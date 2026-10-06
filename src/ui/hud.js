// 캔버스 HUD: 파티 프레임, 스킬 바, 보스 바, 배너, 핑 휠, 노드 맵, 미니맵
G.HUD = (function () {
  const H = {};
  const C = G.C, U = G.U, R = G.R;
  let banner = null, flash = null;
  H.minimap = false;
  H.banner = (a, b) => { banner = { a, b, t: 0, life: 2.6 }; };
  H.flash = (c, a) => { flash = { c, a, t: 0 }; };
  const PING = ['여기', '적!', '도와줘', '모여', '후퇴', '보물', '고마워', '잠깐'];
  const EMOTE = ['👍', '😮‍💨', '😂', '👏', '😴', '💃', '👉', '😭'];
  H.PING = PING; H.EMOTE = EMOTE;

  H.draw = function (x, view, mySlot, dt) {
    const pl = view.pl || [];
    // 파티 프레임 (좌상단)
    let y = 8;
    for (const p of pl) {
      if (!p) continue;
      const me = p.s === mySlot; const col = C.PLAYER_COLORS[p.s];
      const w = me ? 118 : 96, h = me ? 26 : 20;
      x.fillStyle = 'rgba(8,6,12,0.7)'; x.fillRect(6, y, w, h);
      x.fillStyle = col; x.fillRect(6, y, 2, h);
      R.text(x, `${G.CLASSES[p.c].icon} ${p.n}${p.gh ? ' (유령)' : p.dn ? ' (다운)' : ''}${!p.conn ? ' (끊김)' : ''}`, 11, y + 6, me ? '#fff' : '#d9d2c5', 7, 'left', true, false);
      const bw = w - 10;
      x.fillStyle = '#1a1720'; x.fillRect(11, y + 11, bw, 4);
      x.fillStyle = p.hp / p.mhp < 0.3 ? '#ff5050' : '#b8462e'; x.fillRect(11, y + 11, Math.round(bw * Math.max(0, p.hp / p.mhp)), 4);
      if (p.sh > 0) { x.fillStyle = '#ffe080'; x.fillRect(11, y + 11, Math.round(bw * Math.min(1, p.sh / p.mhp)), 1); }
      x.fillStyle = '#1a1720'; x.fillRect(11, y + 16, bw, 2);
      x.fillStyle = p.mo >= 100 ? '#ffd36b' : '#7a6a4a'; x.fillRect(11, y + 16, Math.round(bw * p.mo / 100), 2);
      R.text(x, `${p.hp}/${p.mhp}`, 11 + bw, y + 6, '#a89f8c', 6, 'right', true, false);
      if (me) {
        R.text(x, `💰${p.gold}  🧪${p.pot}${p.items.key ? '  🗝️' + p.items.key : ''}${p.items.bomb ? '  💣' + p.items.bomb : ''}${p.items.soulstone ? '  💠' + p.items.soulstone : ''}${p.items.totem ? '  🗿' + p.items.totem : ''}`, 11, y + 22, '#d9d2c5', 6, 'left', true, false);
      }
      y += h + 4;
    }
    // 내 스킬 바 (하단 중앙)
    const me = pl[mySlot];
    const inWorld = view.mode === 'hall' || view.phase === 'combat';
    if (me && !me.gh && inWorld) {
      const cls = G.CLASSES[me.c];
      const items = [['Q', cls.q.name, me.q, me.qc], ['E', cls.e.name, me.e, me.ec], ['R', cls.r.name, me.mo >= 100 ? 0 : 1, 1], ['⇧', '구르기', me.roll, C.ROLL_CD]];
      const bx = C.W / 2 - 92, by = C.H - 30;
      items.forEach(([k, nm, cd, max], i) => {
        const sx = bx + i * 46;
        x.fillStyle = 'rgba(8,6,12,0.75)'; x.fillRect(sx, by, 42, 24);
        const ready = cd <= 0;
        x.strokeStyle = ready ? (k === 'R' ? '#ffd36b' : '#5a4a2a') : '#2a2520'; x.lineWidth = 1; x.strokeRect(sx + 0.5, by + 0.5, 41, 23);
        if (!ready && max > 0) { x.fillStyle = 'rgba(184,70,46,0.35)'; x.fillRect(sx, by + 24 - Math.round(24 * Math.min(1, cd / max)), 42, Math.round(24 * Math.min(1, cd / max))); }
        R.text(x, k, sx + 4, by + 7, ready ? '#fff' : '#777', 8, 'left', true, false);
        R.text(x, nm, sx + 21, by + 17, ready ? '#d9d2c5' : '#777', 5.5, 'center', true, false);
        if (!ready && k !== 'R') R.text(x, cd.toFixed(1), sx + 36, by + 7, '#ffd36b', 6, 'right', true, false);
        if (k === 'R') R.text(x, me.mo + '%', sx + 38, by + 7, me.mo >= 100 ? '#ffd36b' : '#a89f8c', 6, 'right', true, false);
      });
      if (me.ammo != null) R.text(x, `탄 ${me.ammo}`, bx + 190, by + 8, me.ammo === 0 ? '#ff8080' : '#ffe060', 7, 'left', true, false);
      if (me.traps != null) R.text(x, `덫 ${me.traps}`, bx + 190, by + 8, '#90e070', 7, 'left', true, false);
      if (me.form) R.text(x, { bear: '🐻 곰', wolf: '🐺 늑대', crow: '🐦 까마귀' }[me.form], bx + 190, by + 8, '#90e070', 7, 'left', true, false);
      if (me.mo >= 100) R.text(x, 'R 궁극기 준비!', C.W / 2, by - 8 + Math.sin(R.time * 6) * 1.5, '#ffd36b', 8, 'center', true);
    } else if (me && me.gh) {
      R.text(x, '유령: 벽 통과 · F 응원 (아군 이동 +10%) · 발판 밟기 가능', C.W / 2, C.H - 14, '#a0c0ff', 7, 'center', true);
    }
    if (me && me.dn) R.text(x, '다운! 동료가 F로 부활시켜야 한다', C.W / 2, C.H - 14, '#ff8080', 8, 'center', true);
    // 보스 바
    const hud = view.hud || {};
    if (hud.boss) {
      const bw = 220, bx = C.W / 2 - bw / 2, by = 8;
      x.fillStyle = 'rgba(8,6,12,0.75)'; x.fillRect(bx - 2, by - 2, bw + 4, 14);
      x.fillStyle = '#2a1a1a'; x.fillRect(bx, by + 6, bw, 5);
      x.fillStyle = hud.boss.ph >= 3 ? '#ff2060' : hud.boss.ph === 2 ? '#c03050' : '#8a2222'; x.fillRect(bx, by + 6, Math.round(bw * Math.max(0, hud.boss.hp)), 5);
      R.text(x, hud.boss.nm, C.W / 2, by + 2, '#ffd0d0', 7, 'center', true);
    } else if (hud.waves > 0 && !hud.cleared) R.text(x, `웨이브 ${hud.wave}/${hud.waves}`, C.W / 2, 10, '#d9d2c5', 7, 'center', true);
    else if (hud.cleared && view.phase === 'combat') R.text(x, '클리어! 출구로 이동 (자동 진행)', C.W / 2, 10, '#7fcf7a', 8, 'center', true);
    if (hud.timeLeft != null && !hud.cleared) R.text(x, `⏳ ${hud.timeLeft}`, C.W / 2, 24, hud.timeLeft < 30 ? '#ff5050' : '#ffd36b', 8, 'center', true);
    if (hud.allIn > 0) R.text(x, `총공세 ${hud.allIn.toFixed(1)}`, C.W / 2, 36, '#ffd36b', 8, 'center', true);
    // 우상단: 지역/심연
    if (view.mode === 'hall') R.text(x, '길드 홀', C.W - 26, 10, '#a89f8c', 6, 'right', true);
    else if (view.region && view.depth != null) R.text(x, `${G.REGIONS[Math.min(3, view.region - 1)].name} · 심연 ${view.depth}${view.curses && view.curses.length ? ' · 저주 ' + view.curses.length : ''}`, C.W - 26, 10, '#a89f8c', 6, 'right', true);
    if (view.ping != null) R.text(x, `${view.ping}ms`, C.W - 26, 20, view.ping > 150 ? '#ff8080' : '#6f675a', 6, 'right', true);
    // 화면 밖 아군 화살표
    for (const e of (view.ents || [])) {
      if (e.k !== 'p' || e.s === mySlot) continue;
      const sx = e.x - R.cam.left, sy = e.y - R.cam.top;
      if (sx > 0 && sx < C.W && sy > 0 && sy < C.H) continue;
      const cx = U.clamp(sx, 10, C.W - 10), cy = U.clamp(sy, 10, C.H - 10); const a = Math.atan2(sy - cy, sx - cx);
      x.fillStyle = C.PLAYER_COLORS[e.s]; x.beginPath(); x.moveTo(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6); x.lineTo(cx + Math.cos(a + 2.5) * 5, cy + Math.sin(a + 2.5) * 5); x.lineTo(cx + Math.cos(a - 2.5) * 5, cy + Math.sin(a - 2.5) * 5); x.closePath(); x.fill();
      R.text(x, e.n, cx, cy - 9, C.PLAYER_COLORS[e.s], 6, 'center', true);
    }
    // 핑 (월드)
    for (const p of H.pings) { p.t += dt; const sx = p.x - R.cam.left, sy = p.y - R.cam.top; const k = p.t / 3; x.strokeStyle = C.PLAYER_COLORS[p.slot]; x.lineWidth = 1.5; x.globalAlpha = 1 - k; x.beginPath(); x.arc(sx, sy, 6 + Math.sin(p.t * 8) * 2, 0, Math.PI * 2); x.stroke(); x.globalAlpha = 1; R.text(x, p.text, sx, sy - 12, C.PLAYER_COLORS[p.slot], 7, 'center', true); }
    H.pings = H.pings.filter(p => p.t < 3);
    // 배너
    if (banner) { banner.t += dt; const k = banner.t / banner.life; const a = k < 0.1 ? k * 10 : k > 0.8 ? (1 - k) * 5 : 1; x.globalAlpha = a; x.fillStyle = 'rgba(8,6,12,0.75)'; x.fillRect(0, C.H / 2 - 22, C.W, 40); R.text(x, banner.a, C.W / 2, C.H / 2 - 8, '#ffd36b', 14, 'center', true); if (banner.b) R.text(x, banner.b, C.W / 2, C.H / 2 + 8, '#d9d2c5', 8, 'center', true); x.globalAlpha = 1; if (k >= 1) banner = null; }
    if (flash) { flash.t += dt; const a = Math.max(0, flash.a * (1 - flash.t / 0.4)); if (a > 0) { x.fillStyle = flash.c; x.globalAlpha = a; x.fillRect(0, 0, C.W, C.H); x.globalAlpha = 1; } else flash = null; }
    // 휠
    const wh = G.In.wheel;
    if (wh) {
      const list = wh.kind === 'ping' ? PING : EMOTE;
      x.fillStyle = 'rgba(8,6,12,0.6)'; x.beginPath(); x.arc(wh.x, wh.y, 40, 0, Math.PI * 2); x.fill();
      const dx = G.In.mouse.x - wh.x, dy = G.In.mouse.y - wh.y; const sel = Math.hypot(dx, dy) < 12 ? -1 : Math.floor((((Math.atan2(dy, dx) + Math.PI * 2 + Math.PI / 8) % (Math.PI * 2)) / (Math.PI * 2)) * 8);
      list.forEach((s, i) => { const a = i / 8 * Math.PI * 2; R.text(x, s, wh.x + Math.cos(a) * 30, wh.y + Math.sin(a) * 30, sel === i ? '#ffd36b' : '#d9d2c5', sel === i ? 9 : 7, 'center', true); });
      R.text(x, wh.kind === 'ping' ? '핑' : '이모트', wh.x, wh.y, '#a89f8c', 6, 'center', true);
    }
    // 미니맵
    if (H.minimap && view.mapForMini) H.drawMinimap(x, view);
    if (view.drunk && view.drunk[mySlot]) { x.fillStyle = `rgba(120,80,20,${0.12 + Math.sin(R.time * 3) * 0.06})`; x.fillRect(0, 0, C.W, C.H); }
    // 조작 힌트 (길드 홀)
    if (view.mode === 'hall' && view.hintObj) R.text(x, view.hintObj, C.W / 2, C.H - 14, '#ffe080', 7, 'center', true);
  };
  H.pings = [];
  H.addPing = (slot, x, y, idx) => { H.pings.push({ slot, x, y, text: PING[idx] || '', t: 0 }); G.A.play('ping'); };

  H.drawMinimap = function (x, view) {
    const m = view.mapForMini; const sc = 2;
    const w = m.w * sc, h = m.h * sc, ox = C.W - w - 8, oy = 30;
    x.fillStyle = 'rgba(8,6,12,0.8)'; x.fillRect(ox - 2, oy - 2, w + 4, h + 4);
    for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++) { const t = m.tiles[j * m.w + i]; if (t === G.TL.WALL || t === G.TL.VOID) continue; x.fillStyle = t === G.TL.OIL ? '#2a2020' : t === G.TL.WATER ? '#2a4070' : t === G.TL.DARK ? '#30104a' : '#4a4038'; x.fillRect(ox + i * sc, oy + j * sc, sc, sc); }
    for (const e of view.ents) { if (e.k === 'p') { x.fillStyle = C.PLAYER_COLORS[e.s]; x.fillRect(ox + e.x / 16 * sc - 1, oy + e.y / 16 * sc - 1, 3, 3); } else if (e.k === 'e') { x.fillStyle = e.bs ? '#ff2060' : '#d04040'; x.fillRect(ox + e.x / 16 * sc, oy + e.y / 16 * sc, 2, 2); } else if (e.k === 'o' && (e.t === 'exit' || e.t === 'chest')) { x.fillStyle = e.t === 'exit' ? '#c0a0ff' : '#ffd36b'; x.fillRect(ox + e.x / 16 * sc, oy + e.y / 16 * sc, 2, 2); } }
  };

  // ───── 노드 맵 화면 (전투 아닌 페이즈)
  H.drawNodeMap = function (x, view, mySlot) {
    const m = view.map; if (!m) return;
    x.fillStyle = '#0b0a0f'; x.fillRect(0, 0, C.W, C.H);
    // 배경 장식
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(255,255,255,${0.02 + (i % 5) * 0.01})`; x.fillRect((i * 97) % C.W, (i * 53 + R.time * 4 * (i % 3 + 1)) % C.H, 1, 1); }
    const reg = G.REGIONS[Math.min(3, m.region - 1)];
    R.text(x, `${reg.name}  ·  심연 ${view.depth}`, C.W / 2, 14, '#e8dcc0', 11, 'center', true);
    R.text(x, reg.desc, C.W / 2, 28, '#8b8070', 7, 'center', true);
    const byId = {}; m.cols.forEach(c => c.forEach(n => (byId[n.id] = n)));
    const ox = 130, oy = 44;
    // 연결선
    x.lineWidth = 1;
    m.cols.forEach(c => c.forEach(n => n.next.forEach(id => { const b = byId[id]; if (!b) return; const on = n.id === m.cur || (m.cur < 0 && n.col === 0); x.strokeStyle = on ? 'rgba(224,176,80,0.6)' : 'rgba(120,110,90,0.25)'; x.beginPath(); x.moveTo(ox + n.x, oy + n.y); x.lineTo(ox + b.x, oy + b.y); x.stroke(); })));
    const availIds = m.cur < 0 ? m.cols[0].map(n => n.id) : (byId[m.cur] ? byId[m.cur].next : []);
    m.cols.forEach(c => c.forEach(n => {
      const info = G.World.NODE_INFO[n.type]; const avail = availIds.includes(n.id); const cur = n.id === m.cur; const done = m.done.includes(n.id);
      const px = ox + n.x, py = oy + n.y;
      x.fillStyle = cur ? '#5a4a2a' : avail ? '#2a2634' : '#141218'; x.strokeStyle = cur ? '#ffd36b' : avail ? '#e0b050' : '#3a3328'; x.lineWidth = avail ? 1.5 : 1;
      x.beginPath(); x.arc(px, py, n.type === 'boss' ? 14 : 10, 0, Math.PI * 2); x.fill(); x.stroke();
      R.text(x, info.icon, px, py + 1, '#fff', n.type === 'boss' ? 12 : 9, 'center', false);
      if (avail) R.text(x, info.name, px, py + 17 + Math.sin(R.time * 4) * 0.5, '#e0b050', 6, 'center', true);
      else if (n.type === 'boss') R.text(x, '보스', px, py + 21, '#a89f8c', 6, 'center', true);
    }));
    // 현재 위치 캐릭터 아이콘
    const curN = byId[m.cur];
    if (curN) (view.pl || []).forEach(p => { if (!p) return; x.fillStyle = C.PLAYER_COLORS[p.s]; x.fillRect(ox + curN.x - 8 + p.s * 6, oy + curN.y - 18, 4, 4); });
    R.text(x, `노드 ${view.nodesDone}  ·  잿조각 ${view.earned ? view.earned.ash : 0}  혼석 ${view.earned ? view.earned.soul : 0}`, C.W / 2, C.H - 10, '#8b8070', 6, 'center', true);
  };
  return H;
})();
