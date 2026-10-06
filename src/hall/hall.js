// 길드 홀: 걸어 다니는 허브 + 시설 액션(방장 권위) + 원정 설정 + 런 정산
G.Hall = (function () {
  const H = {};
  const C = G.C, U = G.U, S = G.Sim, W = G.World, M = G.META;

  H.create = function (o) {
    const map = W.genHall();
    const sim = S.create({ map, region: 1, mode: 'hall', nPlayers: 3, seed: 7 });
    const hall = { sim, map, phase: 'hall', setup: null, events: [], guild: o.guild, time: 0 };
    let i = 0; for (const p of o.players) if (p) { p.ghost = false; p.dead = false; p.down = null; p.hp = p.maxHp; S.enterMap(sim, p, i++); }
    return hall;
  };
  H.addPlayer = function (hall, p) { p.ghost = false; p.dead = false; p.down = null; p.hp = p.maxHp; S.enterMap(hall.sim, p, hall.sim.players.filter(Boolean).length); };
  H.update = function (hall, inputs, dt) {
    hall.time += dt;
    S.update(hall.sim, inputs, dt);
    for (const ev of S.drain(hall.sim)) if (ev.t === 'station') hall.events.push(ev);
    if (hall.setup) { for (const p of hall.sim.players) if (p && hall.setup.ready[p.slot] === undefined) hall.setup.ready[p.slot] = false; }
  };
  H.view = function (hall) { const v = S.view(hall.sim); v.phase = 'hall'; v.setup = hall.setup; v.mode = 'hall'; return v; };

  // ───── 원정 설정 (술집)
  H.openSetup = function (hall, guild) {
    const wk = M.weekly();
    hall.setup = { depth: 1, curses: [], mode: 'normal', ready: {}, maxDepth: Math.min(C.DEPTH_MAX, (guild.hall.bestDepth || 0) + 1), modes: ['normal', 'weekly'].concat(guild.fac.tavern >= 3 ? ['rush'] : []).concat(guild.fac.tavern >= 4 && guild.hall.clears > 0 ? ['endless'] : []), weekly: { id: wk.id, name: wk.name, desc: wk.desc, done: !!guild.hall.weekly[G.U.weekKey()] }, regionLimit: 4 };
    for (const p of hall.sim.players) if (p) hall.setup.ready[p.slot] = false;
  };
  H.setupChange = function (hall, k, v) {
    const s = hall.setup; if (!s) return;
    if (k === 'depth') s.depth = U.clamp(v, 1, s.maxDepth);
    else if (k === 'curse') { const i = s.curses.indexOf(v); if (i >= 0) s.curses.splice(i, 1); else if (s.curses.length < 5) s.curses.push(v); }
    else if (k === 'mode') { if (s.modes.includes(v)) s.mode = v; if (v === 'weekly') { const wk = M.weekly(); s.curses = wk.curses.slice(); s.regionLimit = wk.region; } else s.regionLimit = 4; }
    else if (k === 'cancel') { hall.setup = null; return; }
    for (const k2 in s.ready) s.ready[k2] = false;
  };
  H.setupReady = function (hall, slot, v) { if (hall.setup) hall.setup.ready[slot] = v; };
  H.setupAllReady = hall => hall.setup && hall.sim.players.filter(Boolean).every(p => hall.setup.ready[p.slot]);

  // ───── 길드 액션 (방장이 실행). 반환 { ok, msg, give? }
  H.action = function (guild, slot, p, name, args) {
    const A = G.Acct;
    if (name === 'facUp') {
      const id = args[0], lv = guild.fac[id] || 1; if (lv >= 4) return { ok: false, msg: '최대 레벨' };
      const cost = C.FACILITY_COST[lv]; if (guild.ash < cost) return { ok: false, msg: `잿조각 부족 (${cost})` };
      guild.ash -= cost; guild.fac[id] = lv + 1; A.bump(guild);
      if (id === 'grave' && guild.fac.grave >= 2 && !guild.unlocked.includes('necro')) { guild.unlocked.push('necro'); return { ok: true, msg: `${M.FACILITIES[id].name} Lv${lv + 1} · 강령술사 해금!`, toastAll: true }; }
      return { ok: true, msg: `${M.FACILITIES[id].name} Lv${lv + 1}`, toastAll: true };
    }
    if (name === 'craft') {
      const rar = args[0], slotK = args[1], cls = args[2];
      const maxR = guild.fac.forge >= 3 ? 3 : guild.fac.forge >= 2 ? 2 : 1; if (rar > maxR) return { ok: false, msg: '대장간 레벨 부족' };
      const cost = C.CRAFT_COST[rar]; if (guild.soul < cost) return { ok: false, msg: `혼석 부족 (${cost})` };
      if (guild.storage.length >= M.STORAGE_CAP[guild.fac.storage - 1]) return { ok: false, msg: '창고 가득' };
      guild.soul -= cost; const it = G.Items.gen(U.rng, { rarity: rar, slot: slotK, cls, tier: 2 }); guild.storage.push(it); A.bump(guild);
      return { ok: true, msg: `제작: ${G.Items.label(it)}` };
    }
    if (name === 'upgrade') {
      const it = guild.storage.find(x => x.id === args[0]); if (!it) return { ok: false, msg: '없음' };
      const max = guild.fac.forge >= 3 ? 5 : guild.fac.forge >= 2 ? 4 : 2; if ((it.up || 0) >= max) return { ok: false, msg: '강화 한계 (대장간 레벨)' };
      let cost = C.UPGRADE_COST[it.up || 0] + it.rar; if (guild.fac.forge >= 4) cost = Math.ceil(cost * 0.7);
      if (guild.soul < cost) return { ok: false, msg: `혼석 부족 (${cost})` };
      guild.soul -= cost; it.up = (it.up || 0) + 1; A.bump(guild); return { ok: true, msg: `${it.name} +${it.up}` };
    }
    if (name === 'dismantle') {
      const i = guild.storage.findIndex(x => x.id === args[0]); if (i < 0) return { ok: false, msg: '없음' };
      const it = guild.storage[i]; if (it.lock && it.lock !== p.name) return { ok: false, msg: `${it.lock}의 잠금` };
      guild.storage.splice(i, 1); const v = G.Items.sellValue(it); guild.soul += v; A.bump(guild); return { ok: true, msg: `분해: 혼석 +${v}` };
    }
    if (name === 'lock') { const it = guild.storage.find(x => x.id === args[0]); if (!it) return { ok: false }; it.lock = it.lock === p.name ? '' : (it.lock ? it.lock : p.name); A.bump(guild); return { ok: true, msg: it.lock ? '잠금' : '잠금 해제' }; }
    if (name === 'take') {
      const i = guild.storage.findIndex(x => x.id === args[0]); if (i < 0) return { ok: false, msg: '없음' };
      const it = guild.storage[i]; if (it.lock && it.lock !== p.name) return { ok: false, msg: `${it.lock}의 잠금` };
      if (!G.Items.canUse(it, p.cls)) return { ok: false, msg: '이 직업은 못 씀' };
      guild.storage.splice(i, 1); A.bump(guild); return { ok: true, msg: `장착: ${G.Items.label(it)}`, give: it };
    }
    if (name === 'put') {
      const it = args[0]; if (!it || !it.id) return { ok: false };
      if (guild.storage.length >= M.STORAGE_CAP[guild.fac.storage - 1]) return { ok: false, msg: '창고 가득' };
      guild.storage.push(it); A.bump(guild); return { ok: true, msg: `보관: ${G.Items.label(it)}` };
    }
    if (name === 'banner') { guild.name = String(args[0] || guild.name).slice(0, 12); guild.color = args[1] | 0; A.bump(guild); return { ok: true, msg: '깃발 변경', toastAll: true }; }
    if (name === 'resetTalents') { return { ok: true }; }
    return { ok: false, msg: '?' };
  };

  // ───── 런 정산 → 길드 변경 + 슬롯별 계정 델타
  H.settle = function (guild, run, res, party, codexEvents) {
    const A = G.Acct, deltas = {};
    guild.ash += res.ash; guild.soul += res.soul;
    guild.hall.runs++; if (res.wiped) guild.hall.wipes++; if (res.cleared) guild.hall.clears++;
    if (res.cleared && run.mode !== 'rush' && run.regionIdx >= 3 && run.depth > (guild.hall.bestDepth || 0)) guild.hall.bestDepth = run.depth;
    if (run.mode === 'rush' && res.cleared) guild.hall.bestRush = Math.max(guild.hall.bestRush || 0, 1);
    if (run.mode === 'endless') guild.hall.bestEndless = Math.max(guild.hall.bestEndless || 0, run.endlessLoop + 1);
    if (run.mode === 'weekly' && res.cleared) guild.hall.weekly[G.U.weekKey()] = { score: res.kills * 10 + res.nodes * 50, date: U.today() };
    for (const b of run.bossesKilled) guild.hall.bossKills[b] = (guild.hall.bossKills[b] || 0) + 1;
    for (const ev of codexEvents) { if (!guild.codex[ev.kind]) guild.codex[ev.kind] = {}; guild.codex[ev.kind][ev.id] = (guild.codex[ev.kind][ev.id] || 0) + 1; }
    const members = party.filter(Boolean).map(p => p.name);
    for (const n of members) if (!guild.members.includes(n)) guild.members.push(n);
    const mvpName = res.mvp >= 0 && party[res.mvp] ? party[res.mvp].name : '';
    guild.hall.records.unshift({ date: U.today(), result: res.wiped ? '전멸' : res.cleared ? (run.returned ? '귀환' : '클리어') : '중단', region: res.region, depth: res.depth, time: Math.round(res.time), members, mvp: mvpName, mode: run.mode, kills: res.kills });
    if (guild.hall.records.length > 40) guild.hall.records.length = 40;
    if (res.wiped) {
      const blameName = res.blame != null && party[res.blame] ? party[res.blame].name : '';
      guild.graveyard.unshift({ date: U.today(), region: G.REGIONS[Math.min(3, run.regionIdx)].name, depth: run.depth, blame: blameName, cause: run.lastDownBy || '', lastWords: Object.fromEntries(Object.entries(run.lastWords || {}).map(([s, w]) => [party[s] ? party[s].name : s, w])), members });
      if (guild.graveyard.length > 30) guild.graveyard.length = 30;
      guild.lastBlame = blameName;
    }
    // 창고로: 전원 패스 장비 + 각자 가방
    const cap = M.STORAGE_CAP[guild.fac.storage - 1];
    for (const it of (run.bag || [])) if (guild.storage.length < cap) guild.storage.push(it);
    for (const p of party) if (p) for (const it of (p.bag || [])) if (guild.storage.length < cap) guild.storage.push(it);
    // 업적 · 해금
    const newAch = G.Results.achievements(guild, run, res, party);
    if (newAch.some(a => a.id === 'duoBoss2') && !guild.unlocked.includes('paladin')) guild.unlocked.push('paladin');
    if (newAch.some(a => a.id === 'rush') && !guild.unlocked.includes('gunner')) guild.unlocked.push('gunner');
    if (newAch.some(a => a.id === 'depth5') && !guild.unlocked.includes('druid')) guild.unlocked.push('druid');
    A.bump(guild);
    for (const p of party) {
      if (!p) continue;
      deltas[p.slot] = { cls: p.cls, xp: res.xp, equipped: p.equipped || null, stats: p.stats, titles: newAch.map(a => a.title), mvp: res.mvp === p.slot, blame: res.blame === p.slot, awards: res.awards.filter(a => a.slot === p.slot).map(a => a.id), playTime: Math.round(res.time), depth: res.cleared ? res.depth : 0 };
    }
    return { deltas, newAch };
  };
  // 계정에 델타 적용 (각자 기기)
  H.applyDelta = function (acct, d) {
    const A = G.Acct; const ch = A.charOf(acct, d.cls);
    ch.runs++; ch.xp += d.xp;
    while (ch.lv < C.CLASS_LV_MAX && ch.xp >= C.CLASS_XP_LV(ch.lv)) { ch.xp -= C.CLASS_XP_LV(ch.lv); ch.lv++; }
    if (d.equipped) ch.equip = { w: d.equipped.w || null, a: d.equipped.a || null, t: d.equipped.t || null };
    const s = acct.stats, r = d.stats;
    s.runs++; s.kills += r.kills; s.downs += r.downs; s.deaths += r.deaths; s.revives += r.revives; s.dmg += r.dmg; s.heal += r.heal; s.tank += r.tank; s.gold += r.goldPicked; s.playTime += d.playTime || 0;
    if (d.mvp) s.mvp++; if (d.blame) s.blame++;
    for (const a of d.awards) s.awards[a] = (s.awards[a] || 0) + 1;
    if (d.depth > s.bestDepth) s.bestDepth = d.depth;
    for (const t of d.titles) if (t && !acct.titles.includes(t)) acct.titles.push(t);
    acct.penalty = d.blame ? true : (d.mvp ? false : acct.penalty && false);
    if (d.blame) acct.penalty = true; else acct.penalty = false;
    A.saveMe();
  };
  // 계정 → 런용 meta
  H.metaOf = function (acct, cls) {
    const ch = G.Acct.charOf(acct, cls);
    const mods = {}; for (const k of ['w', 'a', 't']) { const it = ch.equip[k]; if (!it) continue; const m = G.Items.effMods(it); for (const key in m) mods[key] = (mods[key] || 0) + m[key]; }
    return { lv: ch.lv, talents: ch.talents.slice(), mods, equip: ch.equip, title: acct.title || '' };
  };
  H.talentPoints = (acct, cls, guild) => { const ch = G.Acct.charOf(acct, cls); return (ch.lv - 1) + (guild && guild.fac.training >= 3 ? 2 : 0) - ch.talents.length; };
  H.canTalent = (acct, cls, guild, b, i) => {
    const ch = G.Acct.charOf(acct, cls);
    if (b >= (guild && guild.fac.training >= 2 ? 3 : 2)) return false;
    if (ch.talents.includes(`${b}.${i}`)) return false;
    if (i > 0 && !ch.talents.includes(`${b}.${i - 1}`)) return false;
    return H.talentPoints(acct, cls, guild) > 0;
  };
  return H;
})();
