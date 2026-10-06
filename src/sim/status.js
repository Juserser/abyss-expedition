// 상태이상 · 속성 · 반응
G.St = (function () {
  const St = {};
  const C = G.C;
  St.BITS = { burn: 1, poison: 2, frozen: 4, wet: 8, oiled: 16, stun: 32, marked: 64, slow: 128, taunt: 256, shock: 512, stealth: 1024, buff: 2048, root: 4096, shield: 8192 };

  St.init = e => { e.status = {}; return e; };
  St.has = (e, k) => !!(e.status && e.status[k]);
  St.bits = function (e) {
    const s = e.status; if (!s) return 0;
    let b = 0;
    for (const k in St.BITS) if (s[k]) b |= St.BITS[k];
    if (e.shield > 0) b |= St.BITS.shield;
    if (e.buffs && e.buffs.some(x => x.stat === 'atk' && x.v > 0)) b |= St.BITS.buff;
    return b;
  };
  // 지속시간 보정 (플레이어는 statusRes)
  const dur = (e, d) => e.kind === 'p' && e.st && e.st.statusRes ? d * (1 - e.st.statusRes) : d;

  St.add = function (sim, e, k, o) {
    if (e.dead || (e.kind === 'p' && (e.down || e.ghost))) return false;
    if (e.kind === 'p' && e.wardImmune && ['burn', 'poison', 'frozen', 'stun', 'slow', 'root', 'shock'].includes(k)) return false;
    if (k === 'frozen' && (e.iceImmune || (e.kind === 'p' && e.hasHook && e.hasHook('iceImmune')))) return false;
    if (k === 'slow' && e.kind === 'p' && e.hasHook && e.hasHook('iceImmune')) return false;
    const s = e.status;
    o = o || {};
    if (k === 'burn' || k === 'poison' || k === 'bleed') {
      const cur = s[k];
      const t = dur(e, o.t || (k === 'burn' ? C.BURN.dur : C.POISON.dur));
      if (cur) { cur.t = Math.max(cur.t, t); cur.dps = Math.max(cur.dps, o.dps || cur.dps); cur.src = o.src || cur.src; }
      else s[k] = { t, dps: o.dps || 1, src: o.src || null, tick: 0 };
      return true;
    }
    if (k === 'frozen') { if (e.boss) o.t = (o.t || C.FREEZE_DUR) * C.FREEZE_BOSS; if (e.noFreeze) { St.add(sim, e, 'slow', { t: 1.5, v: 0.4 }); return false; } s.frozen = dur(e, o.t || C.FREEZE_DUR); delete s.slow; e.ai && (e.ai.wind = 0); return true; }
    if (k === 'stun') { if (e.boss && (o.t || 1) > 0.5) o.t = 0.5; s.stun = Math.max(s.stun || 0, dur(e, o.t || 1)); return true; }
    if (k === 'slow') { s.slow = { t: dur(e, o.t || C.SLOW_DUR), v: Math.max(o.v || 0.3, s.slow ? s.slow.v : 0) }; return true; }
    if (k === 'marked') { s.marked = { t: o.t || 8, src: o.src, bonus: o.bonus || 0.25 }; return true; }
    if (k === 'taunt') { if (e.noTaunt) return false; s.taunt = { t: o.t || 4, slot: o.slot }; e.target = o.slot; return true; }
    if (k === 'wet') { s.wet = dur(e, o.t || C.WET_DUR); return true; }
    if (k === 'oiled') { s.oiled = dur(e, o.t || C.OIL_DUR); return true; }
    if (k === 'shock') { s.shock = dur(e, o.t || 0.5); return true; }
    if (k === 'root') { if (e.boss) o.t = (o.t || 3) * 0.4; s.root = dur(e, o.t || 3); return true; }
    if (k === 'stealth') { s.stealth = o.t || 1.5; return true; }
    s[k] = o.t || 1; return true;
  };
  St.clear = (e, k) => { if (e.status) delete e.status[k]; };
  St.cleanse = e => { for (const k of ['burn', 'poison', 'bleed', 'frozen', 'stun', 'slow', 'root', 'shock', 'wet', 'oiled']) delete e.status[k]; };
  St.speedMul = function (e) {
    const s = e.status; let m = 1;
    if (s.frozen || s.stun || s.root) return 0;
    if (s.slow) m *= 1 - s.slow.v;
    if (s.oiled && e.kind === 'p') m *= 0.9;
    return m;
  };
  St.canAct = e => { const s = e.status; return !(s.frozen || s.stun); };

  // 매 틱
  St.update = function (sim, e, dt) {
    const s = e.status;
    for (const k of ['burn', 'poison', 'bleed']) {
      const d = s[k]; if (!d) continue;
      d.t -= dt; d.tick += dt;
      if (d.tick >= 0.5) {
        d.tick -= 0.5;
        const rate = k === 'burn' ? C.BURN.dps : C.POISON.dps;
        let dmg = d.dps * rate * 0.5 * 10;
        if (k === 'poison' && d.src && d.src.kind === 'p' && d.src.tal && d.src.tal.poison20) dmg *= 1.2;
        if (k === 'burn' && d.src && d.src.kind === 'p' && d.src.tal) { if (d.src.tal.fire20) dmg *= 1.2; else if (d.src.tal.fire10) dmg *= 1.1; }
        if (k === 'bleed' && d.src && d.src.flags && d.src.flags.bleed2) dmg *= 2;
        G.Sim.damage(sim, e, dmg, { ent: d.src, slot: d.src ? d.src.slot : -1, tag: 'dot', elem: k === 'burn' ? 'fire' : k === 'poison' ? 'poison' : null, noKnock: true, noFlash: true, color: k === 'burn' ? '#ff9040' : k === 'poison' ? '#90e070' : '#ff4040' });
      }
      if (d.t <= 0) delete s[k];
    }
    if (s.frozen) { s.frozen -= dt; if (s.frozen <= 0) delete s.frozen; }
    if (s.stun) { s.stun -= dt; if (s.stun <= 0) delete s.stun; }
    if (s.root) { s.root -= dt; if (s.root <= 0) delete s.root; }
    if (s.shock) { s.shock -= dt; if (s.shock <= 0) delete s.shock; }
    if (s.wet) { s.wet -= dt; if (s.wet <= 0) delete s.wet; }
    if (s.oiled) { s.oiled -= dt; if (s.oiled <= 0) delete s.oiled; }
    if (s.stealth) { s.stealth -= dt; if (s.stealth <= 0) delete s.stealth; }
    if (s.slow) { s.slow.t -= dt; if (s.slow.t <= 0) delete s.slow; }
    if (s.marked) { s.marked.t -= dt; if (s.marked.t <= 0) delete s.marked; }
    if (s.taunt) { s.taunt.t -= dt; if (s.taunt.t <= 0) delete s.taunt; }
  };

  // ───── 속성 적용 + 반응
  // src: { ent, slot, tag } — 반응 발생 시 피해 산정에 쓰임
  St.applyElem = function (sim, e, elem, src, o) {
    if (!e || e.dead || !e.status) return null;
    o = o || {};
    const s = e.status;
    const atk = src && src.ent && src.ent.kind === 'p' ? src.ent.st.atk : (src && src.ent ? src.ent.atk || 10 : 10);
    const react = (name, dmgMul, radius, color) => {
      let mul = dmgMul;
      if (src && src.ent && src.ent.kind === 'p') {
        mul *= 1 + (src.ent.st.react || 0);
        if (src.ent.cls === 'mage') mul *= 1 + C.REACT_BONUS_MAGE;
      }
      const dmg = atk * mul;
      G.Sim.reaction(sim, e, name, dmg, radius, src, color);
      return name;
    };
    if (elem === 'fire') {
      if (s.oiled) { delete s.oiled; return react('폭발!', C.REACT.explode, 40 * (src && src.ent && src.ent.tal && src.ent.tal.explodeRange ? 1.3 : 1), '#ff9040'); }
      if (s.frozen) { delete s.frozen; G.Sim.zone(sim, { x: e.x, y: e.y, r: 44, elem: 'steam', life: 4, team: 'n' }); return react('증기', 0.3, 0, '#e0e0f0'); }
      if (s.poison) { delete s.poison; G.Sim.zone(sim, { x: e.x, y: e.y, r: 46, elem: 'poison', life: 5, team: src && src.ent && src.ent.kind === 'p' ? 'p' : 'e', dps: atk * C.REACT.toxic, owner: src ? src.ent : null }); return react('독연!', 0.6, 0, '#90e070'); }
      St.add(sim, e, 'burn', { dps: atk / 10 * (o.dpsMul || 1), src: src ? src.ent : null, t: o.t });
      return 'burn';
    }
    if (elem === 'ice') {
      if (s.burn) { delete s.burn; G.Sim.zone(sim, { x: e.x, y: e.y, r: 44, elem: 'steam', life: 4, team: 'n' }); return react('증기', 0.3, 0, '#e0e0f0'); }
      let t = o.t || C.FREEZE_DUR;
      if (src && src.ent && src.ent.tal && src.ent.tal.freeze05) t += 0.5;
      St.add(sim, e, 'frozen', { t }); G.fx('snd', 'ice');
      return 'frozen';
    }
    if (elem === 'heavy') {
      if (s.frozen) { delete s.frozen; let mul = C.REACT.shatter; if (e.data && e.data.p && e.data.p.shatterWeak) mul *= 1.6; const r = react('분쇄!', mul, 0, '#c0f0ff'); if (src && src.ent && src.ent.flags && src.ent.flags.shatterNova) G.Sim.nova(sim, e.x, e.y, 40, src.ent, 'ice'); G.fx('snd', 'shatter'); return r; }
      return null;
    }
    if (elem === 'poison') {
      St.add(sim, e, 'poison', { dps: atk / 10 * (o.dpsMul || 1), src: src ? src.ent : null, t: o.t });
      return 'poison';
    }
    if (elem === 'shock') {
      if (s.wet) { delete s.wet; St.add(sim, e, 'stun', { t: 0.5 }); const r = react('감전!', C.REACT.shock, 0, '#ffff80'); G.Sim.chain(sim, e, atk * C.REACT.shock * 0.6, src, C.SHOCK_CHAIN); return r; }
      G.Sim.damage(sim, e, atk * 0.3, Object.assign({}, src, { elem: 'shock', tag: 'elem', color: '#ffff80' }));
      St.add(sim, e, 'shock', { t: 0.3 });
      return 'shock';
    }
    if (elem === 'water') { St.add(sim, e, 'wet'); return 'wet'; }
    if (elem === 'oil') { St.add(sim, e, 'oiled'); return 'oiled'; }
    if (elem === 'holy') { if (e.data && e.data.tags && e.data.tags.includes('undead')) G.Sim.damage(sim, e, atk * 0.5, Object.assign({}, src, { tag: 'elem', color: '#ffe0a0' })); return 'holy'; }
    if (elem === 'bleed') { St.add(sim, e, 'bleed', { dps: atk / 10, src: src ? src.ent : null, t: 4 }); return 'bleed'; }
    return null;
  };
  return St;
})();
