import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const RICH = require('../../js/rich.js');

const join = (line) => line.parts.map((part) => part.text).join('');

test('按行与句子标点切段', () => {
  const lines = RICH.toLines('A。B！C；D\nE');
  assert.equal(lines.length, 5);
  assert.deepEqual(lines.map((line) => line.text), ['A。', 'B！', 'C；', 'D', 'E']);
  for (const line of lines) assert.equal(join(line), line.text);
});

test('关键词分类覆盖六类', () => {
  const lines = RICH.toLines('铲屎换积分，水盆和猫粮让心情开心，去商店升级');
  const classes = new Set();
  for (const line of lines) for (const part of line.parts) if (part.cls) classes.add(part.cls);
  for (const cls of ['kw-scoop', 'kw-points', 'kw-water', 'kw-food', 'kw-mood', 'kw-shop']) {
    assert.ok(classes.has(cls), cls);
  }

  const single = RICH.toLines('铲便便');
  assert.equal(single.length, 1);
  assert.deepEqual(single[0].parts, [{ text: '铲便便', cls: 'kw-scoop' }]);
});

test('长词优先且不拆散片段', () => {
  const [line] = RICH.toLines('买水盆和饭盆');
  assert.deepEqual(line.parts, [
    { text: '买', cls: 'kw-shop' },
    { text: '水盆', cls: 'kw-water' },
    { text: '和', cls: null },
    { text: '饭盆', cls: 'kw-food' },
  ]);
  assert.equal(join(line), '买水盆和饭盆');
});

test('HTML 转义输入自带的标签', () => {
  const html = RICH.toHtml('<img src=x onerror=alert(1)>');
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
  assert.equal(RICH.toText('<img src=x onerror=alert(1)>'), '<img src=x onerror=alert(1)>');
});

test('HTML 转义 & 与引号', () => {
  const html = RICH.toHtml('a&b"c');
  assert.ok(html.includes('a&amp;b&quot;c'));
  const body = html.replace(/<[^>]*>/g, '');
  assert.ok(!/&(?!amp;|lt;|gt;|quot;|#39;)/.test(body));
  assert.ok(body.includes('&quot;'));
  assert.ok(!body.includes('"'));
  assert.ok(RICH.toHtml("it's").includes('&#39;'));
});

test('片段拼回原文', () => {
  const source = '铲屎 积分\n水盆！猫粮；心情, 商店 买';
  const lines = RICH.toLines(source);
  for (const line of lines) assert.equal(join(line), line.text);
  assert.equal(lines.map((line) => line.text).join(''), source.split('\n').join(''));
  assert.equal(RICH.toText(source), source.split('\n').join(''));
});

test('空片段与纯空白行被丢弃', () => {
  assert.deepEqual(RICH.toLines(''), []);
  assert.deepEqual(RICH.toLines('  \n\n \t'), []);
  assert.deepEqual(RICH.toLines('。'), [{ text: '。', parts: [{ text: '。', cls: null }] }]);
});
