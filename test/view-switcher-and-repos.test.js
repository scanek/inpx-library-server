import test from 'node:test';
import assert from 'node:assert/strict';
import './test-env.js';
import { db } from '../src/db.js';
import { createReadingRepository, createShelvesRepository } from '../src/db/repositories/index.js';
import { renderViewModeSwitcher } from '../src/templates/shared.js';

test('repositories initialization', () => {
  const readingRepo = createReadingRepository(db);
  assert.equal(typeof readingRepo.getReadingPosition, 'function');
  assert.equal(typeof readingRepo.setReadingPositionCas, 'function');
  assert.equal(typeof readingRepo.getReaderBookmarks, 'function');

  const shelvesRepo = createShelvesRepository(db);
  assert.equal(typeof shelvesRepo.createShelf, 'function');
  assert.equal(typeof shelvesRepo.getShelfBooks, 'function');
});

test('renderViewModeSwitcher generates correct markup and links', () => {
  const htmlGrid = renderViewModeSwitcher({ currentUrl: '/catalog?q=test', currentMode: 'grid' });
  assert.match(htmlGrid, /class="view-mode-toggle"/);
  assert.match(htmlGrid, /data-view-target="grid"/);
  assert.match(htmlGrid, /data-view-target="list"/);
  assert.match(htmlGrid, /view-toggle-btn is-active.*data-view-target="grid"/s);
  assert.match(htmlGrid, /href="\/catalog\?q=test"/);
  assert.match(htmlGrid, /href="\/catalog\?q=test&amp;view=list"/);

  const htmlList = renderViewModeSwitcher({ currentUrl: '/catalog?q=test&view=list', currentMode: 'list' });
  assert.match(htmlList, /view-toggle-btn is-active.*data-view-target="list"/s);
});
