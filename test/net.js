// 통합 테스트: 방장 + 참가자 2명을 각각 별도 VM 컨텍스트로 띄우고 가짜 네트워크로 연결해 로비→길드 홀→원정→결과→홀 전체 흐름을 돌린다
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const noop = () => {};
const errors = [];

function makeCtx(name) {
  const ctxStub = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 10 }) : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : noop)), set: (t, k, v) => { t[k] = v; return true; } });
  function el(tag) {
    const e = { tagName: (tag || 'div').toUpperCase(), style: {}, dataset: {}, children: [], classList: { add: noop, remove: noop, toggle: noop, contains: () => true }, value: '', innerHTML: '', textContent: '', disabled: false, width: 0, height: 0, title: '',
      addEventListener: noop, removeEventListener: noop, appendChild(c) { this.children.push(c); return c; }, remove: noop, querySelector: () => null, querySelectorAll: () => [], focus: noop, blur: noop, click: noop, closest: () => null, getContext: () => ctxStub, setAttribute: noop, scrollTop: 0, scrollHeight: 0, get firstChild() { return this.children[0]; } };
    return e;
  }
  const store = {}, elCache = {};
  const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  const ctx = { addEventListener: noop, removeEventListener: noop, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, AudioContext: null, location: { search: '', href: 'http://x/' },
    document: { getElementById: id => elCache[id] || (elCache[id] = el('div')), createElement: el, addEventListener: noop, body: el('body'), activeElement: null, hidden: false },
    localStorage, navigator: { getGamepads: () => [], clipboard: null }, performance: { now: () => NOW }, setInterval: () => 0, clearInterval: noop, setTimeout: (f) => 0, clearTimeout: noop, console,
    Peer: function () { return { on: noop, connect: () => ({ on: noop }), destroy: noop }; }, btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary'), escape: s => s, unescape: s => s, URL: { createObjectURL: () => '', revokeObjectURL: noop }, Blob: function () {},
    Uint8Array, Uint8ClampedArray, Map, Set, Math, JSON, Object, Array, Number, String, Date, Error, Promise, Proxy, Reflect, Symbol, Infinity, NaN, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent };
  ctx.requestAnimationFrame = f => { ctx.__frame = f; };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext('Object.keys = (o => { const k = Object.keys; return x => (x === localStorage ? [] : k(x)); })();', ctx);
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]).filter(s => !s.includes('peerjs'));
  for (const s of scripts) vm.runInContext(fs.readFileSync(path.join(ROOT, s), 'utf8'), ctx, { filename: name + ':' + s });
  ctx.__name = name; ctx.__el = id => ctx.document.getElementById(id);
  return ctx;
}
let NOW = 1000;
const host = makeCtx('host'), guests = [makeCtx('g1'), makeCtx('g2')];
const all = [host, ...guests];
// ───── 가짜 네트워크
const clone = m => JSON.parse(JSON.stringify(m));
const stats = { hostBytes: 0, msgs: 0, maxSnap: 0 };
function wire(ctx, isHost) {
  const G = ctx.window.G, N = G.Net, cb = {};
  N.on = (ev, fn) => { cb[ev] = fn; }; N.emit = (ev, ...a) => cb[ev] && cb[ev](...a);
  N.role = null; N.code = 'TEST'; N.conns = []; N.locked = false; N.pingOf = () => 12; N.buffered = () => 0; N.close = noop; N.kick = noop; N.count = () => N.conns.length;
  if (isHost) {
    N.host = () => { N.role = 'host'; N.emit('code', 'TEST'); };
    N.open = () => N.conns.length > 0;
    N.send = (id, m) => { const g = guests[id - 1]; if (g) deliverToGuest(g, m); };
    N.broadcast = m => { const s = JSON.stringify(m); stats.hostBytes += s.length; if (m.t === 's') stats.maxSnap = Math.max(stats.maxSnap, s.length); guests.forEach((g, i) => { if (N.conns.some(c => c.id === i + 1)) deliverToGuest(g, m); }); };
    N.accept = (id) => { N.conns.push({ id, open: true, ping: 10 }); N.emit('connect', id); };
  } else {
    N.join = () => { N.role = 'guest'; N.conns = [{ id: 0, open: true }]; const id = guests.indexOf(ctx) + 1; host.window.G.Net.accept(id); N.emit('connect', 0); };
    N.open = () => true;
    N.toHost = m => { const id = guests.indexOf(ctx) + 1; stats.msgs++; try { host.window.G.Net.emit('data', id, clone(m)); } catch (e) { errors.push('host recv ' + m.t + ': ' + e.stack.split('\n').slice(0, 2).join(' ')); } };
  }
}
function deliverToGuest(g, m) { try { g.window.G.Net.emit('data', 0, clone(m)); } catch (e) { errors.push(g.__name + ' recv ' + m.t + ': ' + e.stack.split('\n').slice(0, 2).join(' ')); } }
wire(host, true); guests.forEach(g => wire(g, false));
for (const c of all) { c.window.G.settings = c.window.G.settings || {}; }

// ───── 흐름
const $h = host.__el;
function init(ctx, name) { const G = ctx.window.G; G.App.init(); ctx.__el('acct-name').value = name; ctx.__el('acct-code').value = '123456'; ctx.__el('btn-login').onclick(); }
init(host, '방장'); guests.forEach((g, i) => init(g, '친구' + (i + 1)));
$h('btn-host').onclick();
for (const g of guests) { g.__el('btn-join').onclick(); g.__el('join-code').value = 'TEST'; g.__el('btn-join-go').onclick(); }
const HG = host.window.G;
console.log('로비 로스터:', HG.App.roster.map(r => `${r.slot}:${r.name}(${r.cls})`).join(' '));
// 참가자 직업 선택 + 준비
guests[0].window.G.Net.toHost({ t: 'cls', c: 'priest' }); guests[1].window.G.Net.toHost({ t: 'cls', c: 'mage' });
guests.forEach(g => g.window.G.Net.toHost({ t: 'ready', v: true }));
$h('btn-ready').onclick();   // 출발 → 길드 홀
console.log('장면:', HG.App.scene.type, '참가자 모드:', guests.map(g => g.window.G.App.mode).join(','));

// 입력: 참가자는 랜덤 걷기 + 공격, 방장은 봇 로직
function guestInput(g, t) { const G = g.window.G; G.In.packet = () => ({ x: Math.sin(t / 2 + guests.indexOf(g)), y: Math.cos(t / 3), a: t, b: 1 | (Math.floor(t) % 7 === 0 ? 32 : 0), n: [0, Math.floor(t / 4), Math.floor(t / 6), Math.floor(t / 20), Math.floor(t / 5), Math.floor(t / 3), 0, 0, 0] }); }
HG.In.packet = () => { const sc = HG.App.scene; if (sc && sc.type === 'run') return HG.App.botInput(0, 1 / 60); return { x: 0.3, y: 0, a: 0, b: 0, n: [0, 0, 0, 0, 0, 0, 0, 0, 0] }; };

function step(seconds) {
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i++) {
    NOW += 1000 / 60; const t = NOW / 1000;
    guests.forEach(g => guestInput(g, t));
    for (const c of all) { try { c.__frame && c.__frame(NOW); } catch (e) { errors.push(c.__name + ' frame: ' + e.stack.split('\n').slice(0, 3).join(' | ')); if (errors.length > 20) throw new Error('too many'); } }
  }
}
step(2);
console.log('홀 스냅샷 크기(최대):', stats.maxSnap, 'B · 참가자 뷰 모드:', guests[0].window.G.App.view && guests[0].window.G.App.view.mode);
// 길드 홀 메뉴 전부 열어보기 (방장 + 참가자)
for (const id of ['tavern', 'forge', 'storage', 'training', 'hall', 'grave', 'library', 'banner']) { for (const c of all) { c.window.G.OV.open(id); } step(0.1); }
// 시설/제작 액션 (참가자 → 방장)
HG.App.guild.ash = 300; HG.App.guild.soul = 30;
guests[0].window.G.App.hallRpc('facUp', ['forge']); guests[0].window.G.App.hallRpc('craft', [1, 'w', 'priest']);
step(0.2);
const it = HG.App.guild.storage[0]; if (it) { guests[0].window.G.App.hallRpc('take', [it.id]); step(0.2); }
console.log('창고:', HG.App.guild.storage.length, '참가자1 장비:', JSON.stringify(Object.keys(guests[0].window.G.Acct.charOf(guests[0].window.G.Acct.me, 'priest').equip).filter(k => guests[0].window.G.Acct.charOf(guests[0].window.G.Acct.me, 'priest').equip[k])));
// 특성 찍기 (참가자2)
{ const g = guests[1].window.G; const a = g.Acct.charOf(g.Acct.me, 'mage'); a.lv = 4; g.UI.onAct('talent', '0.0'); g.UI.onAct('talent', '0.1'); step(0.1); console.log('참가자2 특성:', a.talents.join(','), '→ 방장 meta:', JSON.stringify((HG.App.roster[2].metaByCls.mage || {}).talents)); }
for (const c of all) c.window.G.OV.close();
// 술집 → 원정 설정 → 출발
HG.UI.onAct('openSetup'); step(0.2);
HG.UI.onAct('setupDepth', '1'); HG.UI.onAct('setupCurse', 'eliteMore'); step(0.1);
for (const g of guests) g.window.G.UI.onAct('setupReady'); HG.UI.onAct('setupReady');
step(0.2);
console.log('설정 준비:', JSON.stringify(HG.App.scene.hall.setup.ready));
HG.UI.onAct('setupStart');
console.log('장면:', HG.App.scene.type, '페이즈:', HG.App.scene.run.phase);
// 런 진행: 투표/선택은 각자 UI 액션으로
let T = 0, last = '';
while (HG.App.scene.type === 'run' && !HG.App.scene.run.finished && T < 60 * 25) {
  step(0.5); T += 0.5;
  const run = HG.App.scene.run;
  if (run.phase !== last) { last = run.phase; }
  for (const c of all) {
    const G = c.window.G, v = G.App.view; if (!v) continue;
    const slot = G.App.mySlot;
    if (v.ov && v.ov.type === 'vote' && v.ov.votes[slot] === undefined) G.UI.onAct('vote', String(Math.floor(Math.random() * v.ov.opts.length)));
    if (v.ov && v.ov.type === 'pick' && v.ov.picked[slot] === undefined) { const o = v.ov.offers[slot]; G.UI.onAct('pick', o && o.length ? o[0].id : null); }
    if (v.ov && v.ov.type === 'shop' && !v.ov.done[slot]) { if (Math.random() < 0.5) G.UI.onAct('buy', String(Math.floor(Math.random() * v.ov.items.length))); else G.UI.onAct('shopDone'); }
    if (v.roll && !v.roll.choices[slot]) G.UI.onAct('roll', ['need', 'greed', 'pass'][Math.floor(Math.random() * 3)]);
  }
  if (run.sim && run.sim.time > 120 && !run.sim.cleared) for (const e of run.sim.ents) if (e.kind === 'e' && !e.dead) HG.Sim.kill(run.sim, e, {});
  if (run.ov && run.ov.type === 'bossIntro') run.ovT = 0;
}
const run = HG.App.scene.run;
console.log(`런 종료: ${run.wiped ? '전멸' : run.cleared ? '클리어/귀환' : '미완'} 지역${run.regionIdx + 1} 노드${run.nodesDone} 보스[${run.bossesKilled}] ${Math.round(T)}s`);
step(1);
console.log('결과 오버레이 참가자 수신:', guests.map(g => (g.window.G.App.view.ov || {}).type).join(','));
guests.forEach(g => g.window.G.UI.onAct('lastWords'));
HG.UI.onAct('toHall'); step(1);
console.log('홀 복귀:', HG.App.scene.type, '참가자 뷰:', guests[0].window.G.App.view.mode, '| 길드 기록', HG.App.guild.hall.records.length, '묘지', HG.App.guild.graveyard.length, '| 참가자1 계정 runs', guests[0].window.G.Acct.me.stats.runs, '| 길드 ver 동기화', all.map(c => c.window.G.App.guild.ver).join('/'));
// 참가자 끊김 → 재접속
host.window.G.Net.emit('close', 1); step(0.5);
console.log('끊김 후 로스터:', HG.App.roster.map(r => `${r.name}${r.disconnected ? '(끊김)' : ''}`).join(' '));
host.window.G.Net.conns = host.window.G.Net.conns.filter(c => c.id !== 1); host.window.G.Net.accept(7, guests[0]); host.window.G.Net.emit('data', 7, { t: 'hello', name: '친구1', metaByCls: {}, guilds: [] }); step(0.5);
console.log('재접속 후:', HG.App.roster.map(r => `${r.name}${r.disconnected ? '(끊김)' : ''}`).join(' '), '| 홀 플레이어', HG.App.scene.hall.sim.players.filter(Boolean).length);
console.log(`네트: 방장 송신 ${(stats.hostBytes / 1024).toFixed(0)}KB, 최대 스냅샷 ${stats.maxSnap}B, 참가자→방장 메시지 ${stats.msgs}`);
if (errors.length) { console.log(`\n❌ 오류 ${errors.length}건`); for (const e of errors.slice(0, 20)) console.log(' -', e); process.exit(1); }
console.log('\n✅ 통합 테스트 오류 0');
