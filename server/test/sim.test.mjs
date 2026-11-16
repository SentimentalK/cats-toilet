import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SIM = require('../../js/sim.js');
const doc = readFileSync(new URL('../../design/economy-care-loop-v1.md', import.meta.url), 'utf8');

const CONSTANT_NAMES = [
  'TICK_MS',
  'BASE_INTERVAL_MS',
  'MOOD_MIN',
  'MOOD_MAX',
  'MOOD_BASE',
  'PET_MOOD',
  'PET_MOOD_MS',
  'PLAY_MOOD',
  'PLAY_MOOD_MS',
  'TREAT_MOOD_MS',
  'WATER_LIFE_MS',
  'WATER_LIFE_PRO_MS',
  'FOOD_LIFE_MS',
  'FOOD_LIFE_PRO_MS',
  'EMPTY_FACTOR',
  'WATER_LOW',
  'FOOD_LOW',
  'SQUAT_LEAD_MS',
  'SQUAT_TAIL_MS',
  'MAX_BOXES',
  'FRESHENER_BONUS',
  'FOOD_CAP',
];

const PRICE_IDS = [
  'box2',
  'box3',
  'kibble',
  'strip',
  'can',
  'treat',
  'wand',
  'mouse',
  'bowlPro',
  'waterPro',
  'freshener',
  'rug',
  'bed',
  'tree',
  'lamp',
  'picture',
  'wall',
];

function parseTable(header) {
  const lines = doc.split('\n');
  const start = lines.findIndex((line) => line.trim() === header);
  assert.ok(start >= 0, `文档缺少表头 ${header}`);
  const rows = [];
  for (let i = start + 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('|')) break;
    rows.push(line.slice(1, -1).split('|').map((cell) => cell.trim()));
  }
  return rows;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function totalPoops(state) {
  return state.boxes.reduce((sum, box) => sum + box.poops.length, 0);
}

function threeBoxes(level) {
  return [SIM.createBox(level), SIM.createBox(level), SIM.createBox(level)];
}

test('常数表与模块导出一致', () => {
  const rows = parseTable('| 常数 | 值 | 依据 |');
  assert.equal(rows.length, CONSTANT_NAMES.length);
  const seen = new Set();
  for (const [name, value] of rows) {
    assert.ok(CONSTANT_NAMES.includes(name), `表里多出 ${name}`);
    assert.equal(Number(value), SIM[name], name);
    seen.add(name);
  }
  for (const name of CONSTANT_NAMES) assert.ok(seen.has(name), `表里缺少 ${name}`);
});

test('价格表覆盖全部条目且换算正确', () => {
  const rows = parseTable('| 物品 | id | 价格 | 攒够时长（分钟 / 小时） | 休闲玩家（天） |');
  assert.equal(rows.length, PRICE_IDS.length);
  const seen = new Set();
  for (const [label, id, priceText, timeText, dayText] of rows) {
    assert.ok(PRICE_IDS.includes(id), `表里多出 ${id}`);
    const price = Number(priceText);
    assert.equal(price, SIM.PRICES[id], `${label} 价格`);
    const [minutesText, hoursText] = timeText.split(' / ');
    const boxes = id === 'box3' ? 2 : 1;
    assert.equal(Number(minutesText), price * 2.5, `${label} 分钟`);
    assert.equal(Number(hoursText), round1(price * 2.5 / 60), `${label} 小时`);
    assert.equal(Number(dayText), round1(price / (120 * boxes)), `${label} 天数`);
    seen.add(id);
  }
  for (const id of PRICE_IDS) assert.ok(seen.has(id), `表里缺少 ${id}`);
});

test('中性心情一小时出两团', () => {
  const s = SIM.fresh(0);
  const produced = SIM.simulate(s, 3600000);
  assert.equal(produced, 2);
  assert.equal(totalPoops(s), 2);
  assert.ok(Math.abs(s.sim.fill - 0.4) < 1e-9);
});

test('离线一天封顶于三个零级盆的总容量', () => {
  const s = SIM.fresh(0);
  s.boxes = threeBoxes(0);
  const produced = SIM.simulate(s, 86400000);
  assert.equal(produced, 9);
  assert.equal(totalPoops(s), 9);
  for (const box of s.boxes) assert.ok(box.poops.length <= SIM.BOX_LEVELS[box.level].cap);
});

test('水耗尽后产出变慢', () => {
  const empty = SIM.fresh(0);
  empty.boxes = threeBoxes(10);
  empty.water = 0;
  empty.food = 1;
  assert.equal(SIM.simulate(empty, 7200000), 1);

  const full = SIM.fresh(0);
  full.boxes = threeBoxes(10);
  assert.equal(SIM.simulate(full, 7200000), 4);

  const dry = SIM.fresh(0);
  dry.water = 0;
  dry.food = 0;
  const expected = 1 / SIM.BASE_INTERVAL_MS * 1 * SIM.EMPTY_FACTOR * SIM.EMPTY_FACTOR;
  assert.ok(Math.abs(SIM.rateAt(dry, 0) - expected) < 1e-18);
});

test('食物耗尽后产出变慢', () => {
  const hungry = SIM.fresh(0);
  hungry.boxes = threeBoxes(10);
  hungry.food = 0;
  hungry.water = 1;
  assert.equal(SIM.simulate(hungry, 7200000), 1);
  const starving = SIM.fresh(0);
  starving.food = 0;
  starving.water = 0;
  assert.equal(SIM.factors(starving, 0).food, SIM.EMPTY_FACTOR);
  assert.equal(SIM.factors(starving, 0).water, SIM.EMPTY_FACTOR);
  assert.equal(SIM.simulate(starving, 7200000), 0);
});

test('心情系数始终落在上下限内', () => {
  const nows = [0, 300000, 3600000];
  for (const now of nows) {
    for (const petAt of [0, now - 300000, now, now + 60000]) {
      for (const playAt of [0, now - 300000, now, now + 60000]) {
        const s = SIM.fresh(0);
        s.mood.petAt = petAt;
        s.mood.playAt = playAt;
        const mood = SIM.factors(s, now).mood;
        assert.ok(mood >= SIM.MOOD_MIN && mood <= SIM.MOOD_MAX, `${petAt}/${playAt}/${now}`);
      }
    }
  }

  const idle = SIM.fresh(0);
  assert.equal(SIM.factors(idle, 5000).mood, 1);

  const happy = SIM.fresh(0);
  happy.owned.wand = true;
  SIM.pet(happy, 60000);
  assert.ok(SIM.playWith(happy, 'wand', 60000));
  const boosted = SIM.factors(happy, 60000).mood;
  assert.ok(boosted > 1 && boosted <= SIM.MOOD_MAX);
});

test('逐段推进与一次推进结果相同', () => {
  const once = SIM.fresh(0);
  SIM.simulate(once, 6 * 3600000);

  const stepped = SIM.fresh(0);
  for (let i = 1; i <= 360; i++) SIM.simulate(stepped, i * 60000);

  assert.equal(JSON.stringify(stepped), JSON.stringify(once));
});

test('猫优先拉进没满的盆', () => {
  const s = SIM.fresh(0);
  s.boxes = threeBoxes(0);
  for (let i = 0; i < 3; i++) s.boxes[0].poops.push({ id: s.seq++, kind: 0 });
  SIM.simulate(s, 1800000);
  assert.equal(s.boxes[0].poops.length, 3);
  assert.equal(s.boxes[1].poops.length, 1);
  assert.equal(s.boxes[2].poops.length, 0);
});

test('三盆全满时停止产出', () => {
  const s = SIM.fresh(0);
  s.boxes = threeBoxes(0);
  for (const box of s.boxes) {
    while (box.poops.length < SIM.BOX_LEVELS[box.level].cap) box.poops.push({ id: s.seq++, kind: 0 });
  }
  s.sim.fill = 0.5;
  const before = totalPoops(s);
  SIM.simulate(s, 86400000);
  assert.equal(totalPoops(s), before);
  assert.equal(s.sim.fill, 0.5);
  assert.ok(SIM.reasons(s, 86400000).some((r) => r.id === 'full'));
  assert.equal(SIM.isSquatting(s, 86400000), false);
});

test('旧存档无损迁移', () => {
  const old = {
    points: 1234,
    level: 4,
    poops: [{ id: 1, kind: 0 }, { id: 2, kind: 1 }],
    owned: { bowl: true, bed: true },
    walls: { sky: true, pink: true },
    wall: 'pink',
    cat: { id: 'domestic-orange', name: '豆豆', gender: 'boy' },
    totalScooped: 77,
    seq: 9,
    fedUntil: 999,
  };
  const s = SIM.migrate(old, 0);
  assert.equal(s.v, 2);
  assert.equal(s.points, 1234);
  assert.equal(s.boxes.length, 1);
  assert.equal(s.boxes[0].level, 4);
  assert.equal(s.boxes[0].poops.length, 2);
  assert.equal(s.boxes[0].poops[0].id, 1);
  assert.equal(s.boxes[0].poops[1].kind, 1);
  assert.equal(s.owned.bed, true);
  assert.equal(s.wall, 'pink');
  assert.equal(s.cat.name, '豆豆');
  assert.equal(s.totalScooped, 77);
  assert.equal(s.level, 4);
  assert.equal(s.water, 1);
  assert.equal(s.food, 1);
  assert.ok(!('poops' in s));
  assert.ok(!('fedUntil' in s));

  const crowded = {
    level: 2,
    poops: [0, 1, 0, 1, 0, 1].map((kind, i) => ({ id: i + 1, kind })),
  };
  const capped = SIM.migrate(crowded, 0);
  assert.equal(capped.boxes[0].poops.length, SIM.BOX_LEVELS[2].cap);
});

test('积分按盆等级结算并计入铲出数', () => {
  const zero = SIM.fresh(0);
  assert.equal(SIM.poopValue(zero, 0), 10);
  zero.boxes[0].poops.push({ id: 1, kind: 0 });
  const gain = SIM.scoop(zero, 0, 1);
  assert.equal(gain, 10);
  assert.equal(zero.points, 10);
  assert.equal(zero.totalScooped, 1);
  assert.equal(zero.boxes[0].poops.length, 0);

  const top = SIM.fresh(0);
  top.boxes = [SIM.createBox(10)];
  assert.equal(SIM.poopValue(top, 0), 60);

  const freshAir = SIM.fresh(0);
  freshAir.owned.freshener = true;
  assert.equal(SIM.poopValue(freshAir, 0), 15);
  freshAir.boxes = [SIM.createBox(10)];
  assert.equal(SIM.poopValue(freshAir, 0), 65);
});

test('水粮按固定时长线性消耗', () => {
  const wet = SIM.fresh(0);
  SIM.simulate(wet, 8 * 3600000);
  assert.equal(wet.water, 0);

  const fed = SIM.fresh(0);
  SIM.simulate(fed, 3 * 3600000);
  assert.equal(fed.food, 0);
});

test('蹲坑窗口只在快满或刚拉完时成立', () => {
  const almost = SIM.fresh(0);
  almost.sim.fill = 1 - 30000 * SIM.rateAt(almost, 0);
  assert.equal(SIM.isSquatting(almost, 0), true);

  const clean = SIM.fresh(0);
  assert.equal(SIM.isSquatting(clean, 0), false);

  const justPooped = SIM.fresh(0);
  justPooped.sim.lastPoopAt = 1000000;
  assert.equal(SIM.isSquatting(justPooped, 1002000), true);
  assert.equal(SIM.isSquatting(justPooped, 1005000), false);
});

test('时间回退时不动状态', () => {
  const s = SIM.fresh(10000);
  const before = JSON.stringify(s);
  assert.equal(SIM.simulate(s, 5000), 0);
  assert.equal(JSON.stringify(s), before);
  assert.equal(SIM.simulate(s, 10000), 0);
  assert.equal(JSON.stringify(s), before);
});

test('离线三十天既快又与逐日推进一致', () => {
  const whole = SIM.fresh(0);
  const startedAt = performance.now();
  const produced = SIM.simulate(whole, 30 * 86400000);
  const elapsed = performance.now() - startedAt;
  assert.ok(elapsed < 500, `耗时 ${elapsed} ms`);
  assert.equal(produced, 3);

  const daily = SIM.fresh(0);
  for (let day = 1; day <= 30; day++) SIM.simulate(daily, day * 86400000);
  assert.equal(JSON.stringify(whole), JSON.stringify(daily));
});

test('顶层等级跟随各盆最高等级', () => {
  const s = SIM.fresh(0);
  assert.equal(s.level, 0);
  s.points = 10000;
  const upgraded = SIM.upgradeBox(s, 0);
  assert.equal(upgraded.level, 1);
  assert.equal(s.level, 1);

  const second = SIM.buyBox(s);
  assert.equal(second, 1);
  assert.equal(s.level, 1);

  SIM.upgradeBox(s, 1);
  SIM.upgradeBox(s, 1);
  SIM.upgradeBox(s, 1);
  assert.equal(s.boxes[1].level, 3);
  assert.equal(s.level, 3);

  const old = SIM.migrate({ level: 4, points: 0 }, 0);
  assert.equal(old.level, 4);
});

test('饭盆容量拒绝超装', () => {
  const full = SIM.fresh(0);
  full.points = 1000;
  full.totalScooped = 20;
  full.food = SIM.FOOD_CAP;
  assert.equal(SIM.canBuyFood(full, 'kibble').why, 'full');
  assert.equal(SIM.feedFood(full, 'kibble'), null);
  assert.equal(full.points, 1000);
  assert.equal(full.food, SIM.FOOD_CAP);

  const nearly = SIM.fresh(0);
  nearly.points = 1000;
  nearly.totalScooped = 20;
  nearly.food = 2.5;
  assert.equal(SIM.canBuyFood(nearly, 'can').why, 'full');

  const roomy = SIM.fresh(0);
  roomy.points = 1000;
  roomy.totalScooped = 20;
  roomy.food = 1;
  assert.equal(SIM.canBuyFood(roomy, 'can').ok, true);
  const bought = SIM.feedFood(roomy, 'can');
  assert.equal(bought.id, 'can');
  assert.equal(roomy.food, SIM.FOOD_CAP);
  assert.equal(roomy.points, 1000 - SIM.PRICES.can);
});
