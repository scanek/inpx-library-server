import './test-env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { sendBookFileToChat } from '../src/services/telegram-bot.js';
import { initDb } from '../src/db.js';

initDb();

test('sendBookFileToChat: rejects when bot is disabled', async () => {
  await assert.rejects(
    async () => {
      await sendBookFileToChat('123456', 'non-existent-book-id');
    },
    (err) => {
      assert.match(err.message, /Telegram-бот не настроен или отключён/);
      return true;
    }
  );
});
