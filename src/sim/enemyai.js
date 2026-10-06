// 적 AI — 데이터의 ai 종류별 상태기계. 모든 공격은 예고(tg) 후 실행
G.EnemyAI = (function () {
  const AI = {};
  const C = G.C, U = G.U, S = G.Sim, St = G.St, W = G.World, T = C.TILE;

  // ───── 도구
  AI.moveToward = function (sim, e, tx, ty, dt, mul, ghost) {
    const a = Math.atan2(ty - e.y, tx - e.x);
    const spd = e.spd * T * St.speedMul(e) * (mul || 1);
    W.move(sim.map, e, Math.cos(a) * spd * dt, Math.sin(a) * spd * dt, ghost);
    e.dir = tx > e.x ? 1 : -1;
  };
  AI.moveAway = function (sim, e, tx, ty, dt, mul) {
    const a = Math.atan2(e.y - ty, e.x - tx);
    const spd = e.spd * T * St.speedMul(e) * (mul || 1);
    W.move(sim.map, e, Math.cos(a) * spd * dt, Math.sin(a) * spd * dt);
    e.dir = tx > e.x ? 1 : -1;
  };
  AI.separate = function (sim, e, dt) {
    for (const o of sim.ents) {
      if (o === e || o.kind !== 'e' || o.dead || o.hd || o.spd === 0) continue;
      const d = U.dist(e.x, e.y, o.x, o.y), min = e.r + o.r;
      if (d < min && d > 0.1) { const a = Math.atan2(e.y - o.y, e.x - o.x); W.move(sim.map, e, Math.cos(a) * (min - d) * 4 * dt, Math.sin(a) * (min - d) * 4 * dt); }
    }
  };
  // 부채꼴 타격 (플레이어·소환물·토템)
  AI.hitArc = function (sim, e, r, w, dmg, o) {
    o = o || {}; let hit = 0;
    for (const p of sim.players) {
      if (!p || p.down || p.ghost) continue;
      const d = U.dist(e.x, e.y, p.x, p.y); if (d > r + p.r) continue;
      if (w < Math.PI * 2 && Math.abs(U.angDiff(e.facing, Math.atan2(p.y - e.y, p.x - e.x))) > w / 2 && d > 6) continue;
      S.hurtPlayer(sim, p, dmg, { ent: e, tag: 'e', elem: o.elem, melee: true, x: e.x, y: e.y }); hit++;
      if (o.knock) { const a = Math.atan2(p.y - e.y, p.x - e.x); W.move(sim.map, p, Math.cos(a) * o.knock, Math.sin(a) * o.knock); }
      if (o.stun) St.add(sim, p, 'stun', { t: o.stun });
    }
    for (const m of sim.ents) if (m.kind === 'm' && !m.dead && U.dist(e.x, e.y, m.x, m.y) < r + m.r && (w >= Math.PI * 2 || Math.abs(U.angDiff(e.facing, Math.atan2(m.y - e.y, m.x - e.x))) < w / 2)) { S.damage(sim, m, dmg, { ent: e, tag: 'e', x: e.x, y: e.y }); hit++; }
    for (const t of sim.ents) if (t.kind === 'o' && (t.type === 'totem' || t.type === 'decoy') && !t.removed && U.dist(e.x, e.y, t.x, t.y) < r + 8) { t.life -= 2; hit++; G.fx('burst', t.x, t.y - 6, 4, '#aaa', 30, 0.3); }
    return hit;
  };
  AI.hitCircle = function (sim, cx, cy, r, dmg, e, o) {
    o = o || {}; let hit = 0;
    for (const p of sim.players) if (p && !p.down && !p.ghost && U.dist(cx, cy, p.x, p.y) < r + p.r) { S.hurtPlayer(sim, p, dmg, { ent: e, tag: 'e', elem: o.elem, x: cx, y: cy }); hit++; if (o.knock) { const a = Math.atan2(p.y - cy, p.x - cx); W.move(sim.map, p, Math.cos(a) * o.knock, Math.sin(a) * o.knock); } if (o.stun) St.add(sim, p, 'stun', { t: o.stun }); }
    for (const m of sim.ents) if (m.kind === 'm' && !m.dead && U.dist(cx, cy, m.x, m.y) < r + m.r) { S.damage(sim, m, dmg, { ent: e, tag: 'e', x: cx, y: cy }); hit++; }
    for (const t of sim.ents) if (t.kind === 'o' && t.type === 'barrel' && !t.removed && U.dist(cx, cy, t.x, t.y) < r + 8) S.breakBarrel(sim, t, e);
    return hit;
  };
  AI.fire = function (sim, e, tx, ty, o) {
    o = o || {};
    const a = Math.atan2(ty - e.y, tx - e.x), spd = o.spd || 150;
    const j = S.proj(sim, { x: e.x + Math.cos(a) * 8, y: e.y - 6 + Math.sin(a) * 8, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, team: 'e', owner: e, dmg: o.dmg || e.atk, life: o.life || 2, r: o.r || 3, type: o.type || 'enemyArrow', elem: o.elem || null, zone: o.zone || null, pierce: o.pierce || 0 });
    return j;
  };
  const targetOf = (sim, e) => S.targetPos(sim, e);
  function retarget(sim, e, dt) {
    e.ai.rt = (e.ai.rt || 0) - dt;
    if (e.ai.rt <= 0 || e.target < 0) { e.ai.rt = 0.3; const t = S.pickTarget(sim, e); if (t !== e.target) e.target = t; }
    const tp = targetOf(sim, e);
    if (!tp) { if (e.target >= 0) e.target = -1; return null; }
    return tp;
  }
  function face(e, tp) { if (tp) e.facing = Math.atan2(tp.y - e.y, tp.x - e.x); e.dir = Math.cos(e.facing) >= 0 ? 1 : -1; }

  // ───── 메인
  AI.update = function (sim, e, dt) {
    const s = e.ai, p = e.data.p, st = e.status;
    if (s.cd > 0) s.cd -= dt;
    if (e.blind > 0) e.blind -= dt;
    if (st.frozen || st.stun) { e.tg = null; if (s.state === 'wind' || s.state === 'attack') { s.state = 'chase'; s.t = 0; } return; }
    const fn = AI[e.data.ai] || AI.melee;
    fn(sim, e, dt);
    if (e.spd > 0 && !e.hd && s.state !== 'dash') AI.separate(sim, e, dt);
    e.x = U.clamp(e.x, 8, sim.map.w * T - 8); e.y = U.clamp(e.y, 8, sim.map.h * T - 8);
  };

  // 공용 근접 루틴
  function meleeCore(sim, e, dt, opt) {
    const s = e.ai, p = e.data.p; opt = opt || {};
    const tp = retarget(sim, e, dt);
    const reach = (opt.reach || 10) + e.r;
    if (s.state === 'idle') { if (tp) s.state = 'chase'; return; }
    if (s.state === 'chase') {
      if (!tp) { s.state = 'idle'; return; }
      face(e, tp);
      const d = U.dist(e.x, e.y, tp.x, tp.y);
      // 인접한 소환물 우선
      let m = null; for (const o of sim.ents) if (o.kind === 'm' && !o.dead && U.dist(e.x, e.y, o.x, o.y) < reach + 4) { m = o; break; }
      if (d > reach && !m) { AI.moveToward(sim, e, tp.x, tp.y, dt, opt.spdMul, opt.ghost); }
      else if (s.cd <= 0) { if (m) e.facing = Math.atan2(m.y - e.y, m.x - e.x); s.state = 'wind'; s.t = 0; s.hitsLeft = p.hits || 1; e.tg = ['a', e.x, e.y, e.facing, opt.width || 1.6, reach + 8, 0]; }
      return;
    }
    if (s.state === 'wind') {
      s.t += dt; const wind = (p.wind || 0.5) / (e.aspdMul || 1);
      if (!tp) { s.state = 'idle'; e.tg = null; return; }
      if (s.t < wind * 0.6) face(e, tp);
      e.tg = ['a', e.x, e.y, e.facing, opt.width || 1.6, reach + 8, Math.min(1, s.t / wind)];
      if (s.t >= wind) {
        e.tg = null;
        AI.hitArc(sim, e, reach + 8, opt.width || 1.6, e.atk * (opt.dmgMul || 1), { elem: p.elem, knock: opt.knock || 0, stun: opt.stun });
        G.fx('snd', 'swing'); G.fx('arc', e.x, e.y - 4, reach + 8, e.facing, opt.width || 1.6, '#ff6060');
        s.hitsLeft--;
        if (s.hitsLeft > 0) { s.state = 'wind'; s.t = (p.wind || 0.5) * 0.55; } else { s.state = 'recover'; s.t = 0; s.cd = (opt.cd || 0.6) / (e.aspdMul || 1); }
      }
      return;
    }
    if (s.state === 'recover') { s.t += dt; if (s.t >= 0.35) s.state = 'chase'; return; }
    if (s.state === 'flee') { opt.flee && opt.flee(sim, e, dt, tp); return; }
    s.state = 'chase';
  }
  AI.melee = (sim, e, dt) => meleeCore(sim, e, dt, { knock: e.data.tags && e.data.tags.includes('heavy') ? 18 : 6 });
  AI.pack = (sim, e, dt) => meleeCore(sim, e, dt, { spdMul: 1, cd: 0.5, width: 1.4 });
  AI.phaser = (sim, e, dt) => meleeCore(sim, e, dt, { ghost: true, cd: 0.8 });

  AI.coward = function (sim, e, dt) {
    const s = e.ai, p = e.data.p;
    if (!e.fled && e.hp / e.maxHp <= p.flee) { e.fled = true; s.state = 'flee'; s.t = 0; e.tg = null; G.fx('txt', e.x, e.y - 14, '도망!', '#ffd36b', 6); }
    meleeCore(sim, e, dt, { flee: (sim2, e2, dt2, tp) => {
      s.t += dt2; if (tp) AI.moveAway(sim2, e2, tp.x, tp.y, dt2, 1.2);
      if (s.t >= p.callAfter) { for (const t of p.call) S.spawnEnemy(sim2, t, e2.x + sim2.rng.range(-12, 12), e2.y + sim2.rng.range(-12, 12), { wave: e2.wave, instant: true }); G.fx('snd', 'warn'); G.fx('txt', e2.x, e2.y - 14, '동료를 불렀다!', '#ff8080', 6); s.state = 'chase'; }
    } });
  };

  AI.ranged = function (sim, e, dt) {
    const s = e.ai, p = e.data.p;
    const tp = retarget(sim, e, dt);
    if (!tp) { s.state = 'idle'; e.tg = null; return; }
    const d = U.dist(e.x, e.y, tp.x, tp.y);
    if (s.state === 'wind') {
      s.t += dt; if (s.t < p.wind * 0.5) face(e, tp);
      e.tg = ['l', e.x, e.y - 4, e.facing, 170, 6, Math.min(1, s.t / p.wind)];
      if (s.t >= p.wind) {
        e.tg = null; s.state = 'chase'; s.cd = p.cd;
        AI.fire(sim, e, e.x + Math.cos(e.facing) * 100, e.y - 4 + Math.sin(e.facing) * 100, { spd: p.projSpd || 170, elem: p.elem, type: p.elem === 'fire' ? 'enemyFire' : 'enemyArrow', zone: p.zone === 'fire' ? { r: 18, elem: 'fire', life: 3, dps: e.atk * 0.15, team: 'e' } : null });
        G.fx('snd', p.elem === 'fire' ? 'fire' : 'bow');
      }
      return;
    }
    face(e, tp);
    if (d < p.min) AI.moveAway(sim, e, tp.x, tp.y, dt);
    else if (d > p.max || !W.los(sim.map, e.x, e.y, tp.x, tp.y)) AI.moveToward(sim, e, tp.x, tp.y, dt);
    else if (s.cd <= 0 && e.blind <= 0) { s.state = 'wind'; s.t = 0; }
    s.state = s.state === 'wind' ? 'wind' : 'chase';
  };

  AI.charger = function (sim, e, dt) {
    const s = e.ai, p = e.data.p;
    const tp = retarget(sim, e, dt);
    if (s.state === 'dash') {
      s.t += dt;
      const hit = W.move(sim.map, e, Math.cos(e.facing) * p.dashSpd * T * dt, Math.sin(e.facing) * p.dashSpd * T * dt);
      for (const q of sim.players) if (q && !q.down && !q.ghost && !s.hit.has(q.id) && U.dist(e.x, e.y, q.x, q.y) < e.r + 8) { s.hit.add(q.id); S.hurtPlayer(sim, q, e.atk, { ent: e, tag: 'e', x: e.x, y: e.y }); const a = e.facing; W.move(sim.map, q, Math.cos(a) * 24, Math.sin(a) * 24); }
      s.dist += p.dashSpd * T * dt;
      if (hit || s.dist >= p.dashLen) { s.state = 'chase'; s.cd = p.cd; if (hit) { G.fx('shake', 3); G.fx('snd', 'slam'); St.add(sim, e, 'stun', { t: 0.8 }); } }
      return;
    }
    if (s.state === 'wind') {
      s.t += dt; if (s.t < p.wind * 0.6 && tp) face(e, tp);
      e.tg = ['l', e.x, e.y, e.facing, p.dashLen, e.r * 2 + 4, Math.min(1, s.t / p.wind)];
      if (s.t >= p.wind) { e.tg = null; s.state = 'dash'; s.t = 0; s.dist = 0; s.hit = new Set(); G.fx('snd', 'roar'); }
      return;
    }
    if (!tp) { s.state = 'idle'; return; }
    face(e, tp);
    const d = U.dist(e.x, e.y, tp.x, tp.y);
    if (s.cd <= 0 && d < 180 && W.los(sim.map, e.x, e.y, tp.x, tp.y)) { s.state = 'wind'; s.t = 0; }
    else if (d > 20) AI.moveToward(sim, e, tp.x, tp.y, dt, 0.8);
    else if (s.cd > 0) meleeCore(sim, e, dt, { knock: 20 });
    if (s.state === 'idle') s.state = 'chase';
  };

  AI.turret = function (sim, e, dt) {
    const s = e.ai, p = e.data.p;
    const tp = retarget(sim, e, dt);
    if (s.state === 'wind') {
      s.t += dt;
      e.tg = ['c', s.tx, s.ty, p.radius, Math.min(1, s.t / p.wind)];
      if (s.t >= p.wind) { e.tg = null; s.state = 'chase'; s.cd = p.cd; AI.hitCircle(sim, s.tx, s.ty, p.radius, e.atk, e, { knock: 10 }); G.fx('boom', s.tx, s.ty, p.radius, false); G.fx('snd', 'boom'); }
      return;
    }
    if (!tp) return;
    face(e, tp);
    if (s.cd <= 0 && U.dist(e.x, e.y, tp.x, tp.y) < p.range) { s.state = 'wind'; s.t = 0; s.tx = tp.x + (tp.input ? tp.input.x * 20 : 0); s.ty = tp.y + (tp.input ? tp.input.y * 20 : 0); }
    s.state = s.state === 'wind' ? 'wind' : 'chase';
  };

  AI.support = function (sim, e, dt) {
    const s = e.ai, p = e.data.p;
    const tp = retarget(sim, e, dt);
    if (tp) { face(e, tp); const d = U.dist(e.x, e.y, tp.x, tp.y); if (d < p.min) AI.moveAway(sim, e, tp.x, tp.y, dt); }
    if (s.cd <= 0) {
      let best = null, bd = 120;
      for (const o of sim.ents) if (o.kind === 'e' && o !== e && !o.dead && o.shield <= 0) { const d = U.dist(e.x, e.y, o.x, o.y); if (d < bd) { bd = d; best = o; } }
      if (best) { best.shield = p.shield + sim.depth * 3; s.cd = p.cd; G.fx('snd', 'holy'); G.fx('ring', best.x, best.y, 4, 14, '#c080ff', 0.4); G.fx('txt', e.x, e.y - 14, '보호막', '#c080ff', 6); }
      else s.cd = 1;
    }
    s.state = tp ? 'chase' : 'idle';
  };

  AI.slammer = function (sim, e, dt) {
    const s = e.ai, p = e.data.p;
    const tp = retarget(sim, e, dt);
    if (s.state === 'wind') {
      s.t += dt; e.tg = ['c', e.x, e.y, p.radius, Math.min(1, s.t / p.wind)];
      if (s.t >= p.wind) { e.tg = null; s.state = 'chase'; s.cd = p.cd; AI.hitCircle(sim, e.x, e.y, p.radius, e.atk, e, { knock: 30, stun: 0.3 }); G.fx('shake', 6); G.fx('snd', 'slam'); G.fx('ring', e.x, e.y, 6, p.radius, '#c0a080', 0.4); }
      return;
    }
    if (!tp) { s.state = 'idle'; return; }
    face(e, tp);
    const d = U.dist(e.x, e.y, tp.x, tp.y);
    if (d > p.radius * 0.7) AI.moveToward(sim, e, tp.x, tp.y, dt);
    else if (s.cd <= 0) { s.state = 'wind'; s.t = 0; }
    if (s.state === 'idle') s.state = 'chase';
  };

  AI.grabber = function (sim, e, dt) {
    const s = e.ai, p = e.data.p;
    if (e.hd == null) { e.hd = 1; e.noKnock = true; s.state = 'hidden'; }
    const tp = retarget(sim, e, dt);
    if (s.state === 'hidden') {
      e.invuln = 1;
      if (tp && U.dist(e.x, e.y, tp.x, tp.y) < p.range) { s.state = 'emerge'; s.t = 0; e.tg = ['c', e.x, e.y, 16, 0]; }
      return;
    }
    e.invuln = 0;
    if (s.state === 'emerge') { s.t += dt; e.tg = ['c', e.x, e.y, 16, Math.min(1, s.t / 0.5)]; if (s.t >= 0.5) { e.hd = 0; e.tg = null; s.state = 'chase'; G.fx('burst', e.x, e.y, 10, ['#3a2a5a', '#c080ff'], 40, 0.5); G.fx('snd', 'summon'); } return; }
    if (s.state === 'hold') {
      const q = sim.players[e.held];
      s.t += dt;
      if (!q || q.down || q.ghost || !q.held || s.t > 4 || (e.hp < s.hpAt - e.maxHp * 0.15)) { if (q) q.held = null; e.held = null; s.state = 'chase'; s.cd = p.cd || 2.5; G.fx('txt', e.x, e.y - 14, '놓침', '#aaa', 6); return; }
      if (sim.tick % 30 === 0) S.hurtPlayer(sim, q, p.holdDps * 0.5, { ent: e, tag: 'dot', cause: '촉수' });
      return;
    }
    if (s.state === 'wind') {
      s.t += dt; e.tg = ['c', e.x, e.y, 24, Math.min(1, s.t / p.wind)];
      if (s.t >= p.wind) {
        e.tg = null; s.state = 'chase'; s.cd = 1.5;
        for (const q of sim.players) if (q && !q.down && !q.ghost && !q.roll && U.dist(e.x, e.y, q.x, q.y) < 24 + q.r) { q.held = e; e.held = q.slot; s.state = 'hold'; s.t = 0; s.hpAt = e.hp; G.fx('snd', 'grab'); G.fx('txt', q.x, q.y - 20, '붙잡힘! 동료가 때려야 함', '#ff8080', 6); break; }
      }
      return;
    }
    if (tp) face(e, tp);
    if (tp && s.cd <= 0 && U.dist(e.x, e.y, tp.x, tp.y) < 30) { s.state = 'wind'; s.t = 0; }
    else s.state = 'chase';
  };

  AI.laser = function (sim, e, dt) {
    const s = e.ai, p = e.data.p;
    const tp = retarget(sim, e, dt);
    if (s.state === 'wind') {
      s.t += dt; if (s.t < p.wind * 0.4 && tp) face(e, tp);
      e.tg = ['l', e.x, e.y - 6, e.facing, p.len, 10, Math.min(1, s.t / p.wind)];
      if (s.t >= p.wind) { e.tg = null; s.state = 'beam'; s.t = 0; s.cd = p.cd; const z = S.zone(sim, { x: e.x, y: e.y - 6, r: p.len, a: e.facing, elem: 'beam', life: p.beam, team: 'e', dps: e.atk * 2.2, owner: e }); s.beam = z; G.fx('snd', 'laser'); G.fx('shake', 2); }
      return;
    }
    if (s.state === 'beam') { s.t += dt; if (s.beam) { s.beam.x = e.x; s.beam.y = e.y - 6; } if (s.t >= p.beam) s.state = 'chase'; return; }
    if (!tp) { s.state = 'idle'; return; }
    face(e, tp);
    const d = U.dist(e.x, e.y, tp.x, tp.y);
    if (d < p.min) AI.moveAway(sim, e, tp.x, tp.y, dt);
    else if (d > p.max || !W.los(sim.map, e.x, e.y, tp.x, tp.y)) AI.moveToward(sim, e, tp.x, tp.y, dt);
    else if (s.cd <= 0 && e.blind <= 0) { s.state = 'wind'; s.t = 0; }
    if (s.state === 'idle') s.state = 'chase';
    e.fy = Math.sin(sim.time * 3 + e.id) * 2 - 4;
  };

  AI.mirror = function (sim, e, dt) {
    if (!e.mirrorCls) { const ps = S.alivePlayers(sim); const q = ps.length ? sim.rng.pick(ps) : null; e.mirrorCls = q ? q.cls : 'knight'; e.mirrorRanged = ['archer', 'mage', 'priest', 'necro', 'gunner'].includes(e.mirrorCls); G.fx('txt', e.x, e.y - 16, `${G.CLASSES[e.mirrorCls].name}의 그림자`, '#ff40a0', 6); }
    if (e.mirrorRanged) { e.data = Object.assign({}, e.data, { ai: 'ranged', p: { min: 80, max: 150, wind: 0.6, cd: 1.6, projSpd: 200 } }); AI.ranged(sim, e, dt); }
    else meleeCore(sim, e, dt, { knock: 14, cd: 0.4 });
  };

  AI.blinker = function (sim, e, dt) {
    const s = e.ai, p = e.data.p;
    const tp = retarget(sim, e, dt);
    if (s.state === 'chase' && tp && s.cd <= 0 && U.dist(e.x, e.y, tp.x, tp.y) < 140) {
      const fx = tp.aim != null ? Math.cos(tp.aim) : 1, fy = tp.aim != null ? Math.sin(tp.aim) : 0;
      const nx = tp.x - fx * 16, ny = tp.y - fy * 16;
      if (!W.solidAt(sim.map, nx, ny)) { G.fx('burst', e.x, e.y - 6, 10, ['#2a1a3a', '#c040ff'], 40, 0.4); e.x = nx; e.y = ny; G.fx('burst', e.x, e.y - 6, 10, ['#c040ff'], 40, 0.4); G.fx('snd', 'stealth'); s.cd = p.cd; s.state = 'wind'; s.t = 0; e.facing = Math.atan2(tp.y - e.y, tp.x - e.x); e.tg = ['a', e.x, e.y, e.facing, 1.6, 18 + e.r, 0]; s.hitsLeft = 1; }
    }
    meleeCore(sim, e, dt, { knock: 12, cd: 0.5 });
  };

  AI.puller = function (sim, e, dt) {
    const s = e.ai, p = e.data.p;
    e.noKnock = true;
    const tp = retarget(sim, e, dt);
    for (const q of sim.players) if (q && !q.down && !q.ghost && !q.roll) { const d = U.dist(e.x, e.y, q.x, q.y); if (d < p.range && d > p.biteR * 0.5) { const a = Math.atan2(e.y - q.y, e.x - q.x); W.move(sim.map, q, Math.cos(a) * p.pull * dt, Math.sin(a) * p.pull * dt); } }
    if (sim.tick % 40 === 0) G.fx('ring', e.x, e.y, p.range, p.biteR, '#8040c0', 0.7);
    if (s.state === 'wind') {
      s.t += dt; e.tg = ['c', e.x, e.y, p.biteR, Math.min(1, s.t / p.biteWind)];
      if (s.t >= p.biteWind) { e.tg = null; s.state = 'chase'; s.cd = p.cd; AI.hitCircle(sim, e.x, e.y, p.biteR, e.atk, e, { knock: 30 }); G.fx('snd', 'heavy'); }
      return;
    }
    if (tp) face(e, tp);
    if (s.cd <= 0 && sim.players.some(q => q && !q.down && !q.ghost && U.dist(e.x, e.y, q.x, q.y) < p.biteR)) { s.state = 'wind'; s.t = 0; }
    else s.state = tp ? 'chase' : 'idle';
  };

  AI.summoner = function (sim, e, dt) {
    const s = e.ai, p = e.data.p;
    const tp = retarget(sim, e, dt);
    if (tp) { face(e, tp); const d = U.dist(e.x, e.y, tp.x, tp.y); if (d < p.min) AI.moveAway(sim, e, tp.x, tp.y, dt); }
    const owned = sim.ents.filter(o => o.kind === 'e' && !o.dead && o.summonedBy === e.id).length;
    if (s.cd <= 0 && tp) {
      if (owned < p.max) { for (const t of p.summon) { const m = S.spawnEnemy(sim, t, e.x + sim.rng.range(-20, 20), e.y + sim.rng.range(-20, 20), { wave: e.wave, summon: true }); if (m) { m.summonedBy = e.id; m.noCount = true; } } G.fx('snd', 'summon'); s.cd = p.cd; }
      else { AI.fire(sim, e, tp.x, tp.y - 4, { spd: 170, type: 'bolt' }); s.cd = 1.5; }
    }
    s.state = tp ? 'chase' : 'idle';
  };
  return AI;
})();
