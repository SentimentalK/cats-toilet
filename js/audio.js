(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CatAudio = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var SETTINGS_KEY = 'cats-toilet-audio-v1';
  var SOUND_IDS = ['purr', 'meow', 'meow-long', 'trill', 'happy'];
  var SOUND_LABELS = { purr: '打呼噜', meow: '短喵', 'meow-long': '长喵', trill: '颤音', happy: '开心喵' };
  var BGM_ID = 'bgm';
  var DEFAULT_SETTINGS = { musicOn: true, sfxOn: true, musicVol: 0.4, sfxVol: 0.7 };
  var FILE_IDS = SOUND_IDS.concat([BGM_ID]);

  function copyDefaults() {
    return {
      musicOn: DEFAULT_SETTINGS.musicOn,
      sfxOn: DEFAULT_SETTINGS.sfxOn,
      musicVol: DEFAULT_SETTINGS.musicVol,
      sfxVol: DEFAULT_SETTINGS.sfxVol,
    };
  }

  function normVol(value, fallback) {
    if (typeof value !== 'number' || !isFinite(value)) return fallback;
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  }

  function normalizeSettings(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    return {
      musicOn: typeof src.musicOn === 'boolean' ? src.musicOn : DEFAULT_SETTINGS.musicOn,
      sfxOn: typeof src.sfxOn === 'boolean' ? src.sfxOn : DEFAULT_SETTINGS.sfxOn,
      musicVol: normVol(src.musicVol, DEFAULT_SETTINGS.musicVol),
      sfxVol: normVol(src.sfxVol, DEFAULT_SETTINGS.sfxVol),
    };
  }

  function loadSettings(storage) {
    var raw = null;
    try {
      if (storage && typeof storage.getItem === 'function') {
        raw = JSON.parse(storage.getItem(SETTINGS_KEY));
      }
    } catch (_) {
      raw = null;
    }
    return normalizeSettings(raw);
  }

  function saveSettings(storage, settings) {
    try {
      storage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
      return true;
    } catch (_) {
      return false;
    }
  }

  function pickSound(prev, rand) {
    var r = typeof rand === 'function' ? Number(rand()) : Math.random();
    if (!isFinite(r)) r = 0;
    if (r < 0) r = 0;
    if (r > 0.999999) r = 0.999999;
    var pool = SOUND_IDS;
    if (SOUND_IDS.indexOf(prev) >= 0) pool = SOUND_IDS.filter(function (id) { return id !== prev; });
    return pool[Math.floor(r * pool.length)];
  }

  function createEngine(opts) {
    var settings = copyDefaults();
    var AudioCtor = opts && opts.AudioContext;
    var fetchFn = opts && opts.fetch;
    var baseUrl = (opts && opts.baseUrl) || '';

    var ctx = null;
    var musicGain = null;
    var sfxGain = null;
    var buffers = {};
    var decoded = [];
    var failed = [];
    var bgmSource = null;
    var bgmPlaying = false;
    var lastSfx = null;
    var sfxCount = 0;
    var unlockPromise = null;

    function fail(id) {
      if (failed.indexOf(id) < 0) failed.push(id);
    }

    function ctxState() {
      if (!ctx) return 'none';
      try {
        return ctx.state;
      } catch (_) {
        return 'none';
      }
    }

    function makeGains() {
      if (!ctx || musicGain) return;
      musicGain = ctx.createGain();
      sfxGain = ctx.createGain();
      musicGain.gain.value = settings.musicVol;
      sfxGain.gain.value = settings.sfxVol;
      musicGain.connect(ctx.destination);
      sfxGain.connect(ctx.destination);
    }

    function loadOne(id) {
      var url = baseUrl + 'assets/audio/' + id + '.mp3';
      return Promise.resolve()
        .then(function () {
          if (typeof fetchFn !== 'function') throw new Error('fetch missing');
          return fetchFn(url);
        })
        .then(function (res) {
          if (!res || !res.ok) throw new Error('http ' + (res ? res.status : 'none'));
          return res.arrayBuffer();
        })
        .then(function (bytes) {
          return new Promise(function (ok, bad) {
            ctx.decodeAudioData(bytes, ok, bad);
          });
        })
        .then(function (buffer) {
          buffers[id] = buffer;
          decoded.push(id);
        })
        .catch(function () {
          fail(id);
        });
    }

    function startBgm() {
      if (!ctx || !musicGain || !buffers[BGM_ID] || !settings.musicOn || bgmPlaying) return;
      try {
        var src = ctx.createBufferSource();
        src.buffer = buffers[BGM_ID];
        src.loop = true;
        src.connect(musicGain);
        var now = ctx.currentTime;
        musicGain.gain.cancelScheduledValues(now);
        musicGain.gain.setValueAtTime(0, now);
        musicGain.gain.linearRampToValueAtTime(settings.musicVol, now + 0.4);
        src.start();
        bgmSource = src;
        bgmPlaying = true;
      } catch (_) {
        fail(BGM_ID);
      }
    }

    function stopBgm() {
      if (!bgmSource || !ctx || !musicGain) {
        bgmSource = null;
        bgmPlaying = false;
        return;
      }
      try {
        var src = bgmSource;
        var now = ctx.currentTime;
        musicGain.gain.cancelScheduledValues(now);
        musicGain.gain.setValueAtTime(settings.musicVol, now);
        musicGain.gain.linearRampToValueAtTime(0, now + 0.3);
        bgmSource = null;
        setTimeout(function () {
          try { src.stop(); } catch (_) { /* already stopped */ }
          bgmPlaying = false;
        }, 320);
      } catch (_) {
        bgmSource = null;
        bgmPlaying = false;
      }
    }

    function unlock() {
      if (unlockPromise) return unlockPromise;
      unlockPromise = Promise.resolve().then(function () {
        if (!AudioCtor) return;
        try {
          ctx = new AudioCtor();
        } catch (_) {
          ctx = null;
          FILE_IDS.forEach(fail);
          return;
        }
        try {
          var resuming = ctx.resume();
          if (resuming && typeof resuming.catch === 'function') resuming.catch(function () {});
        } catch (_) { /* stays suspended */ }
        try {
          makeGains();
        } catch (_) {
          FILE_IDS.forEach(fail);
          return;
        }
        return Promise.all(FILE_IDS.map(loadOne)).then(function () {
          if (settings.musicOn) startBgm();
        });
      });
      return unlockPromise;
    }

    function playCat() {
      try {
        if (!ctx || ctxState() !== 'running' || settings.sfxOn !== true) return null;
        var ready = SOUND_IDS.filter(function (id) { return !!buffers[id]; });
        if (!ready.length) return null;
        var id = pickSound(lastSfx);
        if (ready.indexOf(id) < 0) {
          var other = ready.filter(function (x) { return x !== lastSfx; });
          var pool = other.length ? other : ready;
          id = pool[Math.floor(Math.random() * pool.length)];
        }
        var src = ctx.createBufferSource();
        src.buffer = buffers[id];
        src.connect(sfxGain);
        src.start();
        lastSfx = id;
        sfxCount++;
        return id;
      } catch (_) {
        fail('sfx');
        return null;
      }
    }

    function setSettings(partial) {
      try {
        var merged = {};
        for (var k in settings) if (Object.prototype.hasOwnProperty.call(settings, k)) merged[k] = settings[k];
        if (partial && typeof partial === 'object') {
          for (var p in partial) if (Object.prototype.hasOwnProperty.call(partial, p)) merged[p] = partial[p];
        }
        var wasMusicOn = settings.musicOn;
        settings = normalizeSettings(merged);
        if (ctx && musicGain) musicGain.gain.value = settings.musicVol;
        if (ctx && sfxGain) sfxGain.gain.value = settings.sfxVol;
        if (settings.musicOn && !wasMusicOn) startBgm();
        else if (!settings.musicOn && wasMusicOn) stopBgm();
      } catch (_) {
        fail('settings');
      }
    }

    function status() {
      var out = {
        ctx: ctxState(),
        decoded: decoded.slice(),
        failed: failed.slice(),
        bgmPlaying: bgmPlaying,
        lastSfx: lastSfx,
        sfxCount: sfxCount,
        settings: {
          musicOn: settings.musicOn,
          sfxOn: settings.sfxOn,
          musicVol: settings.musicVol,
          sfxVol: settings.sfxVol,
        },
      };
      return out;
    }

    return {
      get settings() { return settings; },
      unlock: unlock,
      playCat: playCat,
      setSettings: setSettings,
      status: status,
    };
  }

  return {
    SETTINGS_KEY: SETTINGS_KEY,
    SOUND_IDS: SOUND_IDS,
    SOUND_LABELS: SOUND_LABELS,
    BGM_ID: BGM_ID,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    normalizeSettings: normalizeSettings,
    loadSettings: loadSettings,
    saveSettings: saveSettings,
    pickSound: pickSound,
    createEngine: createEngine,
  };
});
