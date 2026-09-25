import './test-env.js';
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { db, addSource, updateSource, getSourceById, initDb } from '../src/db.js';
import { indexFolder } from '../src/folder-indexer.js';

initDb();

test('db: addSource and updateSource support fast_scan option', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fast-scan-db-'));
  try {
    const s1 = addSource({
      name: 'Fast Folder',
      type: 'folder',
      path: tmp,
      fast_scan: 1
    });
    assert.strictEqual(s1.fast_scan, 1, 'fast_scan should be 1');

    const sUpdated = updateSource(s1.id, { fast_scan: 0 });
    assert.strictEqual(sUpdated.fast_scan, 0, 'fast_scan should update to 0');

    const sUpdated2 = updateSource(s1.id, { fast_scan: 1 });
    assert.strictEqual(sUpdated2.fast_scan, 1, 'fast_scan should update back to 1');
  } finally {
    try {
      db.prepare('DELETE FROM sources WHERE path = ?').run(tmp);
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {}
  }
});

test('folder-indexer: fastScan mode extracts metadata from filename without error', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fast-scan-index-'));
  try {
    // Create loose books with "Author - Title.fb2" filename format
    const book1Path = path.join(tmp, 'Айзек Азимов - Основание.fb2');
    fs.writeFileSync(book1Path, 'dummy non-xml content that would fail normal fb2 parsing');

    const source = addSource({
      name: 'Fast Scan Test',
      type: 'folder',
      path: tmp,
      fast_scan: 1
    });

    const result = await indexFolder(source, { incremental: false, fastScan: true });
    assert.strictEqual(result.imported, 1, 'Should import 1 book');

    const book = db.prepare('SELECT * FROM books WHERE source_id = ?').get(source.id);
    assert.ok(book, 'Book should be in db');
    assert.strictEqual(book.title, 'Основание', 'Title should be parsed from filename');
    assert.strictEqual(book.authors, 'Айзек Азимов', 'Author should be parsed from filename');
  } finally {
    try {
      db.prepare('DELETE FROM books WHERE source_id IN (SELECT id FROM sources WHERE path = ?)').run(tmp);
      db.prepare('DELETE FROM sources WHERE path = ?').run(tmp);
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {}
  }
});
