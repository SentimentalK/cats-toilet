import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export const SIM = require('../../js/sim.js');
export const CLOCK = 1700000000000;
export const ROOM = '/?clock=' + CLOCK;
export const SAVE_KEY = 'cats-toilet-proto-v1';
export const TOKEN_KEY = 'cats-toilet-token';
export const SYNC_KEY = 'cats-toilet-sync';
export const GAME_READY = '!!window.__game && !document.querySelector(".s-boot")';

const PASSWORD = 'e2e-pass';
let userSeq = 0;

export async function makeUser(base) {
  const tag = Math.random().toString(36).slice(2, 6);
  const username = ('e2e' + process.pid + (userSeq++) + tag).slice(0, 16);
  const res = await fetch(base + '/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || !body.token) {
    throw new Error(`register failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return { token: body.token, id: body.user.id, username };
}

export function seedScript({ token, save, keepSave, guard }) {
  const writes = [];
  if (token) writes.push(`localStorage.setItem(${JSON.stringify(TOKEN_KEY)}, ${JSON.stringify(token)});`);
  if (keepSave !== true && save !== undefined) {
    writes.push(`localStorage.removeItem(${JSON.stringify(SYNC_KEY)});`);
    writes.push(`localStorage.setItem(${JSON.stringify(SAVE_KEY)}, ${JSON.stringify(JSON.stringify(save))});`);
  }
  if (!guard) return writes.join('\n');
  return [
    `if (!localStorage.getItem(${JSON.stringify(guard)})) {`,
    ...writes,
    `localStorage.setItem(${JSON.stringify(guard)}, '1');`,
    '}',
  ].join('\n');
}

export function freshSave(overrides = {}) {
  const save = SIM.fresh(CLOCK);
  save.cat = { id: 'domestic-orange', name: '豆豆', gender: 'boy' };
  return Object.assign(save, overrides);
}

export function seedFor(overrides) {
  return { save: freshSave(overrides) };
}

const slot = (i) => `.box-slot[data-box="${i}"]`;
const card = (i) => `#box-strip .box-card[data-box="${i}"]`;

export const SEL = {
  room: '#room',
  cat: '#cat',
  catSleep: '#cat[data-pose="sleep"]',
  boxSlot: slot,
  boxBadge: (i) => `${slot(i)} .box-badge`,
  boxCard: card,
  boxValue: (i) => `${card(i)} .box-value`,
  boxStrip: '#box-strip',
  poop: '.poop',
  waterBowl: '#water-bowl',
  foodBowl: '#food-bowl',
  waterText: '#water-text',
  foodText: '#food-text',
  moodText: '#mood-text',
  moodFace: '#mood-face',
  reasons: '#reasons',
  reason: (id) => `#reasons .reason[data-reason="${id}"]`,
  onboarding: '#onboarding',
  onboardingCard: '#onboarding .onb-card',
  onboardingStep: '#onboarding-step',
  onboardingText: '#onboarding-text',
  onboardingNext: '#onboarding-next',
  onboardingSkip: '#onboarding-skip',
  help: '#btn-help',
  tabScoop: '#tab-scoop',
  tabShop: '#tab-shop',
  tabPlaza: '#tab-plaza',
  toast: '#toast',
  pointsNum: '#points-num',
  sheet: '#sheet-wrap',
  sheetBody: '#sheet-body',
  sheetClose: '#sheet-close',
  tab: '[data-act="tab"]',
  sprite: (id) => `.sprite[data-item="${id}"]`,
  toy: (id) => `.toy[data-item="${id}"]`,
  act: (act, id) => `[data-act="${act}"]${id === undefined ? '' : `[data-id="${id}"]`}`,
};

const isVisibleExpr = (selector) =>
  `(() => { const el = document.querySelector(${JSON.stringify(selector)}); return !!el && el.offsetParent !== null; })()`;

export function isVisible(page, selector) {
  return page.evaluate(isVisibleExpr(selector));
}

export async function waitVisible(page, selector, ms = 8000) {
  await page.waitFor(isVisibleExpr(selector), ms);
}

export async function waitHidden(page, selector, ms = 8000) {
  await page.waitFor(`!(${isVisibleExpr(selector)})`, ms);
}

export async function advance(page, ms) {
  await page.evaluate(`window.__game.advanceClock(${ms})`);
}

export async function centerOn(page, selectors, ms = 6000) {
  const probe = `(() => {
    const room = document.querySelector('#room');
    const scene = document.querySelector('#scene');
    const els = ${JSON.stringify(selectors)}.map((s) => document.querySelector(s)).filter(Boolean);
    if (!els.length) return { fits: false, scroll: room.scrollLeft };
    const rects = els.map((el) => el.getBoundingClientRect());
    const fits = rects.every((r) => r.left >= 0 && r.right <= room.clientWidth);
    if (!fits) {
      const left = Math.min(...rects.map((r) => r.left)) + room.scrollLeft;
      const right = Math.max(...rects.map((r) => r.right)) + room.scrollLeft;
      const max = room.scrollWidth - room.clientWidth;
      const px = Math.min(max, Math.max(0, Math.round((left + right) / 2 - room.clientWidth / 2)));
      window.__game.panTo((px + room.clientWidth / 2) / scene.offsetWidth * 100, false);
    }
    return { fits, scroll: room.scrollLeft };
  })()`;
  const deadline = Date.now() + ms;
  let prev = null;
  for (;;) {
    const { fits, scroll } = await page.evaluate(probe);
    if (fits && scroll === prev) return;
    prev = fits ? scroll : null;
    if (Date.now() >= deadline) throw new Error(`centerOn: ${JSON.stringify(selectors)} never settled in view`);
    await page.evaluate('new Promise((ok) => requestAnimationFrame(() => ok(true)))');
  }
}

export async function waitSettled(page, selector, ms = 4000) {
  await page.waitFor(
    `(() => { const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
      return els.length > 0 && els.every((el) => el.getAnimations().every((a) => a.playState !== 'running')); })()`,
    ms,
  );
}

export async function waitPoopsSettled(page, ms = 4000) {
  await page.waitFor(
    `(() => { const imgs = [...document.querySelectorAll('.poop img')];
      return imgs.length > 0 && imgs.every((img) =>
        img.getAnimations().every((a) => a.animationName !== 'plop' || a.playState === 'finished')); })()`,
    ms,
  );
}

export async function skipOnboarding(page) {
  if (await isVisible(page, SEL.onboarding)) {
    await page.click(SEL.onboardingSkip);
    await waitHidden(page, SEL.onboarding);
  }
}

export async function openShop(page, tab = 'all') {
  await page.click(SEL.tabShop);
  await waitVisible(page, `${SEL.sheetBody}`);
  if (tab === 'all') return;
  await page.click(`${SEL.sheetBody} ${SEL.act('tab', tab)}`);
  await page.waitFor(`!!document.querySelector(${JSON.stringify(`${SEL.sheetBody} ${SEL.act('tab', tab)}.on`)})`);
}

export async function closeShop(page) {
  await page.click(SEL.sheetClose);
  await waitHidden(page, SEL.sheet);
}

export async function reloadRoom(page, url) {
  await page.evaluate('window.social && window.social.flushNow ? window.social.flushNow() : null');
  await page.goto(url);
  await page.waitFor(GAME_READY);
}

export function poopTotal(page) {
  return page.evaluate('window.__game.state.boxes.reduce((n, b) => n + b.poops.length, 0)');
}

export function boxPoops(page, i) {
  return page.evaluate(`window.__game.state.boxes[${i}].poops.length`);
}

export function boxLevel(page, i) {
  return page.evaluate(`window.__game.state.boxes[${i}].level`);
}

