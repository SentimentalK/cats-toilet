import test from 'node:test';
import assert from 'node:assert/strict';
import { withGame } from './harness.mjs';
import {
  CLOCK,
  ROOM,
  SAVE_KEY,
  SEL,
  SIM,
  SYNC_KEY,
  TOKEN_KEY,
  advance,
  boxLevel,
  boxPoops,
  centerOn,
  closeShop,
  freshSave,
  isVisible,
  makeUser,
  openShop,
  poopTotal,
  reloadRoom,
  seedScript,
  skipOnboarding,
  waitHidden,
  waitPoopsSettled,
  waitSettled,
  waitVisible,
} from './seed.mjs';

// node --test 让 test/e2e/*.test.mjs 并行跑，smoke 已占 8790/9555
const PORTS = { port: 8791, cdpPort: 9556 };
const guard = (name) => 'e2e-seed-' + name;

const ONBOARDING = [
  { title: '猫会自己拉便便', text: '不用你点，猫过一会儿就自己去猫砂盆。盆满了它就憋着，还会生气。' },
  { title: '铲屎换积分', text: '点便便或者下面的「铲屎」，把便便铲进垃圾袋，每坨都能换积分。' },
  { title: '积分能买东西', text: '商店里有更高级的猫砂盆、新猫砂盆、猫窝、高级饭盆水盆、食物和玩具。' },
  { title: '水和食物', text: '水盆点一下就加满，免费。食物要用积分买，吃完猫会饿。' },
  { title: '撸猫', text: '点猫就是摸头，摸头免费。买了逗猫棒、小老鼠陪它玩，它更开心，便便来得更快。' },
];

test('需求 1 — 入门说明', { timeout: 90_000 }, async (t) => {
  await withGame(
    t,
    async ({ page, base, shotDir }) => {
      assert.equal(await isVisible(page, SEL.onboarding), true);
      assert.match(await page.text(SEL.onboardingCard), /猫会自己拉便便/);

      for (const [i, step] of ONBOARDING.entries()) {
        const last = i === ONBOARDING.length - 1;
        assert.equal((await page.text(SEL.onboardingStep)).trim(), step.title);
        assert.equal((await page.text(SEL.onboardingText)).trim(), step.text);
        assert.equal((await page.text(SEL.onboardingNext)).trim(), last ? '开始养猫' : '下一步');
        await page.click(SEL.onboardingNext);
      }
      await waitHidden(page, SEL.onboarding);

      await reloadRoom(page, base + ROOM);
      await waitHidden(page, SEL.onboarding);
      assert.equal(await page.evaluate('window.__game.state.tutorial.done'), true);

      await page.click(SEL.help);
      await waitVisible(page, SEL.onboarding);
      assert.equal((await page.text(SEL.onboardingStep)).trim(), ONBOARDING[0].title);
      assert.equal((await page.text(SEL.onboardingText)).trim(), ONBOARDING[0].text);
      assert.equal((await page.text(SEL.onboardingNext)).trim(), '下一步');
      await waitSettled(page, SEL.onboarding);
      await page.shot(`${shotDir}/req-01-onboarding.png`);

      const userB = await makeUser(base);
      await page.addInitScript(seedScript({ token: userB.token, save: freshSave(), guard: guard('req01b') }));
      await reloadRoom(page, base + ROOM);
      await waitVisible(page, SEL.onboarding);
      await page.click(SEL.onboardingSkip);
      await waitHidden(page, SEL.onboarding);

      await reloadRoom(page, base + ROOM);
      await waitHidden(page, SEL.onboarding);
      assert.equal(await page.evaluate('window.__game.state.tutorial.done'), true);
    },
    {
      ...PORTS,
      init: async ({ base }) => seedScript({ token: (await makeUser(base)).token, save: freshSave(), guard: guard('req01a') }),
      path: ROOM,
    },
  );
});

test('需求 2 — 开局房间', { timeout: 90_000 }, async (t) => {
  await withGame(
    t,
    async ({ page, shotDir }) => {
      await skipOnboarding(page);

      assert.equal(await page.count(SEL.boxSlot(0)), 1);
      assert.equal(await page.count(SEL.boxSlot(1)), 0);
      assert.equal(await page.count(SEL.boxSlot(2)), 0);

      assert.equal(await page.count(SEL.waterBowl), 1);
      assert.equal(await page.count(SEL.foodBowl), 1);

      await page.waitFor(`!!document.querySelector(${JSON.stringify(SEL.catSleep)})`, 5000);
      const inView = (page, selectors) => page.evaluate(`(() => {
        const room = document.querySelector('#room');
        const view = { left: 0, right: room.clientWidth };
        return ${JSON.stringify(selectors)}.map((selector) => {
          const el = document.querySelector(selector);
          if (!el) return { selector, missing: true, inView: false };
          const r = el.getBoundingClientRect();
          return {
            selector,
            left: Number(r.left.toFixed(1)),
            right: Number(r.right.toFixed(1)),
            width: Number(r.width.toFixed(1)),
            view,
            inView: r.width > 0 && r.right > view.left && r.left < view.right,
          };
        });
      })()`);
      const opening = await inView(page, [SEL.boxSlot(0), SEL.waterBowl, SEL.foodBowl, SEL.cat]);
      assert.deepEqual(opening.map((r) => r.inView), [true, true, true, true], JSON.stringify(opening, null, 2));
      assert.equal(await page.count(SEL.catSleep), 1);
      await page.shot(`${shotDir}/req-02-room.png`);

      await page.viewport(1440, 900);
      await page.evaluate('new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok(true))))');
      await centerOn(page, [SEL.cat, SEL.boxSlot(0), SEL.waterBowl, SEL.foodBowl]);
      const wide = await page.evaluate(`(() => {
        const room = document.querySelector('#room');
        const seen = ['#cat', '.box-slot[data-box="0"]', '#water-bowl', '#food-bowl'].map((s) => {
          const el = document.querySelector(s);
          if (!el) return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.left >= 0 && r.right <= room.clientWidth;
        });
        return {
          size: [innerWidth, innerHeight],
          seen,
          asleep: !!document.querySelector('#cat[data-pose="sleep"]'),
        };
      })()`);
      assert.deepEqual(wide, { size: [1440, 900], seen: [true, true, true, true], asleep: true });
      await page.shot(`${shotDir}/req-02-room-wide.png`);
    },
    {
      ...PORTS,
      init: async ({ base }) => seedScript({ token: (await makeUser(base)).token, save: freshSave(), guard: guard('req02') }),
      path: ROOM,
    },
  );
});

test('需求 3 — 自己产便便 / 离线补算 / 盆满', { timeout: 90_000 }, async (t) => {
  await withGame(
    t,
    async ({ page, base, shotDir }) => {
      await skipOnboarding(page);
      await advance(page, 25 * 60 * 1000 + 5000);
      assert.ok((await page.count(SEL.poop)) >= 1);

      const userB = await makeUser(base);
      await page.addInitScript(
        seedScript({
          token: userB.token,
          save: freshSave({ sim: { at: CLOCK - 6 * 3600000, fill: 0, lastPoopAt: 0 } }),
          guard: guard('req03b'),
        }),
      );
      await reloadRoom(page, base + ROOM);
      await skipOnboarding(page);
      await page.waitFor('window.__game.state.boxes[0].poops.length === 3', 5000);

      await advance(page, 2 * 3600000);
      assert.equal(await boxPoops(page, 0), 3);
      await waitVisible(page, SEL.reason('full'));
      await centerOn(page, [SEL.boxSlot(0)]);
      await waitPoopsSettled(page);
      await page.shot(`${shotDir}/req-03-auto-poop.png`);
    },
    {
      ...PORTS,
      init: async ({ base }) => seedScript({ token: (await makeUser(base)).token, save: freshSave(), guard: guard('req03a') }),
      path: ROOM,
    },
  );
});

test('需求 4 — 公式与积分', { timeout: 90_000 }, async (t) => {
  await withGame(
    t,
    async ({ page, base, shotDir }) => {
      await skipOnboarding(page);
      assert.equal((await page.text(SEL.pointsNum)).trim(), '0');

      await advance(page, 3600000);
      assert.equal(await poopTotal(page), 2);

      await page.click(SEL.poop);
      await page.waitFor(`document.querySelector('#points-num').textContent.trim() === '10'`);
      assert.match(await page.text(SEL.boxValue(0)), /10/);

      const userB = await makeUser(base);
      await page.addInitScript(
        seedScript({ token: userB.token, save: freshSave({ points: 2000 }), guard: guard('req04b') }),
      );
      await reloadRoom(page, base + ROOM);
      await skipOnboarding(page);
      await openShop(page, 'box');
      for (let i = 0; i < 3; i++) await page.click(`#sheet-body [data-act="upgrade-box"][data-id="0"]`);

      assert.equal(await boxLevel(page, 0), 3);
      assert.equal(await page.evaluate('window.__game.SIM.poopValue(window.__game.state, 0)'), 25);
      assert.match(await page.text(SEL.boxValue(0)), /25/);

      await closeShop(page);
      await page.shot(`${shotDir}/req-04-points.png`);
    },
    {
      ...PORTS,
      init: async ({ base }) => seedScript({ token: (await makeUser(base)).token, save: freshSave(), guard: guard('req04a') }),
      path: ROOM,
    },
  );
});

test('需求 5 — 三个盆', { timeout: 90_000 }, async (t) => {
  await withGame(
    t,
    async ({ page, shotDir }) => {
      await skipOnboarding(page);
      await openShop(page, 'box');

      await page.click(`${SEL.sheetBody} [data-act="buy-box"]`);
      await page.click(`${SEL.sheetBody} [data-act="buy-box"]`);
      assert.equal(await page.count(SEL.boxSlot(2)), 1);
      assert.equal(await page.count('[data-act="buy-box"]'), 0);

      await page.click(`${SEL.sheetBody} [data-act="upgrade-box"][data-id="1"]`);
      assert.equal((await page.text(SEL.boxBadge(1))).trim(), 'Lv.1');
      assert.equal((await page.text(SEL.boxBadge(0))).trim(), 'Lv.0');

      await closeShop(page);
      await advance(page, 3 * 3600000);
      assert.ok((await page.evaluate('window.__game.state.food')) > 0);
      assert.equal(await boxPoops(page, 0), 3);
      assert.ok((await boxPoops(page, 2)) >= 1);

      await centerOn(page, [SEL.boxSlot(0), SEL.boxSlot(2)]);
      await waitPoopsSettled(page);
      await page.waitFor(
        `(() => {
          const bubble = document.querySelector('#bubble');
          const fx = document.querySelector('#fx');
          return !!bubble && bubble.hidden && !!fx && fx.children.length === 0;
        })()`,
        8000,
      );
      await page.shot(`${shotDir}/req-05-three-boxes.png`);

      await page.viewport(1440, 900);
      await page.evaluate('new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok(true))))');
      await centerOn(page, [SEL.boxSlot(0), SEL.boxSlot(1), SEL.boxSlot(2)]);
      const wide = await page.evaluate(`(() => {
        const room = document.querySelector('#room');
        const slots = [0, 1, 2].map((i) => {
          const slot = document.querySelector('.box-slot[data-box="' + i + '"]');
          const badge = slot ? slot.querySelector('.box-badge') : null;
          const rect = slot ? slot.getBoundingClientRect() : null;
          return {
            seen: !!rect && rect.width > 0 && rect.left >= 0 && rect.right <= room.clientWidth,
            badge: !!badge && badge.getBoundingClientRect().width > 0,
            poops: slot ? slot.querySelectorAll('.poop').length : 0,
          };
        });
        return { size: [innerWidth, innerHeight], slots };
      })()`);
      assert.deepEqual(wide.size, [1440, 900]);
      for (const s of wide.slots) {
        assert.equal(s.seen, true);
        assert.equal(s.badge, true);
        assert.ok(s.poops > 0);
      }
      await page.shot(`${shotDir}/req-05-three-boxes-wide.png`);
    },
    {
      ...PORTS,
      init: async ({ base }) => seedScript({ token: (await makeUser(base)).token, save: freshSave({ points: 5000, food: 3 }), guard: guard('req05') }),
      path: ROOM,
    },
  );
});

test('需求 6 — 水', { timeout: 90_000 }, async (t) => {
  await withGame(
    t,
    async ({ page, shotDir }) => {
      await skipOnboarding(page);
      await advance(page, 9 * 3600000);
      assert.equal((await page.text(SEL.waterText)).trim(), '水盆空啦');
      await waitVisible(page, SEL.reason('thirsty'));
      const points = await page.evaluate('window.__game.state.points');

      await page.click(SEL.waterBowl);
      assert.match((await page.text(SEL.waterText)).trim(), /^水 100/);
      assert.equal(await page.count(SEL.reason('thirsty')), 0);
      assert.equal(await page.evaluate('window.__game.state.points'), points);

      const dry = JSON.parse(JSON.stringify(freshSave({ water: 0 })));
      const wet = JSON.parse(JSON.stringify(freshSave({ water: 1 })));
      SIM.simulate(dry, CLOCK + 3600000);
      SIM.simulate(wet, CLOCK + 3600000);
      const lumps = (s) => s.boxes.reduce((n, b) => n + b.poops.length, 0);
      assert.ok(lumps(dry) < lumps(wet), 'empty water must slow the cat down');

      await centerOn(page, [SEL.waterBowl, SEL.foodBowl]);
      await page.shot(`${shotDir}/req-06-water.png`);
    },
    {
      ...PORTS,
      init: async ({ base }) => seedScript({ token: (await makeUser(base)).token, save: freshSave(), guard: guard('req06') }),
      path: ROOM,
    },
  );
});

test('需求 7 — 食物', { timeout: 120_000 }, async (t) => {
  await withGame(
    t,
    async ({ page, base, shotDir }) => {
      await skipOnboarding(page);
      const before = await page.evaluate('window.__game.state');
      await page.click(SEL.foodBowl);
      const fed = await page.evaluate('window.__game.state');
      assert.equal(fed.points, before.points - 10);
      assert.ok(fed.food > before.food);
      assert.match(await page.text(SEL.foodText), /份/);

      const poor = await makeUser(base);
      await page.addInitScript(seedScript({ token: poor.token, save: freshSave({ points: 0 }), guard: guard('req07b') }));
      await reloadRoom(page, base + ROOM);
      await skipOnboarding(page);
      await page.click(SEL.foodBowl);
      assert.match(await page.text(SEL.toast), /积分不够/);
      assert.equal(await page.evaluate('window.__game.state.food'), 1);

      const rich = await makeUser(base);
      await page.addInitScript(seedScript({ token: rich.token, save: freshSave({ points: 1000 }), guard: guard('req07c') }));
      await reloadRoom(page, base + ROOM);
      await skipOnboarding(page);
      await openShop(page, 'food');
      assert.equal(await page.count(`${SEL.sheetBody} [data-act="feed"][data-id="strip"]`), 1);
      assert.equal(await page.evaluate('document.querySelector(\'#sheet-body [data-act="feed"][data-id="strip"]\').disabled'), true);
      await closeShop(page);

      const empty = await makeUser(base);
      await page.addInitScript(seedScript({ token: empty.token, save: freshSave({ points: 50, food: 0 }), guard: guard('req07d') }));
      await reloadRoom(page, base + ROOM);
      await skipOnboarding(page);
      await page.click(SEL.foodBowl);
      const one = await page.evaluate('window.__game.state');
      assert.equal(one.food, 1);
      assert.equal(one.points, 40);
      await advance(page, 4 * 3600000);
      assert.equal((await page.text(SEL.foodText)).trim(), '饭盆空啦');
      await waitVisible(page, SEL.reason('hungry'));

      await centerOn(page, [SEL.foodBowl]);
      await page.shot(`${shotDir}/req-07-food.png`);
    },
    {
      ...PORTS,
      init: async ({ base }) => seedScript({ token: (await makeUser(base)).token, save: freshSave({ points: 50 }), guard: guard('req07a') }),
      path: ROOM,
    },
  );
});

test('需求 8 — 撸猫与玩具', { timeout: 120_000 }, async (t) => {
  await withGame(
    t,
    async ({ page, base, shotDir }) => {
      await skipOnboarding(page);
      const moodOf = async () => Number((await page.text(SEL.moodText)).replace(/\D+/g, ''));
      const moodBefore = await moodOf();
      const points = await page.evaluate('window.__game.state.points');
      await page.click(SEL.cat);
      const petted = await moodOf();
      assert.ok(petted > moodBefore, `petting must raise mood (${moodBefore} -> ${petted})`);
      assert.equal(await page.evaluate('window.__game.state.points'), points);

      const player = await makeUser(base);
      await page.addInitScript(
        seedScript({
          token: player.token,
          save: freshSave({
            points: 500,
            owned: { wand: true },
            mood: { petAt: CLOCK, playAt: 0, treatAt: 0, treatBoost: 0 },
          }),
          guard: guard('req08b'),
        }),
      );
      await reloadRoom(page, base + ROOM);
      await skipOnboarding(page);
      assert.equal(await page.count(SEL.toy('wand')), 1);
      await page.click(SEL.toy('wand'));
      assert.equal(await page.evaluate(`window.__game.state.mood.playAt >= ${CLOCK}`), true);
      const played = await moodOf();
      assert.ok(played > petted, `toy mood ${played} must beat petting ${petted}`);
      const factor = await page.evaluate('window.__game.SIM.factors(window.__game.state, window.__game.now()).mood');
      assert.ok(factor > 1, `mood factor ${factor} must be > 1`);

      await centerOn(page, [SEL.cat]);
      await page.shot(`${shotDir}/req-08-petting.png`);
    },
    {
      ...PORTS,
      init: async ({ base }) => seedScript({ token: (await makeUser(base)).token, save: freshSave(), guard: guard('req08a') }),
      path: ROOM,
    },
  );
});

test('需求 9 — 看得出状态', { timeout: 90_000 }, async (t) => {
  const boxes = [SIM.createBox(0), SIM.createBox(0), SIM.createBox(0)].map((box, i) => ({
    level: box.level,
    poops: [0, 1, 2].map((k) => ({ id: i * 3 + k + 1, kind: 0 })),
  }));
  await withGame(
    t,
    async ({ page, shotDir }) => {
      await skipOnboarding(page);
      await waitVisible(page, SEL.reason('thirsty'));
      await waitVisible(page, SEL.reason('hungry'));
      await waitVisible(page, SEL.reason('full'));
      assert.match(await page.text(SEL.reason('thirsty')), /渴/);
      assert.match(await page.text(SEL.reason('hungry')), /饿/);
      assert.match(await page.text(SEL.reason('full')), /满/);
      assert.equal(await page.count(SEL.reason('lonely')), 0);
      assert.equal((await page.text(SEL.moodFace)).trim(), '😾');
      assert.equal((await page.text(SEL.moodText)).trim(), '心情 0');

      await centerOn(page, [SEL.boxSlot(0), SEL.boxSlot(2)]);
      await waitPoopsSettled(page);
      await page.shot(`${shotDir}/req-09-status.png`);
    },
    {
      ...PORTS,
      init: async ({ base }) =>
        seedScript({
          token: (await makeUser(base)).token,
          save: freshSave({ water: 0, food: 0, boxes }),
          guard: guard('req09'),
        }),
      path: ROOM,
    },
  );
});

test('需求 10 — 商店兑换', { timeout: 90_000 }, async (t) => {
  await withGame(
    t,
    async ({ page, shotDir }) => {
      await skipOnboarding(page);
      await openShop(page, 'all');
      const tabs = await page.evaluate('[...document.querySelectorAll(\'#sheet-body [data-act="tab"]\')].map((b) => b.textContent.trim())');
      for (const name of ['猫砂盆', '食物', '玩具', '用品', '家具', '装饰', '墙面']) {
        assert.ok(tabs.includes(name), `shop tab missing: ${name}`);
      }

      await page.click(`${SEL.sheetBody} [data-act="buy"][data-id="bed"]`);
      await waitHidden(page, SEL.sheet);
      assert.equal(await page.count(SEL.sprite('bed')), 1);

      await openShop(page, 'all');
      await page.click(`${SEL.sheetBody} [data-act="buy"][data-id="waterPro"]`);
      await waitHidden(page, SEL.sheet);
      assert.equal(await page.evaluate('window.__game.state.owned.waterPro'), true);

      await openShop(page, 'food');
      await page.click(`${SEL.sheetBody} [data-act="feed"][data-id="can"]`);
      assert.ok((await page.evaluate('window.__game.state.food')) > 0);

      await openShop(page, 'toy');
      await page.click(`${SEL.sheetBody} [data-act="buy"][data-id="mouse"]`);
      assert.equal(await page.evaluate('window.__game.state.owned.mouse'), true);

      await openShop(page, 'all');
      await waitSettled(page, '#sheet');
      await page.shotViewport(`${shotDir}/req-10-shop.png`);
    },
    {
      ...PORTS,
      init: async ({ base }) =>
        seedScript({
          token: (await makeUser(base)).token,
          save: freshSave({ points: 10000, totalScooped: 20 }),
          guard: guard('req10'),
        }),
      path: ROOM,
    },
  );
});

const LEGACY_V1 = {
  points: 777,
  level: 4,
  poops: [{ id: 1, kind: 0 }, { id: 2, kind: 1 }],
  totalSquatMs: 1234,
  totalScooped: 77,
  seq: 9,
  owned: { bowl: true, bed: true },
  walls: { sky: true, pink: true },
  wall: 'pink',
  fedUntil: 0,
  cat: { id: 'domestic-orange', name: '豆豆', gender: 'boy' },
};

const legacyInit = (token, save, name) => [
  `if (!localStorage.getItem(${JSON.stringify(guard(name))})) {`,
  `  localStorage.setItem(${JSON.stringify(TOKEN_KEY)}, ${JSON.stringify(token)});`,
  `  localStorage.removeItem(${JSON.stringify(SYNC_KEY)});`,
  `  localStorage.setItem(${JSON.stringify(SAVE_KEY)}, ${JSON.stringify(JSON.stringify(save))});`,
  `  localStorage.setItem(${JSON.stringify(guard(name))}, '1');`,
  '}',
].join('\n');

test('旧存档迁移', { timeout: 120_000 }, async (t) => {
  await withGame(
    t,
    async ({ page, base, shotDir }) => {
      const state = await page.evaluate('window.__game.state');
      assert.equal(state.v, 2);
      assert.equal(state.points, 777);
      assert.equal(state.level, 4);
      assert.equal(state.boxes[0].level, 4);
      assert.equal(state.boxes[0].poops.length, 2);
      assert.equal(state.owned.bed, true);
      assert.equal(state.owned.bowlPro, true);
      assert.equal(state.owned.bowl, undefined);
      assert.equal(await page.evaluate('Object.prototype.hasOwnProperty.call(window.__game.state.owned, "bowl")'), false);
      assert.equal(state.wall, 'pink');
      assert.equal(state.cat.name, '豆豆');
      assert.equal((await page.text(SEL.pointsNum)).trim(), '777');
      assert.equal((await page.text(SEL.boxBadge(0))).trim(), 'Lv.4');
      assert.equal(await page.count(SEL.sprite('bed')), 1);

      await centerOn(page, [SEL.boxSlot(0)]);
      await page.shot(`${shotDir}/req-11-migration.png`);

      const rich = await makeUser(base);
      await page.addInitScript(legacyInit(rich.token, { ...LEGACY_V1, points: 5000 }, 'legacy2'));
      await reloadRoom(page, base + ROOM);
      await openShop(page, 'box');
      await page.click(`${SEL.sheetBody} [data-act="buy-box"]`);
      await page.click(`${SEL.sheetBody} [data-act="upgrade-box"][data-id="1"]`);
      const after = await page.evaluate('window.__game.state');
      assert.equal(after.boxes.length, 2);
      assert.equal(after.level, Math.max(...after.boxes.map((b) => b.level)));
      assert.ok(after.level >= 4);
    },
    {
      ...PORTS,
      init: async ({ base }) => legacyInit((await makeUser(base)).token, LEGACY_V1, 'legacy1'),
      path: ROOM,
    },
  );
});

test('界面产出与 CatSim 一致', { timeout: 90_000 }, async (t) => {
  await withGame(
    t,
    async ({ page }) => {
      await skipOnboarding(page);
      const t0 = JSON.parse(JSON.stringify(await page.evaluate('window.__game.state')));
      await advance(page, 2 * 3600000);
      const t1 = await page.evaluate('window.__game.state');

      const replay = JSON.parse(JSON.stringify(t0));
      SIM.simulate(replay, t1.sim.at);

      assert.deepEqual(replay.boxes, t1.boxes);
      assert.equal(replay.water, t1.water);
      assert.equal(replay.food, t1.food);
      assert.equal(replay.sim.fill, t1.sim.fill);
      assert.equal(replay.sim.at, t1.sim.at);
      assert.equal(replay.seq, t1.seq);
      assert.equal(replay.points, t1.points);
    },
    {
      ...PORTS,
      init: async ({ base }) => seedScript({ token: (await makeUser(base)).token, save: freshSave(), guard: guard('req12') }),
      path: ROOM,
    },
  );
});
