import './test-env.js';
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getSourceRoot } from '../src/inpx.js';
import { db, addSource, initDb } from '../src/db.js';

initDb();

test('probe logic: finds inpx in subdirectories and sorts _local.inpx first', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'inpx-probe-test-'));
  try {
    const subInpx = path.join(tmp, 'inpx');
    fs.mkdirSync(subInpx, { recursive: true });
    fs.writeFileSync(path.join(subInpx, 'flibusta_fb2.inpx'), 'mock');
    fs.writeFileSync(path.join(subInpx, 'flibusta_fb2_local.inpx'), 'mock');
    fs.writeFileSync(path.join(tmp, 'root.inpx'), 'mock');

    // Emulate probe scanning
    const resolvedPath = path.resolve(tmp);
    const inpxFiles = [];
    const entries = fs.readdirSync(resolvedPath);
    for (const e of entries) {
      if (e.toLowerCase().endsWith('.inpx')) inpxFiles.push(path.join(resolvedPath, e));
    }
    for (const e of entries) {
      const sub = path.join(resolvedPath, e);
      try {
        if (fs.statSync(sub).isDirectory()) {
          const subEntries = fs.readdirSync(sub);
          for (const se of subEntries) {
            if (se.toLowerCase().endsWith('.inpx')) inpxFiles.push(path.join(sub, se));
          }
        }
      } catch {}
    }

    inpxFiles.sort((a, b) => {
      const aLocal = /_local\.inpx$/i.test(a) ? 0 : 1;
      const bLocal = /_local\.inpx$/i.test(b) ? 0 : 1;
      if (aLocal !== bLocal) return aLocal - bLocal;
      return a.localeCompare(b);
    });

    assert.strictEqual(inpxFiles.length, 3);
    assert.ok(inpxFiles[0].endsWith('flibusta_fb2_local.inpx'), 'local INPX must be prioritized first');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('getSourceRoot: resolves parent directory when inpx is located in inpx/ subfolder', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'inpx-root-test-'));
  try {
    const subInpx = path.join(tmp, 'inpx');
    const subFb2 = path.join(tmp, 'fb2');
    fs.mkdirSync(subInpx, { recursive: true });
    fs.mkdirSync(subFb2, { recursive: true });
    const inpxPath = path.join(subInpx, 'flibusta_fb2_local.inpx');
    fs.writeFileSync(inpxPath, 'mock');
    fs.writeFileSync(path.join(subFb2, 'fb2-000001-000500.7z'), 'mock archive');

    const source = addSource({
      name: 'Test Source',
      type: 'inpx',
      path: inpxPath
    });

    const root = getSourceRoot(source.id);
    assert.strictEqual(path.resolve(root), path.resolve(tmp), 'Should resolve to parent library root where fb2/ archives live');

    db.prepare('DELETE FROM sources WHERE id = ?').run(source.id);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
