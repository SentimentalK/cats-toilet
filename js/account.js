/* 俺家的猫厕所 — accounts, cat picker, cloud save, presence, live events,
   gifts received, and the small shared UI kit (modal, toast) that the plaza
   uses too. Talks to the room only through window.__game and its events.

   Modes (window.social.mode):
     'pending'  probing the API
     'guest'    no API (file://, static server, offline): local save only
     'login'    API there, waiting for the player to log in / register
     'online'   logged in; save syncs, presence and events run */
(() => {
  'use strict';

  const G = window.__game;
  const api = window.api;
  if (!G || !api) return;

  const SYNC_KEY = 'cats-toilet-sync';         // { userId, rev, hash, dirty }
  const ADOPT_KEY = 'cats-toilet-adopted';     // sessionStorage: reload-loop guard
  const DEFAULT_CAT = G.DEFAULT_CAT || 'domestic-orange';
  const SAVE_DEBOUNCE_MS = 2000;
  const SAVE_MAX_WAIT_MS = 10000;
  const PRESENCE_MS = 10000;

  // ---------- small helpers ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const chars = (s) => [...String(s)].length;
  function hash(str) {          // djb2, enough to notice that the save changed
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36) + ':' + str.length;
  }
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } };
  const lsDel = (k) => { try { localStorage.removeItem(k); } catch (_) { /* nothing to clear */ } };

  const CATS = Array.isArray(window.CATS) ? window.CATS : [];
  function coatInfo(breed, coat) {
    const b = CATS.find((x) => x.breed === breed);
    const c = b && b.coats.find((x) => x.coat === coat);
    return b && c ? { breed: b, coat: c } : null;
  }
  // A profile cat {breed, coat} (or a save cat {id}) -> an id that has art.
  function catIdOf(cat) {
    if (!cat) return DEFAULT_CAT;
    let breed = cat.breed, coat = cat.coat;
    if ((!breed || !coat) && typeof cat.id === 'string') {
      const b = CATS.find((x) => cat.id.startsWith(x.breed + '-'));
      if (b) { breed = b.breed; coat = cat.id.slice(b.breed.length + 1); }
    }
    const info = coatInfo(breed, coat);
    return info && info.coat.ready ? `${breed}-${coat}` : DEFAULT_CAT;
  }
  const catSrc = (id, pose) => `assets/cats/${id || DEFAULT_CAT}/${pose}.png`;
  // <img> markup that falls back to the default cat if the art is missing
  const catImg = (id, pose, cls = '') =>
    `<img class="${cls}" src="${catSrc(id, pose)}" alt="" draggable="false" data-fallback="${catSrc(DEFAULT_CAT, pose)}">`;
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (img && img.tagName === 'IMG' && img.dataset.fallback && img.src.indexOf(img.dataset.fallback) < 0) {
      img.src = img.dataset.fallback;
    }
  }, true);

  // ---------- event bus ----------
  const handlers = {};
  const social = window.social = {
    mode: 'pending', me: null,
    on(name, fn) { (handlers[name] = handlers[name] || []).push(fn); },
    emit(name, data) { for (const fn of handlers[name] || []) { try { fn(data); } catch (err) { console.warn('[social]', name, err); } } },
    esc, chars, catIdOf, catSrc, catImg, coatInfo,
  };

  // ---------- UI kit: layer, screens, modals, toast ----------
  const layer = document.getElementById('social') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'social' }));
  const LOGO = `<div class="s-logo"><span class="ears" aria-hidden="true"></span><strong>俺家的猫厕所</strong><em>Cat's Toilet <svg><use href="#i-paw"/></svg></em></div>`;
  const COIN = '<span class="coin sm"><svg><use href="#i-paw"/></svg></span>';
  social.LOGO = LOGO; social.COIN = COIN;

  function screen(cls, html) {
    const el = document.createElement('section');
    el.className = 's-screen ' + cls;
    el.innerHTML = html;
    layer.appendChild(el);
    return el;
  }
  social.screen = screen;

  const modals = [];
  function modal({ title = '', html = '', cls = '', closable = true, onClose } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 's-modal-wrap ' + cls;
    wrap.innerHTML = `<div class="s-modal card" role="dialog" aria-modal="true">
      ${closable ? '<button class="round-btn s-close" aria-label="关闭">✕</button>' : ''}
      <h2></h2><div class="s-modal-body"></div></div>`;
    const m = {
      el: wrap, body: wrap.querySelector('.s-modal-body'), open: true,
      set(h) { m.body.innerHTML = h; return m; },
      title(t) { wrap.querySelector('h2').textContent = t; wrap.querySelector('h2').hidden = !t; return m; },
      close() {
        if (!m.open) return;
        m.open = false;
        wrap.remove();
        modals.splice(modals.indexOf(m), 1);
        if (onClose) onClose();
      },
      closable,
    };
    m.title(title).set(html);
    if (closable) {
      wrap.querySelector('.s-close').addEventListener('click', () => m.close());
      wrap.addEventListener('click', (e) => { if (e.target === wrap) m.close(); });
    }
    layer.appendChild(wrap);
    modals.push(m);
    return m;
  }
  social.modal = modal;
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const top = modals[modals.length - 1];
    if (top && top.closable) top.close();
  });

  const toastEl = document.createElement('div');
  toastEl.id = 's-toast';
  toastEl.hidden = true;
  layer.appendChild(toastEl);
  let toastTimer = 0;
  // Over the room the room's own toast is used; over one of our screens ours.
  function toast(text, ms = 2600) {
    const covered = layer.querySelector('.s-screen:not([hidden])') || modals.length;
    if (!covered && G.toast) { G.toast(text); return; }
    clearTimeout(toastTimer);
    toastEl.textContent = text;
    toastEl.hidden = true; void toastEl.offsetWidth; toastEl.hidden = false;
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms);
  }
  social.toast = toast;

  // ---------- friendly messages for server error codes ----------
  const MESSAGES = {
    network: '连不上服务器，检查一下网络再试试',
    no_api: '服务器没有回应，稍后再试试',
    bad_username: '用户名要 3–16 个字，只能用字母、数字、下划线或汉字',
    bad_password: '密码要 6–72 位',
    username_taken: '这个名字已经被别的铲屎官用啦，换一个吧',
    bad_credentials: '用户名或密码不对',
    too_many_attempts: '试错太多次啦，过几分钟再来',
    too_many_registrations: '这里注册得太频繁啦，过一会儿再试',
    bad_profile: '猫咪资料不对：名字要 1–12 个字',
    user_not_found: '找不到这位铲屎官',
    self_visit: '不能去自己家串门喵',
    visits_off: '对方关闭了串门',
    offline: '对方已经离开广场了',
    already_pending: '已经在等对方回复啦',
    no_visit: '要先被对方同意参观才行',
    visit_closed: '这个请求已经过期了',
    visit_not_found: '这个请求已经不存在了',
    bad_gift: '礼物数量不对',
    unauthorized: '登录已失效，请重新登录',
  };
  const message = (err) => MESSAGES[err && err.code] || `出了点问题（${(err && err.code) || '未知'}），再试一次吧`;
  social.message = message;

  // ---------- boot cover (until we know which mode we are in) ----------
  let cover = null;
  if (/^https?:$/.test(location.protocol)) {
    cover = screen('s-boot', `${LOGO}<p class="s-boot-note"><span class="s-dots"><i></i><i></i><i></i></span>正在连接…</p>`);
  }
  function dropCover() {
    if (!cover) return;
    const c = cover; cover = null;
    c.classList.add('out');
    setTimeout(() => c.remove(), 260);
  }

  // =====================================================================
  // Cloud save
  // =====================================================================
  let meta = readMeta();
  let syncReady = false, adopting = false, adoptStr = '';
  let inFlight = null, again = false, lastFailed = false;
  let changeSeq = 0, saveTimer = 0, retryTimer = 0, firstDirtyAt = 0, failures = 0;

  function readMeta() {
    try { const m = JSON.parse(lsGet(SYNC_KEY)); if (m && typeof m === 'object') return m; } catch (_) { /* corrupt */ }
    return {};
  }
  const writeMeta = () => lsSet(SYNC_KEY, JSON.stringify(meta));
  const localSaveStr = () => lsGet(G.SAVE_KEY);

  // Take the server's copy: write it where the room reads it and reload.
  function adopt(save, userId) {
    const str = JSON.stringify(save.data);
    const tag = userId + ':' + save.rev + ':' + hash(str);
    let seen = null;
    try { seen = sessionStorage.getItem(ADOPT_KEY); } catch (_) { /* no session storage */ }
    meta = { userId, rev: save.rev, hash: hash(str), dirty: false };
    if (seen === tag || !lsSet(G.SAVE_KEY, str)) {
      // Already reloaded for this exact copy (or storage is read-only):
      // do not loop, carry on with what the room has.
      console.warn('[sync] cloud save could not be applied by reloading; keeping the local game');
      meta.dirty = true;
      writeMeta();
      return false;
    }
    writeMeta();
    try { sessionStorage.setItem(ADOPT_KEY, tag); } catch (_) { /* no guard: localStorage worked anyway */ }
    adopting = true;
    adoptStr = str;
    location.reload();
    return true;
  }

  // Decide between the local save and the server's. Returns false when the
  // page is about to reload.
  function reconcile(me) {
    const uid = me.user.id;
    const sv = me.save;
    const localStr = localSaveStr();
    const same = (s) => localStr != null && JSON.stringify(s.data) === localStr;
    if (meta.userId !== uid) {
      if (sv) {
        // fresh login on this device: the server's save wins
        if (same(sv)) meta = { userId: uid, rev: sv.rev, hash: hash(localStr), dirty: false };
        else if (adopt(sv, uid)) return false;
      } else if (meta.userId) {
        // the local save belongs to another account: start this one fresh
        lsDel(G.SAVE_KEY);
        meta = { userId: uid, rev: 0, hash: '', dirty: true };
        writeMeta();
        adopting = true;
        location.reload();
        return false;
      } else {
        // a guest's progress becomes this account's first save
        meta = { userId: uid, rev: 0, hash: '', dirty: true };
      }
    } else if (!sv) {
      meta.rev = 0; meta.dirty = true;                    // server lost it: upload again
    } else if (localStr == null || sv.rev > (meta.rev | 0)) {
      // played elsewhere since (or local storage was cleared): the server wins
      if (same(sv)) Object.assign(meta, { rev: sv.rev, hash: hash(localStr), dirty: false });
      else if (adopt(sv, uid)) return false;
    } else if (sv.rev < (meta.rev | 0)) {
      meta.rev = sv.rev; meta.dirty = true;
    } else if (hash(localStr) !== meta.hash) {
      meta.dirty = true;                                  // saved while we were not listening (e.g. URL cheats)
    }
    writeMeta();
    syncReady = true;
    if (meta.dirty) flush();
    try { sessionStorage.removeItem(ADOPT_KEY); } catch (_) { /* fine */ }
    return true;
  }

  window.addEventListener('game:save', () => {
    if (adopting) {
      // the room saved between our write and the reload: put the cloud copy back
      if (adoptStr) lsSet(G.SAVE_KEY, adoptStr);
      return;
    }
    if (!syncReady || social.mode !== 'online') return;
    changeSeq++;
    if (!meta.dirty) { meta.dirty = true; writeMeta(); }
    schedule();
  });

  function schedule() {
    clearTimeout(saveTimer);
    const now = Date.now();
    if (!firstDirtyAt) firstDirtyAt = now;
    const wait = Math.max(0, Math.min(SAVE_DEBOUNCE_MS, firstDirtyAt + SAVE_MAX_WAIT_MS - now));
    saveTimer = setTimeout(() => flush(), wait);
  }

  function flush(keepalive) {
    clearTimeout(saveTimer); saveTimer = 0;
    if (!syncReady || adopting || social.mode !== 'online') return Promise.resolve();
    if (inFlight) { again = true; return inFlight; }
    if (!meta.dirty) return Promise.resolve();
    clearTimeout(retryTimer);
    firstDirtyAt = 0;
    const seq = changeSeq;
    const str = JSON.stringify(G.state);
    inFlight = (async () => {
      lastFailed = false;
      try {
        const r = await api.call('PUT', 'save', { data: JSON.parse(str), baseRev: meta.rev | 0 }, { keepalive: !!keepalive });
        meta.rev = r.rev;
        meta.hash = hash(str);
        if (changeSeq === seq) meta.dirty = false;
        writeMeta();
        failures = 0;
      } catch (err) {
        if (err.code === 'rev_conflict') {
          const s = err.body && err.body.save;
          if (s) adopt(s, meta.userId);
          else { meta.rev = 0; writeMeta(); again = true; }
        } else if (err.status === 401) {
          lostToken();
        } else {
          lastFailed = true;
          failures++;
          console.warn('[sync] save upload failed, will retry:', err.code);
          retryTimer = setTimeout(() => flush(), Math.min(60000, 4000 * 2 ** Math.min(failures, 4)));
        }
      } finally {
        inFlight = null;
      }
      if (adopting || lastFailed || !meta.dirty) { again = false; return; }
      if (again) { again = false; await flush(); } else schedule();
    })();
    return inFlight;
  }

  // Upload now and wait for it (before a reload or logout). True when the
  // server has everything.
  async function flushNow() {
    for (let i = 0; i < 4 && meta.dirty && !adopting; i++) {
      await flush();
      if (lastFailed) break;
    }
    return !meta.dirty;
  }
  social.flushNow = flushNow;

  const flushOnLeave = () => { if (meta.dirty && !inFlight) flush(true); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushOnLeave(); });
  window.addEventListener('pagehide', flushOnLeave);
  window.addEventListener('online', () => { if (meta.dirty) flush(); });

  function lostToken() {
    if (adopting) return;
    api.setToken('');
    adopting = true;           // stop everything; the login screen comes after the reload
    location.reload();
  }
  social.lostToken = lostToken;

  // =====================================================================
  // Presence, live events, gifts
  // =====================================================================
  let servicesOn = false, es = null;
  function postPresence(squatting) {
    if (social.mode !== 'online' || document.visibilityState !== 'visible') return Promise.resolve();
    return api.call('POST', 'presence', { squatting: typeof squatting === 'boolean' ? squatting : !!G.squatting })
      .catch((err) => { if (err.status === 401) lostToken(); });
  }
  social.postPresence = postPresence;

  function openEvents() {
    if (es) es.close();
    es = api.events();
    for (const name of ['plaza', 'visit_request', 'visit_answer', 'gift']) {
      es.addEventListener(name, (m) => {
        let d; try { d = JSON.parse(m.data); } catch (_) { return; }
        social.emit(name, d);
      });
    }
    es.addEventListener('error', () => {
      // EventSource retries by itself; a CLOSED stream means it was refused
      if (es && es.readyState === 2) setTimeout(checkStream, 5000);
    });
  }
  async function checkStream() {
    try { await api.call('GET', 'me'); openEvents(); } catch (err) {
      if (err.status === 401) lostToken(); else setTimeout(checkStream, 10000);
    }
  }

  function startServices() {
    if (servicesOn) return;
    servicesOn = true;
    postPresence();
    setInterval(() => postPresence(), PRESENCE_MS);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') postPresence(); });
    window.addEventListener('game:squat', (e) => postPresence(!!(e.detail && e.detail.squatting)));
    openEvents();
    api.call('GET', 'inbox').then((r) => receiveGifts(r.items || []), () => { /* next start gets them */ });
  }

  // Gifts are credited once: their ids are remembered in the save itself,
  // so a lost ack can never pay twice.
  social.on('gift', (g) => receiveGifts([g]));
  function receiveGifts(items) {
    items = items.filter((g) => g && g.kind === 'points' && Number.isInteger(g.amount) && g.amount > 0);
    if (!items.length) return;
    const st = G.state;
    if (!Array.isArray(st.giftsSeen)) st.giftsSeen = [];
    const fresh = items.filter((g) => !st.giftsSeen.includes(g.id));
    if (fresh.length) {
      let total = 0;
      for (const g of fresh) { total += g.amount; st.giftsSeen.push(g.id); }
      if (st.giftsSeen.length > 300) st.giftsSeen.splice(0, st.giftsSeen.length - 300);
      G.addPoints(total);
      G.save();
      G.renderPanel();
      const who = (g) => (g.from && g.from.username) || '有人';
      toast(fresh.length === 1
        ? `${who(fresh[0])} 送了你 ${fresh[0].amount} 积分`
        : `收到 ${fresh.length} 份礼物，一共 ${total} 积分`, 3200);
      social.emit('points', st.points);
    }
    api.call('POST', 'inbox/ack', { ids: items.map((g) => g.id) }).catch(() => { /* re-acked next start */ });
  }

  // =====================================================================
  // Login / register
  // =====================================================================
  function showAuth() {
    social.mode = 'login';
    let mode = 'login';
    const el = screen('s-auth', `
      <div class="s-card card auth-card">
        ${LOGO}
        <p class="auth-sub">登录后，进度存在云端，还能去广场串门</p>
        <div class="s-seg" role="tablist">
          <button type="button" data-mode="login" class="on" role="tab">登录</button>
          <button type="button" data-mode="register" role="tab">注册</button>
        </div>
        <form novalidate>
          <label class="s-field"><span>用户名</span>
            <input name="username" autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="16" placeholder="3–16 个字"></label>
          <label class="s-field"><span>密码</span>
            <input name="password" type="password" autocomplete="current-password" maxlength="72" placeholder="至少 6 位"></label>
          <p class="s-err" role="alert" hidden></p>
          <button class="big-btn" type="submit">登录</button>
          <p class="s-hint">用户名可以用字母、数字、下划线或汉字</p>
        </form>
      </div>`);
    const form = el.querySelector('form');
    const err = el.querySelector('.s-err');
    const submit = form.querySelector('[type=submit]');
    const pw = form.elements.password;
    const setMode = (m) => {
      mode = m;
      el.querySelectorAll('.s-seg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
      submit.textContent = m === 'login' ? '登录' : '注册并开始';
      pw.autocomplete = m === 'login' ? 'current-password' : 'new-password';
      err.hidden = true;
    };
    el.querySelectorAll('.s-seg button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
    const showErr = (text) => { err.textContent = text; err.hidden = false; err.classList.remove('shake'); void err.offsetWidth; err.classList.add('shake'); };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = form.elements.username.value.trim();
      const password = pw.value;
      if (!username) { showErr('先填一个用户名'); return; }
      if (!password) { showErr('先填密码'); return; }
      submit.disabled = true;
      err.hidden = true;
      try {
        const r = await api.call('POST', mode, { username, password });
        api.setToken(r.token);
        const me = await api.call('GET', 'me');
        el.remove();
        await startOnline(me);
      } catch (ex) {
        showErr(message(ex));
      } finally {
        submit.disabled = false;
      }
    });
    dropCover();
    setTimeout(() => { try { form.elements.username.focus({ preventScroll: true }); } catch (_) { /* fine */ } }, 50);
  }

  // =====================================================================
  // Cat picker
  // =====================================================================
  function showPicker() {
    const firstReady = (b) => b.coats.find((c) => c.ready);
    let breed = (CATS.find(firstReady) || CATS[0] || {}).breed;
    let coat = null, gender = 'boy';
    const el = screen('s-picker', `
      <div class="s-card card picker-card">
        <h2 class="s-title">选一只你的猫</h2>
        <div class="pk-main">
          <div class="pk-stage"><div class="pk-portrait"></div><div class="pk-caption"></div></div>
          <div class="pk-controls">
            <div class="pk-label">品种</div>
            <div class="pk-breeds"></div>
            <div class="pk-label">毛色</div>
            <div class="pk-coats"></div>
            <div class="pk-label">名字</div>
            <input class="s-input pk-name" maxlength="12" placeholder="给它起个名字（1–12 个字）" autocomplete="off">
            <div class="s-seg pk-gender">
              <button type="button" data-g="boy" class="on">♂ 男孩</button>
              <button type="button" data-g="girl">♀ 女孩</button>
            </div>
            <p class="s-err" role="alert" hidden></p>
            <button class="big-btn pk-ok" type="button">就是它了！</button>
          </div>
        </div>
      </div>`);
    const $ = (s) => el.querySelector(s);
    const err = $('.s-err'), ok = $('.pk-ok'), nameIn = $('.pk-name');
    const showErr = (t) => { err.textContent = t; err.hidden = !t; };

    function render() {
      const b = CATS.find((x) => x.breed === breed) || CATS[0];
      if (!b) return;
      if (!coat || !b.coats.some((c) => c.coat === coat && c.ready)) coat = (firstReady(b) || {}).coat || null;
      $('.pk-breeds').innerHTML = CATS.map((x) =>
        `<button type="button" data-b="${esc(x.breed)}" class="${x.breed === breed ? 'on' : ''}${x.coats.some((c) => c.ready) ? '' : ' soon'}">${esc(x.breedName)}</button>`).join('');
      $('.pk-coats').innerHTML = b.coats.map((c) =>
        `<button type="button" data-c="${esc(c.coat)}" class="${c.coat === coat ? 'on' : ''}" ${c.ready ? '' : 'disabled'}>
          <span class="dot" style="background:${esc(c.swatch)}"></span>${esc(c.name)}${c.ready ? '' : '<small>即将开放</small>'}</button>`).join('');
      const info = coat && coatInfo(b.breed, coat);
      $('.pk-portrait').innerHTML = info
        ? `<img src="${catSrc(`${b.breed}-${coat}`, 'sit')}" alt="${esc(b.breedName + ' ' + info.coat.name)}" draggable="false">`
        : `<div class="pk-soon"><span class="dot" style="background:${esc(b.coats[0].swatch)}"></span>即将开放</div>`;
      $('.pk-caption').textContent = info ? `${b.breedName} · ${info.coat.name}` : `${b.breedName} · 还在画`;
      ok.disabled = !info;
    }
    el.addEventListener('click', (e) => {
      const bb = e.target.closest('[data-b]');
      if (bb) { breed = bb.dataset.b; coat = null; showErr(''); render(); return; }
      const cb = e.target.closest('[data-c]');
      if (cb && !cb.disabled) { coat = cb.dataset.c; render(); return; }
      const gb = e.target.closest('[data-g]');
      if (gb) { gender = gb.dataset.g; el.querySelectorAll('[data-g]').forEach((x) => x.classList.toggle('on', x === gb)); }
    });
    ok.addEventListener('click', async () => {
      const name = nameIn.value.trim();
      if (chars(name) < 1 || chars(name) > 12) { showErr('名字要 1–12 个字'); nameIn.focus(); return; }
      if (!coat) return;
      ok.disabled = true;
      showErr('');
      const st = G.state;
      st.cat = { id: `${breed}-${coat}`, name, gender };
      G.save();
      if (social.mode === 'online') {
        try {
          await api.call('PUT', 'profile', { cat: { breed, coat, name, gender } });
        } catch (ex) {
          if (ex.code !== 'network') { showErr(message(ex)); ok.disabled = false; return; }
          // offline: the profile is fixed up from the save at the next start
        }
        await flushNow();
      }
      adopting = true;          // the room reloads with the new cat
      location.reload();
    });
    render();
    dropCover();
  }

  // =====================================================================
  // Account sheet (opened from the plaza header)
  // =====================================================================
  function openAccount() {
    const me = social.me;
    if (!me) return;
    const sc = G.state.cat;
    const id = catIdOf(sc);
    const m = modal({ title: '我的账号', cls: 's-account', html: `
      <div class="acct-head">
        <div class="acct-pic">${catImg(id, 'sit')}</div>
        <div class="acct-text">
          <b>${esc(sc ? sc.name : '还没有猫')}</b>
          <small>铲屎官 · ${esc(me.user.username)}</small>
        </div>
      </div>
      <label class="s-switch">
        <span><b>允许别人来串门</b><small>关掉后，别人在广场上不能申请参观你的厕所</small></span>
        <input type="checkbox" role="switch" ${me.profile.allowVisits ? 'checked' : ''}><i aria-hidden="true"></i>
      </label>
      <button class="big-btn plain s-logout" type="button">退出登录</button>` });
    const sw = m.body.querySelector('input');
    sw.addEventListener('change', async () => {
      const want = sw.checked;
      sw.disabled = true;
      try {
        const r = await api.call('PUT', 'profile', { allowVisits: want });
        me.profile.allowVisits = r.allowVisits;
        toast(r.allowVisits ? '已开放串门' : '已关闭串门');
        social.emit('profile', me.profile);
      } catch (ex) {
        sw.checked = !want;
        toast(message(ex));
      } finally {
        sw.disabled = false;
      }
    });
    m.body.querySelector('.s-logout').addEventListener('click', () => logout(m));
  }
  social.openAccount = openAccount;

  async function logout(m) {
    const btn = m.body.querySelector('.s-logout');
    btn.disabled = true;
    btn.textContent = '正在同步进度…';
    const synced = await flushNow();
    if (!synced && !confirm('有进度还没同步到云端，现在退出会丢掉这部分进度。确定退出吗？')) {
      btn.disabled = false; btn.textContent = '退出登录';
      return;
    }
    try { await api.call('POST', 'logout'); } catch (_) { /* the token is dropped locally anyway */ }
    if (es) es.close();
    api.setToken('');
    // the progress lives in the cloud now; leave nothing of it for the next player
    lsDel(G.SAVE_KEY);
    lsDel(SYNC_KEY);
    adopting = true;
    location.reload();
  }

  // =====================================================================
  // Startup
  // =====================================================================
  function startGuest(why) {
    social.mode = 'guest';
    social.guestWhy = why;
    if (!G.state.cat) showPicker();
    dropCover();
    social.emit('ready', social.mode);
  }

  async function startOnline(me) {
    social.mode = 'online';
    social.me = me;
    if (!reconcile(me)) return;               // reloading with the cloud save
    const pc = me.profile.cat, sc = G.state.cat;
    if (!sc && pc) {
      // the profile knows the cat but this save does not: take it, restart the room
      G.state.cat = { id: `${pc.breed}-${pc.coat}`, name: pc.name, gender: pc.gender };
      G.save();
      await flushNow();
      adopting = true;
      location.reload();
      return;
    }
    if (!sc) { showPicker(); return; }
    const info = coatInfo(...splitId(sc.id));
    if (info && (!pc || `${pc.breed}-${pc.coat}` !== sc.id || pc.name !== sc.name || pc.gender !== sc.gender)) {
      // the save is the truth for the cat; keep the profile (what others see) in step
      const [breed, coat] = splitId(sc.id);
      api.call('PUT', 'profile', { cat: { breed, coat, name: sc.name, gender: sc.gender === 'girl' ? 'girl' : 'boy' } })
        .then((r) => { me.profile.cat = r.cat; }, () => { /* retried next start */ });
    }
    dropCover();
    startServices();
    social.emit('ready', social.mode);
  }
  function splitId(id) {
    const b = CATS.find((x) => typeof id === 'string' && id.startsWith(x.breed + '-'));
    return b ? [b.breed, id.slice(b.breed.length + 1)] : ['', ''];
  }

  api.probe().then((r) => {
    if (r.mode === 'online') return startOnline(r.me);
    if (r.mode === 'login') return showAuth();
    return startGuest(r.why);
  }).catch((err) => {
    console.warn('[social] start failed, playing offline:', err);
    startGuest('error');
  });
})();
