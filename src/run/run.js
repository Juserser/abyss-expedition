// 런 상태기계 (방장 권위): 노드 맵 → 전투/이벤트/상점/모닥불/보물/시련/보스 → 결과
G.Run = (function () {
  const R = {};
  const C = G.C, U = G.U, W = G.World, S = G.Sim, St = G.St, T = C.TILE;

  R.create = function (o) {
    const run = {
      seed: o.seed || U.seed(), depth: o.depth || 1, curses: o.curses || [], mode: o.mode || 'normal', regionLimit: o.regionLimit || 4,
      party: [null, null, null], phase: 'map', sim: null, time: 0, regionIdx: 0, nodeMap: null, curNode: -1, nodesDone: 0,
      earned: { ash: 0, soul: 0, xp: 0 }, confirmed: { ash: 0, soul: 0 }, bossesKilled: [], wiped: false, cleared: false, finished: false,
      ov: null, vote: null, flags: {}, rng: U.RNG((o.seed || 1) ^ 0x9e3779b9), events: [], joinQueue: [], guildBuffs: o.guildBuffs || {}, weekly: o.weekly || null, shopMult: 1, relicsTaken: new Set(), cardsTaken: {}, log: [], downOrder: [], bossWeak: 0, musicWanted: 'map', rushIdx: 0, endlessLoop: 0, codexSeen: o.codexSeen || {}, lastWords: {},
    };
    for (const p of o.party) if (p) { run.party[p.slot] = p; R.applyRunCurses(run, p); }
    if (run.mode === 'rush') { run.regionIdx = 0; }
    R.newRegion(run);
    return run;
  };
  R.applyRunCurses = function (run, p) { p.curseLessHp = run.curses.includes('lessHp'); if (run.weekly && run.weekly.buff) for (const k in run.weekly.buff) p.runBuffs[k] = (p.runBuffs[k] || 0) + run.weekly.buff[k]; S.recalc(p); if (p.hp > p.maxHp) p.hp = p.maxHp; };
  R.nPlayers = run => run.party.filter(Boolean).length;
  R.active = run => run.party.filter(p => p && p.connected);
  R.newRegion = function (run) {
    if (run.mode === 'rush') { run.phase = 'map'; R.startRushBoss(run); return; }
    const region = Math.min(4, run.regionIdx + 1);
    run.nodeMap = W.genNodeMap(run.seed + run.endlessLoop * 101, region, { noShop: run.curses.includes('noShop'), eliteMore: run.curses.includes('eliteMore'), moreShop: run.party.some(p => p && p.hasHook('moreShop')) });
    if (region === 4) { // 왕좌의 방: 전투 2 + 보스
      const cols = run.nodeMap.cols; run.nodeMap.cols = [cols[0], cols[1], cols[cols.length - 1]]; run.nodeMap.cols[0].forEach(n => { n.type = 'fight'; n.next = cols[1].map(x => x.id); }); run.nodeMap.cols[1].forEach(n => { n.type = run.rng.chance(0.5) ? 'fire' : 'fight'; n.next = [cols[cols.length - 1][0].id]; }); run.nodeMap.nodes = [].concat(...run.nodeMap.cols); run.nodeMap.byId = Object.fromEntries(run.nodeMap.nodes.map(n => [n.id, n])); run.nodeMap.cols.forEach((col, c) => col.forEach((n, r) => { n.x = 40 + c * 120; n.y = 70 + (r - (col.length - 1) / 2) * 54; }));
    }
    run.curNode = -1;
    R.toMap(run);
  };
  R.toMap = function (run) {
    run.phase = 'map'; run.sim = null; run.musicWanted = 'map';
    R.flushJoin(run);
    const avail = run.curNode < 0 ? run.nodeMap.cols[0].map(n => n.id) : run.nodeMap.byId[run.curNode].next;
    R.startVote(run, { kind: 'node', opts: avail.map(id => { const n = run.nodeMap.byId[id]; return { id, t: W.NODE_INFO[n.type].icon + ' ' + W.NODE_INFO[n.type].name }; }), timer: C.VOTE_TIME, onPick: i => R.enterNode(run, avail[i]) });
    run.events.push({ t: 'save' });
  };
  R.flushJoin = function (run) {
    for (const p of run.joinQueue) {
      const others = run.party.filter(q => q && q !== p);
      const avgCards = others.length ? Math.round(U.sum(others.map(q => q.cards.length)) / others.length) : 0;
      const pool = G.CARDS.common.slice(); for (let i = 0; i < avgCards; i++) { const c = run.rng.pick(pool); p.cards.push(c.id); }
      p.gold = others.length ? Math.round(U.sum(others.map(q => q.gold)) / others.length * 0.6) : 100;
      p.freeShop = true; run.party[p.slot] = p; R.applyRunCurses(run, p);
      run.log.push(`${p.name} 합류`);
    }
    run.joinQueue = [];
  };

  // ───── 투표
  R.startVote = function (run, v) {
    run.vote = { kind: v.kind, opts: v.opts, votes: {}, timer: v.timer || C.VOTE_TIME, onPick: v.onPick, title: v.title, sub: v.sub, exclude: v.exclude, started: run.time };
    run.ov = { type: 'vote', kind: v.kind, title: v.title, sub: v.sub, opts: v.opts.map(o => ({ t: o.t, sub: o.sub, dis: !!o.dis, id: o.id })), votes: {}, timer: Math.ceil(run.vote.timer) };
  };
  R.castVote = function (run, slot, idx) {
    const v = run.vote; if (!v) return;
    if (v.exclude != null && v.exclude === slot) return;
    if (idx < 0 || idx >= v.opts.length || v.opts[idx].dis) return;
    v.votes[slot] = idx; run.ov.votes = Object.assign({}, v.votes);
    G.fx('snd', 'vote');
    const voters = R.active(run).filter(p => v.exclude !== p.slot).length;
    const counts = {}; for (const s in v.votes) counts[v.votes[s]] = (counts[v.votes[s]] || 0) + 1;
    for (const k in counts) if (counts[k] * 2 > voters || Object.keys(v.votes).length >= voters && counts[k] === Math.max(...Object.values(counts)) && Object.values(counts).filter(c => c === counts[k]).length === 1) { R.resolveVote(run, +k); return; }
    if (Object.keys(v.votes).length >= voters) R.resolveVoteTie(run);
  };
  R.resolveVoteTie = function (run) {
    const v = run.vote; const counts = {}; for (const s in v.votes) counts[v.votes[s]] = (counts[v.votes[s]] || 0) + 1;
    const max = Math.max(0, ...Object.values(counts)); const tied = Object.keys(counts).filter(k => counts[k] === max).map(Number);
    if (tied.length === 0) { R.resolveVote(run, 0); return; }
    if (tied.length === 1) { R.resolveVote(run, tied[0]); return; }
    // 주사위
    const rolls = {}; for (const s in v.votes) if (tied.includes(v.votes[s])) rolls[s] = run.rng.int(1, 100);
    const win = Object.keys(rolls).reduce((a, b) => (rolls[b] > rolls[a] ? b : a));
    G.fx('snd', 'dice'); run.log.push(`동률 → 주사위: ${Object.keys(rolls).map(s => `${run.party[s].name} ${rolls[s]}`).join(', ')}`);
    run.events.push({ t: 'chat', s: `🎲 동률! 주사위 — ${Object.keys(rolls).map(s => `${run.party[s].name} ${rolls[s]}`).join(' / ')}` });
    R.resolveVote(run, v.votes[win]);
  };
  R.resolveVote = function (run, idx) {
    const v = run.vote; if (!v) return;
    for (const s in v.votes) { const p = run.party[s]; if (p) { p.stats.votes++; if (v.votes[s] === idx) p.stats.voteWins++; } }
    run.vote = null; run.ov = null;
    v.onPick(idx);
  };

  // ───── 노드 진입
  R.enterNode = function (run, id) {
    const n = run.nodeMap.byId[id]; run.curNode = id; run.nodesDone++;
    const region = Math.min(4, run.regionIdx + 1);
    run.log.push(`${region}-${n.col + 1} ${W.NODE_INFO[n.type].name}`);
    if (n.type === 'fight' || n.type === 'elite') R.startCombat(run, n.type);
    else if (n.type === 'boss') R.startBoss(run, G.REGIONS[region - 1].boss);
    else if (n.type === 'event') R.startEvent(run);
    else if (n.type === 'shop') R.startShop(run);
    else if (n.type === 'fire') R.startFire(run);
    else if (n.type === 'treasure') R.startTreasure(run);
    else if (n.type === 'trial') R.startTrial(run);
  };
  R.makeSim = function (run, map, mode, waves, extra) {
    const nP = Math.max(1, R.nPlayers(run));
    const sim = S.create(Object.assign({ map, region: Math.min(4, run.regionIdx + 1), depth: run.depth, curses: run.curses, mode, nPlayers: nP, seed: map.seed, waves, nextOil: run.flags.nextOil, nextFire: run.flags.nextFire, nextWet: run.flags.nextWet, runFlags: run.flags, timeLimit: run.curses.includes('timer') && mode !== 'hall' ? 180 : 0, bossWeak: run.bossWeak }, extra || {}));
    run.flags.nextOil = run.flags.nextFire = run.flags.nextWet = false;
    let i = 0; for (const p of run.party) if (p) S.enterMap(sim, p, i++);
    run.sim = sim; sim.downOrder = run.downOrder;
    return sim;
  };
  R.genWaves = function (run, type, region) {
    const pool = G.REGIONS[region - 1].pool.filter(t => G.ENEMIES[t].region === region || G.ENEMIES[t].region === 0 || G.ENEMIES[t].region === 3 && region === 4);
    const nW = type === 'elite' ? run.rng.int(C.WAVES_ELITE[0], C.WAVES_ELITE[1]) : run.rng.int(C.WAVES_FIGHT[0], C.WAVES_FIGHT[1]);
    const scale = C.SCALE[Math.max(1, Math.min(3, R.nPlayers(run)))].count;
    const waves = [];
    for (let w = 0; w < nW; w++) {
      const budget = Math.round((3 + w + Math.floor(run.depth / 3) + run.regionIdx) * scale);
      const wave = []; let used = 0, guard = 0;
      while (used < budget && guard++ < 20) { const t = run.rng.pick(pool); const d = G.ENEMIES[t]; const cost = Math.max(1, Math.round(d.xp || 1)); if (used + cost > budget + 1) continue; wave.push({ type: t, n: 1 }); used += cost; }
      if (!wave.length) wave.push({ type: 'soldier', n: 2 });
      waves.push(wave);
    }
    const eliteCount = type === 'elite' ? 1 + (run.depth >= 8 ? 1 : 0) : (run.curses.includes('eliteMore') || run.depth >= 6 ? 1 : 0);
    for (let i = 0; i < eliteCount; i++) {
      const wave = waves[waves.length - 1]; const t = run.rng.pick(pool.filter(x => !G.ENEMIES[x].p.group) || pool);
      const nAff = 1 + (run.depth >= 8 ? 1 : 0); const affixes = run.rng.shuffle(G.AFFIX_ORDER).slice(0, nAff);
      wave.push({ type: t, n: 1, affixes });
    }
    return waves;
  };
  R.startCombat = function (run, type, extra) {
    const region = Math.min(4, run.regionIdx + 1);
    const map = W.genArena(run.rng.int(1, 1e9), region, {});
    const waves = R.genWaves(run, type, region);
    const sim = R.makeSim(run, map, 'combat', waves, extra && extra.trial ? { trial: extra.trial, timeLimit: extra.trial.timer || 0 } : {});
    run.nodeType = type; run.phase = 'combat'; run.ov = null; run.musicWanted = G.REGIONS[region - 1].music; run.combatExtra = extra || null;
    if (run.party.some(p => p && p.cls === 'necro')) sim.corpses.push({ x: map.spawn.x + 30, y: map.spawn.y, t: 60 });
  };
  R.startBoss = function (run, bossId) {
    const region = Math.min(4, run.regionIdx + 1);
    const map = W.genArena(run.rng.int(1, 1e9), region, { boss: true, noPillars: bossId === 'eye' });
    const sim = R.makeSim(run, map, 'boss', []);
    const b = G.Bosses.spawn(sim, bossId, map.bossSpawn.x, map.bossSpawn.y);
    sim.paused = true; run.bossId = bossId;
    run.phase = 'combat'; run.nodeType = 'boss'; run.musicWanted = G.Bosses.DATA[bossId].music;
    run.ov = { type: 'bossIntro', name: b.bossName, sub: G.Bosses.DATA[bossId].intro, timer: 2.5 }; run.ovT = 2.5;
    if (run.weekly && run.weekly.vision) {}
  };
  R.startRushBoss = function (run) {
    const order = ['grad', 'elun', 'eye', 'lord'];
    if (run.rushIdx >= order.length) { run.cleared = true; R.finish(run); return; }
    run.regionIdx = run.rushIdx; R.startBoss(run, order[run.rushIdx]); run.rushIdx++;
  };
  R.startTreasure = function (run) {
    const region = Math.min(4, run.regionIdx + 1);
    const map = W.genArena(run.rng.int(1, 1e9), region, { rooms: 1, hazards: false });
    const sim = R.makeSim(run, map, 'explore', []);
    const room = map.rooms[0]; const cx = (room.x + room.w / 2) * T, cy = (room.y + room.h / 2) * T;
    const kinds = run.rng.shuffle(['', '', 'locked']);
    kinds.forEach((k, i) => { const o = S.addObj(sim, 'chest', cx + (i - 1) * 40, cy - 10, { st: k, wasLocked: k === 'locked', r: 8, nm: k === 'locked' ? '잠긴 상자' : '상자' }); if (run.rng.chance(0.15) && k !== 'locked') o.mimic = true; });
    S.addObj(sim, 'exit', map.exit ? map.exit.x : cx, map.exit ? map.exit.y : cy + 40);
    sim.cleared = true;
    run.phase = 'combat'; run.nodeType = 'treasure'; run.ov = null; run.musicWanted = G.REGIONS[region - 1].music;
    run.events.push({ t: 'chat', s: '📦 상자 3개 중 하나만 열 수 있다. (F)' });
    sim.chestLimit = 1;
  };
  R.startTrial = function (run) {
    const trials = [
      { id: 'timer', name: '모래시계', desc: '90초 안에 끝내라. 초과 시 초당 피해', timer: 90 },
      { id: 'nopot', name: '금주', desc: '물약 사용 불가, 적 체력 +40%', enemyHp: 1.4, noPotion: true },
      { id: 'elite', name: '정예 행렬', desc: '정예 3마리 동시 등장', elites: 3 },
    ];
    const tr = run.rng.pick(trials);
    R.startVote(run, { kind: 'trial', title: '🏆 시련: ' + tr.name, sub: tr.desc + ' · 보상: 희귀 유물 + 금화 150', opts: [{ t: '도전한다' }, { t: '지나간다 (금화 +30)' }], onPick: i => {
      if (i === 1) { for (const p of run.party) if (p) p.gold += 30; R.toMap(run); return; }
      run.trialActive = tr;
      if (tr.noPotion) run.curses = run.curses.concat(['noPotion_trial']);
      R.startCombat(run, 'fight', { trial: tr });
      if (tr.elites) { const last = run.sim.waves[run.sim.waves.length - 1]; for (let i = 0; i < tr.elites; i++) last.push({ type: run.rng.pick(G.REGIONS[Math.min(3, run.regionIdx)].pool), n: 1, affixes: [run.rng.pick(G.AFFIX_ORDER)] }); }
    } });
  };

  // ───── 이벤트
  R.startEvent = function (run) {
    const unseen = G.EVENTS.filter(e => !run.codexSeen[e.id] && !(run.seenEvents || []).includes(e.id));
    const ev = run.rng.pick(unseen.length ? unseen : G.EVENTS.filter(e => !(run.seenEvents || []).includes(e.id)) || G.EVENTS);
    run.seenEvents = (run.seenEvents || []).concat([ev.id]);
    run.events.push({ t: 'codex', kind: 'events', id: ev.id });
    run.phase = 'event';
    R.startVote(run, { kind: 'event', title: '❓ ' + ev.title, sub: ev.text, opts: ev.opts.map(o => ({ t: o.t, sub: o.sub })), timer: 25, onPick: i => R.applyFx(run, ev.opts[i].fx, () => R.toMap(run)) });
  };
  // 효과 해석기 (done: 끝나면 호출)
  R.applyFx = function (run, fx, done) {
    const ps = run.party.filter(Boolean); const alive = ps.filter(p => !p.ghost);
    const msg = [];
    if (fx.chance) { const [p, a, b] = fx.chance; return R.applyFx(run, run.rng.chance(p) ? a : b, done); }
    if (fx.chance3) { let r = run.rng(), pick = fx.chance3[fx.chance3.length - 1][1]; for (const [p, f] of fx.chance3) { if (r < p) { pick = f; break; } r -= p; } return R.applyFx(run, pick, done); }
    if (fx.relicOrCursed != null) return R.applyFx(run, run.rng.chance(fx.relicOrCursed) ? { cursedRelic: 1 } : { relic: 1 }, done);
    if (fx.one) {
      const opts = alive.map(p => ({ t: p.name, sub: G.CLASSES[p.cls].name, slot: p.slot }));
      run.phase = 'event';
      R.startVote(run, { kind: 'one', title: '누가 받을까?', sub: '본인은 투표할 수 없다', opts, timer: 20, onPick: i => { const tgt = alive[i]; R.applyFxTo(run, fx.one, [tgt], msg); run.events.push({ t: 'chat', s: `✨ ${tgt.name}: ${msg.join(', ')}` }); done(); } });
      return;
    }
    R.applyFxTo(run, fx, alive, msg);
    if (fx.fight || fx.fightElite || fx.fightMimic || fx.fightSpiders) {
      run.afterFight = { gold: fx.gold && fx.gold > 0 ? 0 : 0, relic: fx.fightElite ? 1 : 0 };
      R.startCombat(run, fx.fightElite ? 'elite' : 'fight');
      if (fx.fightMimic) run.sim.waves = [[{ type: 'mimic', n: 1 }]];
      if (fx.fightSpiders) run.sim.waves = [[{ type: 'spider', n: 4 }]];
      run.events.push({ t: 'chat', s: '⚔️ 매복! ' + (msg.length ? msg.join(', ') : '') });
      return;
    }
    if (fx.shop === 'black') { run.shopMult = 1.5; run.blackMarket = true; R.startShop(run); return; }
    if (msg.length) run.events.push({ t: 'chat', s: '📜 ' + msg.join(', ') });
    done();
  };
  R.applyFxTo = function (run, fx, targets, msg) {
    const add = s => { if (!msg.includes(s)) msg.push(s); };
    for (const p of targets) {
      if (fx.gold) { p.gold = Math.max(0, p.gold + fx.gold); add(`금화 ${fx.gold > 0 ? '+' : ''}${fx.gold}`); }
      if (fx.heal) { p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * fx.heal)); add(`체력 ${Math.round(fx.heal * 100)}% 회복`); }
      if (fx.hurt) { p.hp = Math.max(1, p.hp - Math.round(p.maxHp * fx.hurt)); add(`체력 -${Math.round(fx.hurt * 100)}%`); }
      if (fx.hpMax) { p.runBuffs.hpFlat = (p.runBuffs.hpFlat || 0) + fx.hpMax; S.recalc(p); add(`최대 체력 ${fx.hpMax > 0 ? '+' : ''}${fx.hpMax}`); }
      if (fx.relic) { const r = R.randomRelic(run, { rarityMin: 0 }); if (r) { R.giveRelic(run, p, r.id); add(`유물 「${r.name}」`); } }
      if (fx.relicRare) { const r = R.randomRelic(run, { rarityMin: 1 }); if (r) { R.giveRelic(run, p, r.id); add(`유물 「${r.name}」`); } }
      if (fx.cursedRelic) { const r = run.rng.pick(G.RELICS.filter(x => x.cursed && !p.relics.includes(x.id))); if (r) { R.giveRelic(run, p, r.id); add(`저주 유물 「${r.name}」`); } }
      if (fx.loseRelic && p.relics.length) { const id = run.rng.pick(p.relics); p.relics.splice(p.relics.indexOf(id), 1); S.recalc(p); add(`유물 「${G.RELIC_BY[id].name}」 잃음`); }
      if (fx.card) { const pool = fx.card === 'class' ? (G.CARDS[p.cls] || []) : G.CARDS.common; const c = run.rng.pick(pool.filter(x => !p.cards.includes(x.id)) || pool); if (c) { p.cards.push(c.id); S.recalc(p); add(`카드 「${c.name}」`); } }
      if (fx.potion) { p.potions = U.clamp(p.potions + fx.potion, 0, C.POTION_MAX); add(`물약 ${fx.potion > 0 ? '+' : ''}${fx.potion}`); }
      if (fx.key) { p.items.key += fx.key; add('열쇠 +' + fx.key); }
      if (fx.bomb) { p.items.bomb += fx.bomb; add('폭탄 +' + fx.bomb); }
      if (fx.morale) { p.morale = U.clamp(p.morale + fx.morale, 0, C.MORALE_MAX); add(`사기 ${fx.morale > 0 ? '+' : ''}${fx.morale}`); }
      if (fx.buff) { for (const k in fx.buff) p.runBuffs[k] = (p.runBuffs[k] || 0) + fx.buff[k]; S.recalc(p); add(`${Object.keys(fx.buff).map(k => (G.Items.MOD_NAME[k] || k) + ' +' + Math.round(fx.buff[k] * 100) + '%').join(', ')} (런)`); }
      if (fx.debuff) { for (const k in fx.debuff) p.runBuffs[k] = (p.runBuffs[k] || 0) - fx.debuff[k]; S.recalc(p); add(`${Object.keys(fx.debuff).map(k => (G.Items.MOD_NAME[k] || k) + ' -' + Math.round(fx.debuff[k] * 100) + '%').join(', ')} (런)`); }
      if (fx.dice) { const bet = Math.floor(p.gold * fx.dice); if (run.rng.chance(0.55)) { p.gold += bet; add(`${p.name} 승리 +${bet}`); } else { p.gold -= bet; add(`${p.name} 패배 -${bet}`); } }
      if (fx.drunk) { p.drunk = fx.drunk; add('취함'); }
      if (fx.xp) { run.earned.xp += fx.xp; add(`직업 경험치 +${fx.xp}`); }
      if (fx.equip) { R.dropEquip(run, p, { fromEvent: true }); add('장비 발견'); }
      if (fx.upgradeEquip) { const it = p.equipRun && p.equipRun.w || null; const any = p.equipped ? Object.values(p.equipped).filter(Boolean) : []; if (any.length) { const t = run.rng.pick(any); t.up = Math.min(5, (t.up || 0) + 1); R.refreshEquip(p); add(`${t.name} +${t.up}`); } else add('강화할 장비 없음'); }
    }
    if (fx.goldPct) for (const p of targets) p.gold = Math.round(p.gold * (1 + fx.goldPct));
    if (fx.soul) { run.earned.soul += fx.soul; msg.push(`혼석 +${fx.soul}`); }
    if (fx.ash) { run.earned.ash += fx.ash; msg.push(`잿조각 +${fx.ash}`); }
    if (fx.revive) { const dead = run.party.filter(p => p && p.ghost); if (dead.length) { for (const p of dead) { p.ghost = false; p.dead = false; p.hp = Math.round(p.maxHp * 0.5); } msg.push(`${dead.map(p => p.name).join(', ')} 복귀`); } else if (fx.goldIfNone) { for (const p of targets) p.gold += fx.goldIfNone; msg.push(`금화 +${fx.goldIfNone}`); } }
    if (fx.nextOil) { run.flags.nextOil = true; msg.push('다음 전투: 기름 장판'); }
    if (fx.nextFire) { run.flags.nextFire = true; msg.push('다음 전투: 불 장판'); }
    if (fx.nextWet) { run.flags.nextWet = true; msg.push('다음 전투: 잿비'); }
    if (fx.bossWeak) { run.bossWeak = fx.bossWeak; msg.push('다음 보스 체력 -10%'); }
    if (fx.curse) { run.flags[fx.curse] = true; msg.push('피의 맹세 체결'); }
    if (fx.blame) { msg.push(run.lastBlame ? `지난 전멸의 원인: ${run.lastBlame}` : '기록이 희미하다'); }
  };
  R.randomRelic = function (run, o) {
    o = o || {};
    const pool = G.RELICS.filter(r => !r.cursed && r.r >= (o.rarityMin || 0) && !run.relicsTaken.has(r.id));
    if (!pool.length) return null;
    return run.rng.weighted(pool, r => r.r === 0 ? 60 : r.r === 1 ? 30 : 8);
  };
  R.giveRelic = function (run, p, id) { p.relics.push(id); run.relicsTaken.add(id); S.recalc(p); run.events.push({ t: 'codex', kind: 'relics', id }); G.fx('snd', 'pick'); };

  // ───── 상점
  R.startShop = function (run) {
    const items = []; const luck = Math.max(...run.party.filter(Boolean).map(p => p.st.luck || 0), 0);
    const price = (base, p) => Math.round(base * run.shopMult);
    for (let i = 0; i < 3; i++) { const r = R.randomRelic(run, { rarityMin: run.blackMarket && i === 0 ? 2 : 0 }); if (r) { run.relicsTaken.add(r.id); items.push({ k: 'relic', id: r.id, nm: r.name, ds: r.desc, q: r.r, pr: price(C.SHOP_PRICES.relic[0] + r.r * 60) }); } }
    items.push({ k: 'potion', nm: '물약', ds: G.Items.CONSUMABLES.potion.desc, q: 0, pr: price(C.SHOP_PRICES.potion), stock: 3 });
    const nE = 1 + (run.rng.chance(0.5) ? 1 : 0);
    for (let i = 0; i < nE; i++) { const it = G.Items.gen(run.rng, { luck, tier: run.regionIdx + 1, cls: run.rng.pick(run.party.filter(Boolean).map(p => p.cls)) }); items.push({ k: 'equip', item: it, nm: G.Items.label(it), ds: G.Items.desc(it), q: it.rar, pr: price(C.SHOP_PRICES.equip[0] + it.rar * 80) }); }
    items.push({ k: 'key', nm: '열쇠', ds: G.Items.CONSUMABLES.key.desc, q: 0, pr: price(C.SHOP_PRICES.key) });
    items.push({ k: 'bomb', nm: '폭탄', ds: G.Items.CONSUMABLES.bomb.desc, q: 0, pr: price(C.SHOP_PRICES.bomb), stock: 2 });
    if (run.party.some(p => p && p.ghost)) items.push({ k: 'soulstone', nm: '영혼석', ds: G.Items.CONSUMABLES.soulstone.desc, q: 2, pr: price(C.SHOP_PRICES.soulstone) });
    if (!run.party.some(p => p && G.CLASSES[p.cls].roleKey === 'tank')) items.push({ k: 'totem', nm: '용병 방패 토템', ds: G.Items.CONSUMABLES.totem.desc, q: 1, pr: price(C.SHOP_PRICES.totem) });
    if (!run.party.some(p => p && G.CLASSES[p.cls].roleKey === 'heal')) items.push({ k: 'potion', nm: '물약 (할인)', ds: '힐러가 없어 할인', q: 0, pr: Math.round(price(C.SHOP_PRICES.potion) * 0.5), stock: 3 });
    run.shop = { items: items.map((it, i) => Object.assign({ i, sold: false, stock: it.stock || 1 }, it)), done: {} };
    run.phase = 'shop'; run.ovT = 60;
    R.refreshShopOv(run);
  };
  R.shopDiscount = (run, p) => { let d = p.st.discount || 0; if (run.party.some(q => q && q.cls === 'rogue')) d += C.ROGUE_DISCOUNT; if (p.freeShop) d = 1; return Math.min(1, d); };
  R.refreshShopOv = function (run) {
    const gold = {}, disc = {}; for (const p of run.party) if (p) { gold[p.slot] = p.gold; disc[p.slot] = Math.round(R.shopDiscount(run, p) * 100); }
    run.ov = { type: 'shop', title: run.blackMarket ? '🕯️ 암시장' : '💰 상점', items: run.shop.items.map(it => ({ i: it.i, k: it.k, nm: it.nm, ds: it.ds, q: it.q, pr: it.pr, sold: it.sold, stock: it.stock, cls: it.item ? it.item.cls : null, slot: it.item ? it.item.slot : null })), gold, disc, done: Object.assign({}, run.shop.done), timer: Math.ceil(run.ovT) };
  };
  R.buy = function (run, slot, i) {
    const p = run.party[slot], it = run.shop && run.shop.items[i]; if (!p || !it || it.sold || p.ghost) return;
    const cost = Math.round(it.pr * (1 - R.shopDiscount(run, p)));
    if (p.gold < cost) { run.events.push({ t: 'toast', slot, s: '금화 부족' }); return; }
    if (it.k === 'potion' && p.potions >= C.POTION_MAX) { run.events.push({ t: 'toast', slot, s: '물약 가득' }); return; }
    p.gold -= cost; p.stats.goldSpent += cost; if (p.freeShop) p.freeShop = false;
    if (it.k === 'relic') R.giveRelic(run, p, it.id);
    else if (it.k === 'potion') p.potions++;
    else if (it.k === 'equip') R.receiveEquip(run, p, it.item);
    else if (it.k === 'key') p.items.key++;
    else if (it.k === 'bomb') p.items.bomb++;
    else if (it.k === 'soulstone') p.items.soulstone++;
    else if (it.k === 'totem') p.items.totem++;
    it.stock--; if (it.stock <= 0) it.sold = true;
    G.fx('snd', 'buy'); run.events.push({ t: 'chat', s: `🛒 ${p.name}: ${it.nm} 구매` });
    R.refreshShopOv(run);
  };
  R.shopDone = function (run, slot) { if (!run.shop) return; run.shop.done[slot] = true; R.refreshShopOv(run); if (R.active(run).every(p => run.shop.done[p.slot])) R.endShop(run); };
  R.endShop = function (run) { run.shop = null; run.shopMult = 1; run.blackMarket = false; R.toMap(run); };

  // ───── 모닥불
  R.startFire = function (run) {
    const dead = run.party.filter(p => p && p.ghost);
    const opts = [{ t: '🔥 휴식', sub: '전원 체력 30% 회복', dis: run.curses.includes('noFireHeal') }, { t: '✨ 유물 강화', sub: '각자 유물 하나 +1 (효과 50% 증가, 최대 +2)' }, { t: '⚰️ 사망자 복귀', sub: dead.length ? `${dead.map(p => p.name).join(', ')} 복귀 (체력 50%)` : '사망자 없음', dis: !dead.length }];
    run.phase = 'fire';
    R.startVote(run, { kind: 'fire', title: '🔥 모닥불', sub: '파티가 함께 하나를 고른다', opts, onPick: i => {
      if (i === 0) { for (const p of run.party) if (p && !p.ghost) p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * 0.3)); run.events.push({ t: 'chat', s: '🔥 휴식: 전원 30% 회복' }); G.fx('snd', 'heal'); R.toMap(run); }
      else if (i === 1) { R.startRelicUpgrade(run); }
      else { for (const p of dead) { p.ghost = false; p.dead = false; p.hp = Math.round(p.maxHp * 0.5); } run.events.push({ t: 'chat', s: `⚰️ ${dead.map(p => p.name).join(', ')} 복귀` }); G.fx('snd', 'revive'); R.toMap(run); }
    } });
  };
  R.startRelicUpgrade = function (run) {
    run.phase = 'pick';
    run.pick = { kind: 'upgrade', offers: {}, picked: {} };
    for (const p of run.party) if (p) { const cands = p.relics.filter(id => (p.relicUp && p.relicUp[id] || 0) < 2); run.pick.offers[p.slot] = cands.map(id => ({ id, nm: G.RELIC_BY[id].name + (p.relicUp && p.relicUp[id] ? ` +${p.relicUp[id]}` : ''), ds: G.RELIC_BY[id].desc, r: G.RELIC_BY[id].r })); if (!cands.length) run.pick.picked[p.slot] = null; }
    run.ovT = 30; R.refreshPickOv(run, '✨ 강화할 유물');
    R.checkPickDone(run);
  };
  R.refreshPickOv = function (run, title) { run.ov = { type: 'pick', kind: run.pick.kind, title: title || run.pick.title, offers: run.pick.offers, picked: Object.assign({}, run.pick.picked), timer: Math.ceil(run.ovT) }; run.pick.title = title || run.pick.title; };
  R.doPick = function (run, slot, id) {
    const pk = run.pick, p = run.party[slot]; if (!pk || !p || pk.picked[slot] !== undefined) return;
    const offer = (pk.offers[slot] || []).find(o => o.id === id); if (!offer && id !== null) return;
    pk.picked[slot] = id;
    if (pk.kind === 'cards' && id) { p.cards.push(id); run.cardsTaken[id] = true; S.recalc(p); run.events.push({ t: 'codex', kind: 'cards', id }); G.fx('snd', 'levelup'); }
    else if (pk.kind === 'relic' && id) R.giveRelic(run, p, id);
    else if (pk.kind === 'upgrade' && id) { p.relicUp = p.relicUp || {}; p.relicUp[id] = (p.relicUp[id] || 0) + 1; R.applyRelicUp(p); G.fx('snd', 'forge'); }
    R.refreshPickOv(run); R.checkPickDone(run);
  };
  R.applyRelicUp = function (p) {
    // 강화: 유물 mods 50%/단계 추가 — 런버프로 근사
    S.recalc(p);
    for (const id in (p.relicUp || {})) { const r = G.RELIC_BY[id]; if (!r || !r.mods) continue; const k = 0.5 * p.relicUp[id]; for (const key in r.mods) { if (key === 'hpFlat') continue; const v = r.mods[key] * k; if (['atk', 'hp', 'spd', 'aspd', 'range'].includes(key)) p.st[key === 'hp' ? 'maxHp' : key] *= 1 + v; else p.st[key] = (p.st[key] || 0) + v; } }
    p.maxHp = Math.round(p.st.maxHp); p.hp = Math.min(p.hp, p.maxHp);
  };
  R.checkPickDone = function (run) {
    const pk = run.pick; if (!pk) return;
    if (R.active(run).every(p => pk.picked[p.slot] !== undefined)) { const kind = pk.kind; run.pick = null; run.ov = null; if (kind === 'cards') R.afterCards(run); else if (kind === 'relic') R.afterBossRelic(run); else R.toMap(run); }
  };

  // ───── 카드
  R.startCards = function (run) {
    run.phase = 'pick'; run.pick = { kind: 'cards', offers: {}, picked: {} };
    const n = run.curses.includes('noCards') ? 2 : 3;
    for (const p of run.party) {
      if (!p) continue;
      const cnt = n + (p.hasHook('card4') ? 1 : 0);
      const pool = G.CARDS.common.concat(G.CARDS[p.cls] || []).filter(c => !p.cards.includes(c.id));
      const offers = []; let guard = 0;
      while (offers.length < cnt && pool.length && guard++ < 50) { const c = run.rng.weighted(pool, x => x.r === 0 ? 70 : x.r === 1 ? 25 : 5); if (!offers.includes(c)) offers.push(c); }
      run.pick.offers[p.slot] = offers.map(c => ({ id: c.id, nm: c.name, ds: c.desc, r: c.r, cls: G.CARDS.common.includes(c) ? '' : G.CLASSES[p.cls].name }));
      if (!offers.length) run.pick.picked[p.slot] = null;
    }
    run.ovT = C.CARD_PICK_TIME; R.refreshPickOv(run, '⬆️ 강화 카드');
    R.checkPickDone(run);
  };
  R.afterCards = function (run) {
    if (run.pendingBossRelic) { run.pendingBossRelic = false; R.startBossRelic(run); return; }
    R.toMap(run);
  };
  R.startBossRelic = function (run) {
    run.phase = 'pick'; run.pick = { kind: 'relic', offers: {}, picked: {} };
    for (const p of run.party) { if (!p) continue; const offers = []; for (let i = 0; i < 3; i++) { const r = R.randomRelic(run, { rarityMin: i === 0 ? 1 : 0 }); if (r && !offers.includes(r)) offers.push(r); } run.pick.offers[p.slot] = offers.map(r => ({ id: r.id, nm: r.name, ds: r.desc, r: r.r })); if (!offers.length) run.pick.picked[p.slot] = null; }
    run.ovT = 30; R.refreshPickOv(run, '👑 보스 유물 (3택1)');
    R.checkPickDone(run);
  };
  R.afterBossRelic = function (run) {
    if (run.mode === 'rush') { R.startRushBoss(run); return; }
    const region = run.regionIdx + 1;
    if (region >= 4 || region >= run.regionLimit) { if (run.mode === 'endless') { run.endlessLoop++; run.depth++; run.regionIdx = 0; run.events.push({ t: 'chat', s: `🌀 무한 심연 ${run.endlessLoop + 1}바퀴 — 심연 단계 ${run.depth}` }); R.newRegion(run); return; } run.cleared = true; R.finish(run); return; }
    // 귀환 투표
    run.phase = 'return';
    const nextMult = C.REGION_MULT[Math.min(3, run.regionIdx + 1)];
    R.startVote(run, { kind: 'return', title: '🏠 귀환할까, 더 갈까?', sub: `지금 귀환: 보상 ×${C.REGION_MULT[run.regionIdx]} 확정 · 계속: 다음 지역 보상 ×${nextMult} (전멸 시 미확정분 70% 손실)`, opts: [{ t: `⬇️ 계속 간다 — ${G.REGIONS[region].name}` }, { t: '🏠 귀환한다' }], timer: 20, onPick: i => {
      if (i === 1) { run.cleared = true; run.returned = true; R.finish(run); return; }
      const mult = C.REGION_MULT[run.regionIdx]; run.confirmed.ash += Math.round(run.earned.ash * mult * 0.5); run.confirmed.soul += Math.round(run.earned.soul * mult * 0.5); run.earned.ash = Math.round(run.earned.ash * 0.5); run.earned.soul = Math.round(run.earned.soul * 0.5);
      run.regionIdx++; R.newRegion(run);
    } });
  };

  // ───── 장비
  R.dropEquip = function (run, p, o) {
    o = o || {};
    const luck = Math.max(...run.party.filter(Boolean).map(q => q.st.luck || 0), 0);
    const it = G.Items.gen(run.rng, { luck, tier: run.regionIdx + 1 + (o.boss ? 1 : 0), rarity: o.rarity });
    if (R.active(run).length <= 1) { R.receiveEquip(run, run.party.find(q => q && q.connected) || p, it); return; }
    run.rolls = run.rolls || []; run.rolls.push({ item: it, choices: {}, timer: C.ROLL_TIME_LOOT });
    if (!run.roll) R.nextRoll(run);
  };
  R.nextRoll = function (run) {
    run.roll = run.rolls.shift() || null;
    if (!run.roll) return;
    const it = run.roll.item;
    run.rollOv = { type: 'roll', item: { nm: G.Items.label(it), ds: G.Items.desc(it), q: it.rar, slot: it.slot, cls: it.cls }, choices: {}, timer: Math.ceil(run.roll.timer) };
  };
  R.rollChoice = function (run, slot, choice) {
    const r = run.roll; const p = run.party[slot]; if (!r || !p || r.choices[slot]) return;
    r.choices[slot] = choice; run.rollOv.choices = Object.assign({}, r.choices);
    if (choice === 'need' && !G.Items.canUse(r.item, p.cls)) p.stats.needAbuse++;
    if (R.active(run).every(q => r.choices[q.slot])) R.resolveRoll(run);
  };
  R.resolveRoll = function (run) {
    const r = run.roll; if (!r) return;
    const pr = R.active(run).map(p => ({ p, c: r.choices[p.slot] || 'pass', d: 0 }));
    const dice = x => { const n = run.rng.int(1, 100); return x.p.hasHook('dice2') ? Math.max(n, run.rng.int(1, 100)) : n; };
    let cands = pr.filter(x => x.c === 'need'); if (!cands.length) cands = pr.filter(x => x.c === 'greed');
    let winner = null;
    if (cands.length) { for (const x of cands) x.d = dice(x); winner = cands.reduce((a, b) => (b.d > a.d ? b : a)); run.events.push({ t: 'chat', s: `🎲 ${G.Items.label(r.item)}: ${cands.map(x => `${x.p.name}(${x.c === 'need' ? '니드' : '그리드'}) ${x.d}`).join(' / ')} → ${winner.p.name}` }); G.fx('snd', 'dice'); R.receiveEquip(run, winner.p, r.item); }
    else { run.events.push({ t: 'chat', s: `🎲 ${G.Items.label(r.item)}: 전원 패스 → 길드 창고` }); run.bag = run.bag || []; run.bag.push(r.item); }
    run.roll = null; run.rollOv = null;
    if (run.rolls.length) R.nextRoll(run);
  };
  R.receiveEquip = function (run, p, it) {
    p.equipped = p.equipped || { w: null, a: null, t: null }; p.bag = p.bag || [];
    const cur = p.equipped[it.slot];
    if (G.Items.canUse(it, p.cls) && (!cur || cur.rar < it.rar || (cur.rar === it.rar && (cur.up || 0) <= (it.up || 0)))) { if (cur) p.bag.push(cur); p.equipped[it.slot] = it; R.refreshEquip(p); run.events.push({ t: 'toast', slot: p.slot, s: `장착: ${G.Items.label(it)}` }); }
    else { p.bag.push(it); run.events.push({ t: 'toast', slot: p.slot, s: `가방: ${G.Items.label(it)}` }); }
  };
  R.refreshEquip = function (p) {
    const mods = {}; for (const k of ['w', 'a', 't']) { const it = p.equipped && p.equipped[k]; if (!it) continue; const m = G.Items.effMods(it); for (const key in m) mods[key] = (mods[key] || 0) + m[key]; }
    p.meta.mods = mods; S.recalc(p);
  };

  // ───── 업데이트
  R.update = function (run, inputs, dt) {
    if (run.finished) return;
    run.time += dt;
    if (run.vote) { run.vote.timer -= dt; if (run.ov && run.ov.type === 'vote') run.ov.timer = Math.max(0, Math.ceil(run.vote.timer)); if (run.vote.timer <= 0) R.resolveVoteTie(run); }
    if (run.phase === 'pick' && run.pick) { run.ovT -= dt; run.ov.timer = Math.max(0, Math.ceil(run.ovT)); if (run.ovT <= 0) { for (const p of R.active(run)) if (run.pick.picked[p.slot] === undefined) { const o = run.pick.offers[p.slot]; R.doPick(run, p.slot, o && o.length ? o[0].id : null); } } }
    if (run.phase === 'shop') { run.ovT -= dt; run.ov.timer = Math.max(0, Math.ceil(run.ovT)); if (run.ovT <= 0) R.endShop(run); }
    if (run.roll) { run.roll.timer -= dt; run.rollOv.timer = Math.max(0, Math.ceil(run.roll.timer)); if (run.roll.timer <= 0) R.resolveRoll(run); }
    if (run.phase === 'combat' && run.sim) {
      const sim = run.sim;
      if (run.ov && run.ov.type === 'bossIntro') { run.ovT -= dt; run.ov.timer = run.ovT; if (run.ovT <= 0) { run.ov = null; sim.paused = false; } return; }
      S.update(sim, inputs, dt);
      for (const ev of S.drain(sim)) R.onSimEvent(run, ev);
      if (sim.cleared && run.phase === 'combat') { run.clearT = (run.clearT || 0) + dt; if (run.clearT >= C.EXIT_AUTO && run.nodeType !== 'treasure') R.nodeDone(run); if (run.nodeType === 'treasure' && run.clearT >= 20) R.nodeDone(run); }
      for (const p of run.party) if (p && p.drunk > 0) p.drunk -= dt;
    }
    if (run.phase === 'results' && run.ov) { run.ovT -= dt; }
  };
  R.onSimEvent = function (run, ev) {
    const sim = run.sim;
    if (ev.t === 'exit') { if (run.nodeType === 'treasure' || sim.cleared) R.nodeDone(run); }
    else if (ev.t === 'wipe') { run.wiped = true; R.finish(run); }
    else if (ev.t === 'bossDead') { sim.bossDead = true; run.bossesKilled.push(ev.id); run.earned.ash += C.ASH_PER_BOSS; run.earned.soul += C.SOUL_PER_BOSS; run.earned.xp += C.XP_PER_BOSS; run.events.push({ t: 'codex', kind: 'bosses', id: ev.id }); run.events.push({ t: 'bossKill', id: ev.id }); R.dropEquip(run, run.party.find(Boolean), { boss: true, rarity: Math.min(3, 1 + Math.floor(run.rng() * (2 + (run.depth >= 5 ? 1 : 0)))) }); for (let i = 0; i < 8; i++) S.addPickup(sim, 'gold', ev.x, ev.y, Math.round(run.rng.range(C.GOLD_PER_BOSS[0], C.GOLD_PER_BOSS[1]) / 8)); run.pendingBossRelic = true; for (const e of sim.ents) if (e.kind === 'e' && !e.dead) S.kill(sim, e, {}); }
    else if (ev.t === 'kill') { run.events.push({ t: 'codex', kind: 'enemies', id: ev.type }); if (ev.elite) run.earned.soul += C.SOUL_PER_ELITE; }
    else if (ev.t === 'loot') { if (ev.kind === 'equip') R.dropEquip(run, run.party[ev.slot], {}); else if (ev.kind === 'relic') { const p = run.party[ev.slot]; const r = R.randomRelic(run); if (r && p) { R.giveRelic(run, p, r.id); run.events.push({ t: 'chat', s: `🔮 ${p.name}: 유물 「${r.name}」` }); } } }
    else if (ev.t === 'chest') { if (sim.chestLimit) { sim.chestLimit--; if (sim.chestLimit <= 0) for (const o of sim.ents) if (o.kind === 'o' && o.type === 'chest' && o.st !== 'open') { o.st = 'open'; o.nm = '닫힘'; } } }
    else if (ev.t === 'down') { run.lastDownBy = ev.by; run.downOrder.push(ev.slot); run.events.push({ t: 'chat', s: `💀 ${run.party[ev.slot].name} 다운${ev.by ? ' (' + ev.by + ')' : ''}` }); }
    else if (ev.t === 'dead') { run.events.push({ t: 'chat', s: `☠️ ${run.party[ev.slot].name} 사망 — 유령으로 응원 가능 (F)` }); }
    else if (ev.t === 'station') run.events.push(ev);
    else if (ev.t === 'wallHit') {}
    else if (ev.t === 'mimic') run.events.push({ t: 'chat', s: '👅 미믹이었다!' });
    else if (ev.t === 'allIn') run.events.push({ t: 'chat', s: '🔥 총공세! 파티 공격력 +20%' });
  };
  R.nodeDone = function (run) {
    const sim = run.sim; if (!sim) return;
    run.clearT = 0;
    const type = run.nodeType;
    // 노드 보상
    run.earned.ash += C.ASH_PER_NODE; run.earned.xp += C.XP_PER_NODE;
    if (type === 'fight' || type === 'elite') { const g = type === 'elite' ? C.GOLD_PER_ELITE : C.GOLD_PER_FIGHT; for (const p of run.party) if (p && !p.ghost) { p.gold += Math.round(run.rng.range(g[0], g[1]) * (1 + (p.st.gold || 0))); } if (type === 'elite') { const p = run.party.find(q => q && !q.ghost); const r = R.randomRelic(run); if (r && p) { run.events.push({ t: 'relicPickup', id: r.id }); run.pendingRelicAll = r; } if (run.rng.chance(C.DROP_EQUIP.elite)) R.dropEquip(run, run.party.find(Boolean), {}); } }
    if (run.afterFight) { const af = run.afterFight; run.afterFight = null; if (af.relic) { const p = run.party.find(q => q && !q.ghost); const r = R.randomRelic(run); if (r && p) R.giveRelic(run, p, r.id); } }
    if (run.trialActive) { const p = run.party.find(q => q && !q.ghost); const r = R.randomRelic(run, { rarityMin: 1 }); if (r && p) R.giveRelic(run, p, r.id); for (const q of run.party) if (q) q.gold += 150; run.curses = run.curses.filter(c => c !== 'noPotion_trial'); run.trialActive = null; run.events.push({ t: 'chat', s: '🏆 시련 성공! 희귀 유물 + 금화 150' }); }
    if (run.pendingRelicAll) { // 정예 유물: 첫 번째 산 사람 → 간단히 가장 금화 적은 사람? → 투표 대신 라운드로빈
      run.relicRR = ((run.relicRR || 0) + 1) % 3; const order = run.party.filter(Boolean); const p = order[run.relicRR % order.length]; R.giveRelic(run, p, run.pendingRelicAll.id); run.events.push({ t: 'chat', s: `🔮 ${p.name}: 정예 유물 「${run.pendingRelicAll.name}」` }); run.pendingRelicAll = null;
    }
    // 노드 끝: 살아남은 사람 상태 정리
    for (const p of run.party) if (p) { S.removeEnt(sim, p); if (p.down) { p.down = null; p.hp = Math.max(1, Math.round(p.maxHp * 0.3)); } p.status = {}; p.buffs = p.buffs.filter(b => b.run); p.held = null; p.channel = null; p.shield = 0; p.reviving = null; p.reviveProg = 0; }
    run.sim = null;
    if (type === 'boss') { run.pendingBossRelic = true; R.startCards(run); return; }
    if (type === 'treasure') { R.toMap(run); return; }
    R.startCards(run);
  };
  R.finish = function (run) {
    if (run.finished) return;
    run.finished = true; run.phase = 'results'; run.sim = null; run.musicWanted = run.wiped ? 'none' : 'hall';
    for (const p of run.party) if (p) p.stats.goldLeft = p.gold;
    const res = G.Results.compute(run, run.party);
    run.results = res;
    run.ov = { type: 'results', res, names: run.party.map(p => p ? p.name : null), classes: run.party.map(p => p ? p.cls : null) };
    run.events.push({ t: 'finished', res });
  };

  // ───── RPC (참가자/방장 공용 액션)
  R.rpc = function (run, slot, name, args) {
    const p = run.party[slot]; if (!p && name !== 'vote') return;
    if (name === 'vote') R.castVote(run, slot, args[0]);
    else if (name === 'pick') R.doPick(run, slot, args[0]);
    else if (name === 'buy') R.buy(run, slot, args[0]);
    else if (name === 'shopDone') R.shopDone(run, slot);
    else if (name === 'roll') R.rollChoice(run, slot, args[0]);
    else if (name === 'emote') { p.emote = args[0]; p.emoteT = 2.5; }
    else if (name === 'lastWords') { run.lastWords[slot] = args[0]; }
  };
  R.addPlayer = function (run, p) { run.joinQueue.push(p); if (run.phase === 'map' && run.vote) { R.flushJoin(run); } };
  R.removePlayer = function (run, slot) { const p = run.party[slot]; if (!p) return; p.connected = false; if (run.sim) { p.afk = true; p.inv = 999; } };
  R.reconnect = function (run, slot, meta) { const p = run.party[slot]; if (!p) return null; p.connected = true; p.afk = false; p.inv = 1; return p; };

  // ───── 뷰 (방장 → 참가자, 방장 자신도 사용)
  R.view = function (run) {
    const v = run.sim ? S.view(run.sim) : { ents: [], amb: 0, hud: {}, pl: run.party.map(p => p ? S.playerHud(p) : null), mode: 'none' };
    v.phase = run.phase; v.ov = run.ov; v.roll = run.rollOv || null;
    v.region = Math.min(4, run.regionIdx + 1); v.depth = run.depth; v.nodesDone = run.nodesDone; v.earned = run.earned; v.curses = run.curses; v.mode = run.mode;
    v.drunk = run.party.map(p => p && p.drunk > 0 ? 1 : 0);
    if (run.phase === 'map' || run.phase === 'event' || run.phase === 'fire' || run.phase === 'return' || run.phase === 'shop' || run.phase === 'pick') v.map = { region: v.region, cols: run.nodeMap ? run.nodeMap.cols.map(c => c.map(n => ({ id: n.id, type: n.type, next: n.next, x: n.x, y: n.y }))) : [], cur: run.curNode, done: run.visited || [] };
    if (run.sim) v.mapSeed = run.sim.map.seed; v.mapBoss = run.sim ? !!run.sim.map.bossSpawn : false; v.mapRooms = run.sim ? run.sim.map.rooms.length : 0; v.mapKind = run.sim ? (run.sim.mode === 'explore' ? 'treasure' : run.sim.map.bossSpawn ? 'boss' : 'arena') : '';
    v.bossId = run.bossId || null;
    return v;
  };
  // 이어하기용 스냅샷 (노드 시작 시점)
  R.snapshot = function (run) {
    return { seed: run.seed, depth: run.depth, curses: run.curses, mode: run.mode, regionLimit: run.regionLimit, regionIdx: run.regionIdx, curNode: run.curNode, nodesDone: run.nodesDone, earned: run.earned, confirmed: run.confirmed, bossesKilled: run.bossesKilled, time: run.time, relicsTaken: Array.from(run.relicsTaken), seenEvents: run.seenEvents || [], endlessLoop: run.endlessLoop, rushIdx: run.rushIdx, flags: run.flags, downOrder: run.downOrder, rngState: run.rng.state(),
      party: run.party.map(p => p ? R.serializePlayer(p) : null), ts: Date.now() };
  };
  R.serializePlayer = p => ({ slot: p.slot, cls: p.cls, name: p.name, hp: p.hp, maxHp: p.maxHp, morale: p.morale, gold: p.gold, potions: p.potions, items: p.items, relics: p.relics, cards: p.cards, runBuffs: p.runBuffs, ghost: p.ghost, stats: p.stats, equipped: p.equipped || null, bag: p.bag || [], relicUp: p.relicUp || {}, secondWindUsed: p.secondWindUsed, meta: p.meta, guild: p.guild });
  R.restore = function (snap, players) {
    const run = R.create({ seed: snap.seed, depth: snap.depth, curses: snap.curses, mode: snap.mode, regionLimit: snap.regionLimit, party: [] });
    Object.assign(run, { regionIdx: snap.regionIdx, curNode: snap.curNode, nodesDone: snap.nodesDone, earned: snap.earned, confirmed: snap.confirmed, bossesKilled: snap.bossesKilled, time: snap.time, relicsTaken: new Set(snap.relicsTaken), seenEvents: snap.seenEvents, endlessLoop: snap.endlessLoop || 0, rushIdx: snap.rushIdx || 0, flags: snap.flags || {}, downOrder: snap.downOrder || [] });
    run.rng = U.RNG(snap.rngState || snap.seed);
    for (const sp of snap.party) { if (!sp) continue; const p = players[sp.slot]; if (!p) continue; R.restorePlayer(p, sp); run.party[p.slot] = p; R.applyRunCurses(run, p); }
    run.vote = null; run.ov = null;
    run.nodeMap = W.genNodeMap(run.seed + run.endlessLoop * 101, Math.min(4, run.regionIdx + 1), { noShop: run.curses.includes('noShop'), eliteMore: run.curses.includes('eliteMore') });
    if (run.mode === 'rush') { run.rushIdx = Math.max(0, run.rushIdx - 1); R.startRushBoss(run); } else R.toMap(run);
    return run;
  };
  R.restorePlayer = function (p, sp) {
    Object.assign(p, { hp: sp.hp, morale: sp.morale, gold: sp.gold, potions: sp.potions, items: sp.items, relics: sp.relics, cards: sp.cards, runBuffs: sp.runBuffs, ghost: sp.ghost, dead: sp.ghost, stats: sp.stats, equipped: sp.equipped, bag: sp.bag, relicUp: sp.relicUp, secondWindUsed: sp.secondWindUsed });
    if (sp.equipped) R.refreshEquip(p); else S.recalc(p);
    p.hp = Math.min(p.hp, p.maxHp);
  };
  return R;
})();
