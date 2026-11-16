import test from 'node:test';
import assert from 'node:assert/strict';
import { withGame } from './harness.mjs';
import {
  CLOCK,
  ROOM,
  SEL,
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

test('需求 1 — 入门说明', { timeout: 90_000 }, async (t) => {
  await withGame(
    t,
    async ({ page, base, shotDir }) => {
      assert.equal(await isVisible(page, SEL.onboarding), true);
      assert.match(await page.text(SEL.onboardingCard), /猫会自己拉便便/);
      assert.equal(await page.text(SEL.onboardingText), '不用你点，猫过一会儿就自己去猫砂盆。盆满了它就憋着，还会生气。');

      for (let i = 0; i < 10 && (await page.text(SEL.onboardingNext)).trim() !== '开始养猫'; i++) {
        await page.click(SEL.onboardingNext);
      }
      assert.equal((await page.text(SEL.onboardingNext)).trim(), '开始养猫');
      await page.click(SEL.onboardingNext);
      await waitHidden(page, SEL.onboarding);

      await reloadRoom(page, base + ROOM);
      await waitHidden(page, SEL.onboarding);
      assert.equal(await page.evaluate('window.__game.state.tutorial.done'), true);

      await page.click(SEL.help);
      await waitVisible(page, SEL.onboarding);
      assert.equal((await page.text(SEL.onboardingStep)).trim(), '猫会自己拉便便');
      assert.match(await page.text(SEL.onboardingText), /盆满了它就憋着/);
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
      assert.equal(await isVisible(page, SEL.waterBowl), true);
      assert.equal(await isVisible(page, SEL.foodBowl), true);

      await page.waitFor(`!!document.querySelector(${JSON.stringify(SEL.catSleep)})`, 5000);
      await centerOn(page, [SEL.waterBowl, SEL.foodBowl]);
      await page.shot(`${shotDir}/req-02-room.png`);
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
      await page.shot(`${shotDir}/req-05-three-boxes.png`);
    },
    {
      ...PORTS,
      init: async ({ base }) => seedScript({ token: (await makeUser(base)).token, save: freshSave({ points: 5000, food: 3 }), guard: guard('req05') }),
      path: ROOM,
    },
  );
});
