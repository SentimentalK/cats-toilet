/* 俺家的猫厕所 — room screen prototype.
   Single-player, state in localStorage. Timings are sped up for the demo
   (a poop every few seconds); the real game would run on minutes. */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const SAVE_KEY = 'cats-toilet-proto-v1';
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // ---------- tuning ----------
  const COSTS = [50, 120, 250, 450, 700, 1000, 1400, 1900, 2500, 3200];
  const LEVELS = Array.from({ length: 11 }, (_, lv) => ({
    cap: 3 + Math.floor(lv / 2),              // poops the box holds
    every: Math.max(2.5, 6 - lv * 0.35),      // seconds per poop while squatting
    value: 10 + lv * 5,                       // points per scooped poop
    cost: lv < 10 ? COSTS[lv] : null,         // price of the next level
    art: lv === 0 ? 0 : lv <= 3 ? 1 : lv <= 6 ? 2 : 3,
  }));
  const SLEEP_AFTER_MS = 25000;   // untouched this long -> the cat goes to sleep
  const FEED_COST = 10;           // points for one bowl of kibble
  const EAT_MS = 3200;
  const FED_MS = 60000;           // how long "full" lasts
  const FED_SPEEDUP = 0.6;        // poop interval multiplier while full
  const FRESHENER_BONUS = 5;      // extra points per poop with the deodorizer

  // ---------- art layout ----------
  // Scene positions are % of the 4:3 scene: x = centre, y = where the feet
  // touch the floor (from the top), w = width. Sprites stack by y unless a
  // z is given.
  // Box art, all in % of the box image: `rim` = the part redrawn in front of
  // the cat (front wall, or the whole hood minus its doorway), `cat` = squat
  // placement (dx, w as a share of box width; lift as a share of box height),
  // `litter` = where poops pile up: the strip of litter behind the squatting
  // cat's rear (the cat faces left, so that is the right end of the box).
  const BOX_ART = [
    { src: 'assets/box-0.png', name: '塑料小盆', aspect: 1.75, w: 20,
      rim: 'polygon(0 44%, 16% 48%, 45% 56%, 70% 61%, 80% 52%, 90% 38%, 100% 22%, 100% 100%, 0 100%)',
      cat: { dx: -0.11, lift: 0.47, w: 0.78 }, litter: { x0: 64, x1: 76, y0: 50, y1: 53 } },
    { src: 'assets/box-1.png', name: '圆边猫砂盆', aspect: 1.70, w: 20,
      rim: 'polygon(0 45%, 20% 52%, 45% 58%, 72% 62%, 85% 50%, 100% 28%, 100% 100%, 0 100%)',
      cat: { dx: -0.10, lift: 0.45, w: 0.78 }, litter: { x0: 66, x1: 78, y0: 52, y1: 56 } },
    { src: 'assets/box-2.png', name: '半封闭猫砂盆', aspect: 1.28, w: 20,
      rim: 'polygon(0 52%, 12% 57%, 35% 63%, 62% 67%, 70% 63%, 74% 50%, 80% 40%, 90% 30%, 93% 8%, 100% 8%, 100% 100%, 0 100%)',
      cat: { dx: -0.17, lift: 0.40, w: 0.72 }, litter: { x0: 55, x1: 67, y0: 60, y1: 64 } },
    { src: 'assets/box-3.png', name: '豪华猫厕小屋', aspect: 1.07, w: 20,
      rim: 'polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, 16% 68%, 16% 42%, 19% 34%, 27% 30%, 44% 30%, 51% 33%, 55% 41%, 55% 69%, 16% 68%)',
      cat: { dx: 0, lift: 0.18, w: 0.62 }, litter: { x0: 25, x1: 47, y0: 67, y1: 70 } },
  ];
  const POS = {
    box: { x: 42.5, y: 87 },
    cat: { x: 63, y: 93, w: 14 },
    bag: { x: 54.5, y: 79.5, w: 7.5 },
    scoop: { x: 50, y: 98, w: 7.5 },
  };
  const FOCUS_X = 52.5;   // what a narrow screen centres on when the room opens

  // k = width relative to the sitting cat; aspect = image w/h;
  // butt = where poop comes out, as a share of the squat image.
  // Every cat is a folder assets/cats/<id>/ holding <pose>.png for each pose
  // below plus walk-1..4.png, all drawn to the same layout as the first cat.
  // Two things do differ from cat to cat and are measured from the images
  // when they load: how far the tail sticks out sideways in the squat, and
  // the width of the run frames. Both are sized by height so every cat's
  // body comes out the same size.
  const DEFAULT_CAT = 'domestic-orange';
  const SQUAT_REF_ASPECT = 1.27;   // the first cat's squat image, w/h
  const WALK_REF = { w: 27, aspect: 1.46 };
  const POSES = {
    sit: { k: 1 },
    squat: { k: 1, aspect: 1.27, butt: { x: 0.79, y: 0.81 } },
    sleep: { k: 1.3 },
    happy: { k: 1.15 },
    eat: { k: 1.2 },
    loaf: { k: 1.3 },
    groom: { k: 1.06 },
    yawn: { k: 1.03 },
  };
  const POOP_SRC = ['assets/poop-1.png', 'assets/poop-2.png'];
  // Side-view scamper cycle, four gallop phases drawn facing left (stretched,
  // front paws landing, tucked, pushing off). Until all frames have loaded the
  // cat falls back to hopping across in its sitting pose.
  const WALK = { frames: [], w: 27, fps: 9, ready: false };

  // ---------- shop ----------
  // `pos` = where the item stands in the room. Items the cat uses also carry
  // `aspect`, `rim` (redrawn in front of the cat) and `cat` (placement, as for
  // the litter boxes).
  const ITEMS = [
    { id: 'bowl', group: 'gear', name: '猫食盆', price: 80, desc: '解锁喂食，吃饱了出货更快',
      src: 'assets/bowl-empty.png', full: 'assets/bowl-full.png', pos: { x: 90, y: 96.5, w: 7.5 } },
    { id: 'freshener', group: 'gear', name: '除臭小机器', price: 150, desc: `臭气消失，每坨多 ${FRESHENER_BONUS} 积分`,
      src: 'assets/freshener.png', pos: { x: 30.5, y: 84.5, w: 5.5 } },
    { id: 'rug', group: 'furniture', name: '爪印地毯', price: 120, desc: '软软的，踩着舒服',
      src: 'assets/rug.png', flat: true, pos: { x: 63, y: 99, w: 27, z: 3 } },
    { id: 'bed', group: 'furniture', name: '奶油猫窝', price: 200, desc: '困了会自己去窝里睡',
      src: 'assets/bed.png', aspect: 1.61, pos: { x: 79.5, y: 89.5, w: 20 },
      rim: 'polygon(0 36%, 10% 43%, 18% 56%, 30% 62%, 50% 66%, 68% 63%, 75% 52%, 88% 45%, 100% 34%, 100% 100%, 0 100%)',
      cat: { dx: -0.02, lift: 0.32, w: 0.72 } },
    { id: 'tree', group: 'furniture', name: '猫爬架', price: 400, desc: '猫咪会爬上去看风景',
      src: 'assets/tree.png', aspect: 0.43, pos: { x: 21.5, y: 82, w: 15 },
      rim: 'inset(6.5% 0 0 0)', cat: { dx: 0, lift: 0.915, w: 0.95 } },
    { id: 'lamp', group: 'decor', name: '蘑菇小夜灯', price: 160, desc: '放在窗台上暖暖的',
      src: 'assets/lamp.png', flat: true, glow: true, pos: { x: 64.5, y: 47.2, w: 5, z: 2 } },
    { id: 'picture', group: 'decor', name: '猫咪挂画', price: 100, desc: '挂在墙上的自画像',
      src: 'assets/picture.png', flat: true, pos: { x: 79.5, y: 62, w: 8.5, z: 2 } },
  ];
  const ITEM = Object.fromEntries(ITEMS.map((it) => [it.id, it]));
  // Wall colours are laid over the painted wall with a "color" blend, so only
  // the hue changes and the brushwork stays. null = the wall as painted.
  const WALLS = [
    { id: 'sky', name: '天空蓝', color: null, swatch: '#b9d3df', price: 0 },
    { id: 'pink', name: '樱花粉', color: '#e9c2ca', swatch: '#ecccd2', price: 60 },
    { id: 'mint', name: '薄荷绿', color: '#b9d9c2', swatch: '#c3dccb', price: 60 },
    { id: 'cream', name: '奶油黄', color: '#ebdcab', swatch: '#ebdfb8', price: 60 },
    { id: 'lilac', name: '薰衣草', color: '#cdc2e6', swatch: '#d3cae6', price: 60 },
  ];
  const SHOP_TABS = [['all', '全部'], ['gear', '用品'], ['furniture', '家具'], ['decor', '装饰'], ['wall', '墙面']];

  // ---------- state ----------
  const fresh = () => ({
    points: 0, level: 0, poops: [], totalSquatMs: 0, totalScooped: 0, seq: 1,
    owned: {}, walls: { sky: true }, wall: 'sky', fedUntil: 0,
    cat: null,               // { id, name, gender } once the player has picked one
  });
  let state = load();

  // ---------- developer cheats (URL only, never shown in the UI) ----------
  //   index.html?coins=3000            add points (negative takes them away)
  //   index.html?level=5               set the litter box level (0-10)
  //   index.html?items=all             own every shop item and wall colour
  //   index.html?reset=1               wipe the save first
  // They combine: ?reset=1&coins=500&level=3. Applied once, then removed from
  // the address bar so a reload does not apply them again.
  (function applyCheats() {
    let q;
    try { q = new URLSearchParams(location.search); } catch (_) { return; }
    const keys = ['coins', 'level', 'items', 'reset'];
    if (!keys.some((k) => q.has(k))) return;
    if (q.has('reset')) state = fresh();
    const coins = parseInt(q.get('coins'), 10);
    if (Number.isFinite(coins)) state.points = Math.max(0, state.points + coins);
    const level = parseInt(q.get('level'), 10);
    if (Number.isFinite(level)) {
      state.level = clamp(level, 0, 10);
      state.poops = state.poops.slice(0, LEVELS[state.level].cap);
    }
    if (q.get('items') === 'all') {
      for (const it of ITEMS) state.owned[it.id] = true;
      for (const w of WALLS) state.walls[w.id] = true;
    }
    save();
    keys.forEach((k) => q.delete(k));
    const rest = q.toString();
    try { history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash); } catch (_) { /* keep the URL as is */ }
  })();
  let squat = null;        // { startedAt, nextPoopAt } while squatting
  let busy = false;        // cat is on the move
  let eating = false;
  let lastTouch = Date.now();
  let treeSince = 0;
  let bubbleTimer = 0, toastTimer = 0, cheerTimer = 0, walkTimer = 0, idleTimer = 0, briefTimer = 0;
  const cat = { at: 'idle', pose: 'sit' };
  const itemEls = {};
  const justDropped = new Set();   // poop ids that should fall from the cat's rear when first drawn

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (raw && typeof raw.points === 'number') {
        const s = Object.assign(fresh(), raw);
        s.level = clamp(s.level | 0, 0, 10);
        s.poops = Array.isArray(s.poops) ? s.poops.slice(0, LEVELS[s.level].cap) : [];
        s.owned = Object.assign({}, s.owned);
        s.walls = Object.assign({ sky: true }, s.walls);
        if (!WALLS.some((w) => w.id === s.wall) || !s.walls[s.wall]) s.wall = 'sky';
        return s;
      }
    } catch (_) { /* storage unavailable or corrupt: start fresh */ }
    return fresh();
  }
  // Other screens (account sync, plaza) hook in through window events, so
  // this file never needs to know about them.
  // (a hoisted declaration: the URL cheats above already save, and so emit)
  function emit(name, detail) { return window.dispatchEvent(new CustomEvent(name, { detail, cancelable: true })); }
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (_) { /* play without saving */ }
    emit('game:save', state);
  }

  const lv = () => LEVELS[state.level];
  const art = () => BOX_ART[lv().art];
  const fed = () => Date.now() < state.fedUntil;
  const poopEvery = () => lv().every * (fed() ? FED_SPEEDUP : 1);
  const poopValue = () => lv().value + (state.owned.freshener ? FRESHENER_BONUS : 0);
  const fmt = (n) => n.toLocaleString('en-US');
  const CAT_ID = (state.cat && /^[a-z0-9-]+$/.test(state.cat.id || '')) ? state.cat.id : DEFAULT_CAT;
  const poseSrc = (name) => `assets/cats/${CAT_ID}/${name}.png`;
  WALK.frames = [1, 2, 3, 4].map((i) => poseSrc('walk-' + i));

  // ---------- elements ----------
  const el = {
    room: $('#room'), scene: $('#scene'), box: $('#box'), rim: $('#rim'), cat: $('#cat'), bag: $('#bag'), scoop: $('#scoop'),
    poops: $('#poops'), stink: $('#stink'), bubble: $('#bubble'), fx: $('#fx'), toast: $('#toast'),
    points: $('#points'), pointsNum: $('#points-num'),
    status: $('#status'), thumb: $('#status-thumb'), lvBadge: $('#lv-badge'), boxName: $('#box-name'),
    upChip: $('#up-chip'), buff: $('#buff'),
    pips: $('#pips'), timer: $('#timer'), timerLabel: $('#timer-label'),
    statTime: $('#stat-time'), statScooped: $('#stat-scooped'), statValue: $('#stat-value'),
    tabSquat: $('#tab-squat'), tabScoop: $('#tab-scoop'), tabShop: $('#tab-shop'), tabPlaza: $('#tab-plaza'),
    scoopBadge: $('#scoop-badge'), shopDot: $('#shop-dot'),
    sheetWrap: $('#sheet-wrap'), sheetTitle: $('#sheet-title'), sheetBody: $('#sheet-body'),
  };
  const catImg = el.cat.querySelector('img');
  const boxImg = el.box.querySelector('img');
  const rimImg = el.rim.querySelector('img');
  const wallTint = document.createElement('div');
  wallTint.id = 'wall-tint';
  el.scene.insertBefore(wallTint, el.scene.children[1]);

  // ---------- placement ----------
  const zOf = (y) => Math.round(y * 10);
  function place(node, p) {
    node.style.left = p.x + '%';
    node.style.bottom = (100 - p.y) + '%';
    if (p.w != null) node.style.width = p.w + '%';
    if (p.z != null) node.style.zIndex = p.z;
  }
  // height of a sprite in % of scene height (scene is always 4:3)
  const hPct = (wPct, aspect) => wPct * (4 / 3) / aspect;
  function pop(...imgs) {
    for (const img of imgs) { img.classList.remove('pop'); void img.offsetWidth; img.classList.add('pop'); }
  }
  function mkSprite(src, p) {
    const node = document.createElement('div');
    node.className = 'sprite';
    const img = document.createElement('img');
    img.src = src; img.alt = ''; img.draggable = false;
    node.appendChild(img);
    place(node, p);
    el.scene.appendChild(node);
    return node;
  }

  function layoutBox(withPop) {
    const a = art(), z = zOf(POS.box.y);
    const p = { x: POS.box.x, y: POS.box.y, w: a.w };
    boxImg.src = a.src; rimImg.src = a.src;
    place(el.box, { ...p, z }); place(el.rim, { ...p, z: z + 3 });
    rimImg.style.clipPath = a.rim;
    const h = hPct(a.w, a.aspect);
    Object.assign(el.poops.style, { left: p.x + '%', bottom: (100 - p.y) + '%', width: a.w + '%', height: h + '%', zIndex: z + 1 });
    Object.assign(el.stink.style, { left: (p.x - a.w * 0.22) + '%', bottom: (100 - p.y + h * 0.95) + '%', width: (a.w * 0.5) + '%', zIndex: z + 4 });
    if (withPop) pop(boxImg, rimImg);
  }

  // Where the cat stands for each place it can be. `fixed` spots give the
  // final width (the pose is known); otherwise w is the sitting width.
  function spotOf(where) {
    if (where === 'box') {
      const a = art(), h = hPct(a.w, a.aspect);
      return { x: POS.box.x + a.cat.dx * a.w, y: POS.box.y - a.cat.lift * h, w: a.w * a.cat.w, fixed: true, z: zOf(POS.box.y) + 2 };
    }
    if (where === 'bed' || where === 'tree') {
      const it = ITEM[where], p = it.pos, h = hPct(p.w, it.aspect);
      return { x: p.x + it.cat.dx * p.w, y: p.y - it.cat.lift * h, w: p.w * it.cat.w, fixed: true, z: zOf(p.y) + 1 };
    }
    if (where === 'treeBase') {
      const p = ITEM.tree.pos;
      return { x: p.x + 9, y: p.y + 4, w: POS.cat.w, z: zOf(p.y + 4) };
    }
    if (where === 'bowl') {
      const p = ITEM.bowl.pos;   // stand left of the bowl, facing it
      return { x: p.x - 6.5, y: p.y - 1, w: POS.cat.w, flip: true, z: zOf(p.y - 1) };
    }
    return { ...POS.cat, z: zOf(POS.cat.y) };
  }
  function setPose(name, where = cat.at) {
    const pose = POSES[name], spot = spotOf(where);
    catImg.src = poseSrc(name);
    let x = spot.x, w = spot.fixed ? spot.w : spot.w * pose.k;
    if (name === 'squat' && spot.fixed) {     // keep the height and the head end where the first cat's are
      w = spot.w * pose.aspect / SQUAT_REF_ASPECT;
      x += (w - spot.w) / 2;
    }
    place(el.cat, { x, y: spot.y, w });
    cat.pose = name;
    el.cat.dataset.pose = name;
    el.cat.classList.toggle('squatting', name === 'squat');
    el.cat.classList.toggle('sleeping', name === 'sleep');
    el.cat.classList.toggle('face-right', !!spot.flip);
    el.cat.classList.toggle('shadowed', !spot.fixed);
  }

  // ---------- moving around ----------
  const setWalkMs = (ms) => el.cat.style.setProperty('--walk', ms + 'ms');
  function startWalk(where, ms) {
    const spot = spotOf(where);
    const goingRight = spot.x > parseFloat(el.cat.style.left);
    setWalkMs(ms);
    el.cat.classList.add('walking', 'shadowed');
    if (!WALK.ready) { setPose('sit', where); return; }
    let f = 0;
    catImg.src = WALK.frames[0];
    place(el.cat, { x: spot.x, y: spot.y, w: WALK.w });
    cat.pose = 'walk';
    el.cat.dataset.pose = 'walk';
    el.cat.classList.remove('squatting', 'sleeping');
    el.cat.classList.add('framed');
    el.cat.classList.toggle('face-right', goingRight);
    clearInterval(walkTimer);
    walkTimer = setInterval(() => { f = (f + 1) % WALK.frames.length; catImg.src = WALK.frames[f]; }, 1000 / WALK.fps);
  }
  function endWalk() {
    clearInterval(walkTimer);
    el.cat.classList.remove('walking', 'framed', 'face-right');
  }

  // Walk to `where`, take `pose` there, then call `after`.
  function go(where, pose, after) {
    busy = true;
    clearTimeout(idleTimer); clearTimeout(briefTimer); clearTimeout(cheerTimer);
    el.cat.classList.remove('cheer');
    el.bubble.hidden = true;
    const arrive = () => {
      cat.at = where; busy = false;
      renderPanel(); scheduleIdle();
      if (after) after();
    };
    const walk = () => {
      const target = where === 'tree' ? 'treeBase' : where;
      const to = spotOf(target);
      const fromX = parseFloat(el.cat.style.left), fromY = 100 - parseFloat(el.cat.style.bottom);
      const dist = Math.hypot(to.x - fromX, (to.y - fromY) * 0.75);
      const ms = Math.round(clamp(dist * 45, 650, 2200));
      const zFrom = +el.cat.style.zIndex || 0;
      startWalk(target, ms);
      // step behind a rim late, step out from behind it early
      setTimeout(() => { el.cat.style.zIndex = to.z; }, ms * (to.z < zFrom ? 0.55 : 0.4));
      keepInView(to.x);
      setTimeout(() => {
        endWalk();
        if (where === 'tree') {            // hop up onto the top platform
          setWalkMs(320);
          setPose(pose, 'tree');
          el.cat.style.zIndex = spotOf('tree').z;
          setTimeout(arrive, 340);
        } else {
          setPose(pose, where);
          arrive();
        }
      }, ms + 30);
    };
    if (cat.at === 'tree') {               // hop down first
      setWalkMs(300);
      setPose('sit', 'treeBase');
      el.cat.style.zIndex = spotOf('treeBase').z;
      cat.at = 'treeBase';
      setTimeout(walk, 320);
    } else walk();
    renderPanel();
  }

  // ---------- camera (narrow screens scroll the room sideways) ----------
  function panTo(xPct, smooth = true) {
    const w = el.scene.offsetWidth, view = el.room.clientWidth;
    el.room.scrollTo({ left: clamp(xPct / 100 * w - view / 2, 0, Math.max(0, w - view)), behavior: smooth ? 'smooth' : 'auto' });
  }
  function keepInView(xPct) {
    const w = el.scene.offsetWidth, view = el.room.clientWidth;
    if (w <= view + 1) return;
    const px = xPct / 100 * w - el.room.scrollLeft;
    if (px < view * 0.2 || px > view * 0.8) panTo(xPct);
  }
  let camX = FOCUS_X;
  el.room.addEventListener('scroll', () => {
    camX = (el.room.scrollLeft + el.room.clientWidth / 2) / el.scene.offsetWidth * 100;
  }, { passive: true });
  window.addEventListener('resize', () => panTo(camX, false));
  // mouse users drag the room; touch scrolls natively
  let drag = null, dragged = false;
  el.room.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button === 0) drag = { x: e.clientX, left: el.room.scrollLeft };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 5) dragged = true;
    if (dragged) el.room.scrollLeft = drag.left - dx;
  });
  window.addEventListener('pointerup', () => { drag = null; setTimeout(() => { dragged = false; }, 0); });
  el.room.addEventListener('click', (e) => { if (dragged) { e.stopPropagation(); e.preventDefault(); } }, true);

  // ---------- poops ----------
  function slot(i, cap) {
    const a = art().litter;
    const t = cap === 1 ? 0.5 : i / (cap - 1);
    // odd ones sit a little further back so a full box reads as a pile
    return { x: a.x0 + t * (a.x1 - a.x0), y: a.y0 + t * (a.y1 - a.y0) - (i % 2 ? 7 : 0) };
  }
  // The squatting cat's rear, in % of the box image.
  function buttInBox() {
    const a = art(), c = a.cat, pose = POSES.squat;
    const ref = c.w * 100;                         // the first cat's width, % of box width
    const w = ref * pose.aspect / SQUAT_REF_ASPECT; // this cat's width (same height, longer or shorter tail)
    const h = w * a.aspect / pose.aspect;          // cat height, % of box height
    return { x: 50 + c.dx * 100 - ref / 2 + pose.butt.x * w, y: 100 - c.lift * 100 - (1 - pose.butt.y) * h };
  }
  function renderPoops() {
    const cap = lv().cap;
    const size = Math.max(13, Math.min(20, 70 / cap));
    const seen = new Set();
    state.poops.forEach((p, i) => {
      seen.add(String(p.id));
      let node = el.poops.querySelector(`[data-id="${p.id}"]`);
      if (!node) {
        node = document.createElement('button');
        node.className = 'poop';
        node.dataset.id = p.id;
        node.setAttribute('aria-label', '铲掉这坨便便');
        node.innerHTML = `<img src="${POOP_SRC[p.kind]}" alt="" draggable="false">`;
        node.addEventListener('click', () => { poke(); scoopOne(p.id); });
        el.poops.appendChild(node);
      }
      const s = slot(i, cap);
      if (justDropped.delete(p.id)) {
        // start the drop at the cat's rear: offsets are in % of the poop's own size
        const b = buttInBox();
        node.style.setProperty('--fx', ((b.x - s.x) / size * 100) + '%');
        node.style.setProperty('--fy', ((b.y - s.y) * 1.05 / (art().aspect * size) * 100 + 50) + '%');
      }
      node.style.left = s.x + '%';
      node.style.bottom = (100 - s.y) + '%';
      node.style.width = size + '%';
      node.style.zIndex = Math.round(s.y);
    });
    for (const node of [...el.poops.children]) if (!seen.has(node.dataset.id)) node.remove();
    el.stink.classList.toggle('on', !state.owned.freshener && state.poops.length >= Math.min(3, cap));
  }
  function addPoop() {
    const id = state.seq++;
    if (squat) justDropped.add(id);
    state.poops.push({ id, kind: Math.random() < 0.6 ? 0 : 1 });
    save(); renderPoops(); renderPanel();
  }

  // ---------- effects ----------
  function sceneXY(rect) {
    const s = el.scene.getBoundingClientRect();
    return { x: (rect.left + rect.width / 2 - s.left) / s.width * 100, y: (rect.top - s.top) / s.height * 100, w: rect.width / s.width * 100 };
  }
  function floatPoints(xPct, yPct, text) {
    const n = document.createElement('div');
    n.className = 'float-pts';
    n.textContent = text;
    n.style.left = xPct + '%'; n.style.top = yPct + '%';
    el.fx.appendChild(n);
    n.addEventListener('animationend', () => n.remove());
  }
  function say(text, ms = 3200) {
    clearTimeout(bubbleTimer);
    const r = sceneXY(el.cat.getBoundingClientRect());
    // keep the bubble inside the part of the room that is on screen
    const w = el.scene.offsetWidth, view = el.room.clientWidth;
    const lo = el.room.scrollLeft / w * 100, hi = (el.room.scrollLeft + view) / w * 100;
    const half = Math.min(18, (hi - lo) / 2);
    el.bubble.textContent = text;
    el.bubble.style.left = clamp(r.x, lo + half, hi - half) + '%';
    el.bubble.style.bottom = (100 - r.y + 2.5) + '%';
    el.bubble.hidden = true; void el.bubble.offsetWidth; el.bubble.hidden = false;
    bubbleTimer = setTimeout(() => { el.bubble.hidden = true; }, ms);
  }
  function toast(text) {
    clearTimeout(toastTimer);
    el.toast.textContent = text;
    el.toast.hidden = true; void el.toast.offsetWidth; el.toast.hidden = false;
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, 2200);
  }
  function addPoints(n) {
    state.points += n;
    el.pointsNum.textContent = fmt(state.points);
    el.points.classList.remove('bump'); void el.points.offsetWidth; el.points.classList.add('bump');
  }

  // ---------- the cat on its own ----------
  function scheduleIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(idleTick, 5000 + Math.random() * 4000);
  }
  function idleTick() {
    if (busy || squat || eating) { scheduleIdle(); return; }
    if (cat.pose === 'sleep') return;                 // sleeps until touched
    const now = Date.now();
    if (now - lastTouch > SLEEP_AFTER_MS) {
      if (state.owned.bed && cat.at === 'idle') go('bed', 'sleep');
      else if (cat.at !== 'bed') setPose('sleep');
      return;
    }
    if (cat.at === 'tree') {
      if (now - treeSince > 14000) go('idle', 'sit'); else scheduleIdle();
      return;
    }
    if (cat.at !== 'idle') { scheduleIdle(); return; }
    const r = Math.random();
    if (state.owned.tree && r < 0.2) { treeSince = now; go('tree', 'loaf'); return; }
    const pick = r < 0.45 ? 'groom' : r < 0.65 ? 'yawn' : r < 0.85 ? 'loaf' : 'sit';
    setPose(pick);
    if (pick === 'groom' || pick === 'yawn') {
      clearTimeout(briefTimer);
      briefTimer = setTimeout(() => {
        if (!busy && !squat && cat.at === 'idle' && cat.pose === pick) setPose('sit');
      }, pick === 'yawn' ? 1700 : 2600);
    }
    scheduleIdle();
  }
  // any interaction keeps the cat awake
  function poke() { lastTouch = Date.now(); if (cat.pose !== 'sleep') scheduleIdle(); }
  // touching the cat itself wakes it; returns true if it was asleep
  function wake() {
    lastTouch = Date.now();
    if (cat.pose !== 'sleep' || busy) return false;
    if (cat.at === 'idle') { setPose('sit'); say('喵？…我没睡着喵'); scheduleIdle(); }
    else go('idle', 'sit', () => say('睡饱了喵～'));
    return true;
  }

  // ---------- actions ----------
  function startSquat() {
    if (busy || squat || eating) return;
    if (state.poops.length >= lv().cap) { say('盆里满啦，先铲屎喵！'); return; }
    go('box', 'squat', () => {
      const now = Date.now();
      squat = { startedAt: now, nextPoopAt: now + poopEvery() * 1000 };
      emit('game:squat', { squatting: true });
      say('嗯——！使劲中…', 2200);
      renderPanel();
    });
  }

  function stopSquat(reason) {
    if (!squat || busy) return;
    state.totalSquatMs += Date.now() - squat.startedAt;
    squat = null; save();
    emit('game:squat', { squatting: false });
    go('idle', 'sit', () => {
      if (reason === 'full') say('拉满啦！快来铲屎喵～', 4000);
      else if (state.poops.length) say('舒服了喵～ 记得铲屎哦');
      else say('还没酝酿好喵…');
    });
  }

  function scoopOne(id, quiet) {
    const i = state.poops.findIndex((p) => p.id === id);
    if (i < 0) return false;
    const node = el.poops.querySelector(`[data-id="${id}"]`);
    const from = node ? sceneXY(node.getBoundingClientRect()) : null;
    const [p] = state.poops.splice(i, 1);
    const value = poopValue();
    state.totalScooped++;
    addPoints(value);
    save(); renderPoops(); renderPanel();

    if (from) {
      const to = sceneXY(el.bag.getBoundingClientRect());
      const fly = document.createElement('div');
      fly.className = 'fly';
      fly.innerHTML = `<img src="${POOP_SRC[p.kind]}" alt="">`;
      Object.assign(fly.style, { left: (from.x - from.w / 2) + '%', top: from.y + '%', width: from.w + '%' });
      el.fx.appendChild(fly);
      const s = el.scene.getBoundingClientRect();
      const dx = (to.x - from.x) / 100 * s.width, dy = (to.y - from.y) / 100 * s.height;
      fly.animate([
        { transform: 'translate(0,0) scale(1) rotate(0)', offset: 0 },
        { transform: `translate(${dx * 0.5}px, ${Math.min(dy, 0) - s.height * 0.12}px) scale(1.15) rotate(180deg)`, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(.35) rotate(360deg)`, opacity: 0.2, offset: 1 },
      ], { duration: 520, easing: 'ease-in-out' }).onfinish = () => {
        fly.remove();
        el.bag.querySelector('img').animate(
          [{ transform: 'scale(1,1)' }, { transform: 'scale(1.12,.88)' }, { transform: 'scale(1,1)' }], { duration: 260 });
      };
      floatPoints(from.x, from.y - 3, '+' + value);
      el.scoop.querySelector('img').animate(
        [{ transform: 'rotate(0)' }, { transform: 'translateY(-18%) rotate(-24deg)' }, { transform: 'rotate(0)' }],
        { duration: 380, easing: 'ease-out' });
    }
    if (!quiet && !state.poops.length) cheer();
    return true;
  }

  function scoopAll() {
    if (!state.poops.length) { say(squat ? '还在酝酿喵…' : '盆里干干净净喵～'); return; }
    keepInView(POS.box.x);
    const ids = state.poops.map((p) => p.id);
    ids.forEach((id, k) => setTimeout(() => scoopOne(id, k < ids.length - 1), k * 170));
  }

  function cheer() {
    if (squat || busy || eating || cat.at !== 'idle' || cat.pose === 'sleep') return;
    setPose('happy');
    el.cat.classList.add('cheer');
    say('谢谢铲屎官喵！');
    clearTimeout(cheerTimer);
    cheerTimer = setTimeout(() => {
      el.cat.classList.remove('cheer');
      if (!squat && !busy && cat.pose === 'happy') setPose('sit');
    }, 1700);
  }

  function feed() {
    poke();
    if (!state.owned.bowl) return;
    if (busy || eating) return;
    if (squat) { say('等我上完厕所喵…'); return; }
    if (fed()) { say('还饱着呢喵～'); return; }
    if (state.points < FEED_COST) { say(`买猫粮要 ${FEED_COST} 积分喵…`); return; }
    state.points -= FEED_COST;
    eating = true;
    save(); renderPanel();
    const bowlImg = itemEls.bowl.querySelector('img');
    bowlImg.src = ITEM.bowl.full;
    pop(bowlImg);
    go('bowl', 'eat', () => {
      say('吧唧吧唧…好吃喵！', EAT_MS);
      setTimeout(() => {
        bowlImg.src = ITEM.bowl.src;
        state.fedUntil = Date.now() + FED_MS;
        eating = false;
        save(); renderPanel();
        go('idle', 'sit', () => say('吃饱了，有感觉了喵！'));
      }, EAT_MS);
    });
  }

  function upgrade() {
    const cost = lv().cost;
    if (cost == null || state.points < cost) return;
    if (squat) stopSquat();
    const oldArt = lv().art;
    state.points -= cost;
    state.level++;
    save();
    layoutBox(lv().art !== oldArt);
    renderPoops(); renderPanel(); closeSheet();
    keepInView(POS.box.x);
    const r = sceneXY(el.box.getBoundingClientRect());
    floatPoints(r.x, r.y - 2, 'Lv.' + state.level + ' ↑');
    setTimeout(() => { if (!busy) say(lv().art !== oldArt ? '哇！新厕所喵！' : '厕所变高级了喵～'); }, 800);
  }

  // ---------- shop ----------
  function addItem(id, withPop) {
    const it = ITEM[id];
    if (!it || itemEls[id]) return;
    const z = it.pos.z != null ? it.pos.z : zOf(it.pos.y);
    const node = mkSprite(it.src, { ...it.pos, z });
    node.dataset.item = id;
    if (!it.flat) node.classList.add('shadowed');
    if (it.glow) node.classList.add('glow');
    itemEls[id] = node;
    const imgs = [node.firstChild];
    if (it.rim) {
      const rim = mkSprite(it.src, { ...it.pos, z: z + 2 });
      rim.firstChild.style.clipPath = it.rim;
      imgs.push(rim.firstChild);
    }
    if (id === 'bowl') {
      node.classList.add('tappable');
      node.setAttribute('role', 'button');
      node.setAttribute('aria-label', '喂食');
      node.addEventListener('click', feed);
    }
    if (withPop) pop(...imgs);
  }
  const BOUGHT_LINES = {
    bowl: '点一下猫食盆就能喂我喵！', freshener: '空气都变香了喵～', rug: '软软的，喜欢喵！',
    bed: '有自己的窝了喵！', tree: '我要爬到最高的地方喵！', lamp: '暖暖的喵～', picture: '画的是我吗喵？',
  };
  function buy(id) {
    const it = ITEM[id];
    if (!it || state.owned[id] || state.points < it.price) return;
    state.points -= it.price;
    state.owned[id] = true;
    save();
    closeSheet();
    addItem(id, true);
    renderPoops(); renderPanel();
    panTo(it.pos.x);
    setTimeout(() => { if (!busy) say(BOUGHT_LINES[id]); }, 900);
  }
  function applyWall() {
    const w = WALLS.find((x) => x.id === state.wall) || WALLS[0];
    wallTint.style.backgroundColor = w.color || 'transparent';
    wallTint.style.opacity = w.color ? 1 : 0;
  }
  function pickWall(id) {
    const w = WALLS.find((x) => x.id === id);
    if (!w) return;
    if (!state.walls[id]) {
      if (state.points < w.price) return;
      state.points -= w.price;
      state.walls[id] = true;
    }
    state.wall = id;
    save(); applyWall(); renderPanel(); closeSheet();
    setTimeout(() => { if (!busy) say(w.color ? `${w.name}的墙，好看喵！` : '还是原来的蓝色舒服喵～'); }, 500);
  }

  // ---------- panel ----------
  const mmss = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  };
  function renderPanel() {
    const L = lv(), a = art();
    el.pointsNum.textContent = fmt(state.points);
    el.thumb.src = a.src;
    el.lvBadge.textContent = 'Lv.' + state.level;
    el.boxName.textContent = a.name;
    const canUpgrade = L.cost != null && state.points >= L.cost;
    el.upChip.hidden = !canUpgrade;

    if (el.pips.children.length !== L.cap) {
      el.pips.innerHTML = Array.from({ length: L.cap }, () => `<img src="${POOP_SRC[0]}" alt="">`).join('');
    }
    [...el.pips.children].forEach((img, i) => img.classList.toggle('full', i < state.poops.length));

    el.status.classList.toggle('active', !!squat);
    el.timerLabel.textContent = squat ? '正在蹲坑' : '本次蹲坑';
    if (!squat) el.timer.textContent = '00:00';
    renderBuff();

    const mins = Math.floor((state.totalSquatMs + (squat ? Date.now() - squat.startedAt : 0)) / 60000);
    el.statTime.textContent = mins + ' 分钟';
    el.statScooped.textContent = state.totalScooped + ' 坨';
    el.statValue.textContent = poopValue();

    el.tabSquat.classList.toggle('on', !!squat);
    el.tabSquat.querySelector('span').textContent = squat ? '起身' : '蹲坑';
    el.scoopBadge.hidden = !state.poops.length;
    el.scoopBadge.textContent = state.poops.length;
    el.tabScoop.classList.toggle('cta', state.poops.length >= L.cap);
    el.shopDot.hidden = !canUpgrade;
  }
  function renderBuff() {
    const left = state.fedUntil - Date.now();
    el.buff.hidden = left <= 0;
    if (left > 0) el.buff.textContent = '吃饱了 ' + mmss(left);
  }

  // ---------- sheets ----------
  function openSheet(title, html) {
    el.sheetTitle.textContent = title;
    el.sheetBody.innerHTML = html;
    el.sheetBody.scrollTop = 0;
    el.sheetWrap.hidden = false;
  }
  function closeSheet() { el.sheetWrap.hidden = true; }

  const coin = '<span class="coin sm"><svg><use href="#i-paw"/></svg></span>';
  const priceBtn = (act, id, price) =>
    `<button class="buy" data-act="${act}" data-id="${id}" ${state.points >= price ? '' : 'disabled'}>${coin}${fmt(price)}</button>`;

  function openUpgrade() {
    const L = lv(), a = art();
    if (L.cost == null) {
      openSheet('猫砂盆已满级', `
        <div class="up-art"><figure><img src="${a.src}" alt="">Lv.10 · ${a.name}</figure></div>
        <p class="sheet-note">已经是全广场最豪华的厕所了喵！</p>`);
      return;
    }
    const N = LEVELS[state.level + 1], na = BOX_ART[N.art];
    const row = (label, cur, next, unit = '') =>
      `<div><span>${label}</span><b>${cur}${unit}${next !== cur ? ` → <span>${next}${unit}</span>` : ''}</b></div>`;
    const enough = state.points >= L.cost;
    openSheet('升级猫砂盆', `
      <div class="up-art">
        <figure><img src="${a.src}" alt="">Lv.${state.level} · ${a.name}</figure>
        <span class="arrow">➜</span>
        <figure><img src="${na.src}" alt="">Lv.${state.level + 1} · ${na.name}</figure>
      </div>
      <div class="up-rows">
        ${row('容量', L.cap, N.cap, ' 坨')}
        ${row('每坨积分', L.value, N.value)}
        ${row('出货速度', L.every.toFixed(1), N.every.toFixed(1), ' 秒/坨')}
      </div>
      <button class="big-btn" data-act="do-upgrade" ${enough ? '' : 'disabled'}>${coin} ${fmt(L.cost)} · ${enough ? '升级' : '积分不够'}</button>
      ${enough ? '' : `<p class="sheet-note">还差 ${fmt(L.cost - state.points)} 积分，多蹲坑多铲屎喵～</p>`}`);
  }

  function openShop(tab = 'all') {
    const L = lv(), a = art();
    const show = (group) => tab === 'all' || tab === group;
    let cards = '';
    if (show('gear')) {
      cards += `
        <div class="shop-card wide">
          <div class="shop-pic"><img src="${a.src}" alt=""></div>
          <div class="shop-text"><b>猫砂盆 Lv.${state.level}</b><small>${L.cost == null ? '已经满级啦' : '升级后装得更多、每坨更值钱'}</small></div>
          ${L.cost == null ? '<span class="own">满级</span>' : `<button class="buy" data-act="upgrade">${coin}${fmt(L.cost)}</button>`}
        </div>`;
    }
    for (const it of ITEMS) {
      if (!show(it.group)) continue;
      const owned = !!state.owned[it.id];
      cards += `
        <div class="shop-card${owned ? ' owned' : ''}">
          <div class="shop-pic"><img src="${it.full || it.src}" alt=""></div>
          <b>${it.name}</b><small>${it.desc}</small>
          ${owned ? '<span class="own">已拥有</span>' : priceBtn('buy', it.id, it.price)}
        </div>`;
    }
    if (show('wall')) {
      for (const w of WALLS) {
        const owned = !!state.walls[w.id], using = state.wall === w.id;
        cards += `
          <div class="shop-card${using ? ' owned' : ''}">
            <div class="shop-pic"><span class="swatch" style="background:${w.swatch}"></span></div>
            <b>${w.name}</b><small>墙面颜色</small>
            ${using ? '<span class="own">使用中</span>'
              : owned ? `<button class="buy plain" data-act="wall" data-id="${w.id}">换上</button>`
              : priceBtn('wall', w.id, w.price)}
          </div>`;
      }
    }
    openSheet('商店', `
      <div class="shop-tabs">${SHOP_TABS.map(([id, name]) =>
        `<button data-act="tab" data-id="${id}" class="${id === tab ? 'on' : ''}">${name}</button>`).join('')}</div>
      <div class="shop-grid">${cards}</div>`);
  }

  function openSettings() {
    openSheet('设置', `
      <p class="sheet-note" style="margin-bottom:12px">这是画风与玩法原型，节奏为演示做了加速。登录后进度存在云端；游客模式只存在这台设备的浏览器里。</p>
      <button class="big-btn plain" data-act="reset">重置存档</button>`);
  }

  el.sheetBody.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const id = b.dataset.id;
    switch (b.dataset.act) {
      case 'tab': openShop(id); break;
      case 'buy': buy(id); break;
      case 'wall': pickWall(id); break;
      case 'upgrade': openUpgrade(); break;
      case 'do-upgrade': upgrade(); break;
      case 'reset': {
        if (!confirm('确定要清空进度重新开始吗？猫咪会保留。')) return;
        // Write an empty save rather than deleting it, so a signed-in player's
        // cloud copy is reset too (the account layer uploads on game:save).
        const keepCat = state.cat;
        state = fresh();
        state.cat = keepCat;
        squat = null;
        save();
        const flush = window.social && window.social.flushNow;
        Promise.resolve(flush ? flush() : null).catch(() => {}).then(() => location.reload());
        break;
      }
    }
  });

  // ---------- loop ----------
  function tick() {
    const now = Date.now();
    if (!el.buff.hidden || fed()) renderBuff();
    if (!squat) return;
    el.timer.textContent = mmss(now - squat.startedAt);
    if (now >= squat.nextPoopAt) {
      squat.nextPoopAt = now + poopEvery() * 1000;
      if (state.poops.length < lv().cap) {
        addPoop();
        const a = art(), b = buttInBox(), h = hPct(a.w, a.aspect);
        floatPoints(POS.box.x - a.w / 2 + b.x / 100 * a.w + 3, POS.box.y - h + b.y / 100 * h - 4, '噗～');
      }
      if (state.poops.length >= lv().cap) stopSquat('full');
    }
  }

  // ---------- wire up ----------
  el.tabSquat.addEventListener('click', () => { poke(); squat ? stopSquat() : startSquat(); });
  el.tabScoop.addEventListener('click', () => { poke(); scoopAll(); });
  el.tabShop.addEventListener('click', () => { poke(); openShop(); });
  // the plaza screen, when loaded, takes this event over (preventDefault)
  el.tabPlaza.addEventListener('click', () => { poke(); if (emit('game:open-plaza')) toast('广场还在施工中喵～'); });
  el.status.addEventListener('click', () => { poke(); openUpgrade(); });
  $('#btn-settings').addEventListener('click', openSettings);
  $('#sheet-close').addEventListener('click', closeSheet);
  el.sheetWrap.addEventListener('click', (e) => { if (e.target === el.sheetWrap) closeSheet(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

  el.cat.classList.add('tappable');
  el.scoop.classList.add('tappable');
  el.cat.addEventListener('click', () => {
    if (wake() || busy) return;
    scheduleIdle();
    if (squat) say('别、别看喵…');
    else if (eating) say('吃饭呢，别闹喵');
    else if (cat.at === 'tree') say('上面风景好喵～');
    else say(state.poops.length ? '盆里有货，帮我铲一下喵～' : '想蹲坑了就点「蹲坑」喵');
  });
  el.scoop.addEventListener('click', () => { poke(); scoopAll(); });

  // load everything up front so it is also there offline
  const preload = [...Object.keys(POSES).map(poseSrc), ...BOX_ART.map((a) => a.src), ...POOP_SRC,
    ...ITEMS.flatMap((it) => [it.src, it.full].filter(Boolean))];
  for (const src of preload) new Image().src = src;
  Promise.all(WALK.frames.map((src) => new Promise((ok, fail) => {
    const im = new Image(); im.onload = () => ok(im); im.onerror = fail; im.src = src;
  }))).then(([first]) => {
    WALK.w = WALK_REF.w * (first.naturalWidth / first.naturalHeight) / WALK_REF.aspect;
    WALK.ready = true;
  }, () => { /* no walk frames: keep the hop */ });
  const squatProbe = new Image();
  squatProbe.onload = () => {
    const aspect = squatProbe.naturalWidth / squatProbe.naturalHeight;
    POSES.squat.aspect = aspect;
    // the rump sits about one body-height in from the head end, whatever the tail does
    POSES.squat.butt.x = Math.min(0.86, SQUAT_REF_ASPECT * 0.79 / aspect);
    if (cat.pose === 'squat') setPose('squat');
  };
  squatProbe.src = poseSrc('squat');

  el.tabSquat.querySelector('img').src = poseSrc('squat');
  place(el.bag, { ...POS.bag, z: zOf(POS.bag.y) });
  place(el.scoop, { ...POS.scoop, z: zOf(POS.scoop.y) });
  el.bag.classList.add('shadowed');
  layoutBox(false);
  for (const it of ITEMS) if (state.owned[it.id]) addItem(it.id, false);
  applyWall();
  // place the cat without the walk transition on first paint
  el.cat.style.transition = 'none';
  setPose('sit', 'idle');
  el.cat.style.zIndex = spotOf('idle').z;
  requestAnimationFrame(() => requestAnimationFrame(() => { el.cat.style.transition = ''; }));
  renderPoops(); renderPanel();
  panTo(FOCUS_X, false);
  setInterval(tick, 200);
  scheduleIdle();
  setTimeout(() => { if (!busy) say(state.totalScooped ? '欢迎回家喵～' : '欢迎来到俺家的猫厕所喵！', 4000); }, 600);

  // exposed for tuning/testing in the console
  window.__game = {
    get state() { return state; }, get cat() { return cat; }, get squatting() { return !!squat; },
    SAVE_KEY, CAT_ID, DEFAULT_CAT, say, toast,
    BOX_ART, POS, LEVELS, WALK, ITEMS, WALLS,
    layoutBox, setPose, go, renderPoops, renderPanel, addPoop, addPoints, save,
    addItem, buy, pickWall, feed, openShop, panTo,
  };
})();
