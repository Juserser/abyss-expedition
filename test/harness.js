// Headless 테스트: 가짜 DOM/canvas 로 전체 스크립트를 로드하고 봇 3명으로 런을 자동 플레이
// 사용: node test/harness.js [runs=3] [seed]
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const NRUNS = +(process.argv[2] || 3), SEED0 = +(process.argv[3] || 12345);

// ───── 가짜 브라우저
const noop = () => {};
const ctxStub = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 10 }) : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : noop)), set: (t, k, v) => { t[k] = v; return true; } });
function el(tag) {
  const e = { tagName: (tag || 'div').toUpperCase(), style: {}, dataset: {}, children: [], classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, value: '', innerHTML: '', textContent: '', disabled: false, width: 0, height: 0,
    addEventListener: noop, removeEventListener: noop, appendChild(c) { this.children.push(c); return c; }, remove: noop, querySelector: () => null, querySelectorAll: () => [], focus: noop, blur: noop, click: noop, closest: () => null, getContext: () => ctxStub, setAttribute: noop, getAttribute: () => null, scrollTop: 0, scrollHeight: 0, get firstChild() { return this.children[0]; } };
  return e;
}
const store = {};
const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }, get length() { return Object.keys(store).length; }, key: i => Object.keys(store)[i] };
Object.defineProperty(localStorage, 'keys', { value: () => Object.keys(store) });
const window = { addEventListener: noop, removeEventListener: noop, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, requestAnimationFrame: noop, AudioContext: null, location: { search: '', href: 'http://x/' } };
const document = { getElementById: id => elCache[id] || (elCache[id] = el('div')), createElement: el, addEventListener: noop, body: el('body'), activeElement: null, hidden: false };
const elCache = {};
const ctx = { window, document, localStorage, navigator: { getGamepads: () => [] }, performance: { now: () => Date.now() }, requestAnimationFrame: noop, setInterval: () => 0, clearInterval: noop, setTimeout: (f, t) => 0, clearTimeout: noop, console, location: window.location, Peer: function () { return { on: noop, connect: () => ({ on: noop }), destroy: noop }; }, btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary'), escape: s => s, unescape: s => s, URL: { createObjectURL: () => '', revokeObjectURL: noop }, Blob: function () {}, Uint8Array, Uint8ClampedArray, Map, Set, Math, JSON, Object, Array, Number, String, Date, Error, Promise, Proxy, Reflect, Symbol, Infinity, NaN, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent };
Object.assign(ctx, window); ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
vm.createContext(ctx);
// Object.keys(localStorage) 지원
ctx.Object = Object;
Object.keys = (orig => o => (o === localStorage ? Object.getOwnPropertyNames(store) : orig(o)))(Object.keys);

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]).filter(s => !s.includes('peerjs'));
for (const s of scripts) { const code = fs.readFileSync(path.join(ROOT, s), 'utf8'); try { vm.runInContext(code, ctx, { filename: s }); } catch (e) { console.error('LOAD FAIL', s, e.message); process.exit(1); } }
const G = ctx.window.G;
G.settings = { shake: 1, dmgNum: true };
G.fx = (name, ...a) => { if (name === 'hitstop') { const s = curSim(); if (s) s.hitstop = Math.max(s.hitstop || 0, a[0]); } };
let errors = [];
const log = (...a) => console.log(...a);

function curSim() { return RUN && RUN.sim; }
let RUN = null;
const CLASSES = G.CLASS_ORDER;

function makeParty(rng, n) {
  const party = [];
  for (let i = 0; i < n; i++) { const cls = rng.pick(CLASSES); const p = G.Sim.makePlayer({ slot: i, cls, name: '봇' + i, meta: { lv: 1 + rng.int(0, 10), talents: [], mods: {} }, guild: {}, gold: 50, potions: 1 }); party.push(p); }
  return party;
}
// 봇 입력 (main.js 의 App.botInput 재사용)
function botFor(run, slot, dt) { G.App.scene = { type: 'run', run }; return G.App.botInput(slot, dt); }

function checkNaN(run, where) {
  const sim = run.sim; if (!sim) return;
  for (const e of sim.ents) { if (!isFinite(e.x) || !isFinite(e.y) || (e.hp != null && !isFinite(e.hp))) { errors.push(`NaN ${e.kind} ${e.type || e.cls} at ${where}`); e.x = e.x || 0; e.y = e.y || 0; e.hp = e.hp || 1; } }
}

function playRun(seed, nP, depth, opts) {
  const rng = G.U.RNG(seed);
  const party = makeParty(rng, nP);
  const run = G.Run.create({ seed, depth, curses: opts.curses || [], mode: opts.mode || 'normal', regionLimit: 4, party, guildBuffs: {}, codexSeen: {} });
  RUN = run;
  const dt = 1 / 60; let t = 0, maxT = 60 * 40, phases = {}, maxView = 0, transitions = 0, lastPhase = '';
  const stats = { kills: 0, downs: 0, reacts: 0, nodes: 0 };
  while (!run.finished && t < maxT) {
    const inputs = {}; for (const p of run.party) if (p) inputs[p.slot] = botFor(run, p.slot, dt);
    try { G.Run.update(run, inputs, dt); } catch (e) { errors.push(`update ${run.phase} ${run.nodeType}: ${e.stack.split('\n').slice(0, 3).join(' | ')}`); break; }
    t += dt;
    if (run.phase !== lastPhase) { transitions++; lastPhase = run.phase; }
    phases[run.phase] = (phases[run.phase] || 0) + dt;
    // 봇의 메뉴 행동
    if (Math.round(t * 60) % 30 === 0) {
      for (const p of run.party) {
        if (!p) continue;
        if (run.vote && run.vote.votes[p.slot] === undefined && rng.chance(0.6)) G.Run.rpc(run, p.slot, 'vote', [rng.int(0, run.vote.opts.length - 1)]);
        if (run.pick && run.pick.picked[p.slot] === undefined) { const o = run.pick.offers[p.slot]; G.Run.rpc(run, p.slot, 'pick', [o && o.length ? rng.pick(o).id : null]); }
        if (run.shop && !run.shop.done[p.slot]) { const it = rng.pick(run.shop.items.filter(x => !x.sold)); if (it && rng.chance(0.5)) G.Run.rpc(run, p.slot, 'buy', [it.i]); else G.Run.rpc(run, p.slot, 'shopDone', []); }
        if (run.roll && !run.roll.choices[p.slot]) G.Run.rpc(run, p.slot, 'roll', [rng.pick(['need', 'greed', 'pass'])]);
      }
      // 보스 인트로 스킵 가속
      if (run.ov && run.ov.type === 'bossIntro') run.ovT = 0;
    }
    if (Math.round(t * 60) % 60 === 0) {
      checkNaN(run, `t=${t.toFixed(0)} ${run.phase}`);
      try { const v = G.Run.view(run); const s = JSON.stringify(v).length; if (s > maxView) maxView = s; } catch (e) { errors.push('view: ' + e.message); }
      try { G.Run.snapshot(run); } catch (e) { errors.push('snapshot: ' + e.message); }
    }
    // 전투가 너무 오래 걸리면 (봇이 못 깸) 적 제거
    if (run.phase === 'combat' && run.sim && run.sim.time > 150 && !run.sim.cleared) { for (const e of run.sim.ents) if (e.kind === 'e' && !e.dead) G.Sim.kill(run.sim, e, {}); }
  }
  const res = run.results;
  const ps = run.party.filter(Boolean);
  return { seed, nP, depth, finished: run.finished, time: Math.round(t), phases: Object.fromEntries(Object.entries(phases).map(([k, v]) => [k, Math.round(v)])), transitions, maxView, nodes: run.nodesDone, region: run.regionIdx + 1, wiped: run.wiped, cleared: run.cleared, classes: ps.map(p => p.cls).join(','), kills: ps.reduce((a, p) => a + p.stats.kills, 0), downs: ps.reduce((a, p) => a + p.stats.downs, 0), reacts: ps.reduce((a, p) => a + p.stats.reacts, 0), bosses: run.bossesKilled.join(','), awards: res ? res.awards.map(a => a.name).join(',') : '', relics: ps.map(p => p.relics.length).join('/'), cards: ps.map(p => p.cards.length).join('/') };
}

function testHall() {
  const g = G.Acct.freshGuild('테스트', 'TESTCODE');
  g.ash = 500; g.soul = 50;
  const players = [G.Sim.makePlayer({ slot: 0, cls: 'knight', name: 'A', meta: { lv: 3, talents: ['0.0'], mods: {} } }), G.Sim.makePlayer({ slot: 1, cls: 'mage', name: 'B', meta: { lv: 1, talents: [], mods: {} } })];
  const hall = G.Hall.create({ guild: g, players });
  for (let i = 0; i < 600; i++) { const inputs = { 0: { x: Math.sin(i / 30), y: Math.cos(i / 40), a: 0, b: i % 50 === 0 ? 1 : 0, n: [0, 0, 0, 0, 0, i % 100 === 0 ? 1 : 0, 0, 0, 0] }, 1: { x: 0.5, y: 0, a: 1, b: 1, n: [0, 0, 0, 0, 0, 0, 0, 0, 0] } }; G.Hall.update(hall, inputs, 1 / 60); }
  G.Hall.view(hall);
  const r = [];
  r.push(G.Hall.action(g, 0, players[0], 'facUp', ['forge']).msg);
  r.push(G.Hall.action(g, 0, players[0], 'craft', [1, 'w', 'knight']).msg);
  const it = g.storage[0]; r.push(G.Hall.action(g, 0, players[0], 'upgrade', [it.id]).msg);
  r.push(G.Hall.action(g, 0, players[0], 'lock', [it.id]).msg);
  r.push(G.Hall.action(g, 1, players[1], 'take', [it.id]).msg);
  r.push(G.Hall.action(g, 0, players[0], 'take', [it.id]).msg);
  r.push(G.Hall.action(g, 0, players[0], 'banner', ['새이름', 2]).msg);
  G.Hall.openSetup(hall, g); G.Hall.setupChange(hall, 'depth', 3); G.Hall.setupChange(hall, 'curse', 'timer'); G.Hall.setupChange(hall, 'mode', 'weekly');
  return r.join(' | ') + ` | storage=${g.storage.length} ash=${g.ash} soul=${g.soul} setup=${JSON.stringify({ d: hall.setup.depth, c: hall.setup.curses, m: hall.setup.mode })}`;
}
function testSettle() {
  const g = G.Acct.freshGuild('정산', 'SETTLE01');
  const r = playRun(777, 3, 2, {});
  const run = RUN; const res = run.results || G.Results.compute(run, run.party);
  const out = G.Hall.settle(g, run, res, run.party, []);
  const acct = G.Acct.freshAcct('X'); G.Hall.applyDelta(acct, out.deltas[0]);
  return `ash=${g.ash} soul=${g.soul} records=${g.hall.records.length} grave=${g.graveyard.length} ach=${g.ach.join(',')} xp→lv${G.Acct.charOf(acct, out.deltas[0].cls).lv} titles=${acct.titles.join(',')}`;
}
function testAcct() {
  const a = G.Acct.login('테스터', '123456'); const b = G.Acct.login('테스터', '000000');
  const bk = G.Acct.exportBackup(); let ok = false; try { G.Acct.importBackup(bk, '테스터', '123456'); ok = true; } catch (e) { ok = e.message; }
  return `login=${JSON.stringify(a)} wrongCode=${JSON.stringify(b)} backup=${bk.length}chars restore=${ok}`;
}

log('=== 심연 원정대 headless ===');
log('계정:', testAcct());
log('길드 홀:', testHall());
const results = [];
for (let i = 0; i < NRUNS; i++) {
  const nP = 1 + (i % 3), depth = 1 + (i % 4);
  const r = playRun(SEED0 + i * 7919, nP, depth, { curses: i % 2 ? ['timer', 'eliteMore'] : [], mode: i % 5 === 4 ? 'rush' : 'normal' });
  results.push(r);
  log(`런 ${i + 1}: ${nP}인 [${r.classes}] 심연${depth} → ${r.wiped ? '전멸' : r.cleared ? '클리어/귀환' : '미완'} 지역${r.region} 노드${r.nodes} 보스[${r.bosses}] 처치${r.kills} 다운${r.downs} 반응${r.reacts} 유물${r.relics} 카드${r.cards} ${r.time}s view≤${(r.maxView / 1024).toFixed(1)}KB 상[${r.awards}]`);
}
log('정산:', testSettle());
log('페이즈 시간 합:', JSON.stringify(results.reduce((acc, r) => { for (const k in r.phases) acc[k] = (acc[k] || 0) + r.phases[k]; return acc; }, {})));
if (errors.length) { log(`\n❌ 오류 ${errors.length}건`); for (const e of errors.slice(0, 25)) log(' -', e); process.exit(1); }
else log('\n✅ 오류 0, NaN 0');
