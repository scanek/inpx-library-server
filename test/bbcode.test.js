import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBbCode, stripBbCode } from '../src/html-sanitize.js';
import { sanitizeHtml } from '../src/templates/shared.js';

test('parseBbCode transforms formatting tags', () => {
  const input = '[b]bold[/b] and [i]italic[/i] and [u]underline[/u] and [s]strikethrough[/s] and [del]del[/del]';
  const res = parseBbCode(input);
  assert.equal(res, '<strong>bold</strong> and <em>italic</em> and <u>underline</u> and <s>strikethrough</s> and <del>del</del>');
});

test('parseBbCode transforms spoilers with title and without title', () => {
  const input = '[spoiler=Содержание]Глава 1[/spoiler] и [spoiler]Секрет[/spoiler]';
  const res = parseBbCode(input);
  assert.match(res, /<details class="book-annotation-spoiler"><summary>Содержание<\/summary><div class="book-annotation-spoiler-content">Глава 1<\/div><\/details>/);
  assert.match(res, /<details class="book-annotation-spoiler"><summary>Спойлер<\/summary><div class="book-annotation-spoiler-content">Секрет<\/div><\/details>/);
});

test('parseBbCode decodes XML escaped HTML entities', () => {
  const input = '&lt;p&gt;Первый абзац&lt;/p&gt;&lt;p&gt;[b]Жирный[/b]&lt;/p&gt;';
  const res = parseBbCode(input);
  assert.equal(res, '<p>Первый абзац</p><p><strong>Жирный</strong></p>');
});

test('parseBbCode strips color and size tags', () => {
  const input = '[color=red][size=14]Красный текст[/size][/color]';
  const res = parseBbCode(input);
  assert.equal(res, 'Красный текст');
});

test('parseBbCode transforms url tags', () => {
  const input = '[url=https://example.com]Ссылка[/url] и [url]https://test.com[/url]';
  const res = parseBbCode(input);
  assert.equal(res, '<a href="https://example.com" target="_blank" rel="noopener noreferrer">Ссылка</a> и <a href="https://test.com" target="_blank" rel="noopener noreferrer">https://test.com</a>');
});

test('sanitizeHtml integrates parseBbCode and preserves safe tags', () => {
  const input = '<p>Текст с [b]жирным[/b] и [spoiler=Спойлер]секретом[/spoiler]</p>';
  const sanitized = sanitizeHtml(input);
  assert.match(sanitized, /<strong>жирным<\/strong>/);
  assert.match(sanitized, /<details>/);
  assert.match(sanitized, /<summary>Спойлер<\/summary>/);
});

test('stripBbCode removes bb-codes for plain text', () => {
  const input = '[b]Заголовок[/b]: [spoiler=Скрыто]Секрет[/spoiler] [url=https://example.com]Сайт[/url]';
  const stripped = stripBbCode(input);
  assert.equal(stripped, 'Заголовок: Секрет Сайт (https://example.com)');
});
