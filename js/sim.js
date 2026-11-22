(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CatSim = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var TICK_MS = 1000;
  var BASE_INTERVAL_MS = 1500000;
  var MOOD_MIN = 0.6;
  var MOOD_MAX = 1.4;
  var MOOD_BASE = 50;
  var THIRSTY_MOOD = 20;
  var HUNGRY_MOOD = 20;
  var FULL_MOOD = 15;
  var PET_MOOD = 30;
  var PET_MOOD_MS = 1200000;
  var PLAY_MOOD = 40;
  var PLAY_MOOD_MS = 1800000;
  var TREAT_MOOD_MS = 900000;
  var WATER_LIFE_MS = 28800000;
  var WATER_LIFE_PRO_MS = 43200000;
  var FOOD_LIFE_MS = 10800000;
  var FOOD_LIFE_PRO_MS = 16200000;
  var EMPTY_FACTOR = 0.4;
  var WATER_LOW = 0.15;
  var FOOD_LOW = 0.2;
  var SQUAT_LEAD_MS = 45000;
  var SQUAT_TAIL_MS = 4000;
  var MAX_BOXES = 3;
  var FRESHENER_BONUS = 5;
  var FOOD_CAP = 3;
  var LONELY_MS = 300000;
  var STARTER_BONUS = 70;
  var START_POOP_COUNT = 3;
  var BASE_RATE = 1 / BASE_INTERVAL_MS;

  var BOX_LEVELS = Array.from({ length: 11 }, function (_, lv) {
    return {
      level: lv,
      cap: 3 + Math.floor(lv / 2),
      value: 10 + 5 * lv,
      cost: lv < 10 ? [50, 120, 250, 450, 700, 1000, 1400, 1900, 2500, 3200][lv] : null,
      art: lv === 0 ? 0 : lv <= 3 ? 1 : lv <= 6 ? 2 : 3,
    };
  });

  var PRICES = {
    box1: 0,
    box2: 600,
    box3: 2000,
    kibble: 10,
    strip: 15,
    can: 40,
    treat: 25,
    wand: 60,
    mouse: 90,
    bowlPro: 80,
    waterPro: 120,
    freshener: 150,
    rug: 120,
    bed: 200,
    tree: 400,
    lamp: 160,
    picture: 100,
    wall: 60,
  };

  var FOODS = {
    kibble: { id: 'kibble', name: '初级猫粮', price: 10, servings: 1, mood: 0, unlock: 0 },
    strip: { id: 'strip', name: '猫条', price: 15, servings: 0.5, mood: 15, unlock: 5 },
    can: { id: 'can', name: '罐头', price: 40, servings: 2, mood: 10, unlock: 12 },
    treat: { id: 'treat', name: '小零食', price: 25, servings: 0.3, mood: 25, unlock: 20 },
  };

  var TOYS = {
    wand: { id: 'wand', name: '逗猫棒', price: 60, boost: 20, ms: 1200000 },
    mouse: { id: 'mouse', name: '小老鼠', price: 90, boost: 35, ms: 1500000 },
  };

  var FOOD_IDS = ['kibble', 'strip', 'can', 'treat'];
  var TOY_IDS = ['wand', 'mouse'];

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function num(v, fallback) {
    return typeof v === 'number' && isFinite(v) ? v : fallback;
  }

  function decay(t0, now, T) {
    if (!t0 || t0 >= now) return t0 ? 1 : 0;
    var left = 1 - (now - t0) / T;
    return left > 0 ? left : 0;
  }

  function createBox(level) {
    return { level: level, poops: [] };
  }

  function fresh(nowMs) {
    return {
      v: 2,
      level: 0,
      points: 0,
      totalScooped: 0,
      seq: START_POOP_COUNT + 1,
      starterBonus: STARTER_BONUS,
      cat: null,
      owned: {},
      walls: { sky: true },
      wall: 'sky',
      boxes: [{ level: 0, poops: Array.from({ length: START_POOP_COUNT }, function (_, i) { return { id: i + 1, kind: i ? 1 : 0 }; }) }],
      water: 1,
      food: 1,
      mood: { petAt: 0, playAt: 0, treatAt: 0, treatBoost: 0 },
      sim: { at: nowMs, fill: 0, lastPoopAt: 0 },
      tutorial: { done: false },
      foodKind: 'kibble',
    };
  }

  function syncLevel(state) {
    var level = 0;
    for (var i = 0; i < state.boxes.length; i++) {
      if (state.boxes[i].level > level) level = state.boxes[i].level;
    }
    state.level = level;
    return level;
  }

  function migrate(raw, nowMs) {
    var src = raw || {};
    if (src.v !== 2) {
      var lv = clamp(num(src.level, 0) | 0, 0, 10);
      var poops = [];
      if (Array.isArray(src.poops)) {
        for (var i = 0; i < src.poops.length && poops.length < BOX_LEVELS[lv].cap; i++) {
          var p = src.poops[i];
          if (!p || typeof p.id !== 'number' || typeof p.kind !== 'number') continue;
          poops.push({ id: p.id, kind: p.kind === 1 ? 1 : 0 });
        }
      }
      var out = {
        v: 2,
        level: lv,
        points: num(src.points, 0),
        totalScooped: num(src.totalScooped, 0),
        seq: num(src.seq, 1),
        starterBonus: 0,
        cat: src.cat || null,
        owned: src.owned && typeof src.owned === 'object' ? src.owned : {},
        walls: src.walls && typeof src.walls === 'object' ? src.walls : { sky: true },
        wall: typeof src.wall === 'string' ? src.wall : 'sky',
        boxes: [{ level: lv, poops: poops }],
        water: 1,
        food: 1,
        mood: { petAt: 0, playAt: 0, treatAt: 0, treatBoost: 0 },
        sim: { at: nowMs, fill: 0, lastPoopAt: 0 },
        tutorial: { done: true },
        foodKind: 'kibble',
      };
      if (out.owned.bowl === true) {
        out.owned.bowlPro = true;
        delete out.owned.bowl;
      }
      syncLevel(out);
      return out;
    }

    var s = src;
    if (!Array.isArray(s.boxes) || !s.boxes.length) s.boxes = [createBox(0)];
    for (var b = 0; b < s.boxes.length; b++) {
      if (!s.boxes[b]) s.boxes[b] = createBox(0);
      s.boxes[b].level = clamp(num(s.boxes[b].level, 0) | 0, 0, 10);
      if (!Array.isArray(s.boxes[b].poops)) s.boxes[b].poops = [];
    }
    if (s.points === undefined) s.points = 0;
    if (s.totalScooped === undefined) s.totalScooped = 0;
    if (typeof s.starterBonus !== 'number') s.starterBonus = 0;
    else if (s.starterBonus < 0) s.starterBonus = 0;
    if (s.seq === undefined) s.seq = 1;
    if (s.cat === undefined) s.cat = null;
    if (!s.owned || typeof s.owned !== 'object') s.owned = {};
    if (!s.walls || typeof s.walls !== 'object') s.walls = { sky: true };
    if (s.wall === undefined) s.wall = 'sky';
    if (typeof s.water !== 'number') s.water = 1;
    if (typeof s.food !== 'number') s.food = 1;
    if (!s.mood || typeof s.mood !== 'object') s.mood = {};
    if (s.mood.petAt === undefined) s.mood.petAt = 0;
    if (s.mood.playAt === undefined) s.mood.playAt = 0;
    if (s.mood.treatAt === undefined) s.mood.treatAt = 0;
    if (s.mood.treatBoost === undefined) s.mood.treatBoost = 0;
    if (!s.sim || typeof s.sim !== 'object') s.sim = {};
    if (typeof s.sim.at !== 'number') s.sim.at = nowMs;
    if (typeof s.sim.fill !== 'number') s.sim.fill = 0;
    if (typeof s.sim.lastPoopAt !== 'number') s.sim.lastPoopAt = 0;
    if (!s.tutorial || typeof s.tutorial !== 'object') s.tutorial = { done: true };
    if (s.tutorial.done === undefined) s.tutorial.done = true;
    delete s.tutorial.step;
    if (s.foodKind === undefined) s.foodKind = 'kibble';
    if (s.owned.bowl === true) {
      s.owned.bowlPro = true;
      delete s.owned.bowl;
    }
    syncLevel(s);
    return s;
  }

  function hasSpace(state) {
    for (var i = 0; i < state.boxes.length; i++) {
      var box = state.boxes[i];
      if (box.poops.length < BOX_LEVELS[box.level].cap) return true;
    }
    return false;
  }

  function nextBox(state) {
    for (var i = 0; i < state.boxes.length; i++) {
      var box = state.boxes[i];
      if (box.poops.length < BOX_LEVELS[box.level].cap) return i;
    }
    return -1;
  }

  function moodScore(state, atMs) {
    var m = state.mood;
    var play = Math.min(m.playBoost || 0, PLAY_MOOD);
    return clamp(
      MOOD_BASE +
        PET_MOOD * decay(m.petAt, atMs, PET_MOOD_MS) +
        play * decay(m.playAt, atMs, m.playMs || PLAY_MOOD_MS) +
        (m.treatBoost || 0) * decay(m.treatAt, atMs, TREAT_MOOD_MS) -
        (state.water <= 0 ? THIRSTY_MOOD : 0) -
        (state.food <= 0 ? HUNGRY_MOOD : 0) -
        (hasSpace(state) ? 0 : FULL_MOOD),
      0,
      100
    );
  }

  function factors(state, atMs) {
    var score = moodScore(state, atMs);
    var water = state.water;
    var food = state.food;
    return {
      mood: MOOD_MIN + (MOOD_MAX - MOOD_MIN) * score / 100,
      water:
        water <= 0
          ? EMPTY_FACTOR
          : water >= WATER_LOW
          ? 1
          : EMPTY_FACTOR + (1 - EMPTY_FACTOR) * water / WATER_LOW,
      food:
        food <= 0
          ? EMPTY_FACTOR
          : food >= FOOD_LOW
          ? 1
          : EMPTY_FACTOR + (1 - EMPTY_FACTOR) * food / FOOD_LOW,
    };
  }

  function rateAt(state, atMs) {
    var f = factors(state, atMs);
    return BASE_RATE * f.mood * f.water * f.food;
  }

  function nextPoopInMs(state, atMs) {
    if (!hasSpace(state)) return Infinity;
    return (1 - state.sim.fill) / rateAt(state, atMs);
  }

  function isSquatting(state, atMs) {
    if (!hasSpace(state)) return false;
    if (nextPoopInMs(state, atMs) <= SQUAT_LEAD_MS) return true;
    var last = state.sim.lastPoopAt;
    return !!(last && atMs - last < SQUAT_TAIL_MS);
  }

  function reasons(state, atMs) {
    var out = [];
    if (state.water <= 0) out.push({ id: 'thirsty', text: '水盆空了，猫很渴' });
    if (state.food <= 0) out.push({ id: 'hungry', text: '饭盆空了，猫很饿' });
    if (!hasSpace(state)) {
      out.push({
        id: 'full',
        text:
          state.boxes.length === 1
            ? '盆满了，猫憋着很难受'
            : state.boxes.length + ' 个盆都满了，猫憋着很难受',
      });
    }
    var petAt = state.mood.petAt;
    var playAt = state.mood.playAt;
    var everTouched = !!(petAt || playAt);
    var touched = (petAt && atMs - petAt < LONELY_MS) || (playAt && atMs - playAt < LONELY_MS);
    if (everTouched && !touched) out.push({ id: 'lonely', text: '好久没人陪它玩了' });
    return out;
  }

  function step(state, at) {
    var owned = state.owned || {};
    state.water = Math.max(0, state.water - TICK_MS / (owned.waterPro ? WATER_LIFE_PRO_MS : WATER_LIFE_MS));
    state.food = Math.max(0, state.food - TICK_MS / (owned.bowlPro ? FOOD_LIFE_PRO_MS : FOOD_LIFE_MS));
    if (!hasSpace(state)) return 0;
    state.sim.fill += rateAt(state, at) * TICK_MS;
    var produced = 0;
    while (state.sim.fill >= 1 && hasSpace(state)) {
      state.sim.fill -= 1;
      var index = nextBox(state);
      var id = state.seq;
      var kind = (id + 1) % 5 < 3 ? 0 : 1;
      state.boxes[index].poops.push({ id: id, kind: kind });
      state.seq = id + 1;
      state.sim.lastPoopAt = at;
      produced++;
    }
    return produced;
  }

  function simulate(state, toMs) {
    var target = Math.floor(toMs / TICK_MS) * TICK_MS;
    if (target <= state.sim.at) return 0;
    var produced = 0;
    var at = Math.floor(state.sim.at / TICK_MS) * TICK_MS + TICK_MS;
    while (at <= target) {
      if (!hasSpace(state) && state.water === 0 && state.food === 0) {
        state.sim.at = target;
        return produced;
      }
      produced += step(state, at);
      state.sim.at = at;
      at += TICK_MS;
    }
    return produced;
  }

  function poopValue(state, boxIndex) {
    var box = state.boxes[boxIndex];
    if (!box) return 0;
    return BOX_LEVELS[box.level].value + (state.owned.freshener ? FRESHENER_BONUS : 0);
  }

  function takeStarterBonus(state) {
    var bonus = Math.floor(num(state.starterBonus, 0));
    if (bonus < 0) bonus = 0;
    state.starterBonus = 0;
    return bonus;
  }

  function scoop(state, boxIndex, poopId) {
    var box = state.boxes[boxIndex];
    if (!box) return 0;
    for (var i = 0; i < box.poops.length; i++) {
      if (box.poops[i].id === poopId) {
        box.poops.splice(i, 1);
        state.totalScooped++;
        var gain = poopValue(state, boxIndex) + takeStarterBonus(state);
        state.points += gain;
        return gain;
      }
    }
    return 0;
  }

  function scoopAll(state) {
    var total = 0;
    var count = 0;
    for (var i = 0; i < state.boxes.length; i++) {
      var box = state.boxes[i];
      total += poopValue(state, i) * box.poops.length;
      count += box.poops.length;
    }
    if (count === 0) return 0;
    total += takeStarterBonus(state);
    for (var b = 0; b < state.boxes.length; b++) state.boxes[b].poops = [];
    state.points += total;
    state.totalScooped += count;
    return total;
  }

  function addWater(state) {
    state.water = 1;
    return true;
  }

  function canBuyFood(state, foodId) {
    var food = FOODS[foodId];
    if (!food || state.totalScooped < food.unlock) return { ok: false, why: 'locked' };
    if (state.points < food.price) return { ok: false, why: 'points' };
    if (state.food + food.servings > FOOD_CAP) return { ok: false, why: 'full' };
    return { ok: true };
  }

  function feedFood(state, foodId, atMs) {
    var check = canBuyFood(state, foodId);
    if (!check.ok) return null;
    var food = FOODS[foodId];
    state.points -= food.price;
    state.food += food.servings;
    if (food.mood > 0) {
      state.mood.treatAt = atMs === undefined ? state.sim.at : atMs;
      state.mood.treatBoost = food.mood;
    }
    return food;
  }

  function pet(state, atMs) {
    state.mood.petAt = atMs;
    return true;
  }

  function playWith(state, toyId, atMs) {
    if (state.owned[toyId] !== true) return null;
    var toy = TOYS[toyId];
    if (!toy) return null;
    state.mood.playAt = atMs;
    state.mood.playBoost = toy.boost;
    state.mood.playMs = toy.ms;
    return toy;
  }

  function boxPrice(state) {
    return state.boxes.length === 1 ? PRICES.box2 : state.boxes.length === 2 ? PRICES.box3 : null;
  }

  function buyBox(state) {
    if (state.boxes.length >= MAX_BOXES) return null;
    var price = boxPrice(state);
    if (price === null || state.points < price) return null;
    state.points -= price;
    state.boxes.push(createBox(0));
    syncLevel(state);
    return state.boxes.length - 1;
  }

  function upgradeBox(state, boxIndex) {
    var box = state.boxes[boxIndex];
    if (!box || box.level >= 10) return null;
    var cost = BOX_LEVELS[box.level].cost;
    if (state.points < cost) return null;
    state.points -= cost;
    box.level++;
    syncLevel(state);
    return BOX_LEVELS[box.level];
  }

  return {
    TICK_MS: TICK_MS,
    BASE_INTERVAL_MS: BASE_INTERVAL_MS,
    MOOD_MIN: MOOD_MIN,
    MOOD_MAX: MOOD_MAX,
    MOOD_BASE: MOOD_BASE,
    THIRSTY_MOOD: THIRSTY_MOOD,
    HUNGRY_MOOD: HUNGRY_MOOD,
    FULL_MOOD: FULL_MOOD,
    PET_MOOD: PET_MOOD,
    PET_MOOD_MS: PET_MOOD_MS,
    PLAY_MOOD: PLAY_MOOD,
    PLAY_MOOD_MS: PLAY_MOOD_MS,
    TREAT_MOOD_MS: TREAT_MOOD_MS,
    WATER_LIFE_MS: WATER_LIFE_MS,
    WATER_LIFE_PRO_MS: WATER_LIFE_PRO_MS,
    FOOD_LIFE_MS: FOOD_LIFE_MS,
    FOOD_LIFE_PRO_MS: FOOD_LIFE_PRO_MS,
    EMPTY_FACTOR: EMPTY_FACTOR,
    WATER_LOW: WATER_LOW,
    FOOD_LOW: FOOD_LOW,
    SQUAT_LEAD_MS: SQUAT_LEAD_MS,
    SQUAT_TAIL_MS: SQUAT_TAIL_MS,
    MAX_BOXES: MAX_BOXES,
    FRESHENER_BONUS: FRESHENER_BONUS,
    FOOD_CAP: FOOD_CAP,
    STARTER_BONUS: STARTER_BONUS,
    START_POOP_COUNT: START_POOP_COUNT,
    BOX_LEVELS: BOX_LEVELS,
    PRICES: PRICES,
    FOODS: FOODS,
    TOYS: TOYS,
    FOOD_IDS: FOOD_IDS,
    TOY_IDS: TOY_IDS,
    fresh: fresh,
    createBox: createBox,
    migrate: migrate,
    simulate: simulate,
    rateAt: rateAt,
    factors: factors,
    moodScore: moodScore,
    nextPoopInMs: nextPoopInMs,
    hasSpace: hasSpace,
    nextBox: nextBox,
    isSquatting: isSquatting,
    reasons: reasons,
    poopValue: poopValue,
    scoop: scoop,
    scoopAll: scoopAll,
    addWater: addWater,
    canBuyFood: canBuyFood,
    feedFood: feedFood,
    pet: pet,
    playWith: playWith,
    buyBox: buyBox,
    boxPrice: boxPrice,
    upgradeBox: upgradeBox,
    syncLevel: syncLevel,
  };
});
