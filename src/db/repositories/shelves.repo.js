export function createShelvesRepository(db) {
  let _stmtCreateShelfDup = null;
  let _stmtCreateShelfInsert = null;
  function createShelf(username, name, description = '') {
    const trimmed = String(name || '').trim();
    if (!trimmed) throw new Error('Название полки не указано');
    _stmtCreateShelfDup ??= db.prepare('SELECT id FROM shelves WHERE username = ? AND name = ?');
    const existing = _stmtCreateShelfDup.get(username, trimmed);
    if (existing) throw new Error('Полка с таким названием уже существует');
    _stmtCreateShelfInsert ??= db.prepare('INSERT INTO shelves(username, name, description) VALUES(?, ?, ?)');
    const result = _stmtCreateShelfInsert.run(username, trimmed, String(description || '').trim());
    return result.lastInsertRowid;
  }

  let _stmtUpdateShelfDup = null;
  let _stmtUpdateShelf = null;
  function updateShelf(shelfId, username, name, description) {
    const trimmed = String(name || '').trim();
    if (!trimmed) throw new Error('Название полки не указано');
    _stmtUpdateShelfDup ??= db.prepare('SELECT id FROM shelves WHERE username = ? AND name = ? AND id != ?');
    const dup = _stmtUpdateShelfDup.get(username, trimmed, shelfId);
    if (dup) throw new Error('Полка с таким названием уже существует');
    _stmtUpdateShelf ??= db.prepare('UPDATE shelves SET name = ?, description = ? WHERE id = ? AND username = ?');
    return _stmtUpdateShelf.run(trimmed, String(description || '').trim(), shelfId, username).changes;
  }

  let _stmtDeleteShelf = null;
  function deleteShelf(shelfId, username) {
    _stmtDeleteShelf ??= db.prepare('DELETE FROM shelves WHERE id = ? AND username = ?');
    return _stmtDeleteShelf.run(shelfId, username).changes;
  }

  let _stmtAddBookToShelf = null;
  function addBookToShelf(shelfId, bookId) {
    _stmtAddBookToShelf ??= db.prepare('INSERT OR IGNORE INTO shelf_books(shelf_id, book_id) VALUES(?, ?)');
    _stmtAddBookToShelf.run(shelfId, bookId);
  }

  let _stmtRemoveBookFromShelf = null;
  function removeBookFromShelf(shelfId, bookId) {
    _stmtRemoveBookFromShelf ??= db.prepare('DELETE FROM shelf_books WHERE shelf_id = ? AND book_id = ?');
    return _stmtRemoveBookFromShelf.run(shelfId, bookId).changes;
  }

  let _stmtGetShelfBooks = null;
  function getShelfBooks(shelfId, username) {
    _stmtGetShelfBooks ??= db.prepare(`
      SELECT b.id, b.title, b.authors, b.genres, b.series, b.series_no AS seriesNo, b.ext, b.lang,
             b.archive_name AS archiveName, sb.added_at AS addedAt
      FROM shelf_books sb
      JOIN active_books b ON b.id = sb.book_id
      JOIN shelves s ON s.id = sb.shelf_id AND s.username = ?
      WHERE sb.shelf_id = ?
      ORDER BY sb.added_at DESC
    `);
    return _stmtGetShelfBooks.all(username, shelfId);
  }

  let _stmtGetShelves = null;
  function getShelves(username) {
    _stmtGetShelves ??= db.prepare(`
      SELECT s.id, s.name, s.description, s.created_at AS createdAt,
             COUNT(sb.book_id) AS bookCount
      FROM shelves s
      LEFT JOIN shelf_books sb ON sb.shelf_id = s.id
      WHERE s.username = ?
      GROUP BY s.id
      ORDER BY s.name COLLATE NOCASE ASC
    `);
    return _stmtGetShelves.all(username);
  }

  return {
    createShelf,
    updateShelf,
    deleteShelf,
    addBookToShelf,
    removeBookFromShelf,
    getShelfBooks,
    getShelves,
  };
}
