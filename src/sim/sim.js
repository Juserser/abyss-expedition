// 시뮬레이션 (방장 권위): 엔티티, 이동, 전투 파이프라인, 웨이브, 픽업, 오브젝트, 뷰
G.Sim = (function () {
  const S = {};
  const C = G.C, U = G.U, W = G.World, St = G.St, TL = G.TL, T = C.TILE;

  // ───── 생성
  S.create = function (o) {
    const sim = {
      map: o.map, region: o.region || 1, depth: o.depth || 1, curses: o.curses || [], mode: o.mode || 'combat',
      nPlayers: o.nPlayers || 3, rng: U.RNG(o.seed || U.seed()), seed: o.seed,
      ents: [], byId: new Map(), players: [null, null, null], nextId: 1, time: 0, tick: 0,
      waves: o.waves || [], waveIdx: 0, cleared: false, clearedT: 0, started: false, startT: 1.0,
      events: [], corpses: [], partyDef: 0, partyInv: 0, allIn: 0, ultTimes: {}, timeLimit: o.timeLimit || 0,
      boss: null, bossWeak: o.bossWeak || 0, nextOil: o.nextOil, nextFire: o.nextFire, nextWet: o.nextWet,
      revivesUsed: 0, paused: false, frozen: false, hitstop: 0, trial: o.trial || null, lightMul: o.curses && o.curses.includes('darkness') ? 0.5 : 1,
      runFlags: o.runFlags || {}, dummies: {},
    };
    sim.scale = C.SCALE[Math.max(1, Math.min(3, sim.nPlayers))];
    for (const ob of sim.map.objs || []) S.addObj(sim, ob.t, ob.x, ob.y, ob);
    if (sim.mode === 'hall') { sim.started = true; sim.startT = 0; }
    return sim;
  };
  S.addEnt = function (sim, e) { e.id = sim.nextId++; sim.ents.push(e); sim.byId.set(e.id, e); return e; };
  S.removeEnt = function (sim, e) { e.removed = true; sim.byId.delete(e.id); const i = sim.ents.indexOf(e); if (i >= 0) sim.ents.splice(i, 1); };

  // ───── 플레이어 (런 동안 유지되는 객체)
  S.makePlayer = function (d) {
    const cls = G.CLASSES[d.cls];
    const p = {
      kind: 'p', id: 0, slot: d.slot, cls: d.cls, name: d.name, x: 0, y: 0, r: 5, dir: 1, aim: 0, vx: 0, vy: 0, team: 'p',
      hp: 1, maxHp: 1, shield: 0, morale: d.morale || 0, gold: d.gold || 0, potions: d.potions != null ? d.potions : 1,
      items: { key: 0, bomb: 0, soulstone: 0, totem: 0 }, relics: [], cards: [], runBuffs: {}, flags: {}, sk: {}, hooks: [], tal: {},
      meta: d.meta || { lv: 1, talents: [], mods: {} }, guild: d.guild || {}, hat: !!d.hat,
      cd: { q: 0, e: 0 }, qHold: false, charge: 0, combo: 0, counter: 0, ammo: 6, reloading: 0, form: null, traps: 2, summons: [], swing: 0,
      status: {}, buffs: [], down: null, ghost: false, dead: false, reviveProg: 0, reviving: null, roll: null, rollCd: 0, inv: 0, stun: 0, atkT: 0, cheerCd: 0, cheerT: 0,
      prevN: null, input: G.In.EMPTY, lastIn: G.In.EMPTY, emote: '', emoteT: 0, connected: true, afk: false,
      stats: { dmg: 0, heal: 0, tank: 0, downs: 0, deaths: 0, rolls: 0, wallHits: 0, fireSteps: 0, reacts: 0, revives: 0, kills: 0, goldPicked: 0, goldSpent: 0, needAbuse: 0, voteWins: 0, votes: 0, ults: 0, cheers: 0, potionsUsed: 0, goldLeft: 0 },
      secondWindUsed: false, fightSW: false, guardianAngelUsed: false, decoy: null, lastDownT: -99,
    };
    p.hasHook = t => p.hooks.some(h => h.type === t);
    p.hook = t => p.hooks.find(h => h.type === t);
    S.recalc(p);
    p.hp = p.maxHp;
    return p;
  };
  // 스탯 재계산: 직업 기본 + 메타(특성/장비/길드) + 유물 + 카드 + 런 버프
  S.recalc = function (p) {
    const cls = G.CLASSES[p.cls];
    const st = { atk: cls.atk, maxHp: cls.hp, spd: cls.spd, def: cls.def, cdr: 0, crit: C.CRIT_BASE, critDmg: C.CRIT_DMG, luck: 0, gold: 0, heal: 0, healTaken: 0, aspd: cls.aspd, range: cls.range, morale: 0, potion: 0, react: 0, rollCd: 0, summon: 0, statusRes: 0, discount: 0, reviveSpd: 0 };
    const mul = { atk: 0, hp: 0, spd: 0, aspd: 0, range: 0, hpFlat: 0 };
    const add = (m, k) => { if (!m) return; for (const key in m) { const v = m[key] * (k || 1); if (key === 'atk' || key === 'hp' || key === 'spd' || key === 'aspd' || key === 'range' || key === 'hpFlat') mul[key] += v; else if (key in st) st[key] += v; } };
    p.hooks = []; p.flags = {}; p.sk = {}; p.tal = {};
    // 특성
    const tals = G.META.TALENTS[p.cls] || [];
    for (const id of (p.meta.talents || [])) { const [b, i] = id.split('.').map(Number); const t = tals[b] && tals[b].t[i]; if (t) { add(t.mods); if (t.flag) p.tal[t.flag] = true; } }
    // 장비
    add(p.meta.mods);
    // 길드 버프
    if (p.guild) { add({ hp: p.guild.hp || 0, def: p.guild.def || 0, gold: p.guild.gold || 0, luck: p.guild.luck || 0, reviveSpd: p.guild.reviveSpd || 0 }); }
    // 유물
    for (const id of p.relics) { const r = G.RELIC_BY[id]; if (!r) continue; add(r.mods); if (r.h) p.hooks.push(r.h); }
    // 카드
    for (const id of p.cards) { const c = G.CARD_BY[id]; if (!c) continue; add(c.mods); if (c.h) p.hooks.push(c.h); if (c.flag) p.flags[c.flag] = true; if (c.sk) for (const k in c.sk) p.sk[k] = (p.sk[k] || 0) + c.sk[k]; }
    // 런 버프
    add(p.runBuffs);
    // 드루이드 형태
    if (p.cls === 'druid') {
      const all = p.flags.avatar;
      if (p.form === 'bear' || all) mul.hp += p.flags.bear80 ? 0.8 : 0.4;
      if (p.form === 'wolf' || all) mul.spd += 0.3;
      if (p.form === 'bear') { mul.atk += 0.1; } if (p.form === 'wolf') { mul.aspd += 0.6; mul.atk -= 0.3; }
    }
    st.atk = cls.atk * (1 + mul.atk);
    st.maxHp = Math.round(cls.hp * (1 + mul.hp) + mul.hpFlat);
    if (p.curseLessHp) st.maxHp = Math.round(st.maxHp * 0.75);
    st.spd = cls.spd * (1 + mul.spd);
    st.aspd = cls.aspd * (1 + mul.aspd);
    st.range = cls.range * (1 + mul.range);
    st.def = U.clamp(st.def, -0.5, 0.75);
    st.cdr = Math.min(0.6, st.cdr);
    st.crit = Math.min(1, st.crit);
    const ratio = p.maxHp > 0 ? p.hp / p.maxHp : 1;
    p.maxHp = st.maxHp; p.hp = Math.min(p.maxHp, Math.max(0, Math.round(ratio * p.maxHp)));
    if (p.hp === 0 && !p.down && !p.ghost) p.hp = 1;
    p.st = st;
    p.skMul = k => 1 + (p.sk[k] || 0);
  };
  S.skParam = (p, k, base) => base * (1 + (p.sk[k] || 0));
  S.cdOf = (p, base) => base * (1 - p.st.cdr);
  // 동적 스탯 (저체력 등)
  S.atkMul = function (p) {
    let m = 1;
    const lost = 1 - p.hp / p.maxHp;
    if (p.cls === 'berserker') m += Math.min(p.flags.blood60 ? 0.6 : 0.36, Math.floor(lost * 10) * (0.04 + (p.tal.blood5 ? 0.005 : 0)));
    for (const h of p.hooks) if (h.type === 'lowHp' && p.hp / p.maxHp <= h.th) m += h.atk || 0;
    for (const b of p.buffs) if (b.stat === 'atk') m += b.v;
    if (p.frenzy > 0) m += p.frenzyAtk || 0;
    return m;
  };
  S.defMul = function (p, sim) {
    let d = p.st.def + (p.auraDef || 0);
    for (const h of p.hooks) if (h.type === 'lowHp' && p.hp / p.maxHp <= h.th) d += h.def || 0;
    for (const b of p.buffs) if (b.stat === 'def') d += b.v;
    if (p.flags.boneArmor) d += 0.04 * p.summons.filter(s => !s.dead).length;
    if (p.tal.cmdAura) d += 0;
    return U.clamp(d, -0.5, 0.8);
  };
  S.aspdMul = function (p) { let m = p.st.aspd; for (const b of p.buffs) if (b.stat === 'aspd') m *= 1 + b.v; if (p.frenzy > 0) m *= 1.5; if (p.rollHaste > 0) m *= 1.6; return m; };
  S.spdMul = function (p) { let m = 1; for (const b of p.buffs) if (b.stat === 'spd') m += b.v; if (p.status.stealth && p.tal.stealthSpd) m += 0.4; if (p.cls === 'berserker' && p.hp / p.maxHp <= 0.3) m += 0.15; return m; };
  S.addBuff = function (p, stat, v, t, id) { if (id) { const b = p.buffs.find(x => x.id === id); if (b) { b.v = Math.max(b.v, v); b.t = Math.max(b.t, t); return; } } p.buffs.push({ stat, v, t, id }); };

  S.enterMap = function (sim, p, i) {
    const sp = sim.map.spawn;
    const n = sim.players.filter(Boolean).length;
    p.x = sp.x + (i - 1) * 14; p.y = sp.y + (i % 2) * 10;
    p.vx = p.vy = 0; p.roll = null; p.inv = 0; p.reviveProg = 0; p.reviving = null; p.charge = 0; p.combo = 0; p.qHold = false; p.swing = 0;
    p.summons = []; p.traps = p.flags.trap3 ? 3 : 2; if (p.tal.trapPlus1) p.traps++; p.ammo = p.flags.mag9 ? 9 : 6; p.reloading = 0; p.fightSW = false; p.decoy = null; p.frenzy = 0; p.rollHaste = 0;
    p.cd.q = Math.min(p.cd.q, 2); p.cd.e = Math.min(p.cd.e, 3);
    p.status = {}; p.buffs = p.buffs.filter(b => b.run);
    if (p.ghost) { p.dead = true; }
    if (p.down) { p.down = null; p.hp = Math.max(1, Math.round(p.maxHp * 0.3)); }
    S.addEnt(sim, p); sim.players[p.slot] = p;
    for (const h of p.hooks) if (h.type === 'startShield' && sim.mode !== 'hall') p.shield = Math.max(p.shield, p.maxHp * h.val);
    return p;
  };
  S.removePlayer = function (sim, p) { S.removeEnt(sim, p); sim.players[p.slot] = null; };
  S.alivePlayers = sim => sim.players.filter(p => p && !p.down && !p.ghost);
  S.activePlayers = sim => sim.players.filter(p => p && !p.ghost);

  // ───── 적
  S.spawnEnemy = function (sim, type, x, y, o) {
    o = o || {};
    const d = G.ENEMIES[type]; if (!d) return null;
    const dm = 1 + (sim.depth - 1) * C.DEPTH_DMG, hm = 1 + (sim.depth - 1) * C.DEPTH_HP;
    const e = { kind: 'e', type, data: d, x, y, r: d.r, dir: -1, team: 'e', hp: 0, maxHp: 0, atk: d.atk * dm * sim.scale.dmg, spd: d.spd * (sim.curses.includes('fastEnemy') ? 1.3 : 1), status: {}, buffs: [], shield: 0,
      ai: { state: 'idle', t: 0, cd: 0 }, threat: {}, target: -1, affixes: o.affixes || [], elite: !!(o.affixes && o.affixes.length), boss: false, tg: null, flash: 0, spawnT: o.instant ? 0 : 0.9, wave: o.wave || 0, summon: !!o.summon, stealthCd: 0, noKnock: false, facing: Math.PI };
    e.maxHp = Math.round(d.hp * hm * sim.scale.hp * (o.hpMul || 1));
    if (e.affixes.includes('giant')) { e.maxHp = Math.round(e.maxHp * 2.5); e.r = Math.round(d.r * 1.3); e.noKnock = true; e.sz = 1.3; }
    if (e.elite) { e.maxHp = Math.round(e.maxHp * 1.4); e.atk *= 1.2; }
    e.hp = e.maxHp;
    if (sim.trial && sim.trial.enemyHp) e.maxHp = e.hp = Math.round(e.maxHp * sim.trial.enemyHp);
    if (d.p.group && !o.noGroup) { e.groupLeader = true; }
    S.addEnt(sim, e);
    G.fx('spawnRing', x, y);
    return e;
  };
  S.spawnGroup = function (sim, type, x, y, o) {
    const d = G.ENEMIES[type]; const n = d.p.group || 1; const out = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const e = S.spawnEnemy(sim, type, x + Math.cos(a) * 12, y + Math.sin(a) * 12, Object.assign({ noGroup: true }, o)); if (e) out.push(e); }
    return out;
  };
  S.spawnAt = function (sim, type, o) {
    const ps = S.alivePlayers(sim);
    let best = null, bd = -1;
    const pts = sim.map.spawns.length ? sim.map.spawns : [sim.map.spawn];
    for (const sp of sim.rng.shuffle(pts)) { let d = 1e9; for (const p of ps) d = Math.min(d, U.dist(sp.x, sp.y, p.x, p.y)); if (d > 90 && d < 260) { best = sp; break; } if (d > bd) { bd = d; best = sp; } }
    best = best || sim.map.spawn;
    const jx = sim.rng.range(-10, 10), jy = sim.rng.range(-10, 10);
    const d = G.ENEMIES[type];
    if (d && d.p.group) return S.spawnGroup(sim, type, best.x + jx, best.y + jy, o);
    const e = S.spawnEnemy(sim, type, best.x + jx, best.y + jy, o); return e ? [e] : [];
  };
  S.addObj = function (sim, t, x, y, extra) {
    const o = Object.assign({ kind: 'o', type: t, x, y, r: 8, st: '', nm: '', team: 'n' }, extra || {}); o.t = t;
    if (extra && extra.id != null) { o.sid = extra.id; delete o.id; }
    if (t === 'exit') o.nm = '출구';
    S.addEnt(sim, o); return o;
  };
  S.addPickup = function (sim, t, x, y, val) { const i = { kind: 'i', type: t, x, y, r: 4, val: val || 0, life: 90, vx: sim.rng.range(-30, 30), vy: sim.rng.range(-50, -20), z: 0 }; S.addEnt(sim, i); return i; };
  S.proj = function (sim, o) {
    const j = Object.assign({ kind: 'j', x: 0, y: 0, vx: 0, vy: 0, r: 3, team: 'p', dmg: 10, life: 1.6, pierce: 0, hit: new Set(), type: 'bolt', owner: null, slot: -1, elem: null, homing: 0, heavy: false, zone: null, explode: 0, tag: 'basic', bounce: 0 }, o);
    j.a = Math.atan2(j.vy, j.vx);
    S.addEnt(sim, j); return j;
  };
  S.zone = function (sim, o) {
    // 같은 자리 기름 + 불 → 점화
    if (o.elem === 'fire') S.ignite(sim, o.x, o.y, o.r, o.owner);
    const z = Object.assign({ kind: 'z', x: 0, y: 0, r: 24, elem: 'fire', life: 4, team: 'p', dps: 0, owner: null, tick: 0, touched: new Set() }, o);
    z.maxLife = z.life;
    S.addEnt(sim, z); return z;
  };
  S.ignite = function (sim, x, y, r, owner) {
    for (const z of sim.ents.slice()) {
      if (z.kind === 'z' && z.elem === 'oil' && !z.removed && U.dist(x, y, z.x, z.y) < r + z.r) {
        S.removeEnt(sim, z);
        S.explode(sim, z.x, z.y, z.r + 16, (owner && owner.kind === 'p' ? owner.st.atk : 12) * C.REACT.explode, { ent: owner, slot: owner ? owner.slot : -1, tag: 'react' }, 'n');
        S.zone(sim, { x: z.x, y: z.y, r: z.r + 8, elem: 'fire', life: 5, team: 'n', dps: (owner && owner.kind === 'p' ? owner.st.atk : 12) * 0.1, owner });
      }
    }
    // 기름 타일
    const T2 = T;
    for (let j = Math.floor((y - r) / T2); j <= Math.floor((y + r) / T2); j++) for (let i = Math.floor((x - r) / T2); i <= Math.floor((x + r) / T2); i++) {
      if (W.get(sim.map, i, j) === TL.OIL && U.dist(x, y, i * T2 + 8, j * T2 + 8) < r + 8) {
        W.set(sim.map, i, j, TL.FLOOR); sim.map.ver++; G.fx('tile', i, j, TL.FLOOR);
        S.explode(sim, i * T2 + 8, j * T2 + 8, 22, (owner && owner.kind === 'p' ? owner.st.atk : 12) * C.REACT.explode * 0.7, { ent: owner, slot: owner ? owner.slot : -1, tag: 'react' }, 'n');
        S.zone(sim, { x: i * T2 + 8, y: j * T2 + 8, r: 14, elem: 'fire', life: 4, team: 'n', dps: (owner && owner.kind === 'p' ? owner.st.atk : 12) * 0.1, owner });
      }
    }
  };
  S.explode = function (sim, x, y, r, dmg, src, team) {
    G.fx('boom', x, y, r, dmg > 60);
    G.fx('snd', dmg > 60 ? 'bigboom' : 'boom');
    for (const e of sim.ents.slice()) {
      if (e.removed || e.dead) continue;
      if (e.kind === 'e' || e.kind === 'm' || e.kind === 'p') {
        if (team === 'p' && e.kind === 'p') continue;
        if (team === 'e' && e.kind !== 'p') continue;
        if (e.kind === 'm' && team === 'p') continue;
        if (U.dist(x, y, e.x, e.y) < r + e.r) S.damage(sim, e, dmg, Object.assign({ knock: 40, color: '#ffb060' }, src));
      } else if (e.kind === 'o' && e.type === 'barrel' && U.dist(x, y, e.x, e.y) < r + 8) S.breakBarrel(sim, e, src && src.ent);
    }
    if (src && src.ent && src.ent.kind === 'p') { src.ent.stats.reacts++; }
  };
  S.breakBarrel = function (sim, o, who) { if (o.removed) return; S.removeEnt(sim, o); G.fx('burst', o.x, o.y - 4, 10, ['#5a4a3a', '#2a2a2a'], 50, 0.5); S.zone(sim, { x: o.x, y: o.y, r: 22, elem: 'oil', life: 30, team: 'n' }); };
  S.reaction = function (sim, e, name, dmg, radius, src, color) {
    G.fx('react', e.x, e.y - 8, name, color);
    G.fx('snd', 'react'); G.fx('hitstop', 0.08);
    if (radius > 0) S.explode(sim, e.x, e.y, radius, dmg, Object.assign({}, src, { tag: 'react' }), 'p');
    else S.damage(sim, e, dmg, Object.assign({}, src, { tag: 'react', color }));
    if (src && src.ent && src.ent.kind === 'p') {
      const p = src.ent; p.stats.reacts++; p.morale = Math.min(C.MORALE_MAX, p.morale + C.MORALE.react * (1 + p.st.morale) + (p.tal.reactMorale ? 3 : 0));
      if (p.flags.reactCd) { p.cd.q = Math.max(0, p.cd.q - 1.5); p.cd.e = Math.max(0, p.cd.e - 1.5); }
      if (p.tal.reactCd05) { p.cd.q = Math.max(0, p.cd.q - 0.5); p.cd.e = Math.max(0, p.cd.e - 0.5); }
      sim.events.push({ t: 'react', slot: p.slot });
    }
  };
  S.chain = function (sim, from, dmg, src, n) {
    let cur = from; const done = new Set([from.id]);
    for (let i = 0; i < n; i++) {
      let best = null, bd = 60;
      for (const e of sim.ents) if ((e.kind === 'e') && !e.dead && !done.has(e.id)) { const d = U.dist(cur.x, cur.y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
      if (!best) break;
      G.fx('bolt', cur.x, cur.y - 6, best.x, best.y - 6);
      S.damage(sim, best, dmg, Object.assign({}, src, { elem: 'shock', tag: 'react', color: '#ffff80' }));
      St.add(sim, best, 'stun', { t: 0.3 });
      done.add(best.id); cur = best;
    }
  };
  S.nova = function (sim, x, y, r, p, elem) {
    G.fx('ring', x, y, 4, r, elem === 'ice' ? '#a0e0ff' : '#ffe080', 0.4);
    for (const e of sim.ents) if (e.kind === 'e' && !e.dead && U.dist(x, y, e.x, e.y) < r + e.r) { St.applyElem(sim, e, elem, { ent: p, slot: p.slot, tag: 'e' }); }
  };

  // ───── 위협 / 타겟
  S.threat = function (e, slot, v) { if (slot < 0 || !e.threat) return; e.threat[slot] = (e.threat[slot] || 0) + v; };
  S.pickTarget = function (sim, e) {
    const s = e.status;
    if (s.taunt) { const p = sim.players[s.taunt.slot]; if (p && !p.down && !p.ghost) return s.taunt.slot; }
    if (e.decoyTarget && !e.decoyTarget.removed) return -2;
    let best = -1, bv = -1;
    const totem = sim.ents.find(o => o.kind === 'o' && o.type === 'totem' && !o.removed && U.dist(o.x, o.y, e.x, e.y) < 120);
    if (totem) { e.totem = totem; return -3; }
    e.totem = null;
    for (const p of sim.players) {
      if (!p || p.down || p.ghost || p.status.stealth) continue;
      const d = U.dist(p.x, p.y, e.x, e.y);
      if (d > 14 * T && !(e.threat[p.slot] > 0)) continue;
      let v = (e.threat[p.slot] || 0) + Math.max(0, 200 - d);
      if (e.data.p.pref === 'heal' && (p.cls === 'priest' || p.cls === 'paladin')) v += 150;
      if (v > bv) { bv = v; best = p.slot; }
    }
    return best;
  };
  S.targetPos = function (sim, e) {
    if (e.target === -2 && e.decoyTarget) return e.decoyTarget;
    if (e.target === -3 && e.totem) return e.totem;
    const p = sim.players[e.target]; return p && !p.down && !p.ghost ? p : null;
  };

  // ───── 피해 파이프라인
  // src: { ent, slot, tag, elem, heavy, back, noKnock, knock, noFlash, color, crit, x, y, melee, mult }
  S.damage = function (sim, tgt, amount, src) {
    src = src || {};
    if (!tgt || tgt.dead || tgt.removed) return 0;
    if (tgt.kind === 'p') return S.hurtPlayer(sim, tgt, amount, src);
    if (tgt.kind === 'o') { if (tgt.type === 'dummy') { S.dummyHit(sim, tgt, amount, src); } else if (tgt.type === 'barrel') S.breakBarrel(sim, tgt, src.ent); return amount; }
    if (tgt.spawnT > 0) return 0;
    const a = src.ent, isP = a && a.kind === 'p';
    let dmg = amount * (src.mult || 1);
    let crit = !!src.crit;
    if (isP) {
      dmg *= S.atkMul(a) / (src.tag === 'dot' ? 1 : 1);
      if (src.tag === 'summon' || src.tag === 'trap') dmg *= 1 + (a.st.summon || 0);
      if (src.tag !== 'dot' && src.tag !== 'react') {
        let cc = a.st.crit;
        if (src.back && a.cls === 'rogue') cc += 0.5;
        if (tgt.status.marked && a.hasHook('markCrit')) cc += a.hook('markCrit').val;
        if (src.critBonus) cc += src.critBonus;
        if (sim.rng.chance(cc)) crit = true;
        if (crit) dmg *= a.st.critDmg;
      }
      if (src.back) dmg *= 1 + (a.flags.backstab30 ? 0.3 : 0) + (a.tal.back15 ? 0.15 : 0);
      if (tgt.status.marked) { let b = tgt.status.marked.bonus; const m = tgt.status.marked.src; if (m && m.flags && m.flags.mark35) b += 0.1; if (m && m.tal && m.tal.mark30) b += 0.05; dmg *= 1 + b; }
      else if (sim.curses.includes('markOnly') && (tgt.elite || tgt.boss)) dmg *= 0.6;
      if (tgt.status.taunt && tgt.status.taunt.slot === a.slot) { dmg *= 1.1; if (a.flags.tauntDmg) dmg *= 1.4; if (a.tal.tauntDmg10) dmg *= 1.1; }
      if (tgt.status.frozen && a.tal.frozenDmg) dmg *= 1.2;
      for (const h of a.hooks) {
        if (h.type === 'execute' && tgt.hp / tgt.maxHp <= h.th) dmg *= 1 + h.val;
        if (h.type === 'firstHit' && tgt.hp >= tgt.maxHp) dmg *= 1 + h.val;
      }
      if (a.cls === 'priest' && tgt.data.tags && tgt.data.tags.includes('undead') && (src.tag === 'basic')) { if (a.flags.smite) dmg *= 3; else if (a.tal.smite50) dmg *= 1.5; if (tgt.data.tags.includes('holyweak')) dmg *= 2; }
      if (a.healToDmg > 0 && src.tag === 'basic') { dmg += a.healToDmg; a.healToDmg = 0; }
      if (sim.allIn > 0) dmg *= 1 + C.ALL_IN_BONUS * (a.hasHook('allIn2') ? 2 : 1);
    }
    // 정면 면역
    if (tgt.data && tgt.data.p && tgt.data.p.front && src.tag !== 'dot' && src.tag !== 'react') {
      const sx = src.x != null ? src.x : (a ? a.x : tgt.x), sy = src.y != null ? src.y : (a ? a.y : tgt.y);
      const ang = Math.atan2(sy - tgt.y, sx - tgt.x);
      const arc = tgt.boss ? 1.3 : 1.05;
      if (Math.abs(U.angDiff(tgt.facing, ang)) < arc) { if (!(tgt.blockT > sim.time)) { tgt.blockT = sim.time + 0.6; G.fx('txt', tgt.x, tgt.y - 14, '정면 막힘', '#aaa', 6); G.fx('snd', 'block'); } return 0; }
    }
    if (tgt.invuln > 0) { G.fx('txt', tgt.x, tgt.y - 14, '무적', '#aaa', 6); return 0; }
    if (tgt.dmgMul) dmg *= tgt.dmgMul;
    dmg = Math.max(1, Math.round(dmg));
    // 보호막
    if (tgt.shield > 0) { const ab = Math.min(tgt.shield, dmg); tgt.shield -= ab; dmg -= ab; if (dmg <= 0) { G.fx('txt', tgt.x, tgt.y - 14, '흡수', '#c0a0ff', 6); return 0; } }
    tgt.hp -= dmg;
    if (!src.noFlash) tgt.flash = 0.08;
    G.fx('dmg', tgt.x, tgt.y - 10, dmg, crit ? 1 : 0, src.color);
    if (crit) { G.fx('snd', 'crit'); G.fx('hitstop', 0.04); } else if (src.tag !== 'dot') G.fx('snd', 'hit');
    if (!src.noKnock && !tgt.noKnock && !tgt.boss && src.tag !== 'dot') {
      const kx = src.x != null ? src.x : (a ? a.x : tgt.x), ky = src.y != null ? src.y : (a ? a.y : tgt.y);
      const ang = Math.atan2(tgt.y - ky, tgt.x - kx); const k = src.knock || 14;
      tgt.kx = (tgt.kx || 0) + Math.cos(ang) * k; tgt.ky = (tgt.ky || 0) + Math.sin(ang) * k;
    }
    if (isP) {
      a.stats.dmg += dmg;
      a.morale = Math.min(C.MORALE_MAX, a.morale + dmg * C.MORALE.dmg * (1 + a.st.morale));
      S.threat(tgt, a.slot, dmg * C.THREAT.dmg * (src.threatMul || 1));
      for (const h of a.hooks) {
        if (h.type === 'lifesteal' && src.tag !== 'dot') S.heal(sim, a, dmg * h.val, a, { quiet: true });
        if (h.type === 'critFreeze' && crit) St.add(sim, tgt, 'frozen', { t: h.dur });
        if (h.type === 'elemBasic' && src.tag === 'basic' && !src.noElemHook) { const ch = h.chance * (a.hasHook('elemChance2') ? 2 : 1); if (sim.rng.chance(ch)) St.applyElem(sim, tgt, h.elem, { ent: a, slot: a.slot, tag: 'hook' }); }
      }
      if (a.frenzy > 0 && a.flags.frenzyLs) S.heal(sim, a, dmg * 0.2, a, { quiet: true });
      if (a.frenzy > 0 && a.flags.frenzyLong && src.tag === 'basic') { a.cd.q = Math.max(0, a.cd.q - 0.3); a.cd.e = Math.max(0, a.cd.e - 0.3); }
      if (a.cls === 'knight' && src.tag === 'basic' && a.counter > 0) { const extra = Math.round(a.counter * (a.qHold && a.flags.counter2 ? 2 : 1)); a.counter = 0; if (extra > 0) { tgt.hp -= extra; G.fx('dmg', tgt.x + 4, tgt.y - 16, extra, 1, '#ffd36b'); a.stats.dmg += extra; } }
    } else if (a && a.kind === 'm' && a.owner != null) { const o = sim.players[a.owner]; if (o) { o.stats.dmg += dmg; S.threat(tgt, o.slot, dmg * 0.3); } if (tgt.threat) tgt.summonThreat = (tgt.summonThreat || 0) + dmg; }
    // 흡혈 접두어
    if (tgt.affixes && tgt.affixes.includes('vampiric') && false) {}
    if (tgt.hp <= 0) S.kill(sim, tgt, src);
    else if (tgt.kind === 'e') { if (tgt.ai.state === 'idle') tgt.ai.state = 'chase'; if (a && a.kind === 'p' && tgt.target < 0) tgt.target = a.slot; }
    if (src.elem && tgt.hp > 0 && src.tag !== 'hook' && src.tag !== 'elem' && src.tag !== 'dot' && src.tag !== 'react') St.applyElem(sim, tgt, src.elem, { ent: a, slot: a ? a.slot : -1, tag: src.tag });
    if (src.heavy && tgt.hp > 0) St.applyElem(sim, tgt, 'heavy', { ent: a, slot: a ? a.slot : -1, tag: src.tag });
    return dmg;
  };
  S.kill = function (sim, e, src) {
    if (e.dead) return;
    e.dead = true; e.deadT = 0.35; e.tg = null;
    const a = src && src.ent, isP = a && a.kind === 'p';
    const killer = isP ? a : (a && a.kind === 'm' && a.owner != null ? sim.players[a.owner] : null);
    if (e.kind === 'm') { S.removeEnt(sim, e); const o = sim.players[e.owner]; if (o) { o.summons = o.summons.filter(s => s !== e); if (o.flags.skelBoom) S.explode(sim, e.x, e.y, 26, o.st.atk * 1.2, { ent: o, slot: o.slot, tag: 'summon' }, 'p'); } G.fx('burst', e.x, e.y - 6, 8, ['#e8e0d0', '#888'], 40, 0.5); return; }
    G.fx('die', e.x, e.y, e.boss ? 3 : 1);
    G.fx('snd', e.boss ? 'bossdie' : 'kill');
    sim.corpses.push({ x: e.x, y: e.y, t: 20 });
    if (!e.summon) sim.corpseObjs = sim.corpseObjs || [];
    const d = e.data;
    if (killer) {
      killer.stats.kills++;
      if (killer.hasHook('killMorale')) killer.morale = Math.min(C.MORALE_MAX, killer.morale + killer.hook('killMorale').val);
      if (killer.cls === 'necro') { killer.morale = Math.min(C.MORALE_MAX, killer.morale + (killer.flags.harvest6 ? 6 : 3)); if (killer.flags.autoRaise && sim.rng.chance(0.3)) G.Skills.raise(sim, killer, e.x, e.y); }
      if (e.status.marked && killer.tal.markKillMorale) killer.morale = Math.min(C.MORALE_MAX, killer.morale + 10);
      for (const h of killer.hooks) {
        if (h.type === 'killChain') S.chain(sim, e, killer.st.atk * h.dmg, { ent: killer, slot: killer.slot }, 2);
        if (h.type === 'killShield') killer.shield = Math.min(killer.maxHp * 0.5, killer.shield + killer.maxHp * h.val);
        if (h.type === 'killHeal') S.heal(sim, killer, killer.maxHp * h.val, killer, { quiet: true });
        if (h.type === 'burnSpread' && e.status.burn) S.zone(sim, { x: e.x, y: e.y, r: 22, elem: 'fire', life: 3, team: 'p', dps: killer.st.atk * 0.1, owner: killer });
      }
      if (src.tag === 'r' && killer.cls === 'rogue') { killer.morale = Math.min(C.MORALE_MAX, killer.morale + (killer.flags.chainKill ? 100 : 50)); G.fx('txt', killer.x, killer.y - 20, killer.flags.chainKill ? '연쇄 암살!' : '사기 환급', '#ffd36b', 7); }
    }
    // 죽을 때 효과
    if (d.p.onDeath === 'oil') S.zone(sim, { x: e.x, y: e.y, r: 20, elem: 'oil', life: 30, team: 'n' });
    if (d.p.bones && !e.noBones) S.addObj(sim, 'bones', e.x, e.y, { timer: d.p.bones, etype: e.type, affixes: e.affixes });
    if (e.affixes.includes('splitting') && !e.splitChild) { for (let i = 0; i < 2; i++) { const c = S.spawnEnemy(sim, e.type, e.x + (i ? 10 : -10), e.y, { instant: true, hpMul: 0.4, wave: e.wave }); if (c) { c.splitChild = true; c.sz = 0.8; } } }
    if (e.affixes.includes('burning')) S.zone(sim, { x: e.x, y: e.y, r: 22, elem: 'fire', life: 4, team: 'e', dps: e.atk * 0.1 });
    if (e.type === 'tentacle' && e.held) { const p = sim.players[e.held]; if (p) p.held = null; }
    if (e.boss) { sim.events.push({ t: 'bossDead', id: e.bossId, x: e.x, y: e.y }); sim.boss = null; G.fx('hitstop', 0.5); G.fx('shake', 8); }
    // 전리품
    const gold = e.boss ? 0 : Math.round((d.xp || 1) * sim.rng.range(4, 9) * (e.elite ? 2 : 1));
    for (let i = 0; i < Math.min(6, Math.ceil(gold / 8)); i++) S.addPickup(sim, 'gold', e.x, e.y, Math.ceil(gold / Math.min(6, Math.ceil(gold / 8))));
    if (!e.boss && !e.summon && sim.rng.chance(0.03 + (e.elite ? 0.12 : 0))) S.addPickup(sim, 'potion', e.x, e.y);
    sim.events.push({ t: 'kill', type: e.type, elite: e.elite, slot: killer ? killer.slot : -1, x: e.x, y: e.y });
  };
  S.hurtPlayer = function (sim, p, amount, src) {
    src = src || {};
    if (p.down || p.ghost || p.dead) return 0;
    if (p.inv > 0 || p.roll || sim.partyInv > 0) { if (p.roll) G.fx('txt', p.x, p.y - 16, '회피', '#aaa', 6); return 0; }
    if (p.status.stealth && src.tag !== 'dot') { delete p.status.stealth; }
    let dmg = amount;
    const a = src.ent;
    const ax = src.x != null ? src.x : (a ? a.x : p.x), ay = src.y != null ? src.y : (a ? a.y : p.y);
    const fromAng = Math.atan2(ay - p.y, ax - p.x);
    // 기사 방패
    if (p.qHold && p.cls === 'knight' && src.tag !== 'dot' && Math.abs(U.angDiff(p.aim, fromAng)) < Math.PI / 2) {
      const red = p.flags.shield90 ? 0.9 : p.tal.shield85 ? 0.85 : 0.8;
      const ab = dmg * red; dmg -= ab; p.stats.tank += Math.round(ab);
      p.morale = Math.min(C.MORALE_MAX, p.morale + C.MORALE.block * ab * (1 + p.st.morale));
      p.counter = Math.min(p.st.atk * (p.tal.counter150 ? 1.5 : 1), p.counter + ab * 0.15);
      G.fx('snd', 'block'); G.fx('txt', p.x, p.y - 18, '막음', '#c8ccd8', 6);
    } else {
      // 아군 기사 방패 뒤 보호
      for (const k of sim.players) {
        if (!k || k === p || k.cls !== 'knight' || !k.qHold || k.down || k.ghost) continue;
        if (U.dist(k.x, k.y, p.x, p.y) > 40) continue;
        const toAtk = Math.atan2(ay - k.y, ax - k.x);
        if (Math.abs(U.angDiff(k.aim, toAtk)) < Math.PI / 2 && Math.abs(U.angDiff(toAtk, Math.atan2(p.y - k.y, p.x - k.x))) > Math.PI / 2.2) { const ab = dmg * 0.8; dmg -= ab; k.stats.tank += Math.round(ab); k.morale = Math.min(C.MORALE_MAX, k.morale + C.MORALE.block * ab); G.fx('txt', k.x, k.y - 18, '보호', '#c8ccd8', 6); break; }
      }
      // 수호의 맹세 (k6)
      for (const k of sim.players) { if (k && k !== p && k.cls === 'knight' && k.flags.guardian && !k.down && !k.ghost && U.dist(k.x, k.y, p.x, p.y) < 32) { const sh = dmg * 0.2; dmg -= sh; const taken = Math.round(sh * (1 - S.defMul(k, sim))); k.hp -= taken; k.stats.tank += taken; G.fx('dmg', k.x, k.y - 10, taken, 2); if (k.hp <= 0) S.downPlayer(sim, k, src); break; } }
    }
    if (sim.partyDef > 0) dmg *= 1 - 0.5;
    let def = S.defMul(p, sim);
    if (p.tauntActive > 0 && p.hasHook('tauntDef')) def += p.hook('tauntDef').val;
    dmg *= 1 - U.clamp(def, -0.5, 0.8);
    if (p.cls === 'druid' && p.form === 'bear') dmg *= 0.8;
    if (p.frenzy > 0) { p.frenzyAtk = (p.frenzyAtk || 0) + 0.05; }
    dmg = Math.max(0, Math.round(dmg));
    if (p.shield > 0) { const ab = Math.min(p.shield, dmg); p.shield -= ab; dmg -= ab; p.stats.tank += ab; if (p.shield <= 0 && p.shieldBurst) { p.shieldBurst = false; S.explode(sim, p.x, p.y, 30, p.st.atk * 1.5, { ent: p, slot: p.slot, tag: 'e' }, 'p'); } }
    if (dmg <= 0) { if (src.tag !== 'dot') G.fx('txt', p.x, p.y - 16, '흡수', '#c0a0ff', 6); return 0; }
    if (p.frenzy > 0 && p.hp - dmg < 1) dmg = p.hp - 1;
    p.hp -= dmg; p.flash = 0.08;
    p.stats.taken = (p.stats.taken || 0) + dmg;
    if (p.cls === 'knight' || p.cls === 'paladin' || (p.cls === 'druid' && p.form === 'bear')) p.stats.tank += dmg;
    G.fx('dmg', p.x, p.y - 12, dmg, 2);
    G.fx('snd', 'hurt');
    if (p.slot === (sim.localSlot != null ? sim.localSlot : -1)) {}
    G.fx('shakeFor', p.slot, Math.min(4, dmg / 10));
    if (p.reviving) { p.reviving = null; }
    for (const h of p.hooks) {
      if (h.type === 'hurtRage') S.addBuff(p, 'atk', h.val, h.dur, 'rage');
      if (h.type === 'thorns' && src.melee && a && a.kind === 'e') S.damage(sim, a, p.st.atk * h.val, { ent: p, slot: p.slot, tag: 'e', noKnock: true, color: '#c0c0c0' });
    }
    if (a && a.kind === 'e') { if (a.affixes.includes('vampiric')) { a.hp = Math.min(a.maxHp, a.hp + dmg * 0.5); } if (a.affixes.includes('plague')) St.add(sim, p, 'poison', { dps: a.atk / 10, src: a }); if (a.affixes.includes('frost')) St.add(sim, p, 'slow', { t: 2, v: 0.35 }); if (a.data.p.drain) a.hp = Math.min(a.maxHp, a.hp + dmg * a.data.p.drain); }
    if (src.elem && p.hp > 0) St.applyElem(sim, p, src.elem, { ent: a, slot: -1, tag: 'e' });
    if (p.hp <= 0) S.downPlayer(sim, p, src);
    return dmg;
  };
  S.downPlayer = function (sim, p, src) {
    if (p.down || p.ghost) return;
    // 재기 / 불굴 / 수호 천사
    const sw = p.hook('secondWind');
    if (sw && !p.secondWindUsed) { p.secondWindUsed = true; p.hp = Math.round(p.maxHp * sw.val); p.inv = 1.5; G.fx('txt', p.x, p.y - 20, '재기!', '#ffd36b', 9); G.fx('snd', 'revive'); return; }
    const sf = p.hook('secondWindFight');
    if (sf && !p.fightSW) { p.fightSW = true; p.hp = Math.round(p.maxHp * sf.val); p.inv = 1.5; G.fx('txt', p.x, p.y - 20, '불굴!', '#ffd36b', 9); G.fx('snd', 'revive'); return; }
    if (p.tal.secondWindOnce && !p.secondWindUsed) { p.secondWindUsed = true; p.hp = Math.round(p.maxHp * 0.3); p.inv = 1.5; G.fx('txt', p.x, p.y - 20, '죽음 거부!', '#ffd36b', 9); return; }
    for (const k of sim.players) if (k && k !== p && k.cls === 'paladin' && k.flags.guardianAngel && !k.guardianAngelUsed && !k.down && !k.ghost) { k.guardianAngelUsed = true; p.hp = Math.round(p.maxHp * 0.3); p.inv = 2; G.fx('txt', p.x, p.y - 20, '수호 천사!', '#ffe080', 9); G.fx('snd', 'holy'); return; }
    p.hp = 0; p.qHold = false; p.charge = 0; p.reviving = null; p.frenzy = 0;
    let timer = sim.nPlayers <= 2 ? C.DOWN_TIMER_2P : C.DOWN_TIMER;
    timer += (p.guild && p.guild.downTimer) || 0;
    p.down = { t: timer, max: timer }; p.reviveProg = 0;
    p.stats.downs++; p.lastDownT = sim.time; delete p.status.stealth;
    G.fx('snd', 'down'); G.fx('txt', p.x, p.y - 20, '다운!', '#ff5050', 10);
    sim.events.push({ t: 'down', slot: p.slot, by: src && src.ent ? (src.ent.data ? src.ent.data.name : src.ent.name || '') : (src && src.cause) || '' });
    sim.downOrder = sim.downOrder || []; sim.downOrder.push(p.slot);
    if (sim.runFlags.oath) for (const k of sim.players) if (k && k !== p && !k.down && !k.ghost) S.addBuff(k, 'atk', 0.2, 999, 'oath');
    if (S.alivePlayers(sim).length === 0 && sim.mode !== 'hall') S.wipe(sim);
  };
  S.wipe = function (sim) {
    if (sim.wiped) return; sim.wiped = true;
    G.fx('snd', 'wipe');
    sim.events.push({ t: 'wipe' });
  };
  S.revivePlayer = function (sim, p, by, hpPct, o) {
    o = o || {};
    if (!p.down && !p.ghost) return;
    const wasGhost = p.ghost;
    if (wasGhost) for (const o of sim.ents.slice()) if (o.kind === 'o' && o.type === 'corpseP' && o.slot === p.slot) S.removeEnt(sim, o);
    p.down = null; p.ghost = false; p.dead = false; p.hp = Math.max(1, Math.round(p.maxHp * (hpPct || C.REVIVE_HP))); p.reviveProg = 0; p.inv = o.inv || 1;
    if (by && by.kind === 'p') {
      by.stats.revives++; by.morale = Math.min(C.MORALE_MAX, by.morale + C.MORALE.revive);
      for (const h of by.hooks) if (h.type === 'reviveInv') p.inv = Math.max(p.inv, h.val);
      if (by.tal.reviveInv3) p.inv = Math.max(p.inv, 3);
      if (by.hasHook('reviveMorale')) for (const k of sim.players) if (k) k.morale = Math.min(C.MORALE_MAX, k.morale + by.hook('reviveMorale').val);
    }
    for (const h of p.hooks) if (h.type === 'reviveInv') p.inv = Math.max(p.inv, h.val);
    sim.revivesUsed++;
    G.fx('snd', 'revive'); G.fx('revive', p.x, p.y); G.fx('txt', p.x, p.y - 20, wasGhost ? '귀환!' : '부활!', '#7fcf7a', 10);
    sim.events.push({ t: 'revive', slot: p.slot, by: by ? by.slot : -1 });
  };
  S.heal = function (sim, tgt, amount, src, o) {
    o = o || {};
    if (!tgt || tgt.down || tgt.ghost || tgt.dead) return 0;
    let v = amount;
    if (src && src.kind === 'p') { v *= 1 + (src.st.heal || 0); if (src.flags && src.flags.martyr && src.hp / src.maxHp <= 0.5) v *= 1.5; }
    if (tgt.kind === 'p') v *= 1 + (tgt.st.healTaken || 0);
    v = Math.round(v);
    if (v <= 0) return 0;
    const before = tgt.hp; tgt.hp = Math.min(tgt.maxHp, tgt.hp + v); const done = tgt.hp - before;
    const over = v - done;
    if (over > 0 && o.overShield && tgt.kind === 'p') tgt.shield = Math.min(tgt.maxHp * 0.3, tgt.shield + Math.min(over, tgt.maxHp * 0.15 * (src && src.tal && src.tal.shield25 ? 1.25 : 1)));
    if (src && src.kind === 'p') {
      if (src !== tgt || !o.quiet) { src.stats.heal += done; src.morale = Math.min(C.MORALE_MAX, src.morale + done * C.MORALE.heal * (1 + src.st.morale)); }
      if (src.cls === 'paladin' && src !== tgt && done > 0) { const dv = src.flags.devotion50 ? 0.5 : 0.2; src.hp = Math.min(src.maxHp, src.hp + Math.round(done * dv)); }
      if (src.flags && src.flags.healToDmg && done > 0) src.healToDmg = Math.min(src.st.atk * 3, (src.healToDmg || 0) + done * 0.3);
      if (done > 0 && src !== tgt) for (const e of sim.ents) if (e.kind === 'e' && !e.dead && U.dist(e.x, e.y, src.x, src.y) < 12 * T) S.threat(e, src.slot, done * C.THREAT.heal);
    }
    if (!o.quiet && done > 0) { G.fx('dmg', tgt.x, tgt.y - 12, done, 3); G.fx('healFx', tgt.x, tgt.y); }
    return done;
  };
  S.dummyHit = function (sim, o, amount, src) {
    const a = src.ent; if (!a || a.kind !== 'p') return;
    let dmg = Math.round(amount * S.atkMul(a)); if (sim.rng.chance(a.st.crit)) dmg = Math.round(dmg * a.st.critDmg);
    o.flash = 0.08; G.fx('dmg', o.x, o.y - 10, dmg, 0);
    const d = sim.dummies[a.slot] || (sim.dummies[a.slot] = { total: 0, t: 0, start: sim.time });
    if (sim.time - d.last > 3) { d.total = 0; d.start = sim.time; }
    d.total += dmg; d.last = sim.time; d.dps = Math.round(d.total / Math.max(1, sim.time - d.start));
    o.pr = `DPS ${d.dps}`;
  };

  // ───── 업데이트
  S.update = function (sim, inputs, dt) {
    if (sim.paused) return;
    if (sim.hitstop > 0) { sim.hitstop -= dt; return; }
    sim.time += dt; sim.tick++;
    const map = sim.map;
    if (!sim.started) { sim.startT -= dt; if (sim.startT <= 0) { sim.started = true; S.onStart(sim); } }
    // 플레이어
    for (const p of sim.players) if (p) S.updatePlayer(sim, p, inputs[p.slot] || p.lastIn, dt);
    // 오라
    S.updateAuras(sim, dt);
    // 적/소환물/투사체/구역/픽업/오브젝트
    for (const e of sim.ents.slice()) {
      if (e.removed) continue;
      if (e.kind === 'e') S.updateEnemy(sim, e, dt);
      else if (e.kind === 'm') G.Skills.updateSummon(sim, e, dt);
      else if (e.kind === 'j') S.updateProj(sim, e, dt);
      else if (e.kind === 'z') S.updateZone(sim, e, dt);
      else if (e.kind === 'i') S.updatePickup(sim, e, dt);
      else if (e.kind === 'o') S.updateObj(sim, e, dt);
      if (e.flash > 0) e.flash -= dt;
    }
    // 시체
    for (let i = sim.corpses.length - 1; i >= 0; i--) { sim.corpses[i].t -= dt; if (sim.corpses[i].t <= 0) sim.corpses.splice(i, 1); }
    // 파티 버프 타이머
    if (sim.partyDef > 0) sim.partyDef -= dt;
    if (sim.partyInv > 0) sim.partyInv -= dt;
    if (sim.allIn > 0) sim.allIn -= dt;
    // 웨이브 / 클리어
    if (sim.mode !== 'hall' && sim.started) S.updateWaves(sim, dt);
    // 시간 제한
    if (sim.timeLimit > 0 && sim.started && !sim.cleared) { sim.timeLeft = sim.timeLimit - sim.time; if (sim.timeLeft <= 0 && sim.tick % 60 === 0) for (const p of S.alivePlayers(sim)) S.hurtPlayer(sim, p, p.maxHp * 0.05, { tag: 'dot', cause: '모래시계' }); }
  };
  S.onStart = function (sim) {
    if (sim.nextOil) { const r = sim.rng.pick(sim.map.rooms); for (let i = 0; i < 3; i++) S.zone(sim, { x: (r.x + sim.rng.int(1, r.w - 2)) * T + 8, y: (r.y + sim.rng.int(1, r.h - 2)) * T + 8, r: 22, elem: 'oil', life: 60, team: 'n' }); }
    if (sim.nextFire) { const r = sim.rng.pick(sim.map.rooms); for (let i = 0; i < 2; i++) S.zone(sim, { x: (r.x + sim.rng.int(1, r.w - 2)) * T + 8, y: (r.y + sim.rng.int(1, r.h - 2)) * T + 8, r: 24, elem: 'fire', life: 12, team: 'p', dps: 8, owner: null }); }
    if (sim.nextWet) { S.zone(sim, { x: sim.map.w * 8, y: sim.map.h * 8, r: 400, elem: 'rain', life: 40, team: 'n' }); }
  };
  S.updateAuras = function (sim, dt) {
    for (const p of sim.players) { if (!p) continue; p.auraDef = 0; }
    for (const p of sim.players) {
      if (!p || p.down || p.ghost) continue;
      for (const h of p.hooks) if (h.type === 'aura') for (const q of sim.players) if (q && q !== p && !q.down && U.dist(p.x, p.y, q.x, q.y) < h.range) q.auraDef += h.val;
      if (p.tal.cmdAura) for (const q of sim.players) if (q && q !== p && !q.down && U.dist(p.x, p.y, q.x, q.y) < 32) q.auraDef += 0.04;
      if (p.hasHook('frostAura') && sim.tick % 20 === 0) for (const e of sim.ents) if (e.kind === 'e' && !e.dead && U.dist(p.x, p.y, e.x, e.y) < p.hook('frostAura').range) St.add(sim, e, 'slow', { t: 0.5, v: 0.3 });
      if (p.cls === 'druid' && (p.form === 'crow' || p.flags.avatar) && sim.tick % 60 === 0) for (const q of sim.players) if (q && !q.down && !q.ghost && U.dist(p.x, p.y, q.x, q.y) < 56) S.heal(sim, q, q.maxHp * (p.flags.crow4 ? 0.04 : 0.02), p, { quiet: true });
    }
  };

  // ───── 플레이어 업데이트
  S.updatePlayer = function (sim, p, inp, dt) {
    p.lastIn = inp;
    const n = inp.n || G.In.EMPTY.n;
    if (!p.prevN) p.prevN = n.slice();
    const press = i => Math.max(0, (n[i] || 0) - (p.prevN[i] || 0));
    const pr = { a: press(0), q: press(1), e: press(2), r: press(3), roll: press(4), f: press(5), potion: press(6) };
    p.prevN = n.slice();
    p.input = inp;
    const hold = inp.b || 0;
    p.aim = inp.a || 0;
    if (inp.x !== 0) p.dir = inp.x > 0 ? 1 : -1; else if (Math.abs(Math.cos(p.aim)) > 0.2) p.dir = Math.cos(p.aim) > 0 ? 1 : -1;
    // 타이머
    if (p.inv > 0) p.inv -= dt; if (p.rollCd > 0) p.rollCd -= dt; if (p.cheerCd > 0) p.cheerCd -= dt; if (p.cheerT > 0) p.cheerT -= dt;
    if (p.cd.q > 0) p.cd.q -= dt; if (p.cd.e > 0) p.cd.e -= dt;
    if (p.swing > 0) p.swing -= dt * 4; if (p.emoteT > 0) { p.emoteT -= dt; if (p.emoteT <= 0) p.emote = ''; }
    if (p.frenzy > 0) p.frenzy -= dt; if (p.rollHaste > 0) p.rollHaste -= dt; if (p.tauntActive > 0) p.tauntActive -= dt;
    for (let i = p.buffs.length - 1; i >= 0; i--) { p.buffs[i].t -= dt; if (p.buffs[i].t <= 0) p.buffs.splice(i, 1); }
    St.update(sim, p, dt);
    const map = sim.map;
    // 유령
    if (p.ghost) {
      const spd = p.st.spd * T * 1.2;
      W.move(map, p, inp.x * spd * dt, inp.y * spd * dt, true);
      if (pr.f && p.cheerCd <= 0 && !sim.curses.includes('noCheer')) {
        let best = null, bd = 48; for (const q of sim.players) if (q && q !== p && !q.down && !q.ghost) { const d = U.dist(p.x, p.y, q.x, q.y); if (d < bd) { bd = d; best = q; } }
        if (best) { const mul = p.hasHook('ghostCheer') ? p.hook('ghostCheer').val : 1; S.addBuff(best, 'spd', C.GHOST_CHEER_SPD * mul, C.GHOST_CHEER_DUR, 'cheer'); p.cheerCd = C.GHOST_CHEER_CD; p.cheerT = 1; p.stats.cheers++; G.fx('snd', 'cheer'); G.fx('txt', best.x, best.y - 22, '응원!', '#ffe080', 7); }
      }
      S.ghostInteract(sim, p, pr);
      return;
    }
    // 다운
    if (p.down) {
      let rate = 1; for (const q of sim.players) if (q && q !== p && q.cls === 'priest' && !q.down && !q.ghost) rate = 0.5;
      p.down.t -= dt * rate;
      const spd = p.st.spd * T * 0.25; W.move(map, p, inp.x * spd * dt, inp.y * spd * dt);
      if (p.down.t <= 0) { p.down = null; p.ghost = true; p.dead = true; p.stats.deaths++; G.fx('snd', 'dead'); G.fx('die', p.x, p.y, 1); G.fx('txt', p.x, p.y - 20, '사망', '#8a8a9a', 10); sim.events.push({ t: 'dead', slot: p.slot }); S.addObj(sim, 'corpseP', p.x, p.y, { slot: p.slot, nm: p.name + ' (영혼석)', r: 8 }); if (S.alivePlayers(sim).length === 0 && sim.mode !== 'hall') S.wipe(sim); }
      // 부활 진행 감쇠 (아무도 채널 안 하면)
      if (!sim.players.some(q => q && q.reviving === p)) p.reviveProg = Math.max(0, p.reviveProg - dt * 0.5);
      return;
    }
    if (p.held) { // 촉수에 붙잡힘
      const t = p.held; if (t.dead || t.removed) p.held = null; else { p.x = t.x; p.y = t.y + 4; if (pr.a || pr.roll) { /* 발버둥: 약간 피해 */ } }
    }
    // 구르기
    if (p.roll) {
      p.roll.t -= dt;
      const spd = p.st.spd * T * C.ROLL_SPEED;
      const hit = W.move(map, p, p.roll.dx * spd * dt, p.roll.dy * spd * dt);
      if (p.roll.t <= 0) {
        p.roll = null;
        for (const h of p.hooks) { if (h.type === 'rollBomb') S.explode(sim, p.x, p.y, 26, p.st.atk * h.dmg, { ent: p, slot: p.slot, tag: 'e' }, 'p'); if (h.type === 'rollHit') for (const e of sim.ents) if (e.kind === 'e' && !e.dead && U.dist(p.x, p.y, e.x, e.y) < 24) S.damage(sim, e, p.st.atk * h.dmg, { ent: p, slot: p.slot, tag: 'e' }); if (h.type === 'rollInv') p.inv = Math.max(p.inv, h.val); }
        if (p.flags.rollHaste) p.rollHaste = 2;
        if (p.cls === 'gunner') { p.ammo = p.flags.mag9 ? 9 : 6; p.reloading = 0; }
      }
      return;
    }
    const canAct = St.canAct(p) && !p.held;
    // 이동
    let spd = p.st.spd * T * St.speedMul(p) * S.spdMul(p);
    if (p.qHold && p.cls === 'knight' && !p.flags.fortress) spd *= 0.6;
    if (p.charge > 0 && p.cls === 'archer') spd *= 0.6;
    if (p.reviving) spd = 0;
    if (p.channel) spd = 0;
    if (canAct && !p.status.root) {
      const hit = W.move(map, p, inp.x * spd * dt, inp.y * spd * dt);
      p.moving = (inp.x !== 0 || inp.y !== 0);
    } else p.moving = false;
    // 타일 효과
    const tile = W.tileAt(map, p.x, p.y);
    if (tile === TL.OIL) St.add(sim, p, 'oiled');
    else if (tile === TL.WATER) St.add(sim, p, 'wet');
    else if (tile === TL.DARK && sim.tick % 30 === 0 && !p.hasHook('fireImmune')) S.hurtPlayer(sim, p, p.maxHp * 0.015, { tag: 'dot', cause: '어둠', noFlash: true });
    // 구르기 시작
    const inMaw = sim.ents.some(e => e.kind === 'e' && e.type === 'maw' && !e.dead && U.dist(e.x, e.y, p.x, p.y) < e.data.p.range);
    if (pr.roll && p.rollCd <= 0 && canAct && !inMaw && !p.channel) {
      let dx = inp.x, dy = inp.y; if (!dx && !dy) { dx = Math.cos(p.aim); dy = Math.sin(p.aim); }
      const l = Math.hypot(dx, dy) || 1; p.roll = { t: C.ROLL_TIME, dx: dx / l, dy: dy / l };
      p.rollCd = C.ROLL_CD * (1 + (p.st.rollCd || 0)); p.stats.rolls++; p.qHold = false; p.charge = 0; p.reviving = null; p.channel = null;
      if (p.flags.rollStealth) St.add(sim, p, 'stealth', { t: 0.5 });
      G.fx('snd', 'roll'); G.fx('after', p.cls, p.x, p.y, p.dir);
      return;
    }
    // 물약
    if (pr.potion && p.potions > 0 && !sim.curses.includes('noPotion') && canAct) {
      p.potions--; p.stats.potionsUsed++;
      const v = p.maxHp * C.POTION_HEAL * (1 + (p.st.potion || 0));
      S.heal(sim, p, v, p, { quiet: false }); G.fx('snd', 'heal');
      if (p.hasHook('potionShare')) for (const q of sim.players) if (q && q !== p && !q.down && !q.ghost && U.dist(p.x, p.y, q.x, q.y) < 48) S.heal(sim, q, v * 0.5, p);
      sim.events.push({ t: 'potion', slot: p.slot });
    }
    // 부활 / 상호작용 (F)
    S.interact(sim, p, pr, hold, dt);
    // 스킬
    if (canAct) G.Skills.update(sim, p, pr, hold, dt);
    else { p.qHold = false; p.charge = 0; }
  };
  S.interact = function (sim, p, pr, hold, dt) {
    const holdF = !!(hold & 32);
    // 부활 채널
    if (holdF && !p.channel) {
      let tgt = null, bd = 22; for (const q of sim.players) if (q && q !== p && q.down) { const d = U.dist(p.x, p.y, q.x, q.y); if (d < bd) { bd = d; tgt = q; } }
      if (tgt && !(sim.curses.includes('oneRevive') && sim.revivesUsed >= 1)) {
        p.reviving = tgt;
        let tm = (sim.nPlayers <= 2 ? C.REVIVE_TIME_2P : C.REVIVE_TIME) * (1 - (p.st.reviveSpd || 0));
        if (p.cls === 'priest') tm *= 0.5; if (p.flags.instantRevive) tm = 0.3;
        tgt.reviveProg += dt / tm;
        if (tgt.reviveProg >= 1) { p.reviving = null; S.revivePlayer(sim, tgt, p); }
        return;
      }
    }
    if (!holdF) p.reviving = null;
    // 오브젝트
    let near = null, bd = 20;
    for (const o of sim.ents) if (o.kind === 'o' && !o.removed) { const d = U.dist(p.x, p.y, o.x, o.y - 4); if (d < bd + (o.r || 0)) { bd = d; near = o; } }
    p.near = near ? near.id : 0;
    if (near) {
      if (near.type === 'altar' && near.st !== 'off') { // 채널 (서 있기)
        near.pg = Math.min(1, (near.pg || 0) + dt / 2); near.channeler = p.slot;
        if (near.pg >= 1) { near.st = 'off'; near.pg = null; G.fx('snd', 'door'); G.fx('txt', near.x, near.y - 20, '제단 봉인', '#80ffe0', 7); sim.events.push({ t: 'altarOff', id: near.id }); }
      }
    }
    if (pr.f && near) S.useObj(sim, p, near);
    else if (pr.f && p.items.bomb > 0 && sim.mode !== 'hall') { p.items.bomb--; G.Skills.throwBomb(sim, p); }
    else if (pr.f && p.items.totem > 0 && sim.mode !== 'hall') { p.items.totem--; const o = S.addObj(sim, 'totem', p.x + Math.cos(p.aim) * 16, p.y + Math.sin(p.aim) * 16, { life: 8, nm: '토템' }); G.fx('snd', 'taunt'); for (const e of sim.ents) if (e.kind === 'e' && !e.dead && U.dist(e.x, e.y, o.x, o.y) < 120) { e.threat = {}; e.totem = o; e.target = -3; } }
  };
  S.useObj = function (sim, p, o) {
    if (o.type === 'chest') {
      if (o.st === 'open') return;
      if (o.st === 'locked') {
        const can = p.cls === 'rogue' || p.hasHook('unlock') || p.items.key > 0;
        if (!can) { G.fx('txt', o.x, o.y - 18, '잠김 (도적/열쇠)', '#aaa', 6); G.fx('snd', 'deny'); return; }
        if (p.cls !== 'rogue' && !p.hasHook('unlock')) p.items.key--;
      }
      if (o.mimic) { S.removeEnt(sim, o); const m = S.spawnEnemy(sim, 'mimic', o.x, o.y, { instant: true }); if (m) { m.target = p.slot; m.ai.state = 'chase'; } G.fx('snd', 'mimic'); G.fx('txt', o.x, o.y - 18, '미믹!', '#ff5050', 9); sim.events.push({ t: 'mimic' }); return; }
      o.st = 'open'; G.fx('snd', 'chest');
      S.chestLoot(sim, o, p);
      sim.events.push({ t: 'chest', slot: p.slot, locked: o.wasLocked });
    } else if (o.type === 'station' || o.type === 'npc') {
      sim.events.push({ t: 'station', id: o.sid, slot: p.slot });
    } else if (o.type === 'barrel') { S.breakBarrel(sim, o, p); G.fx('snd', 'break'); }
    else if (o.type === 'bones') { S.removeEnt(sim, o); G.fx('burst', o.x, o.y, 8, ['#e8e0d0'], 40, 0.4); G.fx('snd', 'shatter'); G.fx('txt', o.x, o.y - 10, '뼈 부숨', '#e8e0d0', 6); }
    else if (o.type === 'corpseP') {
      if (p.items.soulstone > 0) { const q = sim.players[o.slot]; if (q && q.ghost) { p.items.soulstone--; q.x = o.x; q.y = o.y; S.revivePlayer(sim, q, p, 0.5); S.removeEnt(sim, o); } }
      else G.fx('txt', o.x, o.y - 18, '영혼석 필요', '#aaa', 6);
    }
  };
  S.chestLoot = function (sim, o, p) {
    const luck = p.st.luck || 0, locked = o.wasLocked;
    const n = 3 + (locked ? 2 : 0) + (p.tal.chestBonus ? 1 : 0);
    for (let i = 0; i < n; i++) S.addPickup(sim, 'gold', o.x, o.y, Math.round(sim.rng.range(10, 22) * (locked ? 1.5 : 1)));
    if (sim.rng.chance(0.5 + luck + (locked ? 0.3 : 0))) S.addPickup(sim, 'relic', o.x, o.y, 0);
    if (sim.rng.chance(C.DROP_EQUIP.treasure + luck * 0.5 + (locked ? 0.3 : 0))) S.addPickup(sim, 'equip', o.x, o.y, 0);
    if (sim.rng.chance(0.4)) S.addPickup(sim, 'potion', o.x, o.y);
  };
  S.ghostInteract = function (sim, p, pr) {
    // 발판(봉인석)은 유령도 밟을 수 있음 — updateObj 에서 처리
  };

  // ───── 적 업데이트
  S.updateEnemy = function (sim, e, dt) {
    if (e.dead) { e.deadT -= dt; if (e.deadT <= 0) S.removeEnt(sim, e); return; }
    if (e.spawnT > 0) { e.spawnT -= dt; e.tg = ['c', e.x, e.y, 12, 1 - e.spawnT / 0.9]; if (e.spawnT <= 0) { e.tg = null; G.fx('burst', e.x, e.y - 4, 8, ['#5a4a5a', '#2a2030'], 30, 0.4); } return; }
    St.update(sim, e, dt);
    for (let i = e.buffs.length - 1; i >= 0; i--) { e.buffs[i].t -= dt; if (e.buffs[i].t <= 0) e.buffs.splice(i, 1); }
    if (e.kx || e.ky) { W.move(sim.map, e, e.kx * dt * 8, e.ky * dt * 8); e.kx *= 0.8; e.ky *= 0.8; if (Math.abs(e.kx) < 0.5) e.kx = 0; if (Math.abs(e.ky) < 0.5) e.ky = 0; }
    if (e.invuln > 0) e.invuln -= dt;
    // 접두어
    if (e.affixes.includes('warding') && sim.tick % 120 === 0) for (const o of sim.ents) if (o.kind === 'e' && o !== e && !o.dead && U.dist(e.x, e.y, o.x, o.y) < 60) o.shield = Math.max(o.shield, 15 + sim.depth * 3);
    if (e.affixes.includes('shadow')) { e.stealthCd -= dt; if (e.stealthCd <= 0) { St.add(sim, e, 'stealth', { t: 2 }); e.stealthCd = 7; } }
    if (e.affixes.includes('frenzied') && e.hp / e.maxHp <= 0.3) e.aspdMul = 2; else e.aspdMul = 1;
    if (e.boss) G.Bosses.update(sim, e, dt);
    else G.EnemyAI.update(sim, e, dt);
    // 타일
    if (!e.boss && sim.tick % 10 === 0) { const t = W.tileAt(sim.map, e.x, e.y); if (t === TL.OIL) St.add(sim, e, 'oiled'); else if (t === TL.WATER) St.add(sim, e, 'wet'); }
  };

  // ───── 투사체
  S.updateProj = function (sim, j, dt) {
    j.life -= dt;
    if (j.type === 'meteor' || j.type === 'bombT') { j.p = Math.min(1, (j.p || 0) + dt / j.fall); if (j.p >= 1) { S.removeEnt(sim, j); j.onLand && j.onLand(sim, j); } return; }
    if (j.homing > 0) {
      let best = null, bd = 90;
      for (const e of sim.ents) { if (j.team === 'p' ? (e.kind === 'e' && !e.dead && e.spawnT <= 0) : (e.kind === 'p' && !e.down && !e.ghost)) { const d = U.dist(j.x, j.y, e.x, e.y); if (d < bd && !j.hit.has(e.id)) { bd = d; best = e; } } }
      if (best) { const sp = Math.hypot(j.vx, j.vy); const a = Math.atan2(best.y - 6 - j.y, best.x - j.x); const cur = Math.atan2(j.vy, j.vx); const na = cur + U.angDiff(cur, a) * Math.min(1, j.homing * dt); j.vx = Math.cos(na) * sp; j.vy = Math.sin(na) * sp; j.a = na; }
    }
    j.x += j.vx * dt; j.y += j.vy * dt;
    if (j.healPass) for (const p of sim.players) if (p && !p.down && !p.ghost && p !== j.owner && !j.healed.has(p.id) && U.dist(j.x, j.y, p.x, p.y - 5) < 9) { j.healed.add(p.id); S.heal(sim, p, p.maxHp * j.healPass, j.owner, { quiet: true }); G.fx('healFx', p.x, p.y); }
    if (W.solidAt(sim.map, j.x, j.y) || j.life <= 0) {
      if (j.bounce > 0 && j.life > 0) { j.bounce--; if (W.solidAt(sim.map, j.x - j.vx * dt, j.y)) j.vy = -j.vy; else j.vx = -j.vx; j.x -= j.vx * dt * -1; j.a = Math.atan2(j.vy, j.vx); j.x += j.vx * dt * 2; j.y += j.vy * dt * 2; return; }
      S.projEnd(sim, j); return;
    }
    // 충돌
    if (j.team === 'p') {
      for (const e of sim.ents) {
        if (!(e.kind === 'e' || (e.kind === 'o' && (e.type === 'dummy' || e.type === 'barrel'))) || e.dead || e.removed || j.hit.has(e.id) || e.spawnT > 0) continue;
        if (e.hd) continue;
        if (U.dist(j.x, j.y, e.x, e.y - (e.kind === 'o' ? 6 : 4)) < j.r + (e.r || 8)) {
          j.hit.add(e.id);
          if (e.kind === 'e' && e.affixes.includes('mirrorA') && !j.reflected) { j.reflected = true; j.team = 'e'; j.vx = -j.vx; j.vy = -j.vy; j.a = Math.atan2(j.vy, j.vx); j.dmg *= 0.6; G.fx('snd', 'block'); G.fx('txt', e.x, e.y - 14, '반사', '#dfe6ff', 6); return; }
          const back = e.kind === 'e' && Math.abs(U.angDiff(e.facing, Math.atan2(j.y - e.y, j.x - e.x))) > 2.2;
          S.damage(sim, e, j.dmg, { ent: j.owner, slot: j.slot, tag: j.tag, elem: j.elem, heavy: j.heavy, x: j.x - j.vx * 0.05, y: j.y - j.vy * 0.05, knock: j.knock, back, critBonus: j.critBonus, noElemHook: j.noElemHook });
          if (j.onHit) j.onHit(sim, j, e);
          if (j.explode > 0) { S.explode(sim, j.x, j.y, j.explode, j.dmg * 0.8, { ent: j.owner, slot: j.slot, tag: j.tag }, 'p'); S.projEnd(sim, j, true); return; }
          if (j.pierce > 0) { j.pierce--; } else { S.projEnd(sim, j, true); return; }
        }
      }
    } else {
      for (const p of sim.players) {
        if (!p || p.down || p.ghost || j.hit.has(p.id)) continue;
        if (U.dist(j.x, j.y, p.x, p.y - 5) < j.r + p.r) {
          j.hit.add(p.id);
          S.hurtPlayer(sim, p, j.dmg, { ent: j.owner, tag: 'e', elem: j.elem, x: j.x - j.vx * 0.05, y: j.y - j.vy * 0.05 });
          if (j.pierce > 0) j.pierce--; else { S.projEnd(sim, j, true); return; }
        }
      }
      for (const m of sim.ents) if (m.kind === 'm' && !m.dead && !j.hit.has(m.id) && U.dist(j.x, j.y, m.x, m.y - 4) < j.r + m.r) { j.hit.add(m.id); S.damage(sim, m, j.dmg, { ent: j.owner, tag: 'e' }); S.projEnd(sim, j, true); return; }
      if (j.team === 'e' && !j.hitTotem) for (const o of sim.ents) if (o.kind === 'o' && o.type === 'totem' && U.dist(j.x, j.y, o.x, o.y) < 10) { j.hitTotem = true; S.projEnd(sim, j, true); return; }
    }
  };
  S.projEnd = function (sim, j, hit) {
    if (j.removed) return;
    S.removeEnt(sim, j);
    if (j.zone) S.zone(sim, Object.assign({ x: j.x, y: j.y, team: j.team, owner: j.owner }, j.zone));
    if (j.explode > 0 && !hit) S.explode(sim, j.x, j.y, j.explode, j.dmg * 0.8, { ent: j.owner, slot: j.slot, tag: j.tag }, j.team);
    if (j.elem === 'fire' && j.team !== 'n') S.ignite(sim, j.x, j.y, 10, j.owner);
    G.fx('burst', j.x, j.y, 3, j.elem === 'fire' ? '#ff8040' : '#c0c0c0', 30, 0.25);
  };

  // ───── 구역
  S.updateZone = function (sim, z, dt) {
    z.life -= dt; z.tick += dt;
    if (z.life <= 0) { S.removeEnt(sim, z); return; }
    if (z.elem === 'beam') { // 레이저: 매 틱 선분 피해
      if (z.tick >= 0.1) { z.tick = 0; for (const p of sim.players) if (p && !p.down && !p.ghost && U.segDist(p.x, p.y - 4, z.x, z.y, z.x + Math.cos(z.a) * z.r, z.y + Math.sin(z.a) * z.r) < 8) S.hurtPlayer(sim, p, z.dps * 0.1, { ent: z.owner, tag: 'e', x: z.x, y: z.y }); }
      return;
    }
    if (z.tick < 0.5) return; z.tick -= 0.5;
    for (const e of sim.ents) {
      if (e.removed || e.dead) continue;
      if (!(e.kind === 'p' || e.kind === 'e' || e.kind === 'm')) continue;
      if (e.kind === 'p' && (e.down || e.ghost)) continue;
      if (e.kind === 'e' && e.spawnT > 0) continue;
      if (U.dist(e.x, e.y, z.x, z.y) > z.r + e.r * 0.5) continue;
      const isP = e.kind === 'p';
      const src = { ent: z.owner, slot: z.owner && z.owner.kind === 'p' ? z.owner.slot : -1, tag: 'zone', noKnock: true, noFlash: true };
      if (z.elem === 'fire') {
        if (isP) { if (z.team === 'p' || (z.owner && z.owner.kind === 'p')) continue; if (e.hasHook('fireImmune')) continue; e.stats.fireSteps++; S.hurtPlayer(sim, e, z.dps * 0.5 || 4, { tag: 'dot', elem: null, cause: '불 장판' }); St.applyElem(sim, e, 'fire', { ent: null, slot: -1, tag: 'zone' }); }
        else { if (z.team === 'e' && e.kind === 'e') continue; if (e.kind === 'm' && z.team === 'p') continue; S.damage(sim, e, z.dps * 0.5 || 4, Object.assign(src, { color: '#ff9040' })); St.applyElem(sim, e, 'fire', { ent: z.owner, slot: src.slot, tag: 'zone' }); }
      } else if (z.elem === 'poison') {
        if (isP) { if (z.team === 'p') continue; S.hurtPlayer(sim, e, z.dps * 0.5 || 3, { tag: 'dot', cause: '독연' }); St.add(sim, e, 'poison', { dps: 1 }); }
        else { if (z.team === 'e' && e.kind === 'e') continue; if (e.kind === 'm') continue; S.damage(sim, e, z.dps * 0.5 || 3, Object.assign(src, { color: '#90e070' })); St.add(sim, e, 'poison', { dps: z.dps / 5 || 1, src: z.owner }); }
      } else if (z.elem === 'oil') St.add(sim, e, 'oiled');
      else if (z.elem === 'water' || z.elem === 'rain') St.add(sim, e, 'wet');
      else if (z.elem === 'holy') {
        if (isP) { St.cleanse(e); e.wardImmune = true; e.wardT = 0.6; S.heal(sim, e, e.maxHp * 0.015, z.owner, { quiet: true }); }
        else if (e.kind === 'e') { St.add(sim, e, 'slow', { t: 0.6, v: 0.3 }); if (e.data.tags && e.data.tags.includes('undead')) S.damage(sim, e, z.dps * 0.5 || 3, Object.assign(src, { color: '#ffe0a0' })); }
      } else if (z.elem === 'dark') { if (isP) S.hurtPlayer(sim, e, z.dps * 0.5 || 4, { tag: 'dot', cause: '어둠' }); }
      else if (z.elem === 'ice') { if (!isP && e.kind === 'e') St.add(sim, e, 'slow', { t: 0.6, v: 0.5 }); }
      else if (z.elem === 'steam') { if (e.kind === 'e') e.blind = 0.6; }
      else if (z.elem === 'arrowRain') { if (e.kind === 'e') S.damage(sim, e, z.dps * 0.5, Object.assign(src, { tag: 'r', knock: 6 })); }
      else if (z.elem === 'root') { if (e.kind === 'e') { St.add(sim, e, 'root', { t: 0.6 }); S.damage(sim, e, z.dps * 0.5, Object.assign(src, { tag: 'r' })); } }
    }
    for (const p of sim.players) if (p && p.wardT != null) { p.wardT -= 0.5; if (p.wardT <= 0) { p.wardImmune = false; p.wardT = null; } }
  };

  // ───── 픽업
  S.updatePickup = function (sim, i, dt) {
    i.life -= dt; if (i.life <= 0) { S.removeEnt(sim, i); return; }
    if (i.vx || i.vy) { i.vy += 160 * dt; const nx = i.x + i.vx * dt, ny = i.y + i.vy * dt; if (!W.solidAt(sim.map, nx, ny)) { i.x = nx; i.y = ny; } else { i.vx = i.vy = 0; } if (i.vy > 0 && i.life < 89.6) { i.vx = i.vy = 0; } }
    if (i.life > 89.5) return;
    for (const p of sim.players) {
      if (!p || p.down || p.ghost) continue;
      const rng = 12 * (p.hasHook('magnet') ? p.hook('magnet').val : 1);
      const d = U.dist(p.x, p.y, i.x, i.y);
      if (d < rng && d > 10) { const a = Math.atan2(p.y - i.y, p.x - i.x); i.x += Math.cos(a) * 120 * dt; i.y += Math.sin(a) * 120 * dt; }
      if (d < 10) {
        if (i.type === 'equip' || i.type === 'relic') { if (i.claimed) continue; i.claimed = true; S.removeEnt(sim, i); sim.events.push({ t: 'loot', kind: i.type, slot: p.slot, x: i.x, y: i.y, val: i.val }); G.fx('snd', 'pick'); continue; }
        S.removeEnt(sim, i);
        if (i.type === 'gold') { const v = Math.round(i.val * (1 + (p.st.gold || 0)) * (p.cls === 'rogue' ? 1.1 : 1)); p.gold += v; p.stats.goldPicked += v; G.fx('snd', 'gold'); G.fx('txt', p.x, p.y - 18, '+' + v, '#ffd36b', 6); }
        else if (i.type === 'potion') { if (p.potions < C.POTION_MAX) { p.potions++; G.fx('txt', p.x, p.y - 18, '물약 +1', '#ff8090', 6); } else { S.heal(sim, p, p.maxHp * 0.2, p); } G.fx('snd', 'pick'); }
        else if (i.type === 'key') { p.items.key++; G.fx('txt', p.x, p.y - 18, '열쇠 +1', '#e0b050', 6); G.fx('snd', 'pick'); }
        else if (i.type === 'bomb') { p.items.bomb++; G.fx('txt', p.x, p.y - 18, '폭탄 +1', '#ff8040', 6); G.fx('snd', 'pick'); }
        else if (i.type === 'soul') { p.items.soulstone++; G.fx('txt', p.x, p.y - 18, '영혼석 +1', '#80e0ff', 6); G.fx('snd', 'pick'); }
        break;
      }
    }
  };

  // ───── 오브젝트
  S.updateObj = function (sim, o, dt) {
    if (o.life != null) { o.life -= dt; if (o.life <= 0) { S.removeEnt(sim, o); if (o.onEnd) o.onEnd(sim, o); return; } }
    if (o.type === 'tg') { if (o.tg && o.tgLife) o.tg[4] = Math.min(1, 1 - o.life / o.tgLife); return; }
    if (o.type === 'exit') {
      for (const p of sim.players) if (p && !p.down && !p.ghost && U.dist(p.x, p.y, o.x, o.y) < 12) { if (!sim.exitTaken) { sim.exitTaken = true; sim.events.push({ t: 'exit', slot: p.slot }); } }
    } else if (o.type === 'bones') {
      o.timer -= dt;
      for (const p of sim.players) if (p && !p.down && !p.ghost && U.dist(p.x, p.y, o.x, o.y) < 10) { S.removeEnt(sim, o); G.fx('burst', o.x, o.y, 8, ['#e8e0d0'], 40, 0.4); G.fx('snd', 'shatter'); G.fx('txt', o.x, o.y - 10, '뼈 부숨', '#e8e0d0', 6); return; }
      o.pg = 1 - o.timer / 10;
      if (o.timer <= 0) { S.removeEnt(sim, o); const e = S.spawnEnemy(sim, o.etype, o.x, o.y, { affixes: o.affixes, wave: sim.waveIdx }); if (e) { e.noBones = true; e.hp = Math.round(e.maxHp * 0.6); } G.fx('snd', 'summon'); G.fx('txt', o.x, o.y - 10, '재조립!', '#e8e0d0', 7); }
    } else if (o.type === 'coffin') {
      if (!o.opened) for (const p of sim.players) if (p && !p.down && !p.ghost && U.dist(p.x, p.y, o.x, o.y) < 28 && sim.rng.chance(0.02)) { o.opened = true; o.st = 'open'; for (let i = 0; i < 2; i++) S.spawnEnemy(sim, 'spider', o.x + (i ? 8 : -8), o.y + 6, { instant: true, wave: sim.waveIdx }); G.fx('snd', 'summon'); G.fx('txt', o.x, o.y - 14, '거미!', '#ff5050', 7); }
    } else if (o.type === 'seal') {
      const on = sim.players.some(p => p && !p.down && U.dist(p.x, p.y, o.x, o.y) < 12);
      o.st = on ? 'on' : '';
    } else if (o.type === 'trap') {
      for (const e of sim.ents) if (e.kind === 'e' && !e.dead && e.spawnT <= 0 && U.dist(e.x, e.y, o.x, o.y) < 12) { G.Skills.triggerTrap(sim, o, e); break; }
    } else if (o.type === 'decoy') {
      o.life2 = (o.life2 || 0) + dt;
    } else if (o.type === 'altar') {
      if (o.st !== 'off' && !sim.players.some(p => p && !p.down && U.dist(p.x, p.y, o.x, o.y - 4) < 20)) o.pg = Math.max(0, (o.pg || 0) - dt * 0.5);
    } else if (o.type === 'npc') { if (sim.tick % 240 === 0 && sim.rng.chance(0.3)) { const lines = G.META.NPC_LINES[o.sid]; if (lines) { o.say = sim.rng.pick(lines); o.sayT = 4; } } if (o.sayT > 0) { o.sayT -= dt; if (o.sayT <= 0) o.say = ''; } }
  };

  // ───── 웨이브
  S.updateWaves = function (sim, dt) {
    if (sim.mode === 'boss' && !sim.boss && !sim.bossDead && sim.started) { }
    const alive = sim.ents.filter(e => e.kind === 'e' && !e.dead && !e.noCount);
    if (sim.cleared) { sim.clearedT += dt; return; }
    if (alive.length === 0 && sim.waveIdx < sim.waves.length && (sim.mode !== 'boss' || sim.waves.length)) {
      if (sim.waveDelay == null) sim.waveDelay = sim.waveIdx === 0 ? 0.2 : 1.2;
      sim.waveDelay -= dt;
      if (sim.waveDelay <= 0) {
        sim.waveDelay = null;
        const wave = sim.waves[sim.waveIdx]; sim.waveIdx++;
        for (const spec of wave) for (let i = 0; i < (spec.n || 1); i++) S.spawnAt(sim, spec.type, { affixes: spec.affixes, wave: sim.waveIdx });
        G.fx('snd', 'warn'); G.fx('wave', sim.waveIdx, sim.waves.length);
      }
      return;
    }
    if (alive.length === 0 && sim.waveIdx >= sim.waves.length && (sim.mode !== 'boss' || sim.bossDead)) {
      sim.cleared = true; sim.clearedT = 0;
      for (const p of sim.players) if (p && p.down) { }
      if (sim.map.exit && sim.mode !== 'boss') S.addObj(sim, 'exit', sim.map.exit.x, sim.map.exit.y);
      sim.events.push({ t: 'cleared' });
      G.fx('snd', 'door');
    }
  };

  // ───── 뷰
  S.view = function (sim) {
    const ents = [];
    for (const e of sim.ents) {
      if (e.removed) continue;
      const x = Math.round(e.x), y = Math.round(e.y);
      if (e.kind === 'p') {
        const r = { k: 'p', id: e.id, s: e.slot, c: e.cls, x, y, d: e.dir, a: Math.round(e.aim * 100) / 100, m: e.moving ? 1 : 0, hp: Math.round(e.hp), mhp: e.maxHp, n: e.name };
        if (e.shield > 0) r.sh = Math.round(e.shield);
        const st = St.bits(e); if (st) r.st = st;
        if (e.down) { r.dn = 1; r.dt = e.down.t / e.down.max; }
        if (e.ghost) r.gh = 1;
        if (e.reviveProg > 0) r.rv = Math.round(e.reviveProg * 100) / 100;
        if (e.charge > 0) r.ch = Math.round(e.charge * 100) / 100;
        if (e.qHold) r.q = 1;
        if (e.form) r.f = e.form;
        if (e.inv > 0 || sim.partyInv > 0) r.inv = 1;
        if (e.status.stealth) r.stl = 1;
        if (e.roll) r.rl = 1;
        if (e.swing > 0) r.sw = Math.round(e.swing * 100) / 100;
        if (e.flash > 0) r.fl = 1;
        if (e.emote) r.em = e.emote;
        if (e.cheerT > 0) r.cheer = 1;
        if (e.hat) r.hat = 1;
        if (sim.lightMul !== 1 || sim.region === 3) r.lr = Math.round(110 * sim.lightMul * (sim.region === 3 ? 0.75 : 1));
        ents.push(r);
      } else if (e.kind === 'e') {
        const r = { k: 'e', id: e.id, t: e.type, x, y, d: e.dir, m: e.ai && (e.ai.state === 'chase' || e.ai.state === 'flee') ? 1 : 0, hp: Math.round(e.hp / e.maxHp * 100) / 100 };
        if (e.sz) r.sz = e.sz;
        if (e.elite) r.el = e.affixes.join(',');
        const st = St.bits(e); if (st) r.st = st;
        if (e.tg) r.tg = e.tg.map(v => typeof v === 'number' ? Math.round(v * 100) / 100 : v);
        if (e.boss) { r.bs = 1; r.nm = e.bossName; }
        if (e.target >= 0 && e.ai && e.ai.state !== 'idle') r.tgt = e.target;
        if (e.flash > 0) r.fl = 1;
        if (e.status.stealth) r.stl = 1;
        if (e.shield > 0) r.sh = 1;
        if (e.hd) r.hd = 1;
        if (e.fy) r.fy = Math.round(e.fy);
        if (e.glow) { r.gl = e.glow; r.glc = e.glowC; }
        if (e.dead) r.hp = 0;
        ents.push(r);
      } else if (e.kind === 'm') {
        ents.push({ k: 'm', id: e.id, t: e.sprite || 'skelMinion', x, y, d: e.dir, m: e.moving ? 1 : 0, hp: Math.round(e.hp / e.maxHp * 100) / 100, fl: e.flash > 0 ? 1 : 0, sz: e.sz });
      } else if (e.kind === 'j') {
        const r = { k: 'j', id: e.id, t: e.type, x, y, a: Math.round(e.a * 100) / 100 }; if (e.elem) r.el = e.elem; if (e.p != null) r.p = Math.round(e.p * 100) / 100; ents.push(r);
      } else if (e.kind === 'z') {
        const r = { k: 'z', id: e.id, t: e.elem, x, y, r: Math.round(e.r), l: Math.round(e.life / e.maxLife * 100) / 100 }; if (e.a != null) r.a = Math.round(e.a * 100) / 100; ents.push(r);
      } else if (e.kind === 'i') {
        if (e.life > 89.5 || !e.claimed) ents.push({ k: 'i', id: e.id, t: e.type === 'soulstone' ? 'soul' : e.type, x, y });
      } else if (e.kind === 'o') {
        const r = { k: 'o', id: e.id, t: e.type, x, y };
        if (e.st) r.st = e.st; if (e.nm) r.nm = e.nm; if (e.pg != null) r.pg = Math.round(e.pg * 100) / 100; if (e.pr) r.pr = e.pr; if (e.flash > 0) r.fl = 1; if (e.say) r.pr = e.say; if (e.sz) r.sz = e.sz;
        if (e.type === 'station' || e.type === 'npc' || e.type === 'chest' || e.type === 'bones' || e.type === 'corpseP') r.hl = sim.players.some(p => p && p.near === e.id) ? 1 : 0;
        if (e.type === 'dummy') { r.t = 'totem'; }
        if (e.tg) r.tg = e.tg.map(v => typeof v === 'number' ? Math.round(v * 100) / 100 : v);
        ents.push(r);
      }
    }
    const amb = sim.mode === 'hall' ? 0.2 : sim.region === 3 ? 0.68 : sim.region === 2 ? 0.52 : sim.region === 4 ? 0.6 : 0.38;
    const hud = { wave: sim.waveIdx, waves: sim.waves.length, cleared: sim.cleared, time: Math.round(sim.time), timeLeft: sim.timeLimit ? Math.max(0, Math.round(sim.timeLimit - sim.time)) : null, allIn: sim.allIn > 0 ? Math.round(sim.allIn * 10) / 10 : 0 };
    if (sim.boss && !sim.boss.dead) hud.boss = { nm: sim.boss.bossName, hp: Math.round(sim.boss.hp / sim.boss.maxHp * 1000) / 1000, ph: sim.boss.phase || 1 };
    const pl = sim.players.map(p => p ? S.playerHud(p) : null);
    return { ents, amb: amb * (sim.curses.includes('darkness') ? 1.08 : 1), hud, pl, mode: sim.mode, seed: sim.seed, region: sim.region, mapVer: sim.map.ver, boss: sim.mode === 'boss' };
  };
  S.playerHud = function (p) {
    const cls = G.CLASSES[p.cls];
    return { s: p.slot, c: p.cls, n: p.name, hp: Math.round(p.hp), mhp: p.maxHp, sh: Math.round(p.shield), mo: Math.round(p.morale), q: Math.max(0, Math.round(p.cd.q * 10) / 10), e: Math.max(0, Math.round(p.cd.e * 10) / 10), qc: S.cdOf(p, S.skParam(p, 'qCd', cls.q.cd)), ec: S.cdOf(p, S.skParam(p, 'eCd', cls.e.cd)),
      gold: p.gold, pot: p.potions, dn: !!p.down, gh: p.ghost, items: p.items, relics: p.relics, spd: Math.round(p.st.spd * St.speedMul(p) * S.spdMul(p) * (p.qHold && p.cls === 'knight' && !p.flags.fortress ? 0.6 : 1) * 100) / 100, ammo: p.cls === 'gunner' ? p.ammo : null, traps: p.cls === 'rogue' ? p.traps : null, form: p.form, lv: p.meta.lv, roll: Math.max(0, Math.round(p.rollCd * 10) / 10), status: St.bits(p), buffs: p.buffs.map(b => b.id || b.stat), conn: p.connected };
  };
  S.drain = sim => { const ev = sim.events; sim.events = []; return ev; };
  return S;
})();
