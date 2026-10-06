// 직업 스킬 구현 — 수치는 data/classes.js + config, 카드 플래그/스킬 배율은 p.flags / p.sk
G.Skills = (function () {
  const K = {};
  const C = G.C, U = G.U, S = G.Sim, St = G.St, W = G.World, T = C.TILE;
  const sp = (p, k, base) => S.skParam(p, k, base);
  const cd = (p, k) => { const cls = G.CLASSES[p.cls]; return S.cdOf(p, sp(p, k + 'Cd', cls[k].cd)); };

  // ───── 공용 도구
  K.aimOf = function (sim, p) {
    let a = p.aim, best = null, bd = C.AIM_ASSIST_ANG;
    for (const e of sim.ents) {
      if (e.kind !== 'e' || e.dead || e.spawnT > 0 || e.hd) continue;
      const d = U.dist(p.x, p.y, e.x, e.y); if (d > C.AIM_ASSIST_RANGE * T) continue;
      const da = Math.abs(U.angDiff(a, Math.atan2(e.y - 4 - p.y, e.x - p.x))); if (da < bd) { bd = da; best = e; }
    }
    return best ? Math.atan2(best.y - 4 - p.y, best.x - p.x) : a;
  };
  K.nearestEnemy = function (sim, p, range, cone) {
    let best = null, bd = range;
    for (const e of sim.ents) { if (e.kind !== 'e' || e.dead || e.spawnT > 0 || e.hd) continue; const d = U.dist(p.x, p.y, e.x, e.y); if (d < bd && (!cone || Math.abs(U.angDiff(p.aim, Math.atan2(e.y - p.y, e.x - p.x))) < cone)) { bd = d; best = e; } }
    return best;
  };
  K.allies = (sim, p, range, self) => sim.players.filter(q => q && (self || q !== p) && !q.down && !q.ghost && U.dist(p.x, p.y, q.x, q.y) <= range);
  // 부채꼴 근접
  K.arc = function (sim, p, range, width, dmgMul, o) {
    o = o || {};
    p.swing = 1;
    const a = p.aim; const hits = [];
    G.fx('arc', p.x, p.y - 4, range, a, width, o.color || '#e8e0d0');
    for (const e of sim.ents) {
      if (!(e.kind === 'e' || (e.kind === 'o' && (e.type === 'dummy' || e.type === 'barrel'))) || e.dead || e.removed || e.spawnT > 0 || e.hd) continue;
      const d = U.dist(p.x, p.y, e.x, e.y); if (d > range + (e.r || 6)) continue;
      if (width < Math.PI * 2 && Math.abs(U.angDiff(a, Math.atan2(e.y - p.y, e.x - p.x))) > width / 2 && d > 8) continue;
      const back = e.kind === 'e' && Math.abs(U.angDiff(e.facing, Math.atan2(p.y - e.y, p.x - e.x))) > 2.2;
      let crit = false;
      if (p.status.stealth && e.kind === 'e') { crit = true; }
      S.damage(sim, e, p.st.atk * dmgMul * (crit && p.cls === 'rogue' ? 3 : 1), { ent: p, slot: p.slot, tag: o.tag || 'basic', heavy: o.heavy || p.hasHook('heavyAll'), knock: o.knock || 14, elem: o.elem, back, crit, x: p.x, y: p.y, melee: true, threatMul: o.threatMul });
      if (o.onHit && e.kind === 'e') o.onHit(e);
      hits.push(e);
    }
    if (p.status.stealth && hits.length) delete p.status.stealth;
    G.fx('snd', o.snd || 'swing');
    return hits;
  };
  K.shoot = function (sim, p, o) {
    const a = o.a != null ? o.a : K.aimOf(sim, p);
    const spd = o.spd || 220;
    const mk = (ang, dm) => S.proj(sim, Object.assign({ x: p.x + Math.cos(ang) * 8, y: p.y - 5 + Math.sin(ang) * 8, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, team: 'p', owner: p, slot: p.slot, dmg: (o.dmg || p.st.atk) * (dm || 1), life: (p.st.range * 1.2) / spd + 0.2 }, o.spec || {}));
    const out = [mk(a, 1)];
    if (o.twin !== false && p.hasHook('twinShot') && (o.spec && o.spec.tag === 'basic')) { out[0].dmg *= 0.7; out.push(mk(a + 0.12, 0.7)); }
    G.fx('snd', o.snd || 'shoot');
    return out;
  };
  K.useUlt = function (sim, p) {
    if (p.morale < C.MORALE_MAX) { G.fx('snd', 'deny'); return false; }
    p.morale = 0; p.stats.ults++; sim.ultTimes[p.slot] = sim.time;
    G.fx('snd', 'ult'); G.fx('ult', p.x, p.y, G.CLASSES[p.cls].r.name, p.slot);
    const alive = S.alivePlayers(sim);
    if (alive.length >= 2 && alive.every(q => sim.ultTimes[q.slot] != null && sim.time - sim.ultTimes[q.slot] <= C.ALL_IN_WINDOW)) {
      let dur = C.ALL_IN_DUR; if (alive.some(q => q.hasHook('allIn2'))) dur += 4;
      sim.allIn = dur; sim.ultTimes = {}; G.fx('snd', 'allin'); G.fx('banner', '총공세!', '파티 공격력 +20%');
      sim.events.push({ t: 'allIn' });
    }
    return true;
  };
  K.dash = function (sim, p, len, dur, o) { p.dash = Object.assign({ t: dur, dur, dx: Math.cos(p.aim), dy: Math.sin(p.aim), spd: len / dur, hit: new Set() }, o || {}); p.inv = Math.max(p.inv, dur); };
  function updateDash(sim, p, dt) {
    const d = p.dash; d.t -= dt;
    const hit = W.move(sim.map, p, d.dx * d.spd * dt, d.dy * d.spd * dt);
    if (d.dmg) for (const e of sim.ents) if (e.kind === 'e' && !e.dead && e.spawnT <= 0 && !d.hit.has(e.id) && U.dist(p.x, p.y, e.x, e.y) < 16) { d.hit.add(e.id); S.damage(sim, e, p.st.atk * d.dmg, { ent: p, slot: p.slot, tag: 'q', knock: 40, heavy: true, x: p.x - d.dx * 10, y: p.y - d.dy * 10 }); if (d.elem) St.applyElem(sim, e, d.elem, { ent: p, slot: p.slot, tag: 'q' }); }
    if (hit && d.wall) { p.dash = null; d.wall(sim, p); return; }
    if (d.t <= 0) { p.dash = null; if (d.end) d.end(sim, p); }
  }

  // ───── 메인
  K.update = function (sim, p, pr, hold, dt) {
    if (p.dash) { updateDash(sim, p, dt); return; }
    if (p.atkT > 0) p.atkT -= dt;
    if (p.trapT > 0) { p.trapT -= dt; if (p.trapT <= 0) { const max = (p.flags.trap3 ? 3 : 2) + (p.tal.trapPlus1 ? 1 : 0); if (p.traps < max) { p.traps++; if (p.traps < max) p.trapT = cd(p, 'e'); } } }
    if (p.reloading > 0) { p.reloading -= dt; if (p.reloading <= 0) { p.ammo = p.flags.mag9 ? 9 : 6; G.fx('snd', 'reload'); if (p.flags.reloadKnock) for (const e of sim.ents) if (e.kind === 'e' && !e.dead && U.dist(p.x, p.y, e.x, e.y) < 36) { const a = Math.atan2(e.y - p.y, e.x - p.x); e.kx = (e.kx || 0) + Math.cos(a) * 40; e.ky = (e.ky || 0) + Math.sin(a) * 40; } } }
    if (p.volley) { p.volley.t -= dt; if (p.volley.t <= 0) { p.volley.n--; p.volley.t = 0.12; K.shoot(sim, p, { dmg: p.st.atk * 0.8, spd: 320, snd: 'bow', twin: false, spec: { type: 'arrow', tag: 'q', r: 3, knock: 8 } }); if (p.volley.n <= 0) p.volley = null; } }
    const cls = K[p.cls] || K.knight;
    if (p.reviving || p.channel) return;
    const ultPressed = pr.r > 0;
    if (ultPressed && cls.r) { if (K.useUlt(sim, p)) cls.r(sim, p); }
    if (pr.q > 0 || (hold & 2)) { if (cls.qHold) cls.qHold(sim, p, !!(hold & 2), pr.q); else if (pr.q > 0) { if (p.cd.q <= 0) { if (cls.q(sim, p) !== false) p.cd.q = cd(p, 'q'); } else G.fx('snd', 'deny'); } }
    else if (cls.qHold) cls.qHold(sim, p, false, 0);
    if (pr.e > 0) { if (p.cd.e <= 0) { if (cls.e(sim, p) !== false) p.cd.e = cd(p, 'e'); } else G.fx('snd', 'deny'); }
    cls.basic(sim, p, !!(hold & 1), pr.a, dt);
  };

  // ───── 기사
  K.knight = {
    basic(sim, p, held, pressed) {
      if (!held || p.atkT > 0) { if (sim.time - (p.lastHit || 0) > 1.2) p.combo = 0; return; }
      const third = p.combo === 2;
      K.arc(sim, p, p.st.range, 1.9, third ? 1.4 : 1, { knock: third ? 34 : 12, heavy: third, snd: third ? 'heavy' : 'swing', threatMul: 1.5, onHit: e => { if (third && p.flags.shieldBash) St.add(sim, e, 'stun', { t: 0.5 }); } });
      p.combo = (p.combo + 1) % 3; p.lastHit = sim.time; p.atkT = (third ? 0.6 : 0.42) / S.aspdMul(p);
    },
    qHold(sim, p, held) {
      p.qHold = held;
      if (held && p.flags.fortress) p.morale = Math.min(C.MORALE_MAX, p.morale + 3 / 60);
    },
    e(sim, p) {
      const r = 6 * T * (1 + (p.sk.eRange || 0)) + (p.tal.tauntRange ? T : 0);
      const dur = sp(p, 'eDur', 4);
      let n = 0;
      for (const e of sim.ents) if (e.kind === 'e' && !e.dead && U.dist(p.x, p.y, e.x, e.y) < r) { if (St.add(sim, e, 'taunt', { t: dur, slot: p.slot })) { S.threat(e, p.slot, C.THREAT.taunt); e.ai.state = 'chase'; n++; } }
      p.tauntActive = dur; G.fx('snd', 'taunt'); G.fx('ring', p.x, p.y, 10, r, '#ff8040', 0.5); G.fx('txt', p.x, p.y - 20, n ? `도발! (${n})` : '도발', '#ff8040', 8);
      if (p.tal.tauntCd) p.cd.e = 0;
      return true;
    },
    r(sim, p) {
      const dur = sp(p, 'rDur', 6);
      sim.partyDef = dur; p.inv = Math.max(p.inv, dur);
      for (const e of sim.ents) if (e.kind === 'e' && !e.dead && U.dist(p.x, p.y, e.x, e.y) < 44) { const a = Math.atan2(e.y - p.y, e.x - p.x); e.kx = (e.kx || 0) + Math.cos(a) * 50; e.ky = (e.ky || 0) + Math.sin(a) * 50; }
      if (p.tal.wallMorale) for (const q of K.allies(sim, p, 999)) q.morale = Math.min(C.MORALE_MAX, q.morale + 20);
      G.fx('ring', p.x, p.y, 6, 50, '#c8ccd8', 0.5); G.fx('shake', 4);
    },
  };
  // ───── 사제
  K.priest = {
    basic(sim, p, held) {
      if (!held || p.atkT > 0) return;
      const js = K.shoot(sim, p, { dmg: p.st.atk * (1 + (p.sk.basicDmg || 0)), spd: 200, snd: 'holy', spec: { type: 'orb', tag: 'basic', elem: 'holy', homing: p.tal.homing2 ? 6 : 3, pierce: p.tal.orbPierce ? 1 : 0, r: 4 } });
      for (const j of js) { j.healPass = p.flags.orbHeal2 ? 0.06 : 0.03; j.healed = new Set(); }
      p.atkT = 0.5 / S.aspdMul(p);
    },
    q(sim, p) {
      const r = 4 * T + (p.tal.waveRange ? T : 0);
      for (const q of K.allies(sim, p, r, true)) { S.heal(sim, q, q.maxHp * 0.25 * (1 + (p.sk.qDmg || 0)), p, { overShield: true }); if (p.flags.waveShield) q.shield = Math.min(q.maxHp * 0.4, q.shield + q.maxHp * 0.1); }
      G.fx('snd', 'heal'); G.fx('ring', p.x, p.y, 6, r, '#ffe0a0', 0.5);
      return true;
    },
    e(sim, p) {
      S.zone(sim, { x: p.x, y: p.y, r: 48 * (1 + (p.sk.eRange || 0)), elem: 'holy', life: sp(p, 'eDur', 6) + (p.tal.wardLong ? 2 : 0), team: 'p', dps: p.st.atk * 0.3, owner: p });
      G.fx('snd', 'holy'); return true;
    },
    r(sim, p) {
      const dead = sim.players.filter(q => q && (q.down || q.ghost));
      if (dead.length) { for (const q of dead) { if (q.ghost) { q.x = p.x + (q.slot - 1) * 12; q.y = p.y + 8; } S.revivePlayer(sim, q, p, 0.5, { inv: p.flags.blessedRevive ? 5 : 1 }); if (p.flags.blessedRevive) q.morale = Math.min(C.MORALE_MAX, q.morale + 50); } G.fx('banner', '부활의 기도', `${dead.length}명 귀환`); }
      else { for (const q of K.allies(sim, p, 9999, true)) S.heal(sim, q, q.maxHp, p); sim.partyInv = Math.max(sim.partyInv, 3); G.fx('banner', '부활의 기도', '전체 회복 · 3초 무적'); }
      G.fx('ring', p.x, p.y, 6, 90, '#ffe0a0', 0.8);
    },
  };
  // ───── 궁수
  K.archer = {
    basic(sim, p, held, pressed, dt) {
      const ct = 1.0 * (p.flags.fastCharge ? 0.65 : 1);
      if (held && p.atkT <= 0) { if (p.charge === 0) G.fx('snd', 'bowCharge'); p.charge = Math.min(1, p.charge + dt / ct); return; }
      if (!held && p.charge > 0) {
        const ch = p.charge; p.charge = 0;
        const full = ch >= 1;
        let mul = 0.6 + 1.9 * ch; if (full && p.tal.fullCharge30) mul *= 1.3;
        // 저격수: 조준선 위 가장 가까운 적까지 거리
        const tgt = K.nearestEnemy(sim, p, 20 * T, 0.4);
        if (tgt) { const d = U.dist(p.x, p.y, tgt.x, tgt.y) / T; const cap = (p.flags.sniper2 ? 0.6 : 0.3) + (p.tal.sniper10 ? 0.1 : 0); mul *= 1 + Math.min(cap, Math.floor(d / 4) * 0.1); }
        let elem = null; if (p.flags.elemArrows) { p.elemIdx = ((p.elemIdx || 0) + 1) % 3; elem = ['fire', 'ice', 'shock'][p.elemIdx]; }
        K.shoot(sim, p, { dmg: p.st.atk * mul, spd: full ? 420 : 300, snd: 'bow', spec: { type: 'arrow', tag: 'basic', r: 3, pierce: full ? 2 : 0, heavy: full, knock: full ? 24 : 8, elem, explode: full && p.flags.explosiveArrow ? 22 : 0 } });
        p.atkT = 0.22 / S.aspdMul(p);
      }
    },
    q(sim, p) { p.volley = { n: 5 + (p.flags.volley8 ? 3 : 0) + (p.tal.volleyPlus2 ? 2 : 0), t: 0 }; if (p.tal.volleyCd) p.cd.q = -cd(p, 'q') * 0.3; return true; },
    e(sim, p) {
      const js = K.shoot(sim, p, { dmg: p.st.atk * 1.2, spd: 360, snd: 'bow', twin: false, spec: { type: 'arrow', tag: 'e', r: 4, elem: null, pierce: 0 } });
      const dur = sp(p, 'eDur', 8) + (p.tal.markPlus2 ? 2 : 0);
      js[0].onHit = (sim2, j, e) => { St.add(sim2, e, 'marked', { t: dur, src: p }); G.fx('txt', e.x, e.y - 16, '표식', '#ff5050', 7); };
      if (p.tal.markCd) p.cd.e = -cd(p, 'e') * 0.3;
      return true;
    },
    r(sim, p) {
      const d = Math.min(8 * T, 8 * T); const x = p.x + Math.cos(p.aim) * d, y = p.y + Math.sin(p.aim) * d;
      const life = sp(p, 'rDur', 2.5);
      S.zone(sim, { x, y, r: 64 * (1 + (p.sk.rRange || 0)), elem: 'arrowRain', life, team: 'p', dps: p.st.atk * 12 * (1 + (p.sk.rDmg || 0)) / life, owner: p });
      G.fx('rain', x, y, 64 * (1 + (p.sk.rRange || 0)), life);
    },
  };
  // ───── 마법사
  K.mage = {
    basic(sim, p, held) {
      if (!held || p.atkT > 0) return;
      p.boltN = (p.boltN || 0) + 1;
      const every = p.flags.bolt3 ? 3 : 5; const big = p.boltN % every === 0;
      K.shoot(sim, p, { dmg: p.st.atk * (big ? 1.5 : 1), spd: 240, snd: 'bolt', spec: { type: 'bolt', tag: 'basic', r: 3, explode: big ? 22 : 0 } });
      p.atkT = 0.3 / S.aspdMul(p);
    },
    q(sim, p) {
      const fl = 4 * (p.flags.longFire ? 2 : 1) + (p.tal.fireLong1 ? 1 : 0);
      K.shoot(sim, p, { dmg: p.st.atk * 2 * (1 + (p.sk.qDmg || 0)), spd: 170, snd: 'fire', twin: false, spec: { type: 'fire', tag: 'q', r: 5, elem: 'fire', explode: 28 * (1 + (p.sk.qRange || 0) + (p.tal.fbRange20 ? 0.2 : 0)), zone: { r: 26, elem: 'fire', life: fl, dps: p.st.atk * 0.15 } } });
      return true;
    },
    e(sim, p) {
      const r = 56 * (1 + (p.sk.eRange || 0) + (p.tal.novaRange ? 0.2 : 0));
      G.fx('ring', p.x, p.y, 6, r, '#a0e0ff', 0.4); G.fx('snd', 'ice');
      for (const e of sim.ents) if (e.kind === 'e' && !e.dead && e.spawnT <= 0 && U.dist(p.x, p.y, e.x, e.y) < r + e.r) St.applyElem(sim, e, 'ice', { ent: p, slot: p.slot, tag: 'e' }, { t: sp(p, 'eDur', C.FREEZE_DUR) });
      return true;
    },
    r(sim, p) {
      const d = Math.min(8 * T, 8 * T); const x = p.x + Math.cos(p.aim) * d, y = p.y + Math.sin(p.aim) * d;
      const drop = (x, y, mul, delay) => {
        const j = S.proj(sim, { type: 'meteor', x, y, team: 'p', owner: p, slot: p.slot, dmg: 0, life: 99, fall: 1.0 + delay, p: -delay });
        j.tg = null;
        j.onLand = (sim2, jj) => { S.explode(sim2, jj.x, jj.y, 70, p.st.atk * 6 * mul * (1 + (p.sk.rDmg || 0)), { ent: p, slot: p.slot, tag: 'r' }, 'p'); S.zone(sim2, { x: jj.x, y: jj.y, r: 80, elem: 'fire', life: 5, team: 'p', dps: p.st.atk * 0.2, owner: p }); for (const e of sim2.ents) if (e.kind === 'e' && !e.dead) St.add(sim2, e, 'stun', { t: 1 }); G.fx('shake', 10); };
        const tg = S.addObj(sim, 'tg', x, y, { life: 1.0 + delay, r: 0 }); tg.tg = ['c', x, y, 70, 0]; tg.tgLife = 1.0 + delay; tg.kind2 = 'tg';
      };
      drop(x, y, 1, 0);
      if (p.flags.meteor2) drop(x + 30, y + 10, 0.6, 0.4);
    },
  };
  // ───── 도적
  K.rogue = {
    basic(sim, p, held) {
      if (!held || p.atkT > 0) return;
      K.arc(sim, p, p.st.range, 1.6, 1, { knock: 6, snd: 'dagger' });
      p.atkT = 0.2 / S.aspdMul(p);
    },
    q(sim, p) {
      const dur = sp(p, 'qDur', 1.5) + (p.tal.stealth05 ? 0.5 : 0);
      St.add(sim, p, 'stealth', { t: dur });
      if (p.flags.decoy) { const o = S.addObj(sim, 'decoy', p.x, p.y, { life: 3, nm: '' }); o.t = 'decoy'; for (const e of sim.ents) if (e.kind === 'e' && !e.dead && e.target === p.slot) { e.decoyTarget = o; } }
      K.dash(sim, p, 2 * T, 0.18, { dmg: 0 });
      for (const e of sim.ents) if (e.kind === 'e' && e.target === p.slot && !p.flags.decoy) e.target = -1;
      G.fx('snd', 'stealth'); G.fx('after', p.cls, p.x, p.y, p.dir);
      if (p.tal.shadowCd) p.cd.q = -cd(p, 'q') * 0.2;
      return true;
    },
    e(sim, p) {
      if (p.traps <= 0) { G.fx('snd', 'deny'); return false; }
      p.traps--; if (p.trapT <= 0) p.trapT = cd(p, 'e');
      S.addObj(sim, 'trap', p.x, p.y + 2, { owner: p, r: 4, life: 40 }); G.fx('snd', 'trap');
      p.cd.e = 0.3; return false;
    },
    r(sim, p) {
      const tgt = K.nearestEnemy(sim, p, 5 * T, 1.0) || K.nearestEnemy(sim, p, 4 * T);
      if (!tgt) { p.morale = C.MORALE_MAX; G.fx('txt', p.x, p.y - 20, '대상 없음', '#aaa', 7); return; }
      p.x = tgt.x - Math.cos(tgt.facing) * 10; p.y = tgt.y - Math.sin(tgt.facing) * 10; p.aim = Math.atan2(tgt.y - p.y, tgt.x - p.x);
      S.damage(sim, tgt, p.st.atk * 8 * (1 + (p.sk.rDmg || 0)) * (p.tal.assass30 ? 1.3 : 1), { ent: p, slot: p.slot, tag: 'r', back: true, crit: true, knock: 20 });
      G.fx('after', p.cls, p.x, p.y, p.dir); G.fx('hitstop', 0.12); G.fx('snd', 'crit');
    },
  };
  K.triggerTrap = function (sim, o, e) {
    const p = o.owner; S.removeEnt(sim, o);
    const mul = 1.5 * (1 + (p.tal.trap30 ? 0.3 : 0));
    S.damage(sim, e, p.st.atk * mul, { ent: p, slot: p.slot, tag: 'trap', elem: 'poison', x: o.x, y: o.y });
    if (p.flags.bombTrap) S.explode(sim, o.x, o.y, 26, p.st.atk * 2, { ent: p, slot: p.slot, tag: 'trap' }, 'p');
    G.fx('snd', 'poison'); G.fx('burst', o.x, o.y, 8, ['#90e070', '#2a2a2a'], 40, 0.4);
  };
  // ───── 광전사
  K.berserker = {
    basic(sim, p, held) {
      if (!held || p.atkT > 0) return;
      K.arc(sim, p, p.st.range, p.flags.spin ? Math.PI * 2 : 2.1, 1, { knock: 24, heavy: true, snd: 'heavy' });
      p.atkT = 0.7 / S.aspdMul(p);
    },
    q(sim, p) {
      const len = (6 + (p.tal.dashLong ? 2 : 0)) * T;
      G.fx('snd', 'dash');
      K.dash(sim, p, len, 0.32, { dmg: 1.2 * (1 + (p.tal.dash30 ? 0.3 : 0)),
        wall: (sim2, pp) => { pp.stats.wallHits++; if (pp.flags.wallBoom) { S.explode(sim2, pp.x, pp.y, 34, pp.st.atk * 2, { ent: pp, slot: pp.slot, tag: 'q' }, 'p'); } else { St.add(sim2, pp, 'stun', { t: 0.5 }); G.fx('txt', pp.x, pp.y - 20, '쿵!', '#ffd36b', 9); G.fx('shake', 4); G.fx('snd', 'slam'); sim2.events.push({ t: 'wallHit', slot: pp.slot }); } },
        end: (sim2, pp) => { if (pp.flags.dashQuake) { for (const e of sim2.ents) if (e.kind === 'e' && !e.dead && U.dist(pp.x, pp.y, e.x, e.y) < 30) St.add(sim2, e, 'stun', { t: 0.4 }); G.fx('ring', pp.x, pp.y, 4, 30, '#c0a080', 0.3); } } });
      if (p.tal.dashCd) p.cd.q = -cd(p, 'q') * 0.3;
      return true;
    },
    e(sim, p) {
      const dur = sp(p, 'eDur', 6); const v = 0.15 + (p.tal.shout20 ? 0.05 : 0);
      for (const q of K.allies(sim, p, 9999, true)) { S.addBuff(q, 'atk', v, dur, 'shout'); S.addBuff(q, 'aspd', v, dur, 'shoutA'); }
      p.morale = Math.min(C.MORALE_MAX, p.morale + (p.flags.shout30 ? 30 : 15));
      G.fx('snd', 'roar'); G.fx('ring', p.x, p.y, 8, 40, '#ff8060', 0.4); G.fx('txt', p.x, p.y - 20, '함성!', '#ff8060', 9);
      if (p.tal.shoutCd) p.cd.e = -cd(p, 'e') * 0.2;
      return true;
    },
    r(sim, p) { p.frenzy = 6 + (p.tal.frenzy2 ? 2 : 0) + (p.flags.frenzyLong ? 4 : 0); p.frenzyAtk = 0; G.fx('banner', '광란', '체력이 1 아래로 떨어지지 않는다'); },
  };
  // ───── 성기사
  K.paladin = {
    basic(sim, p, held) { if (!held || p.atkT > 0) return; K.arc(sim, p, p.st.range, 1.8, 1.1, { knock: 16, heavy: true, snd: 'heavy', threatMul: 1.3 }); p.atkT = 0.5 / S.aspdMul(p); },
    q(sim, p) {
      const v = p.maxHp * 0.25;
      const tg = p.flags.shieldAll ? K.allies(sim, p, 9999, true) : [p].concat(K.allies(sim, p, 9999).sort((a, b) => U.dist(p.x, p.y, a.x, a.y) - U.dist(p.x, p.y, b.x, b.y)).slice(0, 1));
      for (const q of tg) { q.shield = Math.min(q.maxHp * 0.5, q.shield + v * (p.tal.shield25 ? 1.25 : 1)); if (p.flags.shieldBurst) q.shieldBurst = true; }
      G.fx('snd', 'holy'); return true;
    },
    e(sim, p) {
      const m = 1 + (p.sk.eDmg || 0);
      for (const q of K.allies(sim, p, 48, true)) S.heal(sim, q, q.maxHp * 0.15 * m, p);
      for (const e of sim.ents) if (e.kind === 'e' && !e.dead && U.dist(p.x, p.y, e.x, e.y) < 40) S.damage(sim, e, p.st.atk * 1.5 * m, { ent: p, slot: p.slot, tag: 'e', elem: 'holy', threatMul: 3, color: '#ffe0a0' });
      G.fx('ring', p.x, p.y, 6, 44, '#ffe0a0', 0.4); G.fx('snd', 'holy'); return true;
    },
    r(sim, p) { sim.partyInv = Math.max(sim.partyInv, sp(p, 'rDur', 3)); for (const q of K.allies(sim, p, 9999, true)) S.heal(sim, q, q.maxHp * 0.3, p); G.fx('banner', '신성한 보호', '파티 무적'); },
  };
  // ───── 강령술사
  K.necro = {
    basic(sim, p, held) { if (!held || p.atkT > 0) return; K.shoot(sim, p, { dmg: p.st.atk, spd: 210, snd: 'bolt', spec: { type: 'bone', tag: 'basic', r: 3 } }); p.atkT = 0.45 / S.aspdMul(p); },
    q(sim, p) {
      const c = K.nearestCorpse(sim, p, 120); if (!c) { G.fx('txt', p.x, p.y - 20, '시체 없음', '#aaa', 7); return false; }
      sim.corpses.splice(sim.corpses.indexOf(c), 1);
      S.explode(sim, c.x, c.y, 30 * (1 + (p.sk.qRange || 0)), p.st.atk * 2 * (1 + (p.sk.qDmg || 0)), { ent: p, slot: p.slot, tag: 'q' }, 'p');
      S.zone(sim, { x: c.x, y: c.y, r: 22, elem: 'poison', life: 3, team: 'p', dps: p.st.atk * 0.1, owner: p });
      return true;
    },
    e(sim, p) {
      const max = p.flags.skel6 ? 6 : 4;
      if (p.summons.filter(s => !s.dead).length >= max) { G.fx('txt', p.x, p.y - 20, '해골 최대', '#aaa', 7); return false; }
      const c = K.nearestCorpse(sim, p, 140); if (!c) { G.fx('txt', p.x, p.y - 20, '시체 없음', '#aaa', 7); return false; }
      sim.corpses.splice(sim.corpses.indexOf(c), 1); K.raise(sim, p, c.x, c.y); return true;
    },
    r(sim, p) { for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; K.raise(sim, p, p.x + Math.cos(a) * 14, p.y + Math.sin(a) * 14, true); } for (const s of p.summons) { s.rage = 10; if (p.flags.legionInv) s.invuln = 10; } G.fx('banner', '죽음의 군단', '해골 공격력 2배'); },
  };
  K.nearestCorpse = (sim, p, r) => { let b = null, bd = r; for (const c of sim.corpses) { const d = U.dist(p.x, p.y, c.x, c.y); if (d < bd) { bd = d; b = c; } } return b; };
  K.raise = function (sim, p, x, y, force) {
    const max = p.flags.skel6 ? 6 : 4;
    if (!force && p.summons.filter(s => !s.dead).length >= max) return null;
    if (p.summons.filter(s => !s.dead).length >= max + 4) return null;
    const m = { kind: 'm', x, y, r: 5, dir: 1, team: 'p', owner: p.slot, sprite: 'skelMinion', hp: 0, maxHp: 0, atk: p.st.atk * 0.6 * (1 + (p.st.summon || 0)), status: {}, buffs: [], shield: 0, ai: { t: 0, cd: 0 }, flash: 0, rage: 0, invuln: 0, spawnT: 0 };
    m.maxHp = Math.round((30 + sim.depth * 4) * (1 + (p.st.summon || 0)) * 2.5); m.hp = m.maxHp;
    S.addEnt(sim, m); p.summons.push(m); G.fx('snd', 'summon'); G.fx('burst', x, y, 8, ['#e8e0d0', '#70ff70'], 40, 0.5);
    return m;
  };
  K.updateSummon = function (sim, m, dt) {
    if (m.dead) return;
    St.update(sim, m, dt);
    if (m.rage > 0) m.rage -= dt; if (m.invuln > 0) m.invuln -= dt;
    if (m.kx || m.ky) { W.move(sim.map, m, m.kx * dt * 8, m.ky * dt * 8); m.kx *= 0.8; m.ky *= 0.8; }
    const owner = sim.players[m.owner];
    if (!owner || owner.ghost) { S.kill(sim, m, {}); return; }
    let tgt = null, bd = 180;
    for (const e of sim.ents) if (e.kind === 'e' && !e.dead && e.spawnT <= 0 && !e.hd) { const d = U.dist(m.x, m.y, e.x, e.y); if (d < bd) { bd = d; tgt = e; } }
    const spd = 3.8 * T * St.speedMul(m);
    if (m.ai.cd > 0) m.ai.cd -= dt;
    if (tgt) {
      m.dir = tgt.x > m.x ? 1 : -1;
      if (bd > 14) { const a = Math.atan2(tgt.y - m.y, tgt.x - m.x); W.move(sim.map, m, Math.cos(a) * spd * dt, Math.sin(a) * spd * dt); m.moving = true; }
      else { m.moving = false; if (m.ai.cd <= 0) { m.ai.cd = 0.8; S.damage(sim, tgt, m.atk * (m.rage > 0 ? 2 : 1), { ent: m, tag: 'summon', knock: 8, x: m.x, y: m.y }); G.fx('snd', 'swing'); } }
    } else {
      const d = U.dist(m.x, m.y, owner.x, owner.y);
      if (d > 28) { const a = Math.atan2(owner.y - m.y, owner.x - m.x); W.move(sim.map, m, Math.cos(a) * spd * dt, Math.sin(a) * spd * dt); m.moving = true; m.dir = owner.x > m.x ? 1 : -1; } else m.moving = false;
    }
  };
  // ───── 총잡이
  K.gunner = {
    basic(sim, p, held) {
      if (p.reloading > 0) return;
      if (p.ammo <= 0) { p.reloading = 1.2 * (p.flags.fastReload ? 0.6 : 1); G.fx('txt', p.x, p.y - 20, '재장전', '#aaa', 6); return; }
      if (!held || p.atkT > 0) return;
      const last = p.ammo === 1 && p.flags.lastBullet;
      p.ammo--;
      K.shoot(sim, p, { dmg: p.st.atk * (last ? 3 : 1), spd: 320, snd: 'gun', spec: { type: 'bullet', tag: 'basic', r: 2, knock: 6, bounce: p.flags.ricochet ? 1 : 0 } });
      G.fx('shake', 1);
      p.atkT = 0.25 / S.aspdMul(p);
    },
    q(sim, p) { K.shoot(sim, p, { dmg: p.st.atk * 3 * (1 + (p.sk.qDmg || 0)), spd: 420, snd: 'gun', twin: false, spec: { type: 'bullet', tag: 'q', r: 3, pierce: 99, knock: 10 } }); G.fx('shake', 2); return true; },
    e(sim, p) { K.shoot(sim, p, { dmg: p.st.atk * 2 * (1 + (p.sk.eDmg || 0)), spd: 220, snd: 'gun', twin: false, spec: { type: 'fire', tag: 'e', r: 4, elem: 'fire', explode: 26 * (1 + (p.sk.eRange || 0)), zone: { r: 20, elem: 'fire', life: 3, dps: p.st.atk * 0.12 } } }); return true; },
    r(sim, p) { const n = p.flags.fan24 ? 24 : 12; const base = K.aimOf(sim, p); for (let i = 0; i < n; i++) { const a = base - 0.52 + (i / (n - 1)) * 1.04; K.shoot(sim, p, { a, dmg: p.st.atk * 1.5 * (1 + (p.sk.rDmg || 0)), spd: 300 + (i % 3) * 30, snd: 'gun', twin: false, spec: { type: 'bullet', tag: 'r', r: 2, knock: 12 } }); } G.fx('shake', 5); p.ammo = p.flags.mag9 ? 9 : 6; },
  };
  // ───── 드루이드
  K.druid = {
    basic(sim, p, held) {
      if (!held || p.atkT > 0) return;
      if (p.form === 'bear') { K.arc(sim, p, 24, 2.1, 1.3, { knock: 22, heavy: true, snd: 'heavy', threatMul: 3 }); p.atkT = 0.55 / S.aspdMul(p); }
      else if (p.form === 'wolf') { K.arc(sim, p, 18, 1.6, 0.7, { knock: 6, snd: 'dagger', elem: 'bleed' }); p.atkT = 0.22 / S.aspdMul(p); }
      else if (p.form === 'crow') { K.shoot(sim, p, { dmg: p.st.atk * 0.8, spd: 190, snd: 'bolt', spec: { type: 'wind', tag: 'basic', r: 4, pierce: 1 } }); p.atkT = 0.4 / S.aspdMul(p); }
      else { K.arc(sim, p, p.st.range, 1.8, 1, { knock: 12 }); p.atkT = 0.5 / S.aspdMul(p); }
    },
    q(sim, p) {
      const order = ['bear', 'wolf', 'crow']; p.form = order[(order.indexOf(p.form) + 1) % 3];
      S.recalc(p); p.inv = Math.max(p.inv, p.flags.wild2 ? 2 : 1);
      if (p.flags.wild2) for (const e of sim.ents) if (e.kind === 'e' && !e.dead && U.dist(p.x, p.y, e.x, e.y) < 36) { const a = Math.atan2(e.y - p.y, e.x - p.x); e.kx = (e.kx || 0) + Math.cos(a) * 40; e.ky = (e.ky || 0) + Math.sin(a) * 40; }
      if (p.flags.quickShift) { p.morale = Math.min(C.MORALE_MAX, p.morale + 5); p.cd.q = 0; }
      G.fx('snd', 'buff'); G.fx('burst', p.x, p.y - 6, 12, ['#90e070', '#5a3a20'], 40, 0.5); G.fx('txt', p.x, p.y - 22, { bear: '곰', wolf: '늑대', crow: '까마귀' }[p.form], '#90e070', 8);
      return !p.flags.quickShift;
    },
    e(sim, p) {
      if (p.form === 'bear') { for (const e of sim.ents) if (e.kind === 'e' && !e.dead && U.dist(p.x, p.y, e.x, e.y) < 40) { St.add(sim, e, 'stun', { t: 1 }); S.threat(e, p.slot, 300); } G.fx('snd', 'roar'); G.fx('ring', p.x, p.y, 6, 40, '#c0a080', 0.4); }
      else if (p.form === 'wolf') { K.dash(sim, p, 4 * T, 0.25, { dmg: 1.5, elem: 'bleed', end: (sim2, pp) => { if (pp.flags.packLeap) for (const e of sim2.ents) if (e.kind === 'e' && !e.dead && U.dist(pp.x, pp.y, e.x, e.y) < 30) St.applyElem(sim2, e, 'bleed', { ent: pp, slot: pp.slot, tag: 'e' }); } }); G.fx('snd', 'dash'); }
      else if (p.form === 'crow') { for (const q of K.allies(sim, p, 64, true)) S.heal(sim, q, q.maxHp * 0.2, p); G.fx('snd', 'heal'); G.fx('ring', p.x, p.y, 6, 64, '#c0ffc0', 0.5); }
      else { G.fx('txt', p.x, p.y - 20, '먼저 변신 (Q)', '#aaa', 7); return false; }
      return true;
    },
    r(sim, p) { S.zone(sim, { x: p.x, y: p.y, r: 96, elem: 'root', life: sp(p, 'rDur', 3), team: 'p', dps: p.st.atk * 1.0, owner: p }); G.fx('banner', '자연의 분노', '속박'); G.fx('snd', 'roar'); },
  };
  // ───── 폭탄 투척
  K.throwBomb = function (sim, p) {
    const d = Math.min(6 * T, 6 * T); const x = p.x + Math.cos(p.aim) * d, y = p.y + Math.sin(p.aim) * d;
    const j = S.proj(sim, { type: 'bombT', x, y, team: 'p', owner: p, slot: p.slot, dmg: 0, life: 99, fall: 0.6, p: 0 });
    j.onLand = (sim2, jj) => { S.explode(sim2, jj.x, jj.y, 30, p.st.atk * 3, { ent: p, slot: p.slot, tag: 'e' }, 'p'); S.ignite(sim2, jj.x, jj.y, 30, p); };
    G.fx('snd', 'throw');
  };
  return K;
})();
