// 보스 4종 — 패턴 상태기계 + 역할 분담 기믹
G.Bosses = (function () {
  const B = {};
  const C = G.C, U = G.U, S = G.Sim, St = G.St, W = G.World, AI = G.EnemyAI, T = C.TILE;

  B.DATA = {
    grad: { name: '폐허의 거인 기사 그라드', hp: 1800, atk: 18, spd: 2.4, r: 11, sprite: 'grad', front: true, music: 'boss', intro: '정면은 뚫리지 않는다. 도발로 시선을 돌려라.' },
    elun: { name: '묘지 사제 엘른', hp: 1400, atk: 12, spd: 2.8, r: 8, sprite: 'elun', music: 'boss', intro: '제단이 켜져 있는 동안 엘른은 죽지 않는다. 동시에 꺼라.' },
    eye: { name: '심연의 눈', hp: 1600, atk: 20, spd: 1.8, r: 12, sprite: 'eye', music: 'boss', intro: '봉인석을 전부 밟아야 눈이 감긴다. 감긴 눈을 쳐라.' },
    lord: { name: '심연의 군주', hp: 2600, atk: 22, spd: 2.6, r: 13, sprite: 'lord', music: 'final', intro: '왕국을 삼킨 자. 전부 쏟아부어라.' },
  };

  B.spawn = function (sim, id, x, y) {
    const d = B.DATA[id];
    const dm = 1 + (sim.depth - 1) * C.DEPTH_DMG, hm = 1 + (sim.depth - 1) * C.DEPTH_HP;
    const e = { kind: 'e', type: d.sprite, data: { name: d.name, p: { front: !!d.front }, tags: id === 'elun' ? ['undead'] : [], ai: 'boss' }, x, y, r: d.r, dir: -1, team: 'e', status: {}, buffs: [], shield: 0,
      ai: { state: 'chase', t: 0, cd: 1.5 }, threat: {}, target: -1, affixes: [], elite: false, boss: true, bossId: id, bossName: d.name, tg: null, flash: 0, spawnT: 0, wave: 0, noKnock: true, noTaunt: false, noFreeze: true, facing: Math.PI, phase: 1, pat: null, patCd: 1.5, invuln: 0 };
    e.maxHp = Math.round(d.hp * hm * sim.scale.hp * (1 - (sim.bossWeak || 0)) * (sim.depth >= 5 ? 1.15 : 1));
    e.hp = e.maxHp; e.atk = d.atk * dm * sim.scale.dmg; e.spd = d.spd;
    S.addEnt(sim, e); sim.boss = e; sim.mode = 'boss';
    B[id].init(sim, e);
    return e;
  };

  function retarget(sim, b, dt) {
    b.ai.rt = (b.ai.rt || 0) - dt;
    if (b.ai.rt <= 0 || b.target < 0) { b.ai.rt = 0.4; b.target = S.pickTarget(sim, b); }
    return S.targetPos(sim, b);
  }
  function face(b, tp) { if (tp) b.facing = Math.atan2(tp.y - b.y, tp.x - b.x); b.dir = Math.cos(b.facing) >= 0 ? 1 : -1; }
  B.update = function (sim, b, dt) {
    const st = b.status;
    if (b.patCd > 0) b.patCd -= dt;
    if (st.frozen || st.stun) { b.tg = null; if (b.pat && !b.pat.unbreakable) b.pat = null; return; }
    const impl = B[b.bossId];
    const tp = retarget(sim, b, dt);
    const nph = b.hp / b.maxHp <= 0.33 && impl.phases >= 3 ? 3 : b.hp / b.maxHp <= (impl.phases >= 3 ? 0.66 : 0.5) ? 2 : 1;
    if (nph !== b.phase) { b.phase = nph; impl.onPhase && impl.onPhase(sim, b, nph); G.fx('snd', 'roar'); G.fx('banner', b.bossName, nph === 2 ? '2페이즈' : '3페이즈'); G.fx('shake', 6); }
    impl.tick && impl.tick(sim, b, dt, tp);
    if (b.pat) { if (b.pat.fn(sim, b, dt, tp)) { b.pat = null; b.patCd = (impl.gap || 1.2) * (b.phase >= 2 ? 0.75 : 1); } return; }
    if (!tp) return;
    if (!b.pat && !b.taunting) face(b, tp);
    if (b.patCd <= 0 && !b.noPatterns) { const name = impl.pick(sim, b, tp); if (name) { b.pat = { name, t: 0, step: 0, fn: impl.pats[name] }; return; } }
    // 기본: 접근
    const d = U.dist(b.x, b.y, tp.x, tp.y);
    if (d > b.r + 12 && !impl.stationary) AI.moveToward(sim, b, tp.x, tp.y, dt, impl.keepDist && d < impl.keepDist ? 0 : 1);
    if (impl.keepDist && d < impl.keepDist * 0.6) AI.moveAway(sim, b, tp.x, tp.y, dt, 0.8);
  };
  // 패턴 도구: 예고 후 실행
  const windArc = (w, width, r, dmgMul, o) => (sim, b, dt, tp) => {
    const p = b.pat; p.t += dt; o = o || {};
    if (p.t < w * 0.5 && tp) face(b, tp);
    b.tg = ['a', b.x, b.y, b.facing, width, r, Math.min(1, p.t / w)];
    if (p.t >= w) { b.tg = null; AI.hitArc(sim, b, r, width, b.atk * dmgMul, { knock: o.knock || 24, stun: o.stun }); G.fx('arc', b.x, b.y - 4, r, b.facing, width, '#ff6060'); G.fx('snd', 'heavy'); G.fx('shake', 3); return true; }
    return false;
  };
  const windCircle = (w, r, dmgMul, o) => (sim, b, dt) => {
    const p = b.pat; p.t += dt; o = o || {};
    const cx = p.cx != null ? p.cx : b.x, cy = p.cy != null ? p.cy : b.y;
    b.tg = ['c', cx, cy, r, Math.min(1, p.t / w)];
    if (p.t >= w) { b.tg = null; AI.hitCircle(sim, cx, cy, r, b.atk * dmgMul, b, { knock: o.knock || 30, stun: o.stun }); G.fx('ring', cx, cy, 6, r, o.color || '#ff8060', 0.4); G.fx('snd', 'slam'); G.fx('shake', 6); if (o.after) o.after(sim, b, cx, cy); return true; }
    return false;
  };
  const windDash = (w, len, spd, dmgMul) => (sim, b, dt, tp) => {
    const p = b.pat; p.t += dt;
    if (p.step === 0) {
      if (p.t < w * 0.6 && tp) face(b, tp);
      b.tg = ['l', b.x, b.y, b.facing, len, b.r * 2 + 6, Math.min(1, p.t / w)];
      if (p.t >= w) { b.tg = null; p.step = 1; p.dist = 0; p.hit = new Set(); G.fx('snd', 'roar'); }
      return false;
    }
    const mv = spd * T * dt; const hit = W.move(sim.map, b, Math.cos(b.facing) * mv, Math.sin(b.facing) * mv); p.dist += mv;
    for (const q of sim.players) if (q && !q.down && !q.ghost && !p.hit.has(q.id) && U.dist(b.x, b.y, q.x, q.y) < b.r + 8) { p.hit.add(q.id); S.hurtPlayer(sim, q, b.atk * dmgMul, { ent: b, tag: 'e', x: b.x, y: b.y }); W.move(sim.map, q, Math.cos(b.facing) * 28, Math.sin(b.facing) * 28); }
    if (hit || p.dist >= len) { if (hit) { G.fx('shake', 5); G.fx('snd', 'slam'); } return true; }
    return false;
  };
  const volley = (n, spd, interval, o) => (sim, b, dt, tp) => {
    const p = b.pat; p.t += dt; o = o || {};
    if (p.step === 0) { p.step = 1; p.n = n; p.next = 0; }
    if (tp) face(b, tp);
    if (p.t >= p.next && p.n > 0) { p.n--; p.next += interval; const a = b.facing + (o.spread ? (sim.rng() - 0.5) * o.spread : 0); AI.fire(sim, b, b.x + Math.cos(a) * 50, b.y - 4 + Math.sin(a) * 50, { spd, type: o.type || 'bolt', elem: o.elem, dmg: b.atk * (o.dmgMul || 0.8) }); if (o.homing) { const j = sim.ents[sim.ents.length - 1]; if (j.kind === 'j') j.homing = o.homing; } G.fx('snd', 'shoot'); }
    return p.n <= 0 && p.t > p.next;
  };
  const ring = (n, spd, dmgMul) => (sim, b, dt) => {
    const p = b.pat; p.t += dt;
    if (p.step === 0) { b.tg = ['c', b.x, b.y, 30, Math.min(1, p.t / 0.8)]; if (p.t >= 0.8) { b.tg = null; p.step = 1; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + p.t; AI.fire(sim, b, b.x + Math.cos(a) * 50, b.y - 4 + Math.sin(a) * 50, { spd, type: 'bolt', dmg: b.atk * dmgMul, life: 3 }); } G.fx('snd', 'shoot'); } return false; }
    return true;
  };

  // ───── 그라드
  B.grad = {
    phases: 2, gap: 1.0,
    init(sim, b) { b.noTaunt = false; },
    tick(sim, b, dt, tp) { b.taunting = !!b.status.taunt; },
    pick(sim, b, tp) {
      const d = U.dist(b.x, b.y, tp.x, tp.y);
      const r = sim.rng();
      if (d < 50) return r < 0.5 ? 'cleave' : r < 0.8 ? 'stomp' : b.phase >= 2 ? 'spin' : 'cleave';
      if (d < 200) return r < 0.6 ? 'charge' : 'stomp';
      return 'charge';
    },
    pats: {
      cleave: windArc(0.9, 2.2, 42, 1.5, { knock: 30 }),
      stomp: windCircle(1.1, 56, 1.2, { knock: 36, stun: 0.6, after: (sim, b, x, y) => { for (let i = 0; i < 3; i++) { const a = sim.rng() * Math.PI * 2; const t = W.setTile(sim.map, x + Math.cos(a) * 40, y + Math.sin(a) * 40, G.TL.RUBBLE); if (t) G.fx('tile', t[0], t[1], G.TL.RUBBLE); } } }),
      charge: windDash(1.0, 7 * T, 11, 1.4),
      spin: (sim, b, dt, tp) => { const p = b.pat; p.t += dt; if (p.step === 0) { b.tg = ['c', b.x, b.y, 48, Math.min(1, p.t / 1.2)]; if (p.t >= 1.2) { p.step = 1; p.t = 0; b.tg = null; b.spinning = true; } return false; } if (sim.tick % 20 === 0) { AI.hitArc(sim, b, 48, Math.PI * 2, b.atk * 0.6, { knock: 20 }); G.fx('arc', b.x, b.y - 4, 48, p.t * 10, 6.2, '#ff6060'); } if (tp) AI.moveToward(sim, b, tp.x, tp.y, dt, 1.4); if (p.t >= 2.5) { b.spinning = false; return true; } return false; },
    },
    onPhase(sim, b) { b.spd *= 1.25; },
  };

  // ───── 엘른
  B.elun = {
    phases: 2, gap: 1.4, keepDist: 90,
    init(sim, b) {
      const n = Math.max(2, Math.min(3, sim.nPlayers));
      const room = sim.map.rooms[0]; b.altars = [];
      const spots = [[room.x + 4, room.y + 3], [room.x + room.w - 5, room.y + 3], [room.x + room.w / 2, room.y + room.h - 3], [room.x + 4, room.y + room.h - 3]];
      for (let i = 0; i < n; i++) { const [x, y] = spots[i]; b.altars.push(S.addObj(sim, 'altar', x * T + 8, y * T + 14, { nm: '제단', r: 10 })); }
      b.altarTimer = 0;
    },
    tick(sim, b, dt, tp) {
      // 제단 상태: 켜진 제단이 하나라도 있으면 받는 피해 50% + 회복
      const on = b.altars.filter(a => !a.removed && a.st !== 'off');
      const off = b.altars.filter(a => !a.removed && a.st === 'off');
      if (b.altarsDownT > 0) { b.altarsDownT -= dt; b.dmgMul = 1.5; b.glow = 40; b.glowC = '#ff8080'; if (b.altarsDownT <= 0) { for (const a of b.altars) { a.st = ''; a.pg = 0; } G.fx('txt', b.x, b.y - 24, '제단 재점화', '#80ffe0', 7); G.fx('snd', 'warn'); } return; }
      if (on.length === 0 && b.altars.length) { b.altarsDownT = 25; St.add(sim, b, 'stun', { t: 4 }); b.status.stun = 4; b.pat = null; b.tg = null; G.fx('banner', '제단 봉인', '엘른이 무방비 상태! 25초'); G.fx('snd', 'door'); return; }
      b.dmgMul = 0.5; b.glow = 30; b.glowC = '#80ffe0';
      if (sim.tick % 60 === 0) { b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.01); }
      // 꺼진 제단은 8초 뒤 다시 켜짐 (동시에 꺼야 함)
      for (const a of off) { a.offT = (a.offT || 0) + dt; if (a.offT >= 8) { a.st = ''; a.offT = 0; a.pg = 0; G.fx('txt', a.x, a.y - 20, '다시 켜짐', '#ff8080', 6); } }
      for (const a of on) a.offT = 0;
    },
    pick(sim, b, tp) {
      const adds = sim.ents.filter(e => e.kind === 'e' && !e.dead && e.summonedBy === b.id).length;
      const r = sim.rng();
      if (adds < (b.phase >= 2 ? 5 : 3) && r < 0.4) return 'raise';
      if (r < 0.7) return 'orbs';
      if (b.phase >= 2 && r < 0.85) return 'curse';
      return 'nova';
    },
    pats: {
      raise: (sim, b, dt) => { const p = b.pat; p.t += dt; if (p.step === 0) { b.tg = ['c', b.x, b.y, 40, Math.min(1, p.t / 1.0)]; if (p.t >= 1.0) { b.tg = null; p.step = 1; const n = b.phase >= 2 ? 3 : 2; for (let i = 0; i < n; i++) { const c = sim.corpses.length ? sim.corpses.pop() : { x: b.x + sim.rng.range(-30, 30), y: b.y + sim.rng.range(-30, 30) }; const m = S.spawnEnemy(sim, sim.rng.chance(0.7) ? 'skeleton' : 'wraith', c.x, c.y, { wave: 0, summon: true }); if (m) { m.summonedBy = b.id; m.noCount = true; m.noBones = true; } } G.fx('snd', 'summon'); G.fx('txt', b.x, b.y - 24, '일어나라!', '#80ffe0', 8); } return false; } return true; },
      orbs: volley(3, 150, 0.3, { type: 'orb', homing: 3, dmgMul: 0.9 }),
      nova: windCircle(1.2, 64, 1.3, { knock: 30, color: '#80ffe0' }),
      curse: (sim, b, dt, tp) => { const p = b.pat; p.t += dt; if (p.step === 0) { p.step = 1; const ps = S.alivePlayers(sim); p.tgt = ps.length ? sim.rng.pick(ps) : null; if (p.tgt) G.fx('txt', p.tgt.x, p.tgt.y - 22, '저주! 결계로 정화', '#c080ff', 7); } if (!p.tgt || p.tgt.down || p.tgt.ghost || p.tgt.wardImmune) return true; if (sim.tick % 30 === 0) S.hurtPlayer(sim, p.tgt, p.tgt.maxHp * 0.03, { ent: b, tag: 'dot', cause: '저주' }); return p.t >= 4; },
    },
    onPhase(sim, b) { },
  };

  // ───── 심연의 눈
  B.eye = {
    phases: 2, gap: 1.0, keepDist: 110, stationary: false,
    init(sim, b) {
      const n = Math.max(1, Math.min(3, sim.nPlayers));
      const room = sim.map.rooms[0]; b.seals = [];
      const spots = [[room.x + 5, room.y + 4], [room.x + room.w - 6, room.y + room.h - 5], [room.x + 5, room.y + room.h - 5], [room.x + room.w - 6, room.y + 4]];
      for (let i = 0; i < n; i++) { const [x, y] = spots[i]; b.seals.push(S.addObj(sim, 'seal', x * T + 8, y * T + 8, { nm: '봉인석', r: 10 })); }
      b.closed = 0; b.sealCd = 0; b.fy = -6;
    },
    tick(sim, b, dt, tp) {
      b.fy = Math.sin(sim.time * 2) * 3 - 6;
      if (b.closed > 0) { b.closed -= dt; b.dmgMul = 1.6; b.noPatterns = true; b.glow = 60; b.glowC = '#ffffff'; if (b.closed <= 0) { b.sealCd = 5; for (const s of b.seals) s.st = ''; G.fx('txt', b.x, b.y - 30, '눈이 떠진다', '#ff4080', 8); G.fx('snd', 'roar'); } return; }
      b.noPatterns = false; b.dmgMul = 0.3; b.glow = 50; b.glowC = '#ff4080';
      if (b.sealCd > 0) { b.sealCd -= dt; return; }
      if (b.seals.length && b.seals.every(s => s.st === 'on')) { b.closed = 6; b.pat = null; b.tg = null; G.fx('banner', '눈이 감겼다', '6초간 피해 160%'); G.fx('snd', 'door'); }
    },
    pick(sim, b, tp) { const r = sim.rng(); const adds = sim.ents.filter(e => e.kind === 'e' && !e.dead && e.summonedBy === b.id).length; if (adds < 2 && r < 0.25) return 'spawn'; if (r < 0.65) return 'gaze'; if (b.phase >= 2 && r < 0.85) return 'sweep'; return 'blink'; },
    pats: {
      gaze: (sim, b, dt, tp) => { const p = b.pat; p.t += dt; const w = 1.1; if (p.step === 0) { if (p.t < w * 0.4 && tp) face(b, tp); b.tg = ['l', b.x, b.y - 6, b.facing, 260, 12, Math.min(1, p.t / w)]; if (p.t >= w) { b.tg = null; p.step = 1; p.t = 0; p.beam = S.zone(sim, { x: b.x, y: b.y - 6, r: 260, a: b.facing, elem: 'beam', life: 0.7, team: 'e', dps: b.atk * 2.5, owner: b }); G.fx('snd', 'laser'); G.fx('shake', 3); } return false; } if (p.beam) { p.beam.x = b.x; p.beam.y = b.y - 6; } return p.t >= 0.7; },
      sweep: (sim, b, dt, tp) => { const p = b.pat; p.t += dt; if (p.step === 0) { if (tp) face(b, tp); p.a0 = b.facing - 0.9; b.tg = ['a', b.x, b.y, b.facing, 1.8, 200, Math.min(1, p.t / 1.3)]; if (p.t >= 1.3) { b.tg = null; p.step = 1; p.t = 0; p.beam = S.zone(sim, { x: b.x, y: b.y - 6, r: 220, a: p.a0, elem: 'beam', life: 1.6, team: 'e', dps: b.atk * 1.6, owner: b }); G.fx('snd', 'laser'); } return false; } if (p.beam) { p.beam.a = p.a0 + (p.t / 1.6) * 1.8; p.beam.x = b.x; p.beam.y = b.y - 6; } return p.t >= 1.6; },
      blink: (sim, b, dt) => { const p = b.pat; p.t += dt; if (p.step === 0) { b.tg = ['c', b.x, b.y, 20, Math.min(1, p.t / 0.6)]; if (p.t >= 0.6) { p.step = 1; b.tg = null; const room = sim.map.rooms[0]; for (let i = 0; i < 10; i++) { const x = (room.x + sim.rng.int(3, room.w - 4)) * T, y = (room.y + sim.rng.int(3, room.h - 4)) * T; if (!W.solidAt(sim.map, x, y) && !sim.players.some(q => q && U.dist(q.x, q.y, x, y) < 40)) { G.fx('burst', b.x, b.y - 10, 14, ['#ff4080', '#2a1a3a'], 50, 0.5); b.x = x; b.y = y; G.fx('burst', x, y - 10, 14, ['#ff4080'], 50, 0.5); break; } } G.fx('snd', 'stealth'); } return false; } return true; },
      spawn: (sim, b, dt) => { const p = b.pat; p.t += dt; if (p.step === 0) { b.tg = ['c', b.x, b.y, 36, Math.min(1, p.t / 0.9)]; if (p.t >= 0.9) { b.tg = null; p.step = 1; for (let i = 0; i < 2; i++) { const m = S.spawnEnemy(sim, i ? 'hound' : 'watcher', b.x + (i ? 24 : -24), b.y + 10, { summon: true }); if (m) { m.summonedBy = b.id; m.noCount = true; } } G.fx('snd', 'summon'); } return false; } return true; },
    },
    onPhase(sim, b) { },
  };

  // ───── 심연의 군주
  B.lord = {
    phases: 3, gap: 0.9,
    init(sim, b) { b.echoes = []; },
    tick(sim, b, dt, tp) {
      if (b.phase === 2 && b.echoes.length) {
        const alive = b.echoes.filter(e => !e.dead && !e.removed);
        if (alive.length) { b.invuln = 1; b.noPatterns = true; b.glow = 50; b.glowC = '#8040ff'; if (sim.tick % 120 === 0) G.fx('txt', b.x, b.y - 30, `환영 ${alive.length}마리 남음`, '#c080ff', 7); return; }
        b.echoes = []; b.invuln = 0; b.noPatterns = false; G.fx('banner', '환영 소멸', '군주가 다시 움직인다'); G.fx('snd', 'roar');
      }
      b.invuln = 0; b.glow = b.phase === 3 ? 70 : 30; b.glowC = b.phase === 3 ? '#ff2060' : '#8040ff';
      if (b.phase === 3 && sim.tick % 150 === 0) { // 심연의 비
        for (let i = 0; i < 3; i++) { const q = sim.rng.pick(S.alivePlayers(sim)); if (!q) break; const x = q.x + sim.rng.range(-40, 40), y = q.y + sim.rng.range(-40, 40); const o = S.addObj(sim, 'tg', x, y, { life: 1.4, r: 0 }); o.tg = ['c', x, y, 34, 0]; o.tgLife = 1.4; o.onEnd = (sim2) => { AI.hitCircle(sim2, x, y, 34, b.atk * 1.1, b, { knock: 20 }); G.fx('boom', x, y, 34, false); G.fx('snd', 'boom'); S.zone(sim2, { x, y, r: 26, elem: 'dark', life: 4, team: 'e', dps: b.atk * 0.2 }); }; }
      }
    },
    pick(sim, b, tp) {
      const d = U.dist(b.x, b.y, tp.x, tp.y), r = sim.rng();
      if (b.phase === 3 && r < 0.2) return 'ring';
      if (d < 50) return r < 0.55 ? 'cleave' : r < 0.8 ? 'stomp' : 'ring';
      if (r < 0.5) return 'charge';
      return r < 0.8 ? 'bolts' : 'stomp';
    },
    pats: {
      cleave: windArc(0.8, 2.4, 46, 1.6, { knock: 34 }),
      stomp: windCircle(1.0, 60, 1.3, { knock: 40, stun: 0.5, color: '#ff2060' }),
      charge: windDash(0.9, 8 * T, 12, 1.5),
      bolts: volley(4, 170, 0.22, { type: 'bolt', spread: 0.5, dmgMul: 0.9 }),
      ring: ring(12, 120, 0.9),
    },
    onPhase(sim, b, ph) {
      if (ph === 2) {
        const specs = [['echoGrad', -50, -30], ['echoElun', 50, -30], ['echoEye', 0, 40]];
        for (const [t, dx, dy] of specs) { const e = S.spawnEnemy(sim, t, b.x + dx, b.y + dy, { summon: true, hpMul: 0.5 }); if (e) { e.summonedBy = b.id; e.noCount = true; e.sz = 1.4; b.echoes.push(e); } }
        G.fx('banner', '과거의 환영', '세 보스의 환영을 쓰러뜨려라');
      }
      if (ph === 3) { sim.lightMul = 0.6; b.spd *= 1.3; for (const q of sim.players) if (q) q.st.morale += 1; G.fx('banner', '어둠이 내린다', '사기 충전 2배 — 궁극기를 모아라'); }
    },
  };
  return B;
})();
