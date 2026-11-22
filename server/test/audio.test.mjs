import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AUDIO = require('../../js/audio.js');

const DEFAULTS = { musicOn: true, sfxOn: true, musicVol: 0.4, sfxVol: 0.7 };

function memStorage(initial) {
  const map = new Map(Object.entries(initial || {}));
  return {
    map,
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
  };
}

test('音效 id 固定为五个', () => {
  assert.deepEqual(AUDIO.SOUND_IDS, ['purr', 'meow', 'meow-long', 'trill', 'happy']);
  assert.equal(AUDIO.SOUND_IDS.length, 5);
});

test('normalizeSettings 补全并夹紧音量', () => {
  assert.deepEqual(AUDIO.normalizeSettings(null), DEFAULTS);
  assert.deepEqual(AUDIO.normalizeSettings(undefined), DEFAULTS);
  assert.equal(AUDIO.normalizeSettings({ musicVol: 2 }).musicVol, 1);
  assert.equal(AUDIO.normalizeSettings({ musicVol: -1 }).musicVol, 0);
  assert.equal(AUDIO.normalizeSettings({ musicVol: NaN }).musicVol, 0.4);
  assert.equal(AUDIO.normalizeSettings({ musicOn: 'yes' }).musicOn, true);
  assert.equal(AUDIO.normalizeSettings({ sfxOn: 0 }).sfxOn, true);
  assert.deepEqual(Object.keys(AUDIO.normalizeSettings({ musicVol: 0.2, extra: 1 })).sort(),
    ['musicOn', 'musicVol', 'sfxOn', 'sfxVol']);
});

test('设置存取往返、坏 JSON 与写入失败', () => {
  const storage = memStorage();
  const settings = { musicOn: false, sfxOn: false, musicVol: 0.15, sfxVol: 0.95 };
  assert.equal(AUDIO.saveSettings(storage, settings), true);
  assert.deepEqual(AUDIO.loadSettings(storage), settings);
  assert.equal(storage.map.get(AUDIO.SETTINGS_KEY), JSON.stringify(settings));

  const corrupt = memStorage({ [AUDIO.SETTINGS_KEY]: '{not json' });
  assert.deepEqual(AUDIO.loadSettings(corrupt), DEFAULTS);

  const broken = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); },
  };
  assert.deepEqual(AUDIO.loadSettings(broken), DEFAULTS);
  assert.equal(AUDIO.saveSettings(broken, settings), false);
});

test('pickSound 不重样且覆盖五个 id', () => {
  for (const prev of AUDIO.SOUND_IDS) {
    for (const r of [0, 0.25, 0.5, 0.75, 0.9999]) {
      const id = AUDIO.pickSound(prev, () => r);
      assert.ok(AUDIO.SOUND_IDS.includes(id), `${prev} -> ${id}`);
      assert.notEqual(id, prev);
    }
  }
  assert.equal(AUDIO.pickSound(null, () => 0), 'purr');
  assert.equal(AUDIO.pickSound(null, () => 0.9999), 'happy');
  assert.equal(AUDIO.pickSound(null, () => 2), 'happy');
  assert.equal(AUDIO.pickSound(null, () => -1), 'purr');
});

test('连续一千次猫叫相邻不同且五种都出现', () => {
  let x = 1;
  const rnd = () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);
  let prev = null;
  const seen = new Set();
  for (let i = 0; i < 1000; i++) {
    const id = AUDIO.pickSound(prev, rnd);
    assert.ok(AUDIO.SOUND_IDS.includes(id));
    if (prev !== null) assert.notEqual(id, prev);
    seen.add(id);
    prev = id;
  }
  assert.deepEqual([...seen].sort(), [...AUDIO.SOUND_IDS].sort());
});

function fakeAudioContext(state = 'running') {
  const started = [];
  const gains = [];
  const ctx = {
    state,
    currentTime: 0,
    destination: {},
    resume() { return Promise.resolve(); },
    createGain() {
      const gain = {
        value: 0,
        cancelScheduledValues() {},
        setValueAtTime(v) { this.value = v; },
        linearRampToValueAtTime(v) { this.value = v; },
      };
      gains.push(gain);
      return { gain, connect() {} };
    },
    createBufferSource() {
      const src = {
        buffer: null,
        loop: false,
        connect() {},
        start() { started.push(src); },
        stop() {},
      };
      return src;
    },
    decodeAudioData(bytes, ok) { ok({ id: 'buffer' }); },
  };
  return { ctx, started, gains };
}

test('BGM 在 fade 窗口内关再开仍会重新播放', async () => {
  const fake = fakeAudioContext();
  const fetchFn = () => Promise.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) });
  const engine = AUDIO.createEngine({
    AudioContext: function () { return fake.ctx; },
    fetch: fetchFn,
    baseUrl: './assets/audio/',
  });
  await engine.unlock();
  assert.equal(engine.status().bgmPlaying, true);
  assert.equal(fake.started.length, 1);

  engine.setSettings({ musicOn: false });
  assert.equal(engine.status().bgmPlaying, false);
  engine.setSettings({ musicOn: true });
  assert.equal(engine.status().bgmPlaying, true);

  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(engine.status().bgmPlaying, true);
  assert.equal(fake.started.length, 2);
});
