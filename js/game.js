(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const SAVE_KEY = 'cats-toilet-proto-v1';
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const SIM = window.CatSim;
  if (!SIM) throw new Error('CatSim missing');

  // ---------- developer cheats (URL only, never shown in the UI) ----------
  //   index.html?coins=3000           add points (negative takes them away)
  //   index.html?level=5              set every litter box to that level (0-10)
  //   index.html?items=all            own every shop item, toy and wall colour
  //   index.html?reset=1              wipe the save first
  //   index.html?clock=<epochMs>      move the clock to that instant (tests/debug)
  // They combine (?reset=1&coins=500&level=3), are applied once, then removed
  // from the address bar so a reload does not apply them again.
  //   window.__game.advanceClock(ms)  push the clock forward ms and recompute once
  const clock = { offset: 0 };
  const now = () => Date.now() + clock.offset;

  let params = null;
  try { params = new URLSearchParams(location.search); } catch (_) { params = null; }
  const param = (k) => (params && params.has(k) ? params.get(k) : null);
  const clockAt = parseInt(param('clock'), 10);
  if (Number.isFinite(clockAt)) clock.offset = clockAt - Date.now();

  const LEVELS = SIM.BOX_LEVELS;
  const SLEEP_AFTER_MS = 25000;
  const EAT_MS = 3200;
  const FOOD_BOWL_FULL = 'assets/bowl-full.png';
  const FOOD_BOWL_EMPTY = 'assets/bowl-empty.png';
  const FOCUS_X = 44;
  const SAVE_EVERY_MS = 10000;

  const BOX_ART = [
    { src: 'assets/box-0.png', name: '塑料小盆', aspect: 1.75, w: 11,
      rim: 'polygon(0 44%, 16% 48%, 45% 56%, 70% 61%, 80% 52%, 90% 38%, 100% 22%, 100% 100%, 0 100%)',
      cat: { dx: -0.11, lift: 0.47, w: 0.78 }, litter: { x0: 64, x1: 76, y0: 50, y1: 53 } },
    { src: 'assets/box-1.png', name: '圆边猫砂盆', aspect: 1.70, w: 11,
      rim: 'polygon(0 45%, 20% 52%, 45% 58%, 72% 62%, 85% 50%, 100% 28%, 100% 100%, 0 100%)',
      cat: { dx: -0.10, lift: 0.45, w: 0.78 }, litter: { x0: 66, x1: 78, y0: 52, y1: 56 } },
    { src: 'assets/box-2.png', name: '半封闭猫砂盆', aspect: 1.28, w: 11,
      rim: 'polygon(0 52%, 12% 57%, 35% 63%, 62% 67%, 70% 63%, 74% 50%, 80% 40%, 90% 30%, 93% 8%, 100% 8%, 100% 100%, 0 100%)',
      cat: { dx: -0.17, lift: 0.40, w: 0.72 }, litter: { x0: 55, x1: 67, y0: 60, y1: 64 } },
    { src: 'assets/box-3.png', name: '豪华猫厕小屋', aspect: 1.07, w: 11,
      rim: 'polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, 16% 68%, 16% 42%, 19% 34%, 27% 30%, 44% 30%, 51% 33%, 55% 41%, 55% 69%, 16% 68%)',
      cat: { dx: 0, lift: 0.18, w: 0.62 }, litter: { x0: 25, x1: 47, y0: 67, y1: 70 } },
  ];
  const POS = {
    box: { x: 33, y: 87 },
    boxes: [{ x: 33, y: 87, w: 11 }, { x: 21.5, y: 87, w: 11 }, { x: 44.5, y: 87, w: 11 }],
    cat: { x: 55.5, y: 93, w: 10.5 },
    bag: { x: 13, y: 96, w: 6.5 },
    scoop: { x: 28, y: 99, w: 6.5 },
    water: { x: 40, y: 99, w: 6.5 },
    food: { x: 47, y: 99, w: 6.5 },
    wand: { x: 7, y: 97.5 },
    mouse: { x: 19, y: 97.5 },
  };

  const DEFAULT_CAT = 'domestic-orange';
  const SQUAT_REF_ASPECT = 1.27;
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
  const WALK = { frames: [], w: 27, fps: 9, ready: false };

  const ITEMS = [
    { id: 'bowl', group: 'gear', name: '陶瓷饭盆', price: SIM.PRICES.bowlPro, desc: '饭盆容量更大、吃得更久',
      src: 'assets/bowl-empty.png', full: 'assets/bowl-full.png', pro: 'food', pos: { x: 47, y: 99, w: 6.5 } },
    { id: 'waterPro', group: 'gear', name: '高级水盆', price: SIM.PRICES.waterPro, desc: '一盆水顶 12 小时，不用总加',
      src: 'assets/bowl-empty.png', pro: 'water', pos: { x: 40, y: 99, w: 6.5 } },
    { id: 'freshener', group: 'gear', name: '除臭小机器', price: SIM.PRICES.freshener, desc: `臭气消失，每坨多 ${SIM.FRESHENER_BONUS} 积分`,
      src: 'assets/freshener.png', pos: { x: 21, y: 78, w: 5.5 } },
    { id: 'rug', group: 'furniture', name: '爪印地毯', price: SIM.PRICES.rug, desc: '软软的，踩着舒服',
      src: 'assets/rug.png', flat: true, pos: { x: 56, y: 99, w: 26, z: 3 } },
    { id: 'bed', group: 'furniture', name: '奶油猫窝', price: SIM.PRICES.bed, desc: '困了会自己去窝里睡',
      src: 'assets/bed.png', aspect: 1.61, pos: { x: 75.5, y: 89.5, w: 19 },
      rim: 'polygon(0 36%, 10% 43%, 18% 56%, 30% 62%, 50% 66%, 68% 63%, 75% 52%, 88% 45%, 100% 34%, 100% 100%, 0 100%)',
      cat: { dx: -0.02, lift: 0.32, w: 0.72 } },
    { id: 'tree', group: 'furniture', name: '猫爬架', price: SIM.PRICES.tree, desc: '猫咪会爬上去看风景',
      src: 'assets/tree.png', aspect: 0.43, pos: { x: 10, y: 82, w: 15 },
      rim: 'inset(6.5% 0 0 0)', cat: { dx: 0, lift: 0.915, w: 0.95 } },
    { id: 'lamp', group: 'decor', name: '蘑菇小夜灯', price: SIM.PRICES.lamp, desc: '放在窗台上暖暖的',
      src: 'assets/lamp.png', flat: true, glow: true, pos: { x: 64.5, y: 47.2, w: 5, z: 2 } },
    { id: 'picture', group: 'decor', name: '猫咪挂画', price: SIM.PRICES.picture, desc: '挂在墙上的自画像',
      src: 'assets/picture.png', flat: true, pos: { x: 79.5, y: 62, w: 8.5, z: 2 } },
  ];
  const ITEM = Object.fromEntries(ITEMS.map((it) => [it.id, it]));
  const OWNED_ALIAS = { bowl: 'bowlPro' };
  const ownedOf = (id) => !!state.owned[OWNED_ALIAS[id] || id] || !!state.owned[id];
  const WALLS = [
    { id: 'sky', name: '天空蓝', color: null, swatch: '#b9d3df', price: 0 },
    { id: 'pink', name: '樱花粉', color: '#e9c2ca', swatch: '#ecccd2', price: SIM.PRICES.wall },
    { id: 'mint', name: '薄荷绿', color: '#b9d9c2', swatch: '#c3dccb', price: SIM.PRICES.wall },
    { id: 'cream', name: '奶油黄', color: '#ebdcab', swatch: '#ebdfb8', price: SIM.PRICES.wall },
    { id: 'lilac', name: '薰衣草', color: '#cdc2e6', swatch: '#d3cae6', price: SIM.PRICES.wall },
  ];
  const SHOP_TABS = [
    ['all', '全部'], ['box', '猫砂盆'], ['food', '食物'], ['toy', '玩具'],
    ['gear', '用品'], ['furniture', '家具'], ['decor', '装饰'], ['wall', '墙面'],
  ];
  const FOOD_EMOJI = { kibble: '🥣', strip: '🍡', can: '🥫', treat: '🍪' };
  const TOY_EMOJI = { wand: '🧶', mouse: '🐭' };
  const WHY = {
    locked: '还没解锁这种食物喵',
    points: '积分不够喵',
    full: '饭盆装不下啦，等它吃完再买',
  };
  const ONBOARDING = [
    { title: '猫会自己拉便便', text: '不用你点，猫过一会儿就自己去猫砂盆。盆满了它就憋着，还会生气。' },
    { title: '铲屎换积分', text: '点便便或者下面的「铲屎」，把便便铲进垃圾袋，每坨都能换积分。' },
    { title: '积分能买东西', text: '商店里有更高级的猫砂盆、新猫砂盆、猫窝、高级饭盆水盆、食物和玩具。' },
    { title: '水和食物', text: '水盆点一下就加满，免费。食物要用积分买，吃完猫会饿。' },
    { title: '撸猫', text: '点猫就是摸头，摸头免费。买了逗猫棒、小老鼠陪它玩，它更开心，便便来得更快。' },
  ];

  let migrated = false;
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (raw && typeof raw.points === 'number') {
        migrated = raw.v !== 2;
        return SIM.migrate(raw, now());
      }
    } catch (_) { /* storage unavailable or corrupt: start fresh */ }
    return SIM.fresh(now());
  }
  let state = load();

  function emit(name, detail) { return window.dispatchEvent(new CustomEvent(name, { detail, cancelable: true })); }
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (_) { /* play without saving */ }
    emit('game:save', state);
  }
  if (migrated) save();

  let squattingNow = false;
  let busy = false;
  let lastTouch = now();
  let idleAt = 0;
  let idleHold = 0;
  let treeSince = 0;
  let grumpAt = 0;
  let lastSaveAt = 0;
  let bubbleTimer = 0, toastTimer = 0, cheerTimer = 0, walkTimer = 0;
  let sheetKind = null, shopTab = 'all', sheetBox = 0;
  const cat = { at: 'idle', pose: 'sit' };

  (function applyCheats() {
    if (!params) return;
    const keys = ['coins', 'level', 'items', 'reset', 'clock'];
    if (!keys.some((k) => params.has(k))) return;
    if (params.has('reset')) state = SIM.fresh(now());
    const coins = parseInt(params.get('coins'), 10);
    if (Number.isFinite(coins)) state.points = Math.max(0, state.points + coins);
    const level = parseInt(params.get('level'), 10);
    if (Number.isFinite(level)) {
      const lv = clamp(level, 0, 10);
      for (const box of state.boxes) {
        box.level = lv;
        box.poops = box.poops.slice(0, LEVELS[lv].cap);
      }
      SIM.syncLevel(state);
    }
    if (params.get('items') === 'all') {
      for (const it of ITEMS) state.owned[OWNED_ALIAS[it.id] || it.id] = true;
      for (const id of SIM.TOY_IDS) state.owned[id] = true;
      for (const w of WALLS) state.walls[w.id] = true;
    }
    save();
    keys.forEach((k) => params.delete(k));
    const rest = params.toString();
    try { history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash); } catch (_) { /* keep the URL as is */ }
  })();

  const fmt = (n) => n.toLocaleString('en-US');
  const CAT_ID = (state.cat && /^[a-z0-9-]+$/.test(state.cat.id || '')) ? state.cat.id : DEFAULT_CAT;
  const poseSrc = (name) => `assets/cats/${CAT_ID}/${name}.png`;
  WALK.frames = [1, 2, 3, 4].map((i) => poseSrc('walk-' + i));

  const el = {
    room: $('#room'), scene: $('#scene'), boxes: $('#boxes'), cat: $('#cat'), bag: $('#bag'), scoop: $('#scoop'),
    waterBowl: $('#water-bowl'), foodBowl: $('#food-bowl'), stink: $('#stink'),
    bubble: $('#bubble'), fx: $('#fx'), toast: $('#toast'),
    points: $('#points'), pointsNum: $('#points-num'),
    moodFace: $('#mood-face'), moodText: $('#mood-text'),
    waterText: $('#water-text'), waterBar: $('#water-bar'),
    foodText: $('#food-text'), foodBar: $('#food-bar'), reasons: $('#reasons'),
    boxStrip: $('#box-strip'),
    tabScoop: $('#tab-scoop'), tabShop: $('#tab-shop'), tabPlaza: $('#tab-plaza'),
    scoopBadge: $('#scoop-badge'), shopDot: $('#shop-dot'),
    onboarding: $('#onboarding'), onbStep: $('#onboarding-step'), onbText: $('#onboarding-text'),
    onbSkip: $('#onboarding-skip'), onbNext: $('#onboarding-next'),
    sheetWrap: $('#sheet-wrap'), sheetTitle: $('#sheet-title'), sheetBody: $('#sheet-body'),
  };
  const catImg = el.cat.querySelector('img');
  const wallTint = document.createElement('div');
  wallTint.id = 'wall-tint';
  el.scene.insertBefore(wallTint, el.scene.children[1]);

  const zOf = (y) => Math.round(y * 10);
  function place(node, p) {
    node.style.left = p.x + '%';
    node.style.bottom = (100 - p.y) + '%';
    if (p.w != null) node.style.width = p.w + '%';
    if (p.z != null) node.style.zIndex = p.z;
  }
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

  const boxArt = (i) => BOX_ART[(LEVELS[state.boxes[i] ? state.boxes[i].level : 0] || LEVELS[0]).art];
  const boxSlot = (i) => POS.boxes[i] || POS.box;

  const boxEls = [];
  function makeBoxSlot(i) {
    const root = document.createElement('div');
    root.className = 'sprite box-slot tappable';
    root.dataset.box = i;
    root.setAttribute('role', 'button');
    root.innerHTML = '<img class="box-img" alt="" draggable="false">' +
      '<div class="poops"></div>' +
      '<div class="sprite rim" aria-hidden="true"><img alt="" draggable="false"></div>' +
      '<span class="box-badge"></span>';
    el.boxes.appendChild(root);
    const rec = {
      root,
      img: root.querySelector('.box-img'),
      rim: root.querySelector('.rim'),
      rimImg: root.querySelector('.rim img'),
      poops: root.querySelector('.poops'),
      badge: root.querySelector('.box-badge'),
    };
    root.addEventListener('click', () => openBoxUpgrade(i));
    return rec;
  }
  function layoutBoxSlots() {
    while (boxEls.length < state.boxes.length) boxEls.push(makeBoxSlot(boxEls.length));
    while (boxEls.length > state.boxes.length) boxEls.pop().root.remove();
    state.boxes.forEach((box, i) => {
      const a = boxArt(i), p = boxSlot(i), z = zOf(p.y), rec = boxEls[i];
      rec.img.src = a.src;
      rec.rimImg.src = a.src;
      rec.rimImg.style.clipPath = a.rim;
      rec.root.style.left = (p.x - p.w / 2) + '%';
      rec.root.style.bottom = (100 - p.y) + '%';
      rec.root.style.width = p.w + '%';
      rec.img.style.zIndex = z;
      rec.poops.style.zIndex = z + 1;
      rec.rim.style.zIndex = z + 3;
      rec.badge.style.zIndex = z + 4;
      rec.badge.textContent = 'Lv.' + box.level;
      rec.root.classList.toggle('full', box.poops.length >= LEVELS[box.level].cap);
      rec.root.setAttribute('aria-label', `${a.name} Lv.${box.level}，点开升级`);
    });
  }

  function spotOf(where) {
    const m = /^box(\d*)$/.exec(where);
    if (m) {
      const i = clamp(parseInt(m[1] || '0', 10), 0, state.boxes.length - 1);
      const a = boxArt(i), p = boxSlot(i), h = hPct(p.w, a.aspect);
      return { x: p.x + a.cat.dx * p.w, y: p.y - a.cat.lift * h, w: p.w * a.cat.w, fixed: true, z: zOf(p.y) + 2 };
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
      const p = POS.food;
      return { x: p.x - 6.5, y: p.y - 1, w: POS.cat.w, flip: true, z: zOf(p.y - 1) };
    }
    return { ...POS.cat, z: zOf(POS.cat.y) };
  }
  function setPose(name, where = cat.at) {
    const pose = POSES[name], spot = spotOf(where);
    catImg.src = poseSrc(name);
    let x = spot.x, w = spot.fixed ? spot.w : spot.w * pose.k;
    if (name === 'squat' && spot.fixed) {
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

  function go(where, pose, after) {
    busy = true;
    clearTimeout(cheerTimer);
    el.cat.classList.remove('cheer');
    el.bubble.hidden = true;
    const arrive = () => {
      cat.at = where; busy = false;
      idleAt = now() + 3000;
      renderPanel();
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
      setTimeout(() => { el.cat.style.zIndex = to.z; }, ms * (to.z < zFrom ? 0.55 : 0.4));
      keepInView(to.x);
      setTimeout(() => {
        endWalk();
        if (where === 'tree') {
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
    if (cat.at === 'tree') {
      setWalkMs(300);
      setPose('sit', 'treeBase');
      el.cat.style.zIndex = spotOf('treeBase').z;
      cat.at = 'treeBase';
      setTimeout(walk, 320);
    } else walk();
    renderPanel();
  }

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

  const justDropped = new Set();
  const known = new Set();
  for (const box of state.boxes) for (const p of box.poops) known.add(p.id);

  function markNewPoops() {
    for (const box of state.boxes) {
      for (const p of box.poops) {
        if (known.has(p.id)) continue;
        known.add(p.id);
        justDropped.add(p.id);
      }
    }
  }
  function slotPos(a, i, cap) {
    const t = cap === 1 ? 0.5 : i / (cap - 1);
    return { x: a.litter.x0 + t * (a.litter.x1 - a.litter.x0), y: a.litter.y0 + t * (a.litter.y1 - a.litter.y0) - (i % 2 ? 7 : 0) };
  }
  function buttInBox(i) {
    const a = boxArt(i), c = a.cat, pose = POSES.squat;
    const ref = c.w * 100;
    const w = ref * pose.aspect / SQUAT_REF_ASPECT;
    const h = w * a.aspect / pose.aspect;
    return { x: 50 + c.dx * 100 - ref / 2 + pose.butt.x * w, y: 100 - c.lift * 100 - (1 - pose.butt.y) * h };
  }
  function renderBoxPoops(rec, i) {
    const box = state.boxes[i], a = boxArt(i), cap = LEVELS[box.level].cap;
    const size = Math.max(11, Math.min(20, 60 / cap));
    const seen = new Set();
    box.poops.forEach((p, k) => {
      const id = String(p.id);
      const node = rec.poops.querySelector(`[data-id="${id}"]`);
      const fresh = !node;
      const btn = node || document.createElement('button');
      if (fresh) {
        btn.className = 'poop';
        btn.dataset.id = p.id;
        btn.setAttribute('aria-label', '铲掉这坨便便');
        btn.innerHTML = `<img src="${POOP_SRC[p.kind]}" alt="" draggable="false">`;
        btn.addEventListener('click', (e) => { e.stopPropagation(); poke(); scoopOne(i, p.id); });
        rec.poops.appendChild(btn);
      }
      seen.add(id);
      const s = slotPos(a, k, cap);
      if (justDropped.delete(p.id)) {
        const b = buttInBox(i);
        btn.style.setProperty('--fx', ((b.x - s.x) / size * 100) + '%');
        btn.style.setProperty('--fy', ((b.y - s.y) * 1.05 / (a.aspect * size) * 100 + 50) + '%');
      }
      btn.style.left = s.x + '%';
      btn.style.bottom = (100 - s.y) + '%';
      btn.style.width = size + '%';
      btn.style.zIndex = Math.round(s.y);
    });
    for (const node of [...rec.poops.children]) if (!seen.has(node.dataset.id)) node.remove();
    rec.root.classList.toggle('full', box.poops.length >= cap);
    const card = el.boxStrip.querySelector(`.box-card[data-box="${i}"]`);
    if (card) [...card.querySelectorAll('.pip')].forEach((pip, k) => pip.classList.toggle('full', k < box.poops.length));
  }
  function renderStink() {
    const i = state.boxes.findIndex((box) => box.poops.length >= LEVELS[box.level].cap);
    if (state.owned.freshener || i < 0) { el.stink.classList.remove('on'); return; }
    const a = boxArt(i), p = boxSlot(i), h = hPct(p.w, a.aspect);
    el.stink.style.left = (p.x - p.w * 0.30) + '%';
    el.stink.style.bottom = (100 - p.y + h * 0.92) + '%';
    el.stink.style.width = (p.w * 0.62) + '%';
    el.stink.style.zIndex = zOf(p.y) + 4;
    el.stink.classList.add('on');
  }
  function renderBoxes() {
    if (boxEls.length !== state.boxes.length) layoutBoxSlots();
    state.boxes.forEach((box, i) => renderBoxPoops(boxEls[i], i));
    renderStink();
  }

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
  function syncPoints() {
    el.pointsNum.textContent = fmt(state.points);
  }
  function addPoints(n) {
    state.points += n;
    syncPoints();
    el.points.classList.remove('bump'); void el.points.offsetWidth; el.points.classList.add('bump');
  }

  function flyToBag(from, kind, delay) {
    if (!from) return null;
    const fly = document.createElement('div');
    fly.className = 'fly';
    fly.innerHTML = `<img src="${POOP_SRC[kind]}" alt="">`;
    Object.assign(fly.style, { left: (from.x - from.w / 2) + '%', top: from.y + '%', width: from.w + '%' });
    el.fx.appendChild(fly);
    const to = sceneXY(el.bag.getBoundingClientRect());
    const s = el.scene.getBoundingClientRect();
    const dx = (to.x - from.x) / 100 * s.width, dy = (to.y - from.y) / 100 * s.height;
    const anim = fly.animate([
      { transform: 'translate(0,0) scale(1) rotate(0)', offset: 0 },
      { transform: `translate(${dx * 0.5}px, ${Math.min(dy, 0) - s.height * 0.12}px) scale(1.15) rotate(180deg)`, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(.35) rotate(360deg)`, opacity: 0.2, offset: 1 },
    ], { duration: 520, delay: delay || 0, easing: 'ease-in-out', fill: 'both' });
    anim.onfinish = () => {
      fly.remove();
      el.bag.querySelector('img').animate(
        [{ transform: 'scale(1,1)' }, { transform: 'scale(1.12,.88)' }, { transform: 'scale(1,1)' }], { duration: 260 });
    };
    return anim;
  }

  function scoopOne(boxIndex, id) {
    const box = state.boxes[boxIndex];
    if (!box) return;
    const poop = box.poops.find((p) => p.id === id);
    if (!poop) return;
    const node = boxEls[boxIndex] ? boxEls[boxIndex].poops.querySelector(`[data-id="${id}"]`) : null;
    const from = node ? sceneXY(node.getBoundingClientRect()) : null;
    const gain = SIM.scoop(state, boxIndex, id);
    if (!gain) return;
    save(); renderBoxes(); renderPanel(); renderTick(now());
    flyToBag(from, poop.kind, 0);
    if (from) {
      floatPoints(from.x, from.y - 3, '+' + gain);
      el.scoop.querySelector('img').animate(
        [{ transform: 'rotate(0)' }, { transform: 'translateY(-18%) rotate(-24deg)' }, { transform: 'rotate(0)' }],
        { duration: 380, easing: 'ease-out' });
    }
    if (!state.boxes.some((b) => b.poops.length)) cheer();
  }
  function scoopAll() {
    const flights = [];
    state.boxes.forEach((box, i) => {
      box.poops.forEach((p) => {
        const node = boxEls[i] ? boxEls[i].poops.querySelector(`[data-id="${p.id}"]`) : null;
        flights.push({ from: node ? sceneXY(node.getBoundingClientRect()) : null, kind: p.kind });
      });
    });
    if (!flights.length) { say('盆里干干净净喵～'); return; }
    const total = SIM.scoopAll(state);
    if (!total) { renderBoxes(); return; }
    keepInView(POS.box.x);
    save(); renderBoxes(); renderPanel(); renderTick(now());
    flights.forEach((f, k) => flyToBag(f.from, f.kind, k * 130));
    const last = flights[flights.length - 1].from;
    if (last) floatPoints(last.x, last.y - 3, '+' + total);
    el.scoop.querySelector('img').animate(
      [{ transform: 'rotate(0)' }, { transform: 'translateY(-18%) rotate(-24deg)' }, { transform: 'rotate(0)' }],
      { duration: 380, easing: 'ease-out' });
    cheer();
  }

  function cheer() {
    if (busy || cat.at !== 'idle' || cat.pose === 'sleep') return;
    setPose('happy');
    el.cat.classList.add('cheer');
    say('谢谢铲屎官喵！');
    clearTimeout(cheerTimer);
    cheerTimer = setTimeout(() => {
      el.cat.classList.remove('cheer');
      if (!busy && cat.pose === 'happy') setPose('sit');
    }, 1700);
  }

  function driveCat(t) {
    if (busy) return;
    if (squattingNow) {
      const i = SIM.nextBox(state);
      if (i < 0) return;
      const where = 'box' + i;
      if (cat.at !== where) { go(where, 'squat'); return; }
      if (cat.pose !== 'squat') setPose('squat', where);
      return;
    }
    if (/^box/.test(cat.at) || cat.pose === 'squat') { go('idle', 'sit'); return; }
    if (!SIM.hasSpace(state)) {
      if (t < grumpAt) return;
      grumpAt = t + 8000 + Math.random() * 6000;
      const pick = Math.random() < 0.5 ? 'yawn' : 'groom';
      if (cat.at !== 'idle') go('idle', pick);
      else setPose(pick);
      return;
    }
    if (cat.pose === 'sleep') return;
    if (t - lastTouch > SLEEP_AFTER_MS) {
      if (state.owned.bed && cat.at !== 'bed') { go('bed', 'sleep'); return; }
      if (cat.at === 'idle' && cat.pose !== 'sleep') setPose('sleep');
      return;
    }
    if (cat.at === 'tree') {
      if (t - treeSince > 14000) go('idle', 'sit');
      return;
    }
    if (cat.at !== 'idle') return;
    if (idleHold && t >= idleHold) { idleHold = 0; setPose('sit'); }
    if (t < idleAt) return;
    idleAt = t + 5000 + Math.random() * 4000;
    const r = Math.random();
    if (state.owned.tree && r < 0.2) { treeSince = t; go('tree', 'loaf'); return; }
    const pick = r < 0.45 ? 'groom' : r < 0.65 ? 'yawn' : r < 0.85 ? 'loaf' : 'sit';
    setPose(pick);
    if (pick === 'groom' || pick === 'yawn') idleHold = t + (pick === 'yawn' ? 1700 : 2600);
  }

  function poke() { lastTouch = now(); }
  function wake() {
    lastTouch = now();
    if (cat.pose !== 'sleep' || busy) return false;
    if (cat.at === 'idle') { setPose('sit'); say('喵？…我没睡着喵'); idleAt = now() + 4000; }
    else go('idle', 'sit', () => say('睡饱了喵～'));
    return true;
  }

  function faceOf(score) {
    if (score >= 80) return '😻';
    if (score >= 60) return '🙂';
    if (score >= 40) return '😐';
    return '😾';
  }
  function renderTick(t) {
    syncPoints();
    const score = Math.round(SIM.moodScore(state, t));
    el.moodFace.textContent = faceOf(score);
    el.moodText.textContent = '心情 ' + score;
    const waterPct = Math.round(state.water * 100);
    el.waterText.textContent = state.water <= 0 ? '水盆空啦' : '水 ' + waterPct + '%';
    el.waterBar.style.width = clamp(waterPct, 0, 100) + '%';
    const foodPct = Math.round(state.food / SIM.FOOD_CAP * 100);
    el.foodText.textContent = state.food <= 0 ? '饭盆空啦' : '饭盆 ' + state.food.toFixed(1) + ' 份';
    el.foodBar.style.width = clamp(foodPct, 0, 100) + '%';
    const bowlSrc = state.food > 0 ? FOOD_BOWL_FULL : FOOD_BOWL_EMPTY;
    const bowlImg = el.foodBowl.querySelector('img');
    if (bowlImg.getAttribute('src') !== bowlSrc) bowlImg.setAttribute('src', bowlSrc);
    el.foodBowl.classList.toggle('has-food', state.food > 0);
    el.reasons.innerHTML = SIM.reasons(state, t)
      .map((r) => `<li class="reason" data-reason="${r.id}">${r.text}</li>`).join('');
    const total = state.boxes.reduce((n, box) => n + box.poops.length, 0);
    el.scoopBadge.hidden = !total;
    el.scoopBadge.textContent = total;
    el.tabScoop.classList.toggle('cta', total > 0);
  }

  const mmss = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  };
  function canUpgradeAny() {
    const upgradable = state.boxes.some((box) => {
      const lv = LEVELS[box.level];
      return lv.cost != null && state.points >= lv.cost;
    });
    if (upgradable) return true;
    const price = SIM.boxPrice(state);
    return price != null && state.points >= price;
  }
  function renderBoxStrip() {
    let html = '';
    state.boxes.forEach((box, i) => {
      const lv = LEVELS[box.level], a = BOX_ART[lv.art];
      const pips = Array.from({ length: lv.cap }, (_, k) => `<i class="pip${k < box.poops.length ? ' full' : ''}"></i>`).join('');
      const up = lv.cost == null
        ? '<span class="box-value">满级</span>'
        : `<button class="buy" data-act="upgrade-box" data-id="${i}" ${state.points >= lv.cost ? '' : 'disabled'}>↑ ${fmt(lv.cost)}</button>`;
      html += `<div class="box-card${box.poops.length >= lv.cap ? ' filled' : ''}" data-box="${i}">
        <div class="box-head"><span class="box-lv">Lv.${box.level}</span><span class="box-name">${a.name}</span></div>
        <div class="box-pips">${pips}</div>
        <div class="box-value">每坨 ${SIM.poopValue(state, i)}</div>
        ${up}
      </div>`;
    });
    const price = SIM.boxPrice(state);
    if (price != null) {
      html += `<div class="box-card add">
        <div class="box-head"><span class="box-lv">＋</span><span class="box-name">第 ${state.boxes.length + 1} 个盆</span></div>
        <div class="box-value">多一个盆装得更从容</div>
        <button class="buy" data-act="buy-box" ${state.points >= price ? '' : 'disabled'}>${fmt(price)}</button>
      </div>`;
    }
    el.boxStrip.innerHTML = html;
  }
  function renderPanel() {
    syncPoints();
    renderBoxStrip();
    el.shopDot.hidden = !canUpgradeAny();
    renderScoopTab();
  }
  function renderScoopTab() {
    const total = state.boxes.reduce((n, box) => n + box.poops.length, 0);
    el.scoopBadge.hidden = !total;
    el.scoopBadge.textContent = total;
    el.tabScoop.classList.toggle('cta', total > 0);
  }

  function openSheet(title, html, kind) {
    sheetKind = kind || null;
    el.sheetTitle.textContent = title;
    el.sheetBody.innerHTML = html;
    el.sheetBody.scrollTop = 0;
    el.sheetWrap.hidden = false;
  }
  function closeSheet() { el.sheetWrap.hidden = true; sheetKind = null; }
  function refreshSheet() {
    if (sheetKind === 'shop') openShop(shopTab);
    else if (sheetKind === 'box') openBoxUpgrade(sheetBox);
  }

  const coin = '<span class="coin sm"><svg><use href="#i-paw"/></svg></span>';
  const priceBtn = (act, id, price) =>
    `<button class="buy" data-act="${act}" data-id="${id}" ${state.points >= price ? '' : 'disabled'}>${coin}${fmt(price)}</button>`;

  function openBoxUpgrade(i) {
    const box = state.boxes[i];
    if (!box) return;
    const lv = LEVELS[box.level], a = BOX_ART[lv.art];
    sheetBox = i;
    if (lv.cost == null) {
      openSheet('猫砂盆已满级', `
        <div class="up-art"><figure><img src="${a.src}" alt="">Lv.10 · ${a.name}</figure></div>
        <p class="sheet-note">已经是全广场最豪华的厕所了喵！</p>`, 'box');
      return;
    }
    const next = LEVELS[box.level + 1], na = BOX_ART[next.art];
    const row = (label, cur, nextV, unit = '') =>
      `<div><span>${label}</span><b>${cur}${unit}${nextV !== cur ? ` → <span>${nextV}${unit}</span>` : ''}</b></div>`;
    const enough = state.points >= lv.cost;
    const soon = SIM.nextPoopInMs(state, now());
    openSheet(`升级猫砂盆 ${i + 1}`, `
      <div class="up-art">
        <figure><img src="${a.src}" alt="">Lv.${box.level} · ${a.name}</figure>
        <span class="arrow">➜</span>
        <figure><img src="${na.src}" alt="">Lv.${box.level + 1} · ${na.name}</figure>
      </div>
      <div class="up-rows">
        ${row('容量', lv.cap, next.cap, ' 坨')}
        ${row('每坨积分', SIM.poopValue(state, i), next.value + (state.owned.freshener ? SIM.FRESHENER_BONUS : 0))}
        ${row('下一坨', Number.isFinite(soon) ? mmss(soon) : '—')}
      </div>
      <button class="big-btn" data-act="upgrade-box" data-id="${i}" ${enough ? '' : 'disabled'}>${coin} ${fmt(lv.cost)} · ${enough ? '升级' : '积分不够'}</button>
      ${enough ? '' : `<p class="sheet-note">还差 ${fmt(lv.cost - state.points)} 积分，多铲屎喵～</p>`}`, 'box');
  }

  function boxCard(i) {
    const box = state.boxes[i], lv = LEVELS[box.level], a = BOX_ART[lv.art];
    return `<div class="shop-card wide">
      <div class="shop-pic"><img src="${a.src}" alt=""></div>
      <div class="shop-text"><b>第 ${i + 1} 个盆 · Lv.${box.level} ${a.name}</b>
        <small>容量 ${lv.cap} 坨 · 每坨 ${SIM.poopValue(state, i)} 积分 · 现在有 ${box.poops.length} 坨</small></div>
      ${lv.cost == null
        ? '<span class="own">满级</span>'
        : `<button class="buy" data-act="upgrade-box" data-id="${i}" ${state.points >= lv.cost ? '' : 'disabled'}>↑ ${coin}${fmt(lv.cost)}</button>`}
    </div>`;
  }
  function buyBoxCard() {
    const price = SIM.boxPrice(state);
    if (price == null) return '';
    return `<div class="shop-card wide">
      <div class="shop-pic"><img src="${BOX_ART[0].src}" alt=""></div>
      <div class="shop-text"><b>第 ${state.boxes.length + 1} 个猫砂盆</b>
        <small>多一个盆就能多存几坨，猫也不用憋着</small></div>
      <button class="buy" data-act="buy-box" ${state.points >= price ? '' : 'disabled'}>${coin}${fmt(price)}</button>
    </div>`;
  }
  function foodCard(id) {
    const food = SIM.FOODS[id];
    const locked = state.totalScooped < food.unlock;
    const label = locked ? `还差 ${food.unlock - state.totalScooped} 坨解锁` : `${coin}${fmt(food.price)}`;
    return `<div class="shop-card${locked ? ' locked' : ''}">
      <div class="shop-pic"><span class="food-emoji">${FOOD_EMOJI[id]}</span></div>
      <b>${food.name}</b>
      <small>${food.servings} 份 · 开心 +${food.mood} · 解锁 ${food.unlock} 坨</small>
      <button class="buy" data-act="feed" data-id="${id}" ${locked || state.points < food.price ? 'disabled' : ''}>${label}</button>
    </div>`;
  }
  function toyCard(id) {
    const toy = SIM.TOYS[id];
    const owned = ownedOf(id);
    return `<div class="shop-card${owned ? ' owned' : ''}">
      <div class="shop-pic"><span class="toy-emoji">${TOY_EMOJI[id]}</span></div>
      <b>${toy.name}</b>
      <small>陪它玩，开心 +${toy.boost}</small>
      ${owned
        ? `<span class="own">已拥有</span><button class="buy plain" data-act="play-toy" data-id="${id}">陪它玩</button>`
        : priceBtn('buy', id, toy.price)}
    </div>`;
  }

  function openShop(tab = 'all') {
    shopTab = tab;
    const show = (group) => tab === 'all' || tab === group;
    let cards = '';
    if (show('box')) {
      state.boxes.forEach((_, i) => { cards += boxCard(i); });
      cards += buyBoxCard();
    }
    if (show('food')) for (const id of SIM.FOOD_IDS) cards += foodCard(id);
    if (show('toy')) for (const id of SIM.TOY_IDS) cards += toyCard(id);
    for (const it of ITEMS) {
      if (!show(it.group)) continue;
      const owned = ownedOf(it.id);
      cards += `<div class="shop-card${owned ? ' owned' : ''}">
        <div class="shop-pic"><img src="${it.full || it.src}" alt=""></div>
        <b>${it.name}</b><small>${it.desc}</small>
        ${owned ? '<span class="own">已拥有</span>' : priceBtn('buy', it.id, it.price)}
      </div>`;
    }
    if (show('wall')) {
      for (const w of WALLS) {
        const owned = !!state.walls[w.id], using = state.wall === w.id;
        cards += `<div class="shop-card${using ? ' owned' : ''}">
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
      <div class="shop-grid">${cards}</div>`, 'shop');
  }

  function openSettings() {
    openSheet('设置', `
      <p class="sheet-note" style="margin-bottom:12px">猫会自己上厕所，你负责铲屎、加水、买饭和摸头。登录后进度存在云端；游客模式只存在这台设备的浏览器里。</p>
      <button class="big-btn plain" data-act="reset">重置存档</button>`, 'settings');
  }

  const BOUGHT_LINES = {
    bowl: '饭盆升级啦，吃得久一点喵！', waterPro: '水盆升级啦，水更耐用喵！',
    freshener: '空气都变香了喵～', rug: '软软的，喜欢喵！',
    bed: '有自己的窝了喵！', tree: '我要爬到最高的地方喵！', lamp: '暖暖的喵～', picture: '画的是我吗喵？',
    wand: '逗猫棒！快来陪我玩喵！', mouse: '小老鼠！我喜欢喵！',
  };
  function priceOf(id) {
    if (SIM.TOYS[id]) return SIM.TOYS[id].price;
    return ITEM[id] ? ITEM[id].price : 0;
  }
  function buy(id) {
    const it = ITEM[id], toy = SIM.TOYS[id];
    if (!it && !toy) return;
    if (ownedOf(id) || state.points < priceOf(id)) return;
    state.points -= priceOf(id);
    state.owned[OWNED_ALIAS[id] || id] = true;
    save();
    if (it) addItem(id, true); else addToy(id, true);
    if (it) closeSheet(); else refreshSheet();
    renderBoxes(); renderPanel(); renderTick(now());
    panTo((it ? it.pos.x : POS[id].x));
    setTimeout(() => { if (!busy) say(BOUGHT_LINES[id] || '买好啦喵！'); }, 700);
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

  function upgradeBox(i) {
    const box = state.boxes[i];
    if (!box) return;
    const before = LEVELS[box.level].art;
    const next = SIM.upgradeBox(state, i);
    if (!next) return;
    save();
    layoutBoxSlots();
    renderBoxes(); renderPanel(); renderTick(now());
    refreshSheet();
    const p = boxSlot(i);
    floatPoints(p.x, p.y - 10, 'Lv.' + state.boxes[i].level + ' ↑');
    if (LEVELS[state.boxes[i].level].art !== before) panTo(p.x);
    setTimeout(() => { if (!busy) say(LEVELS[state.boxes[i].level].art !== before ? '哇！新厕所喵！' : '厕所变高级了喵～'); }, 600);
  }
  function buyBox() {
    const i = SIM.buyBox(state);
    if (i == null) return;
    save();
    layoutBoxSlots();
    renderBoxes(); renderPanel(); renderTick(now());
    refreshSheet();
    const p = boxSlot(i);
    panTo(p.x);
    floatPoints(p.x, p.y - 10, '新盆！');
    setTimeout(() => { if (!busy) say('新盆到啦喵！'); }, 600);
  }

  function feedAt(id) {
    const food = SIM.feedFood(state, id, now());
    if (!food) {
      const why = SIM.canBuyFood(state, id).why;
      const msg = WHY[why] || '现在喂不了喵';
      toast(msg);
      say(msg);
      return false;
    }
    state.foodKind = id;
    save(); renderPanel(); renderTick(now());
    if (sheetKind === 'shop') refreshSheet();
    poke();
    pop(el.foodBowl.querySelector('img'));
    eatAtBowl();
    return true;
  }

  function eatAtBowl() {
    if (busy || squattingNow) { say('吧唧吧唧…好吃喵！'); return; }
    go('bowl', 'eat', () => {
      say('吧唧吧唧…好吃喵！', EAT_MS);
      setTimeout(() => {
        if (!busy && cat.at === 'bowl') go('idle', 'sit');
      }, EAT_MS);
    });
  }

  function playToy(id) {
    const toy = SIM.playWith(state, id, now());
    if (!toy) return;
    save(); renderPanel(); renderTick(now());
    if (sheetKind === 'shop') refreshSheet();
    say('玩得开心喵！');
    poke();
    const node = toyEls[id];
    if (node) node.animate(
      [{ transform: 'translateY(0) rotate(0)' }, { transform: 'translateY(-28%) rotate(-12deg)' }, { transform: 'translateY(0) rotate(0)' }],
      { duration: 520, easing: 'ease-in-out' });
  }

  const itemEls = {};
  const toyEls = {};
  function addItem(id, withPop) {
    const it = ITEM[id];
    if (!it || itemEls[id]) return;
    if (it.pro === 'food') { el.foodBowl.classList.add('pro'); itemEls[id] = el.foodBowl; return; }
    if (it.pro === 'water') { el.waterBowl.classList.add('pro'); itemEls[id] = el.waterBowl; return; }
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
    if (withPop) pop(...imgs);
  }
  function addToy(id, withPop) {
    if (toyEls[id]) return;
    const p = POS[id];
    if (!p) return;
    const node = document.createElement('div');
    node.className = 'sprite toy tappable';
    node.dataset.item = id;
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', `玩${SIM.TOYS[id].name}`);
    node.innerHTML = `<span>${TOY_EMOJI[id]}</span>`;
    place(node, { x: p.x, y: p.y, z: zOf(p.y) });
    node.addEventListener('click', () => playToy(id));
    el.scene.appendChild(node);
    toyEls[id] = node;
    if (withPop) {
      node.animate([{ transform: 'translate(-50%, 0) scale(.5)', opacity: 0 }, { transform: 'translate(-50%, 0) scale(1)', opacity: 1 }],
        { duration: 420, easing: 'cubic-bezier(.3,1.6,.5,1)' });
    }
  }

  let onbStep = 0;
  let onbHelp = false;
  function renderOnboarding() {
    const step = ONBOARDING[onbStep];
    el.onbStep.textContent = step.title;
    el.onbText.textContent = step.text;
    el.onbNext.textContent = onbStep === ONBOARDING.length - 1 ? '开始养猫' : '下一步';
  }
  function openOnboarding(fromHelp) {
    onbHelp = !!fromHelp;
    onbStep = 0;
    renderOnboarding();
    el.onboarding.hidden = false;
  }
  function finishOnboarding() {
    el.onboarding.hidden = true;
    if (onbHelp) return;
    state.tutorial.done = true;
    save();
  }

  function tick() {
    const t = now();
    const wasSquatting = squattingNow;
    const clumps = SIM.simulate(state, t);
    squattingNow = SIM.isSquatting(state, t);
    if (squattingNow !== wasSquatting) emit('game:squat', { squatting: squattingNow });
    if (clumps > 0) { markNewPoops(); renderBoxes(); }
    renderTick(t);
    if (clumps > 0 || t - lastSaveAt > SAVE_EVERY_MS) { lastSaveAt = t; save(); }
    driveCat(t);
  }
  function renderAll() {
    layoutBoxSlots();
    renderPanel();
    renderBoxes();
    renderTick(now());
  }

  el.tabScoop.addEventListener('click', () => { poke(); scoopAll(); });
  el.tabShop.addEventListener('click', () => { poke(); openShop('all'); });
  el.tabPlaza.addEventListener('click', () => { poke(); if (emit('game:open-plaza')) toast('广场还在施工中喵～'); });
  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-help').addEventListener('click', () => openOnboarding(true));
  $('#sheet-close').addEventListener('click', closeSheet);
  el.sheetWrap.addEventListener('click', (e) => { if (e.target === el.sheetWrap) closeSheet(); });
  document.addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; if (!el.onboarding.hidden) finishOnboarding(); else closeSheet(); });

  el.onbNext.addEventListener('click', () => {
    if (onbStep < ONBOARDING.length - 1) { onbStep++; renderOnboarding(); return; }
    finishOnboarding();
  });
  el.onbSkip.addEventListener('click', finishOnboarding);

  el.boxStrip.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const id = Number(b.dataset.id);
    poke();
    if (b.dataset.act === 'upgrade-box') { upgradeBox(id); return; }
    if (b.dataset.act === 'buy-box') {
      const price = SIM.boxPrice(state);
      if (price == null) return;
      if (state.points < price) { toast('积分不够喵'); return; }
      buyBox();
    }
  });

  el.sheetBody.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const id = b.dataset.id;
    switch (b.dataset.act) {
      case 'tab': openShop(id); break;
      case 'buy': buy(id); break;
      case 'wall': pickWall(id); break;
      case 'feed': feedAt(id); break;
      case 'play-toy': playToy(id); break;
      case 'upgrade-box': upgradeBox(Number(id)); break;
      case 'buy-box': {
        const price = SIM.boxPrice(state);
        if (price != null && state.points < price) { toast('积分不够喵'); return; }
        buyBox();
        break;
      }
      case 'reset': {
        if (!confirm('确定要清空进度重新开始吗？猫咪会保留。')) return;
        const keepCat = state.cat;
        state = SIM.fresh(now());
        state.cat = keepCat;
        squattingNow = false;
        save();
        const flush = window.social && window.social.flushNow;
        Promise.resolve(flush ? flush() : null).catch(() => {}).then(() => location.reload());
        break;
      }
    }
  });

  el.cat.classList.add('tappable');
  el.scoop.classList.add('tappable');
  el.cat.addEventListener('click', () => {
    if (busy) return;
    const asleep = wake();
    poke();
    SIM.pet(state, now());
    save();
    renderPanel(); renderTick(now());
    if (!asleep) say('呼噜呼噜～');
  });
  el.scoop.addEventListener('click', () => { poke(); scoopAll(); });
  el.waterBowl.addEventListener('click', () => {
    poke();
    SIM.addWater(state);
    save(); renderPanel(); renderTick(now());
    say('水加满啦喵');
  });
  el.foodBowl.addEventListener('click', () => {
    poke();
    feedAt(state.foodKind || 'kibble');
  });

  if (!state.tutorial.done) openOnboarding(false);

  const preload = [...Object.keys(POSES).map(poseSrc), ...BOX_ART.map((a) => a.src), ...POOP_SRC,
    ...ITEMS.flatMap((it) => [it.src, it.full].filter(Boolean)), 'assets/bowl-empty.png'];
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
    POSES.squat.butt.x = Math.min(0.86, SQUAT_REF_ASPECT * 0.79 / aspect);
    if (cat.pose === 'squat') setPose('squat');
  };
  squatProbe.src = poseSrc('squat');

  place(el.bag, { ...POS.bag, z: zOf(POS.bag.y) });
  place(el.scoop, { ...POS.scoop, z: zOf(POS.scoop.y) });
  place(el.waterBowl, { ...POS.water, z: zOf(POS.water.y) });
  place(el.foodBowl, { ...POS.food, z: zOf(POS.food.y) });
  el.bag.classList.add('shadowed');
  layoutBoxSlots();
  for (const it of ITEMS) if (ownedOf(it.id)) addItem(it.id, false);
  for (const id of SIM.TOY_IDS) if (ownedOf(id)) addToy(id, false);
  applyWall();
  el.cat.style.transition = 'none';
  setPose('sleep', 'idle');
  el.cat.style.zIndex = spotOf('idle').z;
  requestAnimationFrame(() => requestAnimationFrame(() => { el.cat.style.transition = ''; }));
  renderBoxes(); renderPanel(); renderTick(now());
  panTo(FOCUS_X, false);
  setInterval(tick, 200);
  setTimeout(() => { if (!busy) say(state.totalScooped ? '欢迎回家喵～' : '欢迎来到俺家的猫厕所喵！', 4000); }, 600);

  window.__game = {
    get state() { return state; }, get cat() { return cat; }, get squatting() { return SIM.isSquatting(state, now()); },
    SAVE_KEY, CAT_ID, DEFAULT_CAT, say, toast,
    BOX_ART, POS, LEVELS, WALK, ITEMS, WALLS, SIM,
    setPose, go, renderPanel, renderBoxes, addPoints, save,
    buy, pickWall, openShop, openBoxUpgrade, panTo,
    now, advanceClock: (ms) => { clock.offset += ms; tick(); renderAll(); },
  };
})();
