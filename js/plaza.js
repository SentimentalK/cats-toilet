/* 俺家的猫厕所 — the plaza (who is online, who is squatting), visit requests
   both ways, the read-only view of someone else's room, and gifts.

   Test helper (URL only): index.html?bots=8 adds that many fake local cats to
   the plaza layout. They are never counted on the screen and cannot be
   visited. */
(() => {
  'use strict';

  const G = window.__game;
  const api = window.api;
  const S = window.social;
  if (!G || !api || !S) return;
  const { esc, catIdOf, catImg, catSrc, modal, toast, message } = S;

  const REFRESH_MS = 5000;
  const VISIT_WAIT_MS = 60000;
  const GIFTS = [10, 50, 100];
  const TRAY = G.BOX_ART[0];                 // every plaza cat sits in the basic tray
  const hPct = (wPct, aspect) => wPct * (4 / 3) / aspect;   // sprite height, % of a 4:3 scene
  const zOf = (y) => Math.round(y * 10);
  const levelArt = (lv) => G.BOX_ART[(G.LEVELS[lv] || G.LEVELS[0]).art];
  const clampLv = (lv) => Math.max(0, Math.min(G.LEVELS.length - 1, lv | 0));
  const genderMark = (g) => (g === 'girl' ? '<i class="g girl">♀</i>' : g === 'boy' ? '<i class="g boy">♂</i>' : '');
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  const ICON_HOME = '<svg viewBox="0 0 24 24"><path d="M12 3.2 2.6 11a1 1 0 0 0 1.3 1.5l.9-.7V19a2 2 0 0 0 2 2h3.4v-5.2h3.6V21h3.4a2 2 0 0 0 2-2v-7.2l.9.7a1 1 0 0 0 1.3-1.5L12 3.2Z"/></svg>';
  const ICON_USER = '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4.4"/><path d="M3.6 20.2c.7-4.3 4.2-6.6 8.4-6.6s7.7 2.3 8.4 6.6a1 1 0 0 1-1 1.2H4.6a1 1 0 0 1-1-1.2Z"/></svg>';
  const ICON_BACK = '<svg viewBox="0 0 24 24"><path d="M14.7 4.3a1.2 1.2 0 0 1 0 1.7L8.8 12l5.9 6a1.2 1.2 0 1 1-1.7 1.7l-6.8-6.8a1.2 1.2 0 0 1 0-1.7l6.8-6.9a1.2 1.2 0 0 1 1.7 0Z"/></svg>';

  // ---------- ?bots=N (layout testing only) ----------
  const BOTS = (() => {
    let n = 0;
    try { n = parseInt(new URLSearchParams(location.search).get('bots'), 10) || 0; } catch (_) { /* no params */ }
    n = Math.max(0, Math.min(40, n));
    const ids = (window.CATS || []).flatMap((b) => b.coats.map((c) => [b.breed, c.coat]));
    return Array.from({ length: n }, (_, i) => {
      const [breed, coat] = ids[(i * 5) % Math.max(1, ids.length)] || ['domestic', 'orange'];
      return {
        userId: -(i + 1), username: '测试账号', bot: true,
        cat: { breed, coat, name: '测试猫' + (i + 1), gender: i % 2 ? 'girl' : 'boy' },
        squatting: i % 3 === 0, squatSeconds: 20 + i * 37, level: (i * 3) % 11, allowVisits: false, me: false,
      };
    });
  })();

  // ---------- shared bits ----------
  // Mouse users drag a sideways-scrolling scene; touch scrolls natively.
  function dragScroll(box) {
    let drag = null;
    box.dragged = false;
    box.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button === 0) drag = { x: e.clientX, left: box.scrollLeft };
    });
    window.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 5) box.dragged = true;
      if (box.dragged) box.scrollLeft = drag.left - dx;
    });
    window.addEventListener('pointerup', () => { drag = null; setTimeout(() => { box.dragged = false; }, 0); });
    box.addEventListener('click', (e) => { if (box.dragged) { e.stopPropagation(); e.preventDefault(); } }, true);
  }
  function centreOn(box, scene, xPct) {
    const w = scene.offsetWidth, view = box.clientWidth;
    box.scrollLeft = Math.max(0, Math.min(w - view, xPct / 100 * w - view / 2));
  }
  const hueOf = (id) => (((id * 73) % 360) + 360) % 360;

  // =====================================================================
  // The plaza screen
  // =====================================================================
  let pz = null;            // DOM refs once built
  let isOpen = false, refreshTimer = 0, tickTimer = 0, loadedAt = 0;
  let data = { online: 0, squatting: 0, cats: [] };
  const nodes = new Map();  // userId -> { unit, label }

  function build() {
    const el = S.screen('pz', `
      <div class="pz-scroll"><div class="pz-scene">
        <img class="pz-bg" src="assets/plaza-bg.jpg" alt="" draggable="false">
        <div class="pz-sign" aria-label="俺家的猫厕所 Cat's Toilet"><b>俺家的猫厕所</b><i>Cat's Toilet</i></div>
        <div class="pz-screen" aria-live="polite">
          <div class="pz-big">正在蹲坑 <b class="pz-n">–</b> 只</div>
          <div class="pz-small">在线 <b class="pz-m">–</b> 只</div>
        </div>
        <div class="pz-cats"></div>
        <div class="pz-labels"></div>
      </div></div>
      <header class="s-hud">
        <button class="s-pill pz-home" type="button">${ICON_HOME}<span>回家</span></button>
        <button class="round-btn pz-acct" type="button" aria-label="我的账号">${ICON_USER}</button>
      </header>`);
    el.hidden = true;
    pz = {
      el, scroll: el.querySelector('.pz-scroll'), scene: el.querySelector('.pz-scene'),
      cats: el.querySelector('.pz-cats'), labels: el.querySelector('.pz-labels'),
      n: el.querySelector('.pz-n'), m: el.querySelector('.pz-m'),
    };
    dragScroll(pz.scroll);
    el.querySelector('.pz-home').addEventListener('click', close);
    el.querySelector('.pz-acct').addEventListener('click', () => S.openAccount());
    pz.cats.addEventListener('click', (e) => {
      const b = e.target.closest('.pz-cat');
      if (!b) return;
      const c = [...data.cats, ...BOTS].find((x) => String(x.userId) === b.dataset.uid);
      if (c) openCard(c);
    });
  }

  function open() {
    if (!pz) build();
    pz.el.hidden = false;
    isOpen = true;
    requestAnimationFrame(() => centreOn(pz.scroll, pz.scene, 50));
    // make sure we are on the list ourselves, then load it
    Promise.resolve(S.postPresence()).then(refresh, refresh);
    clearInterval(refreshTimer);
    refreshTimer = setInterval(refresh, REFRESH_MS);
    clearInterval(tickTimer);
    tickTimer = setInterval(tickLabels, 1000);
  }
  function close() {
    isOpen = false;
    clearInterval(refreshTimer);
    clearInterval(tickTimer);
    if (pz) pz.el.hidden = true;
  }

  let refreshing = false;
  async function refresh() {
    if (!isOpen || refreshing) return;
    refreshing = true;
    try {
      data = await api.call('GET', 'plaza');
      loadedAt = Date.now();
      render();
    } catch (err) {
      if (err.status === 401) S.lostToken();
    } finally {
      refreshing = false;
    }
  }
  S.on('plaza', (c) => {
    data.online = c.online; data.squatting = c.squatting;
    if (isOpen) { renderCounts(); refresh(); }
  });

  function renderCounts() {
    pz.n.textContent = data.squatting;
    pz.m.textContent = data.online;
  }

  // Seats on the paving (y 56%-95% of the painting): rows from back to
  // front, staggered, smaller further back. The first seats are front and
  // centre, so your own cat (always first) is easy to find.
  function seats(n) {
    const rows = n <= 3 ? 1 : n <= 8 ? 2 : n <= 14 ? 3 : n <= 22 ? 4 : 5;
    const per = [];
    let left = n;
    for (let r = 0; r < rows; r++) { const k = Math.ceil(left / (rows - r)); per.push(k); left -= k; }
    const out = [];
    for (let r = 0; r < rows; r++) {                       // r = 0 is the front row
      const t = rows === 1 ? 0.65 : 1 - r / (rows - 1);   // 1 = front, 0 = back
      const y = rows === 1 ? 84 : 69 + t * 21;             // feet line
      const s = 0.62 + 0.38 * t;                           // depth scale
      const half = 36 + 5 * t;                             // the paving narrows toward the back
      const k = per[r];
      const sp = Math.min(2 * half / k, 17);               // a few cats stay close together, in view
      const x0 = 50 - sp * k / 2;
      const shift = k > 1 ? (r % 2 ? 0.2 : -0.2) * sp : 0;
      const tw = Math.min(sp * 0.56, 11.5) * s;
      const xs = Array.from({ length: k }, (_, i) => x0 + (i + 0.5) * sp + shift)
        .sort((a, b) => Math.abs(a - 50) - Math.abs(b - 50));
      for (const x of xs) out.push({ x, y, s, tw });
    }
    return out;
  }

  function render() {
    renderCounts();
    const real = data.cats || [];
    const list = [...real.filter((c) => c.me), ...real.filter((c) => !c.me).sort((a, b) => a.userId - b.userId), ...BOTS].slice(0, 48);
    const spots = seats(list.length);
    pz.labels.classList.toggle('crowded', list.length > 14);
    const seen = new Set();
    list.forEach((c, i) => {
      const key = String(c.userId);
      seen.add(key);
      let n = nodes.get(key);
      if (!n) {
        n = { unit: document.createElement('button'), label: document.createElement('div') };
        n.unit.type = 'button';
        n.unit.className = 'pz-cat';
        n.unit.dataset.uid = key;
        n.label.className = 'pz-label';
        pz.cats.appendChild(n.unit);
        pz.labels.appendChild(n.label);
        nodes.set(key, n);
      }
      const p = spots[i];
      const id = catIdOf(c.cat);
      const squat = !!c.squatting;
      const stateKey = id + '|' + squat + '|' + !!c.me;
      if (n.unit.dataset.state !== stateKey) {
        n.unit.dataset.state = stateKey;
        const lift = TRAY.cat.lift * 100;
        const cw = TRAY.cat.w * 100;
        const poseStyle = squat
          ? `left:${50 + TRAY.cat.dx * 100 - cw / 2}%;width:${cw}%;bottom:${lift}%`
          : 'left:76%;width:60%;bottom:-3%';
        n.unit.innerHTML = `
          <img class="pz-tray" src="${TRAY.src}" alt="" draggable="false">
          ${catImg(id, squat ? 'squat' : 'sit', 'pz-pose')}
          <img class="pz-rim" src="${TRAY.src}" alt="" draggable="false" style="clip-path:${TRAY.rim}" ${squat ? '' : 'hidden'}>
`;
        n.unit.querySelector('.pz-pose').setAttribute('style', poseStyle);
        n.unit.classList.toggle('squat', squat);
        n.unit.classList.toggle('me', !!c.me);
        n.unit.classList.toggle('bot', !!c.bot);
        n.unit.style.setProperty('--hue', hueOf(c.userId) + 'deg');
      }
      n.unit.setAttribute('aria-label', `${(c.cat && c.cat.name) || '猫咪'}（${c.username}）`);
      Object.assign(n.unit.style, {
        left: (p.x - 0.2 * p.tw) + '%', bottom: (100 - p.y) + '%', width: p.tw + '%', zIndex: zOf(p.y),
      });
      n.label.classList.toggle('me', !!c.me);
      n.label.classList.toggle('squat', squat);
      n.label.style.left = p.x + '%';
      n.label.style.top = (p.y + 0.6) + '%';
      n.label.style.setProperty('--s', p.s);
      n.label.dataset.since = squat ? String(Date.now() - (c.squatSeconds || 0) * 1000) : '';
      n.label.innerHTML = `<b>${c.me ? '<span class="me-chip">我</span>' : ''}${esc((c.cat && c.cat.name) || '还没有猫')}</b>
        <small>${esc(c.username)}${squat ? ` · <span class="sq">蹲坑 <span class="t">${mmss(c.squatSeconds || 0)}</span></span>` : ''}</small>`;
    });
    for (const [key, n] of nodes) {
      if (!seen.has(key)) { n.unit.remove(); n.label.remove(); nodes.delete(key); }
    }
  }
  function tickLabels() {
    const now = Date.now();
    for (const n of nodes.values()) {
      const since = +n.label.dataset.since;
      if (!since) continue;
      const t = n.label.querySelector('.t');
      if (t) t.textContent = mmss((now - since) / 1000);
    }
  }

  // ---------- a cat's card, and asking to visit ----------
  let pendingVisit = null;   // { id, userId, card, timer }

  function openCard(c) {
    const id = catIdOf(c.cat);
    const lv = clampLv(c.level);
    const name = (c.cat && c.cat.name) || '还没有猫';
    const card = modal({ cls: 'pz-card', html: `
      <div class="cc-head">
        <div class="cc-pic">${catImg(id, 'sit')}</div>
        <div class="cc-text">
          <b>${esc(name)}${genderMark(c.cat && c.cat.gender)}</b>
          <small>铲屎官 · ${esc(c.username)}</small>
          <span class="cc-lv"><span class="lv">Lv.${lv}</span>${esc(levelArt(lv).name)}</span>
          ${c.squatting ? '<span class="cc-state">正在蹲坑中…</span>' : ''}
        </div>
      </div>
      <div class="cc-action"></div>`, onClose: () => {
        if (pendingVisit && pendingVisit.card === card) { clearTimeout(pendingVisit.timer); pendingVisit = null; }
      } });
    const act = card.body.querySelector('.cc-action');
    const idle = () => {
      if (c.me) { act.innerHTML = '<p class="cc-msg">这是你自己的猫喵～</p>'; return; }
      const why = c.bot ? '测试猫，不能串门' : !c.allowVisits ? '对方关闭了串门' : '';
      act.innerHTML = `<button class="big-btn cc-go" type="button" ${why ? 'disabled' : ''}>${why || '去串门'}</button>`;
      if (!why) act.querySelector('.cc-go').addEventListener('click', ask);
    };
    const done = (text) => {
      act.innerHTML = `<p class="cc-msg">${esc(text)}</p><button class="big-btn plain cc-ok" type="button">知道了</button>`;
      act.querySelector('.cc-ok').addEventListener('click', () => card.close());
    };
    async function ask() {
      act.innerHTML = '<div class="cc-wait"><span class="s-dots"><i></i><i></i><i></i></span>正在敲门…</div>';
      try {
        const r = await api.call('POST', 'visits', { to: c.userId });
        if (!card.open) return;
        act.innerHTML = '<div class="cc-wait"><span class="s-dots"><i></i><i></i><i></i></span>等待对方同意…</div>';
        pendingVisit = {
          id: r.id, userId: c.userId, card, done,
          timer: setTimeout(() => {
            if (pendingVisit && pendingVisit.id === r.id) { pendingVisit = null; done('对方没有回应，过会儿再试试吧'); }
          }, VISIT_WAIT_MS),
        };
      } catch (err) {
        if (err.status === 401) { S.lostToken(); return; }
        done(message(err));
      }
    }
    idle();
  }

  S.on('visit_answer', (d) => {
    const p = pendingVisit;
    if (!p || d.id !== p.id) return;
    clearTimeout(p.timer);
    pendingVisit = null;
    if (d.accepted) { p.card.close(); openVisit(p.userId); } else p.done('对方拒绝了你的串门请求');
  });

  // ---------- being asked ----------
  S.on('visit_request', (d) => {
    const from = d.from || {};
    const left = Math.max(0, (d.expiresAt || Date.now() + VISIT_WAIT_MS) - Date.now());
    const m = modal({ title: '有客人敲门', cls: 's-urgent vr', closable: false, html: `
      <div class="vr-head">
        <div class="cc-pic">${catImg(catIdOf(from.cat), 'sit')}</div>
        <p><b>${esc(from.username || '有人')}</b> 想来参观你的厕所</p>
      </div>
      <div class="s-row">
        <button class="big-btn plain" type="button" data-a="no">拒绝</button>
        <button class="big-btn" type="button" data-a="yes">同意</button>
      </div>
      <p class="s-hint">一分钟内不回答就算了</p>` });
    const timer = setTimeout(() => m.close(), left);
    m.body.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      const accept = b.dataset.a === 'yes';
      m.body.querySelectorAll('button').forEach((x) => { x.disabled = true; });
      try {
        await api.call('POST', `visits/${d.id}/answer`, { accept });
        if (accept) {
          toast(`${from.username || '客人'} 来串门啦～`);
          setTimeout(() => G.say('有客人来啦喵！'), 400);
        }
      } catch (err) {
        if (err.status === 401) { S.lostToken(); return; }
        toast(message(err));
      }
      clearTimeout(timer);
      m.close();
    });
  });

  // =====================================================================
  // Someone else's room, read-only
  // =====================================================================
  let vz = null, visiting = null;

  function buildVisit() {
    const el = S.screen('vz', `
      <div class="vz-stage">
        <div class="vz-room"><div class="vz-scene"></div></div>
        <header class="s-hud">
          <button class="s-pill vz-back" type="button">${ICON_BACK}<span>回广场</span></button>
          <div class="s-points" title="我的积分">${S.COIN.replace('coin sm', 'coin')}<b class="vz-pts">0</b></div>
        </header>
      </div>
      <section class="vz-panel">
        <div class="card vz-info">
          <div class="vz-thumb"></div>
          <div class="vz-text"><b class="vz-title"></b><small class="vz-sub"></small></div>
        </div>
        <div class="vz-actions">
          <button class="big-btn vz-gift" type="button">${S.COIN}<span>送礼物</span></button>
          <button class="big-btn plain vz-back" type="button">回广场</button>
        </div>
      </section>`);
    el.hidden = true;
    vz = { el, room: el.querySelector('.vz-room'), scene: el.querySelector('.vz-scene'), pts: el.querySelector('.vz-pts') };
    dragScroll(vz.room);
    el.querySelectorAll('.vz-back').forEach((b) => b.addEventListener('click', closeVisit));
    el.querySelector('.vz-gift').addEventListener('click', openGift);
  }
  const showPoints = () => { if (vz) vz.pts.textContent = G.state.points.toLocaleString('en-US'); };
  S.on('points', showPoints);

  async function openVisit(userId) {
    let room;
    try {
      room = await api.call('GET', `rooms/${userId}`);
    } catch (err) {
      if (err.status === 401) { S.lostToken(); return; }
      toast(message(err));
      return;
    }
    if (!vz) buildVisit();
    visiting = room;
    drawRoom(room);
    const lv = clampLv(room.level);
    const name = (room.cat && room.cat.name) || '猫咪';
    vz.el.querySelector('.vz-thumb').innerHTML = catImg(catIdOf(room.cat), 'sit');
    vz.el.querySelector('.vz-title').textContent = `${room.username} 的厕所`;
    vz.el.querySelector('.vz-sub').innerHTML = `${esc(name)}${genderMark(room.cat && room.cat.gender)} · <span class="lv">Lv.${lv}</span> ${esc(levelArt(lv).name)}`;
    showPoints();
    vz.el.hidden = false;
    requestAnimationFrame(() => centreOn(vz.room, vz.scene, 52.5));
  }
  function closeVisit() {
    if (vz) vz.el.hidden = true;
    visiting = null;
    if (isOpen) refresh();
  }

  // Same layout tables and placement rules as the room (js/game.js).
  function drawRoom(room) {
    const sc = vz.scene;
    sc.innerHTML = '<img class="vz-bg" src="assets/room-bg.jpg" alt="" draggable="false"><div class="vz-wall"></div>';
    const wall = G.WALLS.find((w) => w.id === room.wall) || G.WALLS[0];
    const tint = sc.querySelector('.vz-wall');
    tint.style.backgroundColor = wall.color || 'transparent';
    tint.style.opacity = wall.color ? 1 : 0;
    const sprite = (src, p, cls = '') => {
      const n = document.createElement('div');
      n.className = 'sprite ' + cls;
      n.innerHTML = `<img src="${src}" alt="" draggable="false">`;
      n.style.left = p.x + '%';
      n.style.bottom = (100 - p.y) + '%';
      if (p.w != null) n.style.width = p.w + '%';
      if (p.z != null) n.style.zIndex = p.z;
      sc.appendChild(n);
      return n;
    };
    const POS = G.POS;
    sprite('assets/bag.png', { ...POS.bag, z: zOf(POS.bag.y) }, 'shadowed');
    sprite('assets/scoop.png', { ...POS.scoop, z: zOf(POS.scoop.y) });
    const a = levelArt(clampLv(room.level));
    sprite(a.src, { x: POS.box.x, y: POS.box.y, w: a.w, z: zOf(POS.box.y) });
    const owned = room.owned && typeof room.owned === 'object' ? room.owned : {};
    for (const it of G.ITEMS) {
      if (!owned[it.id]) continue;
      const z = it.pos.z != null ? it.pos.z : zOf(it.pos.y);
      sprite(it.src, { ...it.pos, z }, (it.flat ? '' : 'shadowed') + (it.glow ? ' glow' : ''));
      if (it.rim) sprite(it.src, { ...it.pos, z: z + 2 }).firstChild.style.clipPath = it.rim;
    }
    const cat = sprite(catSrc(catIdOf(room.cat), 'sit'), { ...POS.cat, z: zOf(POS.cat.y) }, 'shadowed vz-cat');
    cat.firstChild.dataset.fallback = catSrc(null, 'sit');
  }

  // ---------- gifts ----------
  function openGift() {
    if (!visiting) return;
    const to = visiting;
    const have = G.state.points;
    const m = modal({ title: `送礼物给 ${to.username}`, cls: 'gift', html: `
      <p class="s-hint gift-have">你现在有 ${S.COIN} <b>${have.toLocaleString('en-US')}</b> 积分</p>
      <div class="gift-opts">${GIFTS.map((n) => `
        <button class="gift-opt" type="button" data-n="${n}" ${have >= n ? '' : 'disabled'}>
          ${S.COIN.replace('coin sm', 'coin')}<b>${n}</b><small>${have >= n ? '积分' : '积分不够'}</small></button>`).join('')}
      </div>
      <p class="s-hint">送出的积分会从你的积分里扣掉</p>` });
    m.body.addEventListener('click', async (e) => {
      const b = e.target.closest('.gift-opt');
      if (!b || b.disabled) return;
      const n = +b.dataset.n;
      if (G.state.points < n) { toast('积分不够喵'); return; }
      m.body.querySelectorAll('.gift-opt').forEach((x) => { x.disabled = true; });
      // pay first, refund if the server says no
      G.addPoints(-n); G.save(); G.renderPanel(); showPoints();
      try {
        await api.call('POST', 'gifts', { to: to.userId, kind: 'points', amount: n });
        m.close();
        toast(`送给 ${to.username} ${n} 积分啦！`);
      } catch (err) {
        G.addPoints(n); G.save(); G.renderPanel(); showPoints();
        m.close();
        if (err.status === 401) { S.lostToken(); return; }
        toast(message(err));
      }
    });
  }

  // =====================================================================
  // The room's 广场 tab
  // =====================================================================
  window.addEventListener('game:open-plaza', (e) => {
    e.preventDefault();
    if (S.mode === 'online') { open(); return; }
    if (S.mode === 'guest') {
      const m = modal({ title: '广场', cls: 'pz-guest', html: `
        <div class="guest-pic"><img src="assets/plaza-bg.jpg" alt="" draggable="false"></div>
        <p class="guest-text">广场要用<b>联网版</b>才能逛：在那里能看到大家的猫正在蹲坑，还能去别人家串门、送积分。</p>
        <p class="s-hint">现在是单机模式，进度只存在这台设备上。</p>
        <button class="big-btn plain" type="button">知道了</button>` });
      m.body.querySelector('button').addEventListener('click', () => m.close());
      return;
    }
    toast('还在连接服务器，稍等一下喵～');
  });

  S.plaza = { open, close, refresh, openVisit, get data() { return data; }, seats };
})();
