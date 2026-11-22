import test from 'node:test';
import assert from 'node:assert/strict';
import { withGame } from './harness.mjs';
import {
  CLOCK,
  ROOM,
  SEL,
  SAVE_KEY,
  SYNC_KEY,
  TOKEN_KEY,
  closeShop,
  freshSave,
  makeUser,
  openShop,
  poopTotal,
  reloadRoom,
  seedScript,
  skipOnboarding,
  waitHidden,
  waitSettled,
  waitVisible,
} from './seed.mjs';

const PORTS = { port: 8792, cdpPort: 9557 };
const RUNTIME_DIR = '/home/sentimentalk/codes/temp/cat-004/e2e';
const SHOT_DIR = '/home/sentimentalk/codes/temp/cat-004/screenshots';
const guard = (name) => 'e2e-cat004-' + name;
const opts = (init, path = ROOM) => ({ ...PORTS, runtimeDir: RUNTIME_DIR, shotDir: SHOT_DIR, init, path });

const ONBOARDING = [
  { title: '猫会自己拉便便', text: '不用你点，猫过一会儿就自己去猫砂盆。盆满了它就憋着，还会生气。' },
  { title: '铲屎换积分', text: '点便便或者下面的「铲屎」，把便便铲进垃圾袋，每坨都能换积分。' },
  { title: '积分能买东西', text: '商店里有更高级的猫砂盆、新猫砂盆、猫窝、高级饭盆水盆、食物和玩具。' },
  { title: '水和食物', text: '水盆点一下就加满，免费。食物要用积分买，吃完猫会饿。' },
  { title: '撸猫', text: '点猫就是摸头，摸头免费。买了逗猫棒、小老鼠陪它玩，它更开心，便便来得更快。' },
];

const UNLOCKED = "window.__audio.status().decoded.length === 6 && window.__audio.status().ctx === 'running'";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ready(page) {
  await page.waitFor("window.social && window.social.mode === 'online'", 10_000);
}

test('CAT-004 需求 1 — BGM 与设置持久化', { timeout: 150_000 }, async (t) => {
  await withGame(
    t,
    async ({ page, base, shotDir }) => {
      await ready(page);
      await skipOnboarding(page);
      await page.click('#points');
      await page.waitFor(UNLOCKED, 15_000);
      assert.equal(await page.evaluate('window.__audio.status().bgmPlaying'), true);

      await page.click('#btn-settings');
      await waitVisible(page, '#set-music');
      assert.equal(await page.evaluate("document.querySelector('#set-music').checked"), true);
      assert.equal(await page.evaluate("document.querySelector('#set-sfx').checked"), true);
      assert.equal(await page.evaluate("document.querySelector('#set-music-vol').value"), '40');
      assert.equal(await page.evaluate("document.querySelector('#set-sfx-vol').value"), '70');
      await waitSettled(page, '#sheet', 4000);
      await page.shot(`${shotDir}/req-01-settings-audio.png`);

      await page.click('#set-music');
      await page.waitFor('window.__audio.status().bgmPlaying === false', 3000);
      assert.equal(await page.evaluate("JSON.parse(localStorage.getItem('cats-toilet-audio-v1')).musicOn"), false);

      await reloadRoom(page, base + ROOM);
      await ready(page);
      await page.click('#points');
      await page.waitFor(UNLOCKED, 15_000);
      await page.click('#btn-settings');
      await waitVisible(page, '#set-music');
      assert.equal(await page.evaluate("document.querySelector('#set-music').checked"), false);
      assert.equal(await page.evaluate('window.__audio.status().bgmPlaying'), false);

      await page.click('#set-music');
      await page.waitFor('window.__audio.status().bgmPlaying === true', 3000);

      await page.evaluate("(() => { const el = document.querySelector('#set-music-vol'); el.value = '20'; el.dispatchEvent(new Event('input', { bubbles: true })); })()");
      assert.equal(await page.evaluate('window.__audio.status().settings.musicVol'), 0.2);
      assert.equal(await page.evaluate("JSON.parse(localStorage.getItem('cats-toilet-audio-v1')).musicVol"), 0.2);
      assert.equal(await page.evaluate("document.querySelector('#set-music-val').textContent"), '20%');

      await page.click('#set-sfx');
      await page.click('#sheet-close');
      await waitHidden(page, SEL.sheet);
      const muted = await page.evaluate('window.__audio.status().sfxCount');
      await page.click(SEL.cat);
      await sleep(300);
      assert.equal(await page.evaluate('window.__audio.status().sfxCount'), muted);

      await page.addInitScript(seedScript({ token: (await makeUser(base)).token, save: freshSave(), guard: guard('req1b') }));
      await reloadRoom(page, base + ROOM + '#room');
      await ready(page);
      await page.click('#points');
      await page.waitFor(UNLOCKED, 15_000);
      await page.click('#btn-settings');
      await waitVisible(page, '#set-sfx');
      assert.equal(await page.evaluate("document.querySelector('#set-sfx').checked"), false);
      assert.equal(await page.evaluate("document.querySelector('#set-music').checked"), true);
      assert.equal(await page.evaluate("document.querySelector('#set-music-vol').value"), '20');
      await page.click('#sheet-close');
      await waitHidden(page, SEL.sheet);
      const afterReload = await page.evaluate('window.__audio.status().sfxCount');
      await page.click(SEL.cat);
      await sleep(300);
      assert.equal(await page.evaluate('window.__audio.status().sfxCount'), afterReload);

      await page.click('#btn-settings');
      await waitVisible(page, '#set-sfx');
      await page.click('#set-sfx');
      await page.click('#sheet-close');
      await waitHidden(page, SEL.sheet);
      await page.click(SEL.cat);
      await page.waitFor(`window.__audio.status().sfxCount === ${afterReload + 1}`, 3000);
      assert.equal(await page.evaluate('window.__audio.status().settings.sfxOn'), true);
    },
    opts(async ({ base }) => seedScript({ token: (await makeUser(base)).token, save: freshSave(), guard: guard('req1') })),
  );
});

test('CAT-004 需求 2 — 分段/高亮/转义', { timeout: 120_000 }, async (t) => {
  await withGame(
    t,
    async ({ page, shotDir }) => {
      await ready(page);
      await skipOnboarding(page);
      await page.click(SEL.help);
      await waitVisible(page, SEL.onboarding);

      const classes = new Set();
      let maxSegs = 0;
      let stacked = 0;
      for (const [i, step] of ONBOARDING.entries()) {
        const probe = await page.evaluate(`(() => {
          const el = document.querySelector('#onboarding-text');
          const segs = [...el.querySelectorAll('.seg')];
          return {
            text: el.textContent,
            segs: segs.length,
            tops: segs.map((s) => s.getBoundingClientRect().top),
            classes: [...el.querySelectorAll('.kw')].map((k) => [...k.classList].find((c) => c.startsWith('kw-')))
          };
        })()`);
        assert.equal(probe.text, step.text, `step ${i}`);
        assert.ok(probe.segs >= 1, `step ${i} has segments`);
        if (probe.segs >= 2 && probe.tops[1] > probe.tops[0] + 2) stacked++;
        maxSegs = Math.max(maxSegs, probe.segs);
        for (const cls of probe.classes) classes.add(cls);
        await page.click(SEL.onboardingNext);
      }
      await waitHidden(page, SEL.onboarding);
      assert.ok(maxSegs >= 2, 'at least one onboarding step splits into 2+ segments');
      assert.ok(stacked >= 1, 'segmented onboarding lines stack vertically');
      for (const cls of ['kw-scoop', 'kw-points', 'kw-water', 'kw-food', 'kw-mood', 'kw-shop']) {
        assert.ok(classes.has(cls), `onboarding highlights ${cls}`);
      }

      await sleep(800);
      await page.click(SEL.waterBowl);
      await page.waitFor(`(() => {
        const b = document.querySelector('#bubble');
        return !b.hidden && b.textContent.includes('水加满啦喵') && !!b.querySelector('.kw-water');
      })()`, 5000);

      await page.evaluate("window.__game.say('铲屎 积分 水 猫粮 心情 商店')");
      for (const cls of ['kw-scoop', 'kw-points', 'kw-water', 'kw-food', 'kw-mood', 'kw-shop']) {
        assert.equal(await page.evaluate(`document.querySelectorAll('#bubble .${cls}').length >= 1`), true, cls);
      }

      await page.evaluate("window.__game.say('<img src=x onerror=window.__pwn=1> 积分')");
      const injected = await page.evaluate(`(() => {
        const b = document.querySelector('#bubble');
        return {
          imgs: b.querySelectorAll('img').length,
          pwn: typeof window.__pwn,
          text: b.textContent,
          points: b.querySelectorAll('.kw-points').length,
        };
      })()`);
      assert.equal(injected.imgs, 0);
      assert.equal(injected.pwn, 'undefined');
      assert.ok(injected.text.includes('<img'));
      assert.ok(injected.points >= 1);
      await page.shot(`${shotDir}/req-02-rich.png`);
    },
    opts(async ({ base }) => seedScript({ token: (await makeUser(base)).token, save: freshSave({ starterBonus: 0, boxes: [{ level: 0, poops: [] }] }), guard: guard('req2') })),
  );
});

test('CAT-004 需求 3 — 5 种猫叫不连续重复 + 唤醒叫', { timeout: 150_000 }, async (t) => {
  await withGame(
    t,
    async ({ page, shotDir }) => {
      await ready(page);
      await skipOnboarding(page);
      await page.click('#points');
      await page.waitFor(UNLOCKED, 15_000);
      await page.waitFor("document.querySelector('#cat').dataset.pose === 'sleep'", 5000);

      await page.click(SEL.cat);
      await page.waitFor('window.__audio.status().sfxCount === 1', 3000);
      const ids = [await page.evaluate('window.__audio.status().lastSfx')];
      for (let i = 0; i < 8; i++) {
        await sleep(120);
        await page.click(SEL.cat);
        await page.waitFor(`window.__audio.status().sfxCount === ${i + 2}`, 3000);
        ids.push(await page.evaluate('window.__audio.status().lastSfx'));
      }

      const allowed = ['purr', 'meow', 'meow-long', 'trill', 'happy'];
      for (let i = 0; i < ids.length; i++) {
        assert.ok(allowed.includes(ids[i]), `sound ${i}: ${ids[i]}`);
        if (i > 0) assert.notEqual(ids[i], ids[i - 1], `sounds ${i - 1}/${i} repeat`);
      }
      assert.ok(new Set(ids).size >= 3, `saw ${[...new Set(ids)].join(',')}`);
      await page.shot(`${shotDir}/req-03-meows.png`);
    },
    opts(async ({ base }) => seedScript({ token: (await makeUser(base)).token, save: freshSave({ starterBonus: 0, boxes: [{ level: 0, poops: [] }] }), guard: guard('req3') })),
  );
});

test('CAT-004 需求 4 — 睡猫无缩放、点击立即醒', { timeout: 120_000 }, async (t) => {
  await withGame(
    t,
    async ({ page, shotDir }) => {
      await ready(page);
      await skipOnboarding(page);
      await page.waitFor("!!document.querySelector('#cat[data-pose=\"sleep\"]')", 8000);
      const sleepAnim = await page.evaluate(`(() => {
        const img = document.querySelector('#cat > img');
        return { name: getComputedStyle(img).animationName, count: img.getAnimations().length };
      })()`);
      assert.equal(sleepAnim.name, 'none');
      assert.equal(sleepAnim.count, 0);

      const before = await page.evaluate("document.querySelector('#cat').getBoundingClientRect().width");
      await page.click(SEL.cat);
      await page.waitFor("document.querySelector('#cat').dataset.pose === 'sit'", 300);

      const widths = [];
      for (let i = 0; i < 6; i++) {
        widths.push(await page.evaluate("document.querySelector('#cat').getBoundingClientRect().width"));
        await sleep(50);
      }
      const spread = Math.max(...widths) - Math.min(...widths);
      assert.ok(spread < 1, `width spread ${spread}`);
      assert.ok(widths[widths.length - 1] <= before + 1, `awake ${widths[widths.length - 1]} vs asleep ${before}`);
      await page.shot(`${shotDir}/req-04-wake.png`);
    },
    opts(async ({ base }) => seedScript({ token: (await makeUser(base)).token, save: freshSave({ starterBonus: 0, boxes: [{ level: 0, poops: [] }] }), guard: guard('req4') })),
  );
});

test('CAT-004 需求 5 — 饭后洗脸 2s 且不打断蹲坑', { timeout: 150_000 }, async (t) => {
  await withGame(
    t,
    async ({ page, base, shotDir }) => {
      await ready(page);
      await skipOnboarding(page);
      await page.click(SEL.foodBowl);
      await page.waitFor("document.querySelector('#cat').dataset.pose === 'groom' && document.querySelector('#cat').classList.contains('washing')", 8000);
      const startedAt = Date.now();
      await page.shot(`${shotDir}/req-05-groom.png`);
      await page.waitFor("!document.querySelector('#cat').classList.contains('washing')", 5000);
      const lasted = Date.now() - startedAt;
      assert.ok(lasted >= 1500, `wash lasted ${lasted}ms`);
      assert.ok(lasted <= 2800, `wash lasted ${lasted}ms`);
      await page.waitFor("document.querySelector('#cat').dataset.pose === 'sit'", 5000);

      await page.addInitScript(seedScript({
        token: (await makeUser(base)).token,
        save: freshSave({
          points: 100,
          food: 1,
          boxes: [{ level: 0, poops: [] }],
          starterBonus: 0,
          sim: { at: CLOCK, fill: 0, lastPoopAt: 0 },
        }),
        guard: guard('req5b'),
      }));
      await reloadRoom(page, base + ROOM);
      await ready(page);
      await skipOnboarding(page);
      await page.evaluate(`(() => {
        const g = window.__game;
        g.state.sim.fill = 1 - 5000 * g.SIM.rateAt(g.state, g.now());
        return g.state.sim.fill;
      })()`);
      await page.click(SEL.foodBowl);

      const seen = [];
      const deadline = Date.now() + 6000;
      while (Date.now() < deadline) {
        const now = await page.evaluate(`(() => {
          const c = document.querySelector('#cat');
          return { pose: c.dataset.pose, washing: c.classList.contains('washing') };
        })()`);
        if (now.pose === 'groom' || now.washing) seen.push(now);
        await sleep(100);
      }
      assert.deepEqual(seen, []);
    },
    opts(async ({ base }) => seedScript({
      token: (await makeUser(base)).token,
      save: freshSave({
        points: 100,
        food: 1,
        boxes: [{ level: 0, poops: [] }],
        starterBonus: 0,
        sim: { at: CLOCK, fill: 0, lastPoopAt: 0 },
      }),
      guard: guard('req5a'),
    })),
  );
});

const LEGACY_V1 = {
  points: 777,
  level: 4,
  totalScooped: 77,
  seq: 9,
  owned: { bowl: true, bed: true },
  walls: { sky: true, pink: true },
  wall: 'pink',
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

test('CAT-004 需求 6 — 开局 3 坨、首铲 100、老存档不注入', { timeout: 180_000 }, async (t) => {
  await withGame(
    t,
    async ({ page, base, shotDir }) => {
      await sleep(700);
      await ready(page);
      await skipOnboarding(page);
      const state = await page.evaluate('window.__game.state');
      assert.equal(state.boxes.length, 1);
      assert.equal(state.boxes[0].poops.length, 3);
      assert.deepEqual(state.boxes[0].poops.map((p) => p.id), [1, 2, 3]);
      assert.equal(state.starterBonus, 70);
      assert.deepEqual(state.boxes[0].poops.map((p) => p.kind), [0, 1, 1]);
      assert.equal((await page.text('#scoop-badge')).trim(), '3');
      await page.waitFor(`(() => {
        const b = document.querySelector('#bubble');
        return !b.hidden && b.textContent.includes('新手礼') && b.textContent.includes('可以铲了')
          && !!b.querySelector('.kw-scoop') && !!b.querySelector('.kw-points');
      })()`, 8000);
      const hintTops = await page.evaluate("[...document.querySelectorAll('#bubble .seg')].map((s) => s.getBoundingClientRect().top)");
      assert.ok(hintTops.length >= 2 && hintTops[1] > hintTops[0] + 2, 'hint lines stack vertically');
      await page.shot(`${shotDir}/req-06-starter-hint.png`);

      await page.click(SEL.poop);
      await page.waitFor("document.querySelector('#points-num').textContent.trim() === '80'", 3000);
      assert.equal(await page.evaluate('window.__game.state.starterBonus'), 0);
      assert.match(await page.text(SEL.toast), /新手礼/);

      await page.click(SEL.tabScoop);
      await page.waitFor("document.querySelector('#points-num').textContent.trim() === '100'", 3000);
      assert.equal(await poopTotal(page), 0);
      await page.shot(`${shotDir}/req-06-scooped.png`);

      await page.addInitScript(seedScript({ token: (await makeUser(base)).token, save: freshSave(), guard: guard('req6b') }));
      await reloadRoom(page, base + ROOM);
      await ready(page);
      await skipOnboarding(page);
      await page.click(SEL.tabScoop);
      await page.waitFor("document.querySelector('#points-num').textContent.trim() === '100'", 3000);
      assert.equal(await poopTotal(page), 0);
      assert.equal(await page.evaluate('window.__game.state.starterBonus'), 0);

      await page.addInitScript(legacyInit((await makeUser(base)).token, LEGACY_V1, 'req6old'));
      await reloadRoom(page, base + ROOM);
      await ready(page);
      await skipOnboarding(page);
      assert.equal(await poopTotal(page), 0);
      assert.equal(await page.evaluate('window.__game.state.starterBonus'), 0);
      assert.equal(await page.evaluate('window.__game.state.points'), 777);
      await page.click(SEL.tabScoop);
      await page.waitFor(`(() => {
        const b = document.querySelector('#bubble');
        return !b.hidden && b.textContent.includes('盆里干干净净');
      })()`, 5000);
      assert.equal(await page.evaluate('window.__game.state.points'), 777);
    },
    opts(async ({ base }) => seedScript({ token: (await makeUser(base)).token, save: freshSave(), guard: guard('req6a') })),
  );
});

test('CAT-004 水碗满/半水接入', { timeout: 150_000 }, async (t) => {
  await withGame(
    t,
    async ({ page, base, shotDir }) => {
      await ready(page);
      await skipOnboarding(page);
      assert.equal(await page.evaluate("document.querySelector('#water-bowl img').getAttribute('src')"), 'assets/water-bowl-full.png');
      await page.shot(`${shotDir}/req-07-water-full.png`);

      await page.addInitScript(seedScript({ token: (await makeUser(base)).token, save: freshSave({ water: 0.3 }), guard: guard('req7b') }));
      await reloadRoom(page, base + ROOM);
      await ready(page);
      await skipOnboarding(page);
      assert.equal(await page.evaluate("document.querySelector('#water-bowl img').getAttribute('src')"), 'assets/water-bowl-half.png');
      assert.equal(await page.evaluate("document.querySelector('#water-bowl').classList.contains('pro')"), false);
      await page.shot(`${shotDir}/req-07-water-half.png`);

      await page.addInitScript(seedScript({ token: (await makeUser(base)).token, save: freshSave({ water: 0 }), guard: guard('req7c') }));
      await reloadRoom(page, base + ROOM);
      await ready(page);
      await skipOnboarding(page);
      assert.equal(await page.evaluate("document.querySelector('#water-bowl img').getAttribute('src')"), 'assets/bowl-empty.png');

      await page.addInitScript(seedScript({ token: (await makeUser(base)).token, save: freshSave({ water: 1, points: 2000 }), guard: guard('req7d') }));
      await reloadRoom(page, base + ROOM);
      await ready(page);
      await skipOnboarding(page);
      await openShop(page, 'gear');
      const cardSrc = await page.evaluate(`(() => {
        const btn = document.querySelector('#sheet-body [data-act="buy"][data-id="waterPro"]');
        const card = btn ? btn.closest('.shop-card') : null;
        const img = card ? card.querySelector('img') : null;
        return img ? img.getAttribute('src') : null;
      })()`);
      assert.equal(cardSrc, 'assets/water-bowl-full.png');
      await closeShop(page);
    },
    opts(async ({ base }) => seedScript({ token: (await makeUser(base)).token, save: freshSave({ water: 1 }), guard: guard('req7a') })),
  );
});
