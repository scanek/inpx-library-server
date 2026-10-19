import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, ensureCollectionsSchema } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COLLECTIONS_DIR = path.join(__dirname, '..', '..', 'collections');

function normalizeStr(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\.,-\/#!$%\^&\*;:{}=\-_`~()«»"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTitleForMatch(raw) {
  return String(raw || '')
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/:.*$/, '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\.,-\/#!$%\^&\*;:{}=\-_`~()«»"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSurnameToken(author) {
  const tokens = normalizeStr(author)
    .split(/\s+/)
    .filter((t) => t.length >= 3);
  if (!tokens.length) return '';
  // Usually the last token or first token is the surname
  return tokens.reduce((longest, curr) => (curr.length > longest.length ? curr : longest), tokens[0]);
}

/**
 * Searches the library for the best book matching the author and title.
 */
export function matchBookInLibrary(author, title) {
  const normTitle = cleanTitleForMatch(title);
  if (!normTitle) return null;

  const surname = extractSurnameToken(author);
  const titleTokens = normTitle.split(/\s+/).filter((t) => t.length >= 2);
  if (!titleTokens.length) return null;

  let candidates = [];

  // 1. Try search using FTS if available
  try {
    const ftsQuery = surname
      ? `"${normTitle}"* OR (title:"${titleTokens[0]}"* AND authors:"${surname}"*)`
      : `"${normTitle}"*`;
    const ftsRows = db.prepare(`
      SELECT b.id, b.title, b.authors, b.ext, b.lib_rate, b.deleted
      FROM books_fts f
      JOIN books b ON b.rowid = f.rowid
      WHERE books_fts MATCH ? AND b.deleted = 0
      LIMIT 25
    `).all(ftsQuery);
    if (ftsRows && ftsRows.length > 0) {
      candidates = ftsRows;
    }
  } catch {
    // FTS query fallback
  }

  // 2. If FTS returned nothing or failed, try LIKE queries on books table with lower_unicode
  if (!candidates.length) {
    try {
      if (surname && titleTokens.length) {
        candidates = db.prepare(`
          SELECT id, title, authors, ext, lib_rate, deleted
          FROM books
          WHERE deleted = 0
            AND (lower_unicode(title) LIKE ? OR lower_unicode(title) LIKE ?)
            AND lower_unicode(authors) LIKE ?
          LIMIT 25
        `).all(`${normTitle}%`, `%${normTitle}%`, `%${surname}%`);
      }
      if (!candidates.length) {
        candidates = db.prepare(`
          SELECT id, title, authors, ext, lib_rate, deleted
          FROM books
          WHERE deleted = 0
            AND (lower_unicode(title) LIKE ? OR lower_unicode(title) = ?)
          LIMIT 25
        `).all(`%${normTitle}%`, normTitle);
      }
    } catch {
      // Ignore database errors during candidate search
    }
  }

  if (!candidates.length) return null;

  // 3. Score candidates
  let bestCandidate = null;
  let highestScore = 0;

  for (const cand of candidates) {
    const candTitle = cleanTitleForMatch(cand.title);
    const candAuthors = normalizeStr(cand.authors);
    let score = 0;

    // Title scoring
    if (candTitle === normTitle) {
      score += 60;
    } else if (candTitle.startsWith(normTitle) || normTitle.startsWith(candTitle)) {
      score += 45;
    } else if (candTitle.includes(normTitle) || normTitle.includes(candTitle)) {
      score += 35;
    } else {
      // Overlap of tokens
      const candTokens = new Set(candTitle.split(/\s+/));
      let matches = 0;
      for (const tok of titleTokens) {
        if (candTokens.has(tok)) matches++;
      }
      score += Math.round((matches / titleTokens.length) * 30);
    }

    // Author scoring
    if (surname && candAuthors.includes(surname)) {
      score += 40;
    } else if (author) {
      const authTokens = normalizeStr(author).split(/\s+/).filter((t) => t.length >= 3);
      let aMatches = 0;
      for (const tok of authTokens) {
        if (candAuthors.includes(tok)) aMatches++;
      }
      if (authTokens.length > 0 && aMatches > 0) {
        score += Math.round((aMatches / authTokens.length) * 35);
      }
    }

    // Format preference bonus (FB2/EPUB preferred over misc formats)
    const ext = String(cand.ext || '').toLowerCase();
    if (ext === 'fb2') score += 5;
    else if (ext === 'epub') score += 4;

    if (score > highestScore) {
      highestScore = score;
      bestCandidate = cand;
    }
  }

  // Threshold: at least 65 points required for a confident match
  if (highestScore >= 65 && bestCandidate) {
    return bestCandidate.id;
  }
  return null;
}

/**
 * Ensures schema exists and loads bundled collections from disk.
 */
export function initCollections() {
  ensureCollectionsSchema();
  loadBundledCollections();
}

/**
 * Loads JSON collections from collections/ folder.
 */
export function loadBundledCollections() {
  if (!fs.existsSync(COLLECTIONS_DIR)) {
    return;
  }

  const files = fs.readdirSync(COLLECTIONS_DIR).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    try {
      const fullPath = path.join(COLLECTIONS_DIR, file);
      const raw = fs.readFileSync(fullPath, 'utf8');
      const data = JSON.parse(raw);
      if (!data.slug || !data.title || !Array.isArray(data.items)) {
        continue;
      }
      importCollection(data, { isBuiltin: 1, allowUpdateMeta: true });
    } catch (err) {
      console.warn(`[collections] Failed to load bundled collection ${file}:`, err.message);
    }
  }
}

/**
 * Imports or updates a collection from an object.
 */
export function importCollection(data, { isBuiltin = 0, allowUpdateMeta = true } = {}) {
  const slug = String(data.slug || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-я0-9\-_]/gi, '-')
    .replace(/--+/g, '-')
    .replace(/^-|-$/g, '') || `collection-${Date.now()}`;

  const title = String(data.title || '').trim();
  const description = String(data.description || '').trim();
  const source = String(data.source || '').trim();
  const url = String(data.url || '').trim();
  const coverUrl = String(data.cover_url || data.coverUrl || '').trim();
  const displayOrder = Number.isInteger(data.display_order) ? data.display_order : 100;

  const existing = db.prepare('SELECT id, is_builtin, is_enabled FROM book_collections WHERE slug = ?').get(slug);

  let collectionId;
  if (existing) {
    collectionId = existing.id;
    if (allowUpdateMeta) {
      db.prepare(`
        UPDATE book_collections
        SET title = ?, description = ?, source = ?, url = ?, cover_url = ?, display_order = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(title, description, source, url, coverUrl, displayOrder, collectionId);
    }
  } else {
    const res = db.prepare(`
      INSERT INTO book_collections (slug, title, description, source, url, cover_url, is_builtin, is_enabled, display_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(slug, title, description, source, url, coverUrl, isBuiltin ? 1 : 0, displayOrder);
    collectionId = res.lastInsertRowid;
  }

  // Insert or refresh items
  if (Array.isArray(data.items) && data.items.length > 0) {
    const existingItems = db.prepare(`
      SELECT id, position, author, title, matched_book_id
      FROM collection_items
      WHERE collection_id = ?
    `).all(collectionId);

    const existingKeyMap = new Map();
    for (const it of existingItems) {
      const key = `${normalizeStr(it.author)}|${cleanTitleForMatch(it.title)}`;
      existingKeyMap.set(key, it);
    }

    const insertStmt = db.prepare(`
      INSERT INTO collection_items (collection_id, position, author, title, year, isbn, note, matched_book_id, matched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateStmt = db.prepare(`
      UPDATE collection_items
      SET position = ?, year = ?, isbn = ?, note = ?
      WHERE id = ?
    `);

    db.transaction(() => {
      let pos = 0;
      for (const rawItem of data.items) {
        pos++;
        let author = '';
        let itemTitle = '';
        let year = null;
        let isbn = '';
        let note = '';

        if (typeof rawItem === 'string') {
          // Format "Author — Title" or "Author: Title"
          const parts = rawItem.split(/\s+[—–\-:]\s+/);
          if (parts.length >= 2) {
            author = parts[0].trim();
            itemTitle = parts.slice(1).join(' — ').trim();
          } else {
            itemTitle = rawItem.trim();
          }
        } else if (rawItem && typeof rawItem === 'object') {
          author = String(rawItem.author || '').trim();
          itemTitle = String(rawItem.title || '').trim();
          year = Number.isInteger(rawItem.year) ? rawItem.year : null;
          isbn = String(rawItem.isbn || '').trim();
          note = String(rawItem.note || '').trim();
        }

        if (!itemTitle) continue;

        const key = `${normalizeStr(author)}|${cleanTitleForMatch(itemTitle)}`;
        const prev = existingKeyMap.get(key);

        if (prev) {
          updateStmt.run(pos, year, isbn, note, prev.id);
        } else {
          // New item: try matching immediately
          const matchedId = matchBookInLibrary(author, itemTitle);
          insertStmt.run(
            collectionId,
            pos,
            author,
            itemTitle,
            year,
            isbn,
            note,
            matchedId,
            matchedId ? new Date().toISOString() : null
          );
        }
      }
    })();
  }

  return collectionId;
}

/**
 * Matches all unmatched items in a collection or rematch all items if force=true.
 */
export function rematchCollection(collectionId, { force = false } = {}) {
  const query = force
    ? 'SELECT id, author, title FROM collection_items WHERE collection_id = ?'
    : 'SELECT id, author, title FROM collection_items WHERE collection_id = ? AND matched_book_id IS NULL';

  const items = db.prepare(query).all(collectionId);
  if (!items.length) return 0;

  const updateStmt = db.prepare(`
    UPDATE collection_items
    SET matched_book_id = ?, matched_at = ?
    WHERE id = ?
  `);

  let matchedCount = 0;
  db.transaction(() => {
    for (const it of items) {
      const matchId = matchBookInLibrary(it.author, it.title);
      if (matchId) {
        updateStmt.run(matchId, new Date().toISOString(), it.id);
        matchedCount++;
      } else if (force) {
        updateStmt.run(null, null, it.id);
      }
    }
  })();

  return matchedCount;
}

/**
 * Rematches all enabled collections.
 */
export function rematchAllCollections({ force = false } = {}) {
  const collections = db.prepare('SELECT id, slug, title FROM book_collections WHERE is_enabled = 1').all();
  let totalMatched = 0;
  for (const c of collections) {
    totalMatched += rematchCollection(c.id, { force });
  }
  return { collectionsProcessed: collections.length, totalMatched };
}

/**
 * Lists collections with progress stats.
 */
export function listCollections({ onlyEnabled = false } = {}) {
  ensureCollectionsSchema();
  const where = onlyEnabled ? 'WHERE c.is_enabled = 1' : '';
  const rows = db.prepare(`
    SELECT c.*,
           COUNT(ci.id) AS total_items,
           COUNT(ci.matched_book_id) AS matched_items,
           CASE WHEN COUNT(ci.id) > 0
                THEN ROUND(COUNT(ci.matched_book_id) * 100.0 / COUNT(ci.id))
                ELSE 0 END AS percent_matched
    FROM book_collections c
    LEFT JOIN collection_items ci ON ci.collection_id = c.id
    ${where}
    GROUP BY c.id
    ORDER BY c.display_order ASC, c.id ASC
  `).all();

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    source: r.source,
    url: r.url,
    coverUrl: r.cover_url,
    isBuiltin: Boolean(r.is_builtin),
    isEnabled: Boolean(r.is_enabled),
    displayOrder: r.display_order,
    totalItems: Number(r.total_items) || 0,
    matchedItems: Number(r.matched_items) || 0,
    percentMatched: Number(r.percent_matched) || 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }));
}

/**
 * Gets full collection details by slug with all items.
 */
export function getCollectionBySlug(slug, { filter = 'all' } = {}) {
  ensureCollectionsSchema();
  const col = db.prepare(`
    SELECT c.*,
           COUNT(ci.id) AS total_items,
           COUNT(ci.matched_book_id) AS matched_items,
           CASE WHEN COUNT(ci.id) > 0
                THEN ROUND(COUNT(ci.matched_book_id) * 100.0 / COUNT(ci.id))
                ELSE 0 END AS percent_matched
    FROM book_collections c
    LEFT JOIN collection_items ci ON ci.collection_id = c.id
    WHERE c.slug = ?
    GROUP BY c.id
  `).get(slug);

  if (!col) return null;

  let itemFilter = '';
  if (filter === 'matched') {
    itemFilter = 'AND ci.matched_book_id IS NOT NULL';
  } else if (filter === 'missing') {
    itemFilter = 'AND ci.matched_book_id IS NULL';
  }

  const items = db.prepare(`
    SELECT ci.id, ci.position, ci.author, ci.title, ci.year, ci.isbn, ci.note,
           ci.matched_book_id AS matchedBookId, ci.matched_at AS matchedAt,
           b.id AS bookId, b.title AS bookTitle, b.authors AS bookAuthors,
           b.ext AS bookExt, b.lib_rate AS bookLibRate, b.archive_name AS bookArchiveName,
           b.series, b.series_no AS seriesNo
    FROM collection_items ci
    LEFT JOIN active_books b ON b.id = ci.matched_book_id
    WHERE ci.collection_id = ?
    ${itemFilter}
    ORDER BY ci.position ASC, ci.id ASC
  `).all(col.id);

  const total = Number(col.total_items) || 0;
  const matched = Number(col.matched_items) || 0;
  const missing = total - matched;

  return {
    collection: {
      id: col.id,
      slug: col.slug,
      title: col.title,
      description: col.description,
      source: col.source,
      url: col.url,
      coverUrl: col.cover_url,
      isBuiltin: Boolean(col.is_builtin),
      isEnabled: Boolean(col.is_enabled),
      displayOrder: col.display_order,
      totalItems: total,
      matchedItems: matched,
      percentMatched: Number(col.percent_matched) || 0
    },
    items: items.map((it) => ({
      id: it.id,
      position: it.position,
      author: it.author,
      title: it.title,
      year: it.year,
      isbn: it.isbn,
      note: it.note,
      isMatched: Boolean(it.bookId),
      book: it.bookId
        ? {
            id: it.bookId,
            title: it.bookTitle,
            authors: it.bookAuthors,
            ext: it.bookExt,
            libRate: it.bookLibRate,
            archiveName: it.bookArchiveName,
            series: it.series,
            seriesNo: it.seriesNo
          }
        : null
    })),
    stats: {
      total,
      matched,
      missing,
      percent: Number(col.percent_matched) || 0
    }
  };
}

/**
 * Toggles collection is_enabled flag.
 */
export function toggleCollection(id, isEnabled) {
  return db.prepare(`
    UPDATE book_collections
    SET is_enabled = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(isEnabled ? 1 : 0, id);
}

/**
 * Deletes a custom collection.
 */
export function deleteCollection(id) {
  return db.prepare('DELETE FROM book_collections WHERE id = ?').run(id);
}

/**
 * Returns collection shelves for the home page.
 */
export function getHomeCollectionsShelves({ maxShelves = 3, booksPerShelf = 16 } = {}) {
  ensureCollectionsSchema();
  const collections = db.prepare(`
    SELECT c.id, c.slug, c.title, c.description, c.source,
           COUNT(ci.id) AS total_items,
           COUNT(ci.matched_book_id) AS matched_items
    FROM book_collections c
    JOIN collection_items ci ON ci.collection_id = c.id AND ci.matched_book_id IS NOT NULL
    WHERE c.is_enabled = 1
    GROUP BY c.id
    HAVING COUNT(ci.matched_book_id) > 0
    ORDER BY c.display_order ASC, c.id ASC
    LIMIT ?
  `).all(maxShelves);

  const shelves = [];
  const stmtBooks = db.prepare(`
    SELECT b.id, b.title, b.authors, b.ext, b.lib_rate AS libRate, b.archive_name AS archiveName,
           b.series, b.series_no AS seriesNo
    FROM collection_items ci
    JOIN active_books b ON b.id = ci.matched_book_id
    WHERE ci.collection_id = ?
    ORDER BY ci.position ASC
    LIMIT ?
  `);

  for (const col of collections) {
    const books = stmtBooks.all(col.id, booksPerShelf);
    if (books.length > 0) {
      shelves.push({
        id: col.id,
        slug: col.slug,
        title: col.title,
        description: col.description,
        source: col.source,
        totalItems: Number(col.total_items) || 0,
        matchedItems: Number(col.matched_items) || 0,
        books
      });
    }
  }

  return shelves;
}
