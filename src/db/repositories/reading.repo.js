import { IDLE_MS, sessionStatusFromActivityAt } from '../../../public/position-sync.js';

const READER_SYNC_EPOCH = '1970-01-01T00:00:00.000Z';
const READER_SYNC_INDEX_MAX_IDS = 200;
const IDLE_SQL_MODIFIER = `-${Math.round(IDLE_MS / 1000)} seconds`;

function nullableFiniteNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeHolderSessionId(value) {
  const id = String(value ?? '').trim();
  if (!id || id.length > 128) return null;
  return id;
}

function normalizeUiBrowseView(value) {
  return String(value || '').toLowerCase() === 'list' ? 'list' : 'grid';
}

function readingPositionWriteFields(position, progress, fraction, fb2Href, anchors = {}) {
  const fractionVal = Number.isFinite(Number(fraction)) ? Math.max(0, Math.min(1, Number(fraction))) : null;
  const fb2HrefVal = fb2Href != null && String(fb2Href).trim() ? String(fb2Href).trim() : null;
  const layoutMode =
    anchors?.layoutMode != null && String(anchors.layoutMode).trim()
      ? String(anchors.layoutMode).trim()
      : null;
  return {
    position: String(position),
    progress: Number(progress) || 0,
    fractionVal,
    fb2HrefVal,
    sectionIndex: nullableFiniteNumber(anchors?.sectionIndex),
    sectionPageFraction: nullableFiniteNumber(anchors?.sectionPageFraction),
    paginatorPage: nullableFiniteNumber(anchors?.paginatorPage),
    paginatorPages: nullableFiniteNumber(anchors?.paginatorPages),
    layoutMode,
    textOffset: nullableFiniteNumber(anchors?.textOffset),
    textQuote: anchors?.textQuote != null ? String(anchors.textQuote) : null,
    textSectionLength: nullableFiniteNumber(anchors?.textSectionLength),
    sessionId: normalizeHolderSessionId(anchors?.sessionId),
  };
}

export function createReadingRepository(db, deps = {}) {
  const { getUserByUsername, isEreaderEmailAllowedForUser } = deps;

  // Revisions
  function touchReaderBookRevision(username, bookId, field) {
    const u = String(username || '').trim();
    const id = String(bookId ?? '');
    if (!u || !id) return;
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO reader_book_revisions (username, book_id, ${field}) VALUES (?, ?, ?)
      ON CONFLICT(username, book_id) DO UPDATE SET ${field} = excluded.${field}`).run(u, id, now);
  }

  function touchUserReaderRevision(username, field) {
    const u = String(username || '').trim();
    if (!u) return;
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO user_reader_revisions (username, ${field}) VALUES (?, ?)
      ON CONFLICT(username) DO UPDATE SET ${field} = excluded.${field}`).run(u, now);
  }

  function getReaderBookSyncMeta(username, bookId) {
    const u = String(username || '').trim();
    const id = String(bookId ?? '');
    const row = db.prepare('SELECT bookmarks_rev AS bookmarksRev, annotations_rev AS annotationsRev FROM reader_book_revisions WHERE username = ? AND book_id = ?').get(u, id);
    const pos = db.prepare('SELECT updated_at AS updatedAt, progress, revision FROM reading_positions WHERE username = ? AND book_id = ?').get(u, id);
    const bmCount = db.prepare('SELECT COUNT(*) AS cnt FROM reader_bookmarks WHERE username = ? AND book_id = ?').get(u, id)?.cnt || 0;
    const annCount = db.prepare('SELECT COUNT(*) AS cnt FROM reader_annotations WHERE username = ? AND book_id = ?').get(u, id)?.cnt || 0;
    const revision = pos?.revision != null ? Math.max(0, Number(pos.revision) || 0) : 0;
    return {
      bookmarksRev: row?.bookmarksRev || READER_SYNC_EPOCH,
      annotationsRev: row?.annotationsRev || READER_SYNC_EPOCH,
      positionUpdatedAt: pos?.updatedAt || null,
      positionProgress: Number(pos?.progress) || 0,
      positionRevision: revision,
      bookmarkCount: bmCount,
      annotationCount: annCount,
    };
  }

  function getReaderSyncIndex(username, bookIds) {
    const u = String(username || '').trim();
    const ids = [...new Set(
      (Array.isArray(bookIds) ? bookIds : [])
        .map((id) => String(id ?? '').trim())
        .filter(Boolean),
    )].slice(0, READER_SYNC_INDEX_MAX_IDS);

    const activity = getUserReaderActivitySyncMeta(u);
    if (ids.length === 0) {
      return { activity, books: [] };
    }

    const placeholders = ids.map(() => '?').join(',');
    const revRows = db.prepare(
      `SELECT book_id AS bookId, bookmarks_rev AS bookmarksRev, annotations_rev AS annotationsRev
       FROM reader_book_revisions WHERE username = ? AND book_id IN (${placeholders})`,
    ).all(u, ...ids);
    const posRows = db.prepare(
      `SELECT book_id AS bookId, updated_at AS updatedAt, progress, revision
       FROM reading_positions WHERE username = ? AND book_id IN (${placeholders})`,
    ).all(u, ...ids);
    const bmRows = db.prepare(
      `SELECT book_id AS bookId, COUNT(*) AS cnt FROM reader_bookmarks
       WHERE username = ? AND book_id IN (${placeholders}) GROUP BY book_id`,
    ).all(u, ...ids);
    const annRows = db.prepare(
      `SELECT book_id AS bookId, COUNT(*) AS cnt FROM reader_annotations
       WHERE username = ? AND book_id IN (${placeholders}) GROUP BY book_id`,
    ).all(u, ...ids);

    const revById = new Map(revRows.map((r) => [String(r.bookId), r]));
    const posById = new Map(posRows.map((r) => [String(r.bookId), r]));
    const bmById = new Map(bmRows.map((r) => [String(r.bookId), Number(r.cnt) || 0]));
    const annById = new Map(annRows.map((r) => [String(r.bookId), Number(r.cnt) || 0]));

    const books = ids.map((bookId) => {
      const rev = revById.get(bookId);
      const pos = posById.get(bookId);
      const revision = pos?.revision != null ? Math.max(0, Number(pos.revision) || 0) : 0;
      return {
        bookId,
        bookmarksRev: rev?.bookmarksRev || READER_SYNC_EPOCH,
        annotationsRev: rev?.annotationsRev || READER_SYNC_EPOCH,
        positionUpdatedAt: pos?.updatedAt || null,
        positionProgress: Number(pos?.progress) || 0,
        positionRevision: revision,
        bookmarkCount: bmById.get(bookId) || 0,
        annotationCount: annById.get(bookId) || 0,
      };
    });

    return { activity, books };
  }

  function getUserReaderActivitySyncMeta(username) {
    const u = String(username || '').trim();
    const row = db.prepare('SELECT read_books_rev AS readBooksRev, reading_history_rev AS readingHistoryRev FROM user_reader_revisions WHERE username = ?').get(u);
    const readCount = db.prepare(`
      SELECT COUNT(*) AS cnt FROM read_books rb
      JOIN active_books b ON b.id = rb.book_id
      WHERE rb.username = ?
    `).get(u)?.cnt || 0;
    const histCount = db.prepare(`
      SELECT COUNT(*) AS cnt FROM reading_history rh
      JOIN active_books b ON b.id = rh.book_id
      WHERE rh.username = ?
    `).get(u)?.cnt || 0;
    return {
      readBooksRev: row?.readBooksRev || READER_SYNC_EPOCH,
      readingHistoryRev: row?.readingHistoryRev || READER_SYNC_EPOCH,
      readBookCount: readCount,
      readingHistoryCount: histCount,
    };
  }

  let _stmtGetReadPos = null;
  function getReadingPosition(username, bookId) {
    _stmtGetReadPos ??= db.prepare(
      `SELECT position, progress, fraction, fb2_href AS fb2Href, updated_at AS updatedAt,
              section_index AS sectionIndex, section_page_fraction AS sectionPageFraction,
              paginator_page AS paginatorPage, paginator_pages AS paginatorPages,
              layout_mode AS layoutMode, text_offset AS textOffset, text_quote AS textQuote,
              text_section_length AS textSectionLength,
              position_version AS positionVersion, revision,
              holder_session_id AS sessionId, last_user_activity_at AS lastUserActivityAt
       FROM reading_positions WHERE username = ? AND book_id = ?`,
    );
    const row = _stmtGetReadPos.get(username, bookId);
    if (!row) return null;
    const sessionId = row.sessionId ? String(row.sessionId) : null;
    const lastUserActivityAt = row.lastUserActivityAt || null;
    return {
      position: row.position || '',
      progress: Number(row.progress) || 0,
      fraction: row.fraction != null && Number.isFinite(Number(row.fraction)) ? Number(row.fraction) : null,
      fb2Href: row.fb2Href || null,
      sectionIndex: nullableFiniteNumber(row.sectionIndex),
      sectionPageFraction: nullableFiniteNumber(row.sectionPageFraction),
      paginatorPage: nullableFiniteNumber(row.paginatorPage),
      paginatorPages: nullableFiniteNumber(row.paginatorPages),
      layoutMode: typeof row.layoutMode === 'string' ? row.layoutMode : null,
      textOffset: nullableFiniteNumber(row.textOffset),
      textQuote: typeof row.textQuote === 'string' ? row.textQuote : null,
      textSectionLength: nullableFiniteNumber(row.textSectionLength),
      updatedAt: row.updatedAt || null,
      positionVersion: Number(row.positionVersion) || 1,
      revision: Math.max(1, Number(row.revision) || 1),
      sessionId,
      lastUserActivityAt,
      sessionStatus: sessionStatusFromActivityAt(lastUserActivityAt),
    };
  }

  let _stmtMigrateReadPos = null;
  let _stmtResetAndMigrateReadPos = null;
  function migrateReadingPositionToV4(username, bookId, { reset = false } = {}) {
    const sql = reset
      ? `UPDATE reading_positions SET
           position = '',
           progress = 0,
           fraction = NULL,
           fb2_href = NULL,
           section_index = NULL,
           section_page_fraction = NULL,
           paginator_page = NULL,
           paginator_pages = NULL,
           layout_mode = NULL,
           text_offset = NULL,
           text_quote = NULL,
           text_section_length = NULL,
           position_version = 4,
           revision = revision + 1,
           updated_at = datetime('now')
         WHERE username = ? AND book_id = ? AND position_version < 4`
      : `UPDATE reading_positions SET
           progress = 0,
           fraction = NULL,
           fb2_href = NULL,
           section_index = NULL,
           section_page_fraction = NULL,
           paginator_page = NULL,
           paginator_pages = NULL,
           layout_mode = NULL,
           text_offset = NULL,
           text_quote = NULL,
           text_section_length = NULL,
           position_version = 4,
           revision = revision + 1,
           updated_at = datetime('now')
         WHERE username = ? AND book_id = ? AND position_version < 4`;
    if (reset) {
      _stmtResetAndMigrateReadPos ??= db.prepare(sql);
      _stmtResetAndMigrateReadPos.run(username, bookId);
    } else {
      _stmtMigrateReadPos ??= db.prepare(sql);
      _stmtMigrateReadPos.run(username, bookId);
    }
    return getReadingPosition(username, bookId);
  }

  let _stmtSetReadPosCas = null;
  function setReadingPositionCas(
    username,
    bookId,
    baseRevision,
    position,
    progress,
    fraction = null,
    fb2Href = null,
    anchors = {},
  ) {
    _stmtSetReadPosCas ??= db.prepare(`INSERT INTO reading_positions (
        username, book_id, position, progress, fraction, fb2_href,
        section_index, section_page_fraction, paginator_page, paginator_pages, layout_mode,
        text_offset, text_quote, text_section_length,
        holder_session_id, last_user_activity_at,
        position_version, revision, updated_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 4, 1, datetime('now')
      WHERE ? = 0 OR EXISTS (
        SELECT 1 FROM reading_positions
        WHERE username = ? AND book_id = ? AND revision = ?
      )
      ON CONFLICT(username, book_id) DO UPDATE SET
        position = excluded.position,
        progress = excluded.progress,
        fraction = excluded.fraction,
        fb2_href = excluded.fb2_href,
        section_index = excluded.section_index,
        section_page_fraction = excluded.section_page_fraction,
        paginator_page = excluded.paginator_page,
        paginator_pages = excluded.paginator_pages,
        layout_mode = excluded.layout_mode,
        text_offset = excluded.text_offset,
        text_quote = excluded.text_quote,
        text_section_length = excluded.text_section_length,
        holder_session_id = excluded.holder_session_id,
        last_user_activity_at = excluded.last_user_activity_at,
        position_version = 4,
        revision = reading_positions.revision + 1,
        updated_at = excluded.updated_at
      WHERE reading_positions.revision = ?
        AND (
          ? IS NULL
          OR reading_positions.holder_session_id IS NULL
          OR reading_positions.holder_session_id = ?
          OR reading_positions.last_user_activity_at IS NULL
          OR datetime(reading_positions.last_user_activity_at) <= datetime('now', ?)
        )
      RETURNING revision`);
    const fields = readingPositionWriteFields(position, progress, fraction, fb2Href, anchors);
    const normalizedBaseRevision = Number(baseRevision);
    const saved = _stmtSetReadPosCas.get(
      username,
      bookId,
      fields.position,
      fields.progress,
      fields.fractionVal,
      fields.fb2HrefVal,
      fields.sectionIndex,
      fields.sectionPageFraction,
      fields.paginatorPage,
      fields.paginatorPages,
      fields.layoutMode,
      fields.textOffset,
      fields.textQuote,
      fields.textSectionLength,
      fields.sessionId,
      normalizedBaseRevision,
      username,
      bookId,
      normalizedBaseRevision,
      normalizedBaseRevision,
      fields.sessionId,
      fields.sessionId,
      IDLE_SQL_MODIFIER,
    );
    return saved ? getReadingPosition(username, bookId) : null;
  }

  let _stmtSetReadPosIdleSteal = null;
  function setReadingPositionIdleSteal(
    username,
    bookId,
    expectedHolderSessionId,
    position,
    progress,
    fraction = null,
    fb2Href = null,
    anchors = {},
  ) {
    const holder = normalizeHolderSessionId(expectedHolderSessionId);
    const incoming = normalizeHolderSessionId(anchors?.sessionId);
    if (!holder || !incoming || holder === incoming) return null;
    _stmtSetReadPosIdleSteal ??= db.prepare(`UPDATE reading_positions SET
        position = ?,
        progress = ?,
        fraction = ?,
        fb2_href = ?,
        section_index = ?,
        section_page_fraction = ?,
        paginator_page = ?,
        paginator_pages = ?,
        layout_mode = ?,
        text_offset = ?,
        text_quote = ?,
        text_section_length = ?,
        holder_session_id = ?,
        last_user_activity_at = datetime('now'),
        position_version = 4,
        revision = revision + 1,
        updated_at = datetime('now')
      WHERE username = ?
        AND book_id = ?
        AND holder_session_id = ?
        AND (
          last_user_activity_at IS NULL
          OR datetime(last_user_activity_at) <= datetime('now', ?)
        )
      RETURNING revision`);
    const fields = readingPositionWriteFields(position, progress, fraction, fb2Href, anchors);
    const saved = _stmtSetReadPosIdleSteal.get(
      fields.position,
      fields.progress,
      fields.fractionVal,
      fields.fb2HrefVal,
      fields.sectionIndex,
      fields.sectionPageFraction,
      fields.paginatorPage,
      fields.paginatorPages,
      fields.layoutMode,
      fields.textOffset,
      fields.textQuote,
      fields.textSectionLength,
      incoming,
      username,
      bookId,
      holder,
      IDLE_SQL_MODIFIER,
    );
    return saved ? getReadingPosition(username, bookId) : null;
  }

  let _stmtDeleteReadHistory = null;
  let _stmtDeleteReadPos = null;
  function deleteReadingHistoryEntry(username, bookId) {
    const u = String(username || '').trim();
    const id = String(bookId ?? '');
    _stmtDeleteReadHistory ??= db.prepare('DELETE FROM reading_history WHERE username = ? AND book_id = ?');
    const result = _stmtDeleteReadHistory.run(u, id);
    if (result.changes > 0) {
      _stmtDeleteReadPos ??= db.prepare('DELETE FROM reading_positions WHERE username = ? AND book_id = ?');
      _stmtDeleteReadPos.run(u, id);
      touchUserReaderRevision(u, 'reading_history_rev');
    }
    return result.changes > 0;
  }

  let _stmtUpsertReadHistory = null;
  function upsertReadingHistoryEntry(username, bookId, lastOpenedAt, openCount) {
    const opened = String(lastOpenedAt || '').trim() || new Date().toISOString();
    const count = Math.max(1, Number(openCount) || 1);
    _stmtUpsertReadHistory ??= db.prepare(`
      INSERT INTO reading_history(username, book_id, last_opened_at, open_count)
      VALUES(?, ?, ?, ?)
      ON CONFLICT(username, book_id) DO UPDATE SET
        last_opened_at = excluded.last_opened_at,
        open_count = excluded.open_count
    `);
    _stmtUpsertReadHistory.run(username, bookId, opened, count);
    touchUserReaderRevision(username, 'reading_history_rev');
  }

  let _stmtGetReaderBookmarks = null;
  function getReaderBookmarks(username, bookId) {
    _stmtGetReaderBookmarks ??= db.prepare('SELECT id, position, title, created_at AS createdAt FROM reader_bookmarks WHERE username = ? AND book_id = ? ORDER BY created_at');
    return _stmtGetReaderBookmarks.all(username, bookId);
  }

  let _stmtAllReaderBm = null;
  function getAllReaderBookmarks(username, limit = 10) {
    _stmtAllReaderBm ??= db.prepare(`
      SELECT rb.id, rb.book_id AS bookId, rb.position, rb.title AS label, rb.created_at AS createdAt,
             b.title AS bookTitle, b.authors
      FROM reader_bookmarks rb
      JOIN active_books b ON b.id = rb.book_id
      WHERE rb.username = ?
      ORDER BY rb.created_at DESC
      LIMIT ?
    `);
    return _stmtAllReaderBm.all(username, limit);
  }

  let _stmtAllReaderBmPage = null;
  let _stmtAllReaderBmCount = null;
  function getAllReaderBookmarksPage(username, { page = 1, pageSize = 100 } = {}) {
    const safePageNum = Math.max(1, Math.floor(Number(page) || 1));
    const size = Math.min(500, Math.max(1, Math.floor(Number(pageSize) || 100)));
    const offset = (safePageNum - 1) * size;
    _stmtAllReaderBmPage ??= db.prepare(`
      SELECT rb.id, rb.book_id AS bookId, rb.position, rb.title AS label, rb.created_at AS createdAt,
             b.title AS bookTitle, b.authors, b.ext
      FROM reader_bookmarks rb
      JOIN active_books b ON b.id = rb.book_id
      WHERE rb.username = ?
      ORDER BY rb.created_at DESC
      LIMIT ? OFFSET ?
    `);
    _stmtAllReaderBmCount ??= db.prepare(`
      SELECT COUNT(*) AS n
      FROM reader_bookmarks rb
      JOIN active_books b ON b.id = rb.book_id
      WHERE rb.username = ?
    `);
    const items = _stmtAllReaderBmPage.all(username, size, offset);
    const total = _stmtAllReaderBmCount.get(username)?.n || 0;
    return { items, total, page: safePageNum, pageSize: size };
  }

  let _stmtAddReaderBm = null;
  function addReaderBookmark(username, bookId, position, title) {
    _stmtAddReaderBm ??= db.prepare('INSERT INTO reader_bookmarks (username, book_id, position, title) VALUES (?, ?, ?, ?)');
    const info = _stmtAddReaderBm.run(username, bookId, String(position), String(title || ''));
    touchReaderBookRevision(username, bookId, 'bookmarks_rev');
    return info.lastInsertRowid;
  }

  let _stmtDelReaderBm = null;
  function deleteReaderBookmark(id, username) {
    _stmtDelReaderBm ??= db.prepare('DELETE FROM reader_bookmarks WHERE id = ? AND username = ?');
    const row = db.prepare('SELECT book_id FROM reader_bookmarks WHERE id = ? AND username = ?').get(id, username);
    _stmtDelReaderBm.run(id, username);
    if (row?.book_id) touchReaderBookRevision(username, row.book_id, 'bookmarks_rev');
  }

  let _stmtGetReaderAnnotations = null;
  function getReaderAnnotations(username, bookId) {
    _stmtGetReaderAnnotations ??= db.prepare('SELECT id, cfi, text, note, color, created_at AS createdAt FROM reader_annotations WHERE username = ? AND book_id = ? ORDER BY created_at');
    return _stmtGetReaderAnnotations.all(username, bookId);
  }

  let _stmtAllReaderAnnotations = null;
  function getAllReaderAnnotations(username, limit = 10) {
    _stmtAllReaderAnnotations ??= db.prepare(`
      SELECT ra.id, ra.book_id AS bookId, ra.cfi, ra.text, ra.note, ra.color, ra.created_at AS createdAt,
             b.title AS bookTitle, b.authors
      FROM reader_annotations ra
      JOIN active_books b ON b.id = ra.book_id
      WHERE ra.username = ?
      ORDER BY ra.created_at DESC
      LIMIT ?
    `);
    return _stmtAllReaderAnnotations.all(username, limit);
  }

  let _stmtAllReaderAnnPage = null;
  let _stmtAllReaderAnnCount = null;
  function getAllReaderAnnotationsPage(username, { page = 1, pageSize = 100 } = {}) {
    const safePageNum = Math.max(1, Math.floor(Number(page) || 1));
    const size = Math.min(500, Math.max(1, Math.floor(Number(pageSize) || 100)));
    const offset = (safePageNum - 1) * size;
    _stmtAllReaderAnnPage ??= db.prepare(`
      SELECT ra.id, ra.book_id AS bookId, ra.cfi, ra.text, ra.note, ra.color, ra.created_at AS createdAt,
             b.title AS bookTitle, b.authors, b.ext
      FROM reader_annotations ra
      JOIN active_books b ON b.id = ra.book_id
      WHERE ra.username = ?
      ORDER BY ra.created_at DESC
      LIMIT ? OFFSET ?
    `);
    _stmtAllReaderAnnCount ??= db.prepare(`
      SELECT COUNT(*) AS n
      FROM reader_annotations ra
      JOIN active_books b ON b.id = ra.book_id
      WHERE ra.username = ?
    `);
    const items = _stmtAllReaderAnnPage.all(username, size, offset);
    const total = _stmtAllReaderAnnCount.get(username)?.n || 0;
    return { items, total, page: safePageNum, pageSize: size };
  }

  let _stmtAddReaderAnnotation = null;
  function addReaderAnnotation(username, bookId, cfi, text, note, color) {
    _stmtAddReaderAnnotation ??= db.prepare('INSERT INTO reader_annotations (username, book_id, cfi, text, note, color) VALUES (?, ?, ?, ?, ?, ?)');
    const info = _stmtAddReaderAnnotation.run(username, bookId, String(cfi), String(text || ''), String(note || ''), String(color || 'yellow'));
    touchReaderBookRevision(username, bookId, 'annotations_rev');
    return info.lastInsertRowid;
  }

  let _stmtUpdReaderAnnotationNote = null;
  let _stmtUpdReaderAnnotationColor = null;
  let _stmtUpdReaderAnnotationBoth = null;
  function updateReaderAnnotation(id, username, { note, color } = {}) {
    const hasNote = note !== undefined;
    const hasColor = color !== undefined;
    if (hasNote && hasColor) {
      _stmtUpdReaderAnnotationBoth ??= db.prepare('UPDATE reader_annotations SET note = ?, color = ? WHERE id = ? AND username = ?');
      _stmtUpdReaderAnnotationBoth.run(String(note), String(color), id, username);
    } else if (hasNote) {
      _stmtUpdReaderAnnotationNote ??= db.prepare('UPDATE reader_annotations SET note = ? WHERE id = ? AND username = ?');
      _stmtUpdReaderAnnotationNote.run(String(note), id, username);
    } else if (hasColor) {
      _stmtUpdReaderAnnotationColor ??= db.prepare('UPDATE reader_annotations SET color = ? WHERE id = ? AND username = ?');
      _stmtUpdReaderAnnotationColor.run(String(color), id, username);
    }
  }

  let _stmtDelReaderAnnotation = null;
  function deleteReaderAnnotation(id, username) {
    _stmtDelReaderAnnotation ??= db.prepare('DELETE FROM reader_annotations WHERE id = ? AND username = ?');
    const row = db.prepare('SELECT book_id FROM reader_annotations WHERE id = ? AND username = ?').get(id, username);
    _stmtDelReaderAnnotation.run(id, username);
    if (row?.book_id) touchReaderBookRevision(username, row.book_id, 'annotations_rev');
  }

  let _stmtGetBrowseViewPrefs = null;
  function getUserBrowseViewPrefs(username) {
    _stmtGetBrowseViewPrefs ??= db.prepare(`
      SELECT COALESCE(ui_home_view, 'grid') AS homeView,
             COALESCE(ui_catalog_view, 'grid') AS catalogView
      FROM users WHERE username = ?
    `);
    const row = _stmtGetBrowseViewPrefs.get(username);
    return {
      homeView: normalizeUiBrowseView(row?.homeView),
      catalogView: normalizeUiBrowseView(row?.catalogView)
    };
  }

  let _stmtSetBrowseViewPrefs = null;
  function setUserBrowseViewPrefs(username, { homeView, catalogView } = {}) {
    const user = getUserByUsername(username);
    if (!user) throw new Error('User not found');
    _stmtSetBrowseViewPrefs ??= db.prepare(
      'UPDATE users SET ui_home_view = ?, ui_catalog_view = ? WHERE username = ?'
    );
    _stmtSetBrowseViewPrefs.run(
      normalizeUiBrowseView(homeView),
      normalizeUiBrowseView(catalogView),
      username
    );
  }

  let _stmtGetEreaderEmail = null;
  function getEreaderEmail(username) {
    _stmtGetEreaderEmail ??= db.prepare('SELECT ereader_email FROM users WHERE username = ?');
    const row = _stmtGetEreaderEmail.get(username);
    return row?.ereader_email || '';
  }

  let _stmtSetEreaderEmail = null;
  function setUserEreaderEmail(username, email) {
    const user = getUserByUsername(username);
    if (!user) throw new Error('User not found');
    _stmtSetEreaderEmail ??= db.prepare('UPDATE users SET ereader_email = ? WHERE username = ?');
    _stmtSetEreaderEmail.run(String(email || '').trim(), username);
  }

  function setEreaderEmail(username, email) {
    const user = getUserByUsername(username);
    if (!user) throw new Error('User not found');
    if (!isEreaderEmailAllowedForUser(user)) throw new Error('E-reader email access denied');
    setUserEreaderEmail(username, email);
  }

  function getReadBooks(username, sort = 'title', order = '') {
    const orderMap = {
      title: 'b.title COLLATE NOCASE ASC',
      author: `COALESCE(b.authors, '') COLLATE NOCASE ASC, b.title COLLATE NOCASE ASC`,
      date: 'rb.created_at DESC',
      rating: 'b.lib_rate DESC, b.title_sort ASC'
    };
    let orderBy = orderMap[sort] || orderMap.title;
    if (order === 'asc' || order === 'desc') {
      const firstMatch = orderBy.match(/\b(ASC|DESC)\b/);
      const natural = firstMatch ? firstMatch[1] : 'ASC';
      if (natural !== order.toUpperCase()) {
        orderBy = orderBy.replace(/\bASC\b/, '#ASC#').replace(/\bDESC\b/, '#DESC#')
          .replace('#ASC#', 'DESC').replace('#DESC#', 'ASC');
      }
    }
    return db.prepare(`
      SELECT b.id, b.title, b.authors, b.genres, b.series, b.series_no AS seriesNo,
             b.ext, b.lib_rate AS libRate, b.archive_name AS archiveName
      FROM read_books rb
      JOIN active_books b ON b.id = rb.book_id
      WHERE rb.username = ?
      ORDER BY ${orderBy}
    `).all(username);
  }

  return {
    touchReaderBookRevision,
    touchUserReaderRevision,
    getReaderBookSyncMeta,
    getReaderSyncIndex,
    getUserReaderActivitySyncMeta,
    getReadingPosition,
    migrateReadingPositionToV4,
    setReadingPositionCas,
    setReadingPositionIdleSteal,
    deleteReadingHistoryEntry,
    upsertReadingHistoryEntry,
    getReaderBookmarks,
    getAllReaderBookmarks,
    getAllReaderBookmarksPage,
    addReaderBookmark,
    deleteReaderBookmark,
    getReaderAnnotations,
    getAllReaderAnnotations,
    getAllReaderAnnotationsPage,
    addReaderAnnotation,
    updateReaderAnnotation,
    deleteReaderAnnotation,
    getUserBrowseViewPrefs,
    setUserBrowseViewPrefs,
    getEreaderEmail,
    setUserEreaderEmail,
    setEreaderEmail,
    getReadBooks,
  };
}
