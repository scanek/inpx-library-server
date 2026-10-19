import './test-env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, db } from '../src/db.js';
import {
  initCollections,
  listCollections,
  getCollectionBySlug,
  importCollection,
  toggleCollection,
  deleteCollection,
  matchBookInLibrary,
  rematchCollection,
  getHomeCollectionsShelves
} from '../src/services/collections.js';
import { renderCollectionsList, renderCollectionDetail } from '../src/templates/library.js';

initDb();

test('collections: initCollections loads bundled collections', () => {
  initCollections();
  const list = listCollections();
  assert.ok(list.length >= 6, 'Should load at least 6 bundled collections');

  const slugs = list.map((c) => c.slug);
  assert.ok(slugs.includes('russian-classics'), 'Should include russian-classics');
  assert.ok(slugs.includes('world-sci-fi-gold'), 'Should include world-sci-fi-gold');
  assert.ok(slugs.includes('bbc-top-200'), 'Should include bbc-top-200');
  assert.ok(slugs.includes('school-reading-100'), 'Should include school-reading-100');
  assert.ok(slugs.includes('detective-legends'), 'Should include detective-legends');
  assert.ok(slugs.includes('le-monde-100'), 'Should include le-monde-100');
});

test('collections: matchBookInLibrary matches books by title and author', () => {
  const dummyBookId = 'test-book-master-margarita';
  try {
    db.prepare(`
      INSERT INTO books (id, title, authors, ext, deleted, lib_rate, lang)
      VALUES (?, ?, ?, ?, 0, 5, 'ru')
    `).run(dummyBookId, 'Мастер и Маргарита', 'Михаил Булгаков', 'fb2');

    const matched = matchBookInLibrary('Михаил Булгаков', 'Мастер и Маргарита');
    assert.strictEqual(matched, dummyBookId, 'Should match exact book');

    // Matching with subtitle or subtitle variations
    const matchedSubtitle = matchBookInLibrary('М. Булгаков', 'Мастер и Маргарита (роман)');
    assert.strictEqual(matchedSubtitle, dummyBookId, 'Should match title with subtitle stripped');

    // Book not in library
    const notFound = matchBookInLibrary('Неизвестный Автор', 'Несуществующая Книга 12345');
    assert.strictEqual(notFound, null, 'Should return null for missing book');
  } finally {
    db.prepare('DELETE FROM books WHERE id = ?').run(dummyBookId);
  }
});

test('collections: rematchCollection updates matched_book_id and stats', () => {
  const dummyBookId = 'test-book-1984';
  try {
    db.prepare(`
      INSERT INTO books (id, title, authors, ext, deleted, lib_rate, lang)
      VALUES (?, ?, ?, ?, 0, 5, 'ru')
    `).run(dummyBookId, '1984', 'Джордж Оруэлл', 'fb2');

    const col = listCollections().find((c) => c.slug === 'world-sci-fi-gold');
    assert.ok(col, 'world-sci-fi-gold collection should exist');

    rematchCollection(col.id, { force: true });

    const detail = getCollectionBySlug('world-sci-fi-gold');
    assert.ok(detail, 'Collection detail should exist');
    assert.ok(detail.stats.matched >= 1, 'Should have at least 1 matched book');

    const item1984 = detail.items.find((it) => it.title === '1984');
    assert.ok(item1984, '1984 item should be in collection');
    assert.strictEqual(item1984.isMatched, true, '1984 should be matched');
    assert.strictEqual(item1984.book.id, dummyBookId, 'Matched book ID should be dummyBookId');
  } finally {
    db.prepare('DELETE FROM books WHERE id = ?').run(dummyBookId);
  }
});

test('collections: getCollectionBySlug filters items by matched and missing', () => {
  const allDetail = getCollectionBySlug('russian-classics', { filter: 'all' });
  const matchedDetail = getCollectionBySlug('russian-classics', { filter: 'matched' });
  const missingDetail = getCollectionBySlug('russian-classics', { filter: 'missing' });

  assert.strictEqual(allDetail.items.length, matchedDetail.items.length + missingDetail.items.length, 'Filter sums should equal all');
});

test('collections: importCollection, toggleCollection and deleteCollection work for custom collection', () => {
  const customSlug = 'my-custom-favs';
  const customData = {
    slug: customSlug,
    title: 'Мои избранные шедевры',
    description: 'Тестовая коллекция',
    source: 'Личный список',
    items: [
      'Александр Пушкин — Капитанская дочка',
      { author: 'Лев Толстой', title: 'Хаджи-Мурат', year: 1912 }
    ]
  };

  const colId = importCollection(customData, { isBuiltin: 0 });
  assert.ok(colId > 0, 'Should return created collection ID');

  let list = listCollections();
  let found = list.find((c) => c.slug === customSlug);
  assert.ok(found, 'Custom collection should be in list');
  assert.strictEqual(found.totalItems, 2, 'Should have 2 items');
  assert.strictEqual(found.isBuiltin, false, 'Should be custom collection');

  // Toggle off
  toggleCollection(colId, false);
  const enabledList = listCollections({ onlyEnabled: true });
  assert.ok(!enabledList.some((c) => c.slug === customSlug), 'Disabled collection should not be in enabled list');

  // Toggle on
  toggleCollection(colId, true);
  const enabledList2 = listCollections({ onlyEnabled: true });
  assert.ok(enabledList2.some((c) => c.slug === customSlug), 'Enabled collection should be in enabled list');

  // Delete
  deleteCollection(colId);
  const afterDeleteList = listCollections();
  assert.ok(!afterDeleteList.some((c) => c.slug === customSlug), 'Deleted collection should not be in list');
});

test('collections: getHomeCollectionsShelves returns shelves with books', () => {
  const shelves = getHomeCollectionsShelves({ maxShelves: 3, booksPerShelf: 10 });
  assert.ok(Array.isArray(shelves), 'Should return an array');
});

test('collections: renderCollectionsList and renderCollectionDetail render valid HTML', () => {
  const list = listCollections();
  const htmlList = renderCollectionsList({
    user: null,
    stats: {},
    indexStatus: {},
    collections: list,
    csrfToken: 'csrf-123'
  });
  assert.ok(htmlList.includes('Тематические подборки') || htmlList.includes('Curated Book Collections'));
  assert.ok(htmlList.includes('Шедевры русской классики'));

  const detail = getCollectionBySlug('russian-classics');
  const htmlDetail = renderCollectionDetail({
    user: null,
    stats: {},
    indexStatus: {},
    collection: detail.collection,
    items: detail.items,
    statsData: detail.stats,
    activeFilter: 'all',
    csrfToken: 'csrf-123',
    readBookIds: null,
    listView: false
  });
  assert.ok(htmlDetail.includes('Шедевры русской классики'));
  assert.ok(htmlDetail.includes('collection-filters'));
});
