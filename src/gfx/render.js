// 캔버스 렌더러: 카메라, 맵 베이크, 조명, 엔티티(뷰 레코드), 파티클, 떠오르는 텍스트
G.TL = { FLOOR: 0, WALL: 1, OIL: 2, WATER: 3, DARK: 4, LIT: 5, RUBBLE: 6, VOID: 7 };
G.R = (function () {
  const R = {};
  const C = G.C, TL = G.TL;
  let screen, sctx, wc, wctx, lc, lctx, mapC, mapCtx, mapVer = -1, mapRef = null;
  R.scale = 3; R.ox = 0; R.oy = 0; R.dpr = 1;
  R.cam = { x: 0, y: 0, shake: 0, sx: 0, sy: 0, left: 0, top: 0 };
  R.time = 0;
  R.hitstop = 0;
  const parts = [], texts = [];
  R.lights = [];
  R.FONT = '"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif';

  R.init = function () {
    screen = document.getElementById('screen');
    sctx = screen.getContext('2d');
    wc = document.createElement('canvas'); wc.width = C.W; wc.height = C.H; wctx = wc.getContext('2d');
    lc = document.createElement('canvas'); lc.width = C.W / 2; lc.height = C.H / 2; lctx = lc.getContext('2d');
    R.sctx = sctx; R.wctx = wctx; R.wc = wc; R.screen = screen;
    window.addEventListener('resize', R.resize);
    R.resize();
  };
  R.resize = function () {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    R.dpr = dpr;
    const cw = Math.floor(window.innerWidth * dpr), ch = Math.floor(window.innerHeight * dpr);
    screen.width = cw; screen.height = ch;
    let s = Math.min(cw / C.W, ch / C.H);
    const si = Math.floor(s);
    if (si >= 2 && si / s > 0.86) s = si;
    R.scale = s;
    R.ox = Math.floor((cw - C.W * s) / 2);
    R.oy = Math.floor((ch - C.H * s) / 2);
  };
  R.toLogical = (px, py) => [((px * R.dpr) - R.ox) / R.scale, ((py * R.dpr) - R.oy) / R.scale];
  R.toWorld = (lx, ly) => [lx + R.cam.left, ly + R.cam.top];
  R.toScreen = (wx, wy) => [wx - R.cam.left, wy - R.cam.top];
  R.uiBegin = function () { sctx.setTransform(R.scale, 0, 0, R.scale, R.ox, R.oy); sctx.imageSmoothingEnabled = false; };
  R.present = function () {
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.fillStyle = '#000'; sctx.fillRect(0, 0, screen.width, screen.height);
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(wc, R.ox, R.oy, C.W * R.scale, C.H * R.scale);
  };

  // ───── 카메라
  R.setCamera = function (tx, ty, map, dt, snap) {
    const cam = R.cam;
    if (snap) { cam.x = tx; cam.y = ty; }
    else { const k = Math.min(1, dt * 9); cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; }
    let x = cam.x, y = cam.y;
    if (map) {
      const mw = map.w * C.TILE, mh = map.h * C.TILE;
      x = mw <= C.W ? mw / 2 : G.U.clamp(x, C.W / 2, mw - C.W / 2);
      y = mh <= C.H ? mh / 2 : G.U.clamp(y, C.H / 2, mh - C.H / 2);
    }
    if (cam.shake > 0) {
      const s = cam.shake * (G.settings ? G.settings.shake : 1);
      cam.sx = (Math.random() - 0.5) * s * 2; cam.sy = (Math.random() - 0.5) * s * 2;
      cam.shake = Math.max(0, cam.shake - dt * 18);
    } else { cam.sx = cam.sy = 0; }
    cam.left = Math.round(x - C.W / 2 + cam.sx); cam.top = Math.round(y - C.H / 2 + cam.sy);
  };
  R.shake = v => { R.cam.shake = Math.max(R.cam.shake, v); };

  // ───── 맵 베이크
  const PAL = r => (G.REGIONS[(r || 1) - 1] || G.REGIONS[0]);
  R.bakeMap = function (map) {
    if (!map) return;
    if (mapRef === map && mapVer === map.ver) return;
    mapRef = map; mapVer = map.ver;
    const T = C.TILE;
    if (!mapC) { mapC = document.createElement('canvas'); mapCtx = mapC.getContext('2d'); }
    mapC.width = map.w * T; mapC.height = map.h * T;
    const x = mapCtx; x.imageSmoothingEnabled = false;
    const rng = G.U.RNG(map.seed || 1);
    const p = map.hall ? { floor: '#2a2420', wall: '#4a3e34', accent: '#6a5a3a' } : PAL(map.region);
    for (let j = 0; j < map.h; j++) for (let i = 0; i < map.w; i++) drawTile(x, map, i, j, p, rng);
  };
  function drawTile(x, map, i, j, p, rng) {
    const T = C.TILE, t = map.tiles[j * map.w + i], px = i * T, py = j * T;
    rng = rng || G.U.RNG((i * 73856093) ^ (j * 19349663));
    const v = rng();
    if (t === TL.WALL || t === TL.VOID) {
      x.fillStyle = t === TL.VOID ? '#050408' : p.wall; x.fillRect(px, py, T, T);
      if (t === TL.WALL) {
        // 윗면 하이라이트 / 벽돌 선
        const below = j + 1 < map.h ? map.tiles[(j + 1) * map.w + i] : TL.WALL;
        x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(px, py + T - 3, T, 3);
        x.fillStyle = 'rgba(255,255,255,0.06)'; x.fillRect(px, py, T, 2);
        x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(px + (v < 0.5 ? 0 : 8), py + 7, 8, 1); x.fillRect(px + 8 * (v < 0.5 ? 1 : 0), py + 14, 8, 1);
        if (below !== TL.WALL && below !== TL.VOID) { x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(px, py + T - 2, T, 2); }
      }
      return;
    }
    x.fillStyle = p.floor; x.fillRect(px, py, T, T);
    // 바닥 변주
    if (v < 0.25) { x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(px + 2 + ((v * 40) | 0) % 8, py + 3 + ((v * 90) | 0) % 8, 3, 2); }
    else if (v < 0.4) { x.fillStyle = 'rgba(255,255,255,0.04)'; x.fillRect(px + ((v * 50) | 0) % 10, py + ((v * 70) | 0) % 10, 4, 1); }
    x.fillStyle = 'rgba(0,0,0,0.08)'; x.fillRect(px, py, T, 1); x.fillRect(px, py, 1, T);
    if (t === TL.OIL) { x.fillStyle = 'rgba(10,8,6,0.75)'; x.fillRect(px + 1, py + 1, T - 2, T - 2); x.fillStyle = 'rgba(80,60,120,0.35)'; x.fillRect(px + 3, py + 4, 6, 2); }
    else if (t === TL.WATER) { x.fillStyle = 'rgba(30,50,90,0.8)'; x.fillRect(px, py, T, T); x.fillStyle = 'rgba(120,160,220,0.25)'; x.fillRect(px + 2, py + 5, 7, 1); x.fillRect(px + 8, py + 11, 5, 1); }
    else if (t === TL.DARK) { x.fillStyle = 'rgba(20,5,40,0.85)'; x.fillRect(px, py, T, T); x.fillStyle = 'rgba(120,40,200,0.2)'; x.fillRect(px + 4, py + 6, 8, 4); }
    else if (t === TL.LIT) { x.fillStyle = 'rgba(255,200,120,0.08)'; x.fillRect(px, py, T, T); }
    else if (t === TL.RUBBLE) { x.fillStyle = p.accent; x.fillRect(px + 3, py + 6, 5, 4); x.fillRect(px + 9, py + 9, 4, 3); x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(px + 3, py + 10, 5, 1); }
  }
  R.updateTile = function (map, i, j) {
    if (mapRef !== map || !mapCtx) return;
    const p = map.hall ? { floor: '#2a2420', wall: '#4a3e34', accent: '#6a5a3a' } : PAL(map.region);
    mapCtx.clearRect(i * C.TILE, j * C.TILE, C.TILE, C.TILE);
    drawTile(mapCtx, map, i, j, p);
  };
  R.invalidateMap = () => { mapVer = -1; };

  // ───── 파티클 / 텍스트
  R.part = s => { if (parts.length < 900) parts.push(Object.assign({ x: 0, y: 0, vx: 0, vy: 0, life: 0.5, t: 0, size: 2, color: '#fff', grav: 0, drag: 0, shape: 'dot', alpha: 1, shrink: true }, s)); };
  R.burst = (x, y, n, o) => {
    o = o || {};
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (o.speed || 40) * (0.4 + Math.random() * 0.8);
      const col = Array.isArray(o.color) ? o.color[Math.floor(Math.random() * o.color.length)] : (o.color || '#fff');
      R.part({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up || 0), life: (o.life || 0.5) * (0.6 + Math.random() * 0.6), color: col, size: o.size || 2, grav: o.grav || 0, drag: o.drag || 0, shape: o.shape || 'dot' });
    }
  };
  R.floatText = (x, y, s, color, size, o) => { if (texts.length > 80) texts.shift(); texts.push(Object.assign({ x, y, s, color: color || '#fff', size: size || 7, t: 0, life: 0.8, vy: -22, pop: false }, o || {})); };
  R.clearFx = () => { parts.length = 0; texts.length = 0; R.lights.length = 0; };
  function updateFx(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.t += dt;
      if (p.t >= p.life) { parts.splice(i, 1); continue; }
      p.vy += p.grav * dt; if (p.drag) { p.vx -= p.vx * p.drag * dt; p.vy -= p.vy * p.drag * dt; }
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (let i = texts.length - 1; i >= 0; i--) { const t = texts[i]; t.t += dt; t.y += t.vy * dt; if (t.t >= t.life) texts.splice(i, 1); }
  }

  // ───── 텍스트
  R.text = function (ctx, s, x, y, color, size, align, bold, stroke) {
    ctx.font = `${bold ? 'bold ' : ''}${size || 7}px ${R.FONT}`;
    ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
    if (stroke !== false) { ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
    ctx.fillStyle = color || '#fff'; ctx.fillText(s, x, y);
  };

  // ───── 월드 그리기 (뷰 레코드 기반: 방장/참가자 동일 경로)
  const STATUS = { burn: 1, poison: 2, frozen: 4, wet: 8, oiled: 16, stun: 32, marked: 64, slow: 128, taunt: 256, shock: 512, stealth: 1024, buff: 2048, root: 4096, shield: 8192 };
  R.STATUS = STATUS;
  R.drawWorld = function (view, map, dt, mySlot) {
    R.time += dt;
    updateFx(dt);
    const x = wctx, T = C.TILE;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.fillStyle = '#050408'; x.fillRect(0, 0, C.W, C.H);
    if (!map) return;
    R.bakeMap(map);
    x.setTransform(1, 0, 0, 1, -R.cam.left, -R.cam.top);
    x.drawImage(mapC, 0, 0);
    const ents = view.ents || [];
    R.lights.length = 0;
    // 구역(장판)
    for (const e of ents) if (e.k === 'z') drawZone(x, e);
    // 예고
    for (const e of ents) if (e.tg) drawTelegraph(x, e.tg, e);
    // 바닥 표식(플레이어 색 링, 타겟 링)
    for (const e of ents) {
      if (e.k === 'p' && !e.gh) { x.strokeStyle = C.PLAYER_COLORS[e.s]; x.lineWidth = 1; x.globalAlpha = e.s === mySlot ? 0.9 : 0.5; x.beginPath(); x.ellipse(e.x, e.y + 1, 7, 3.5, 0, 0, Math.PI * 2); x.stroke(); x.globalAlpha = 1; }
      if (e.k === 'e' && e.tgt != null && e.tgt >= 0) { x.strokeStyle = C.PLAYER_COLORS[e.tgt]; x.lineWidth = 1; x.globalAlpha = 0.55; x.beginPath(); x.ellipse(e.x, e.y + 1, 6 * (e.sz || 1) + 2, 3 * (e.sz || 1) + 1, 0, 0, Math.PI * 2); x.stroke(); x.globalAlpha = 1; }
    }
    // 엔티티 (y 정렬)
    const sorted = ents.filter(e => e.k !== 'z').slice().sort((a, b) => (a.y + (a.k === 'o' ? -6 : 0)) - (b.y + (b.k === 'o' ? -6 : 0)));
    for (const e of sorted) {
      if (e.k === 'p') drawPlayer(x, e, mySlot);
      else if (e.k === 'e' || e.k === 'm') drawEnemy(x, e);
      else if (e.k === 'j') drawProj(x, e);
      else if (e.k === 'i') drawPickup(x, e);
      else if (e.k === 'o') drawObj(x, e);
    }
    // 파티클
    for (const p of parts) {
      const k = p.t / p.life; x.globalAlpha = p.alpha * (1 - k * 0.7);
      if (p.shape === 'ring') { x.strokeStyle = p.color; x.lineWidth = p.size; x.beginPath(); x.arc(p.x, p.y, p.r0 + (p.r1 - p.r0) * k, 0, Math.PI * 2); x.stroke(); }
      else if (p.shape === 'img') { x.drawImage(p.img, Math.round(p.x - p.img.width / 2), Math.round(p.y - p.img.height)); }
      else { x.fillStyle = p.color; const s = p.shrink ? Math.max(1, p.size * (1 - k)) : p.size; x.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s); }
    }
    x.globalAlpha = 1;
    // 조명
    drawLights(x, view, map);
    // 떠오르는 텍스트
    for (const t of texts) {
      const k = t.t / t.life; x.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      const sz = t.pop ? t.size * (k < 0.15 ? 1 + (0.15 - k) * 4 : 1) : t.size;
      R.text(x, t.s, Math.round(t.x), Math.round(t.y), t.color, sz, 'center', true);
    }
    x.globalAlpha = 1;
    x.setTransform(1, 0, 0, 1, 0, 0);
  };

  function drawZone(x, e) {
    const t = e.t, r = e.r, k = e.l != null ? e.l : 1, tm = R.time;
    x.globalAlpha = Math.min(1, k * 3) * 0.75;
    if (t === 'fire') { x.fillStyle = `rgba(255,${90 + Math.sin(tm * 20) * 30 | 0},30,0.45)`; x.beginPath(); x.arc(e.x, e.y, r, 0, Math.PI * 2); x.fill(); x.fillStyle = 'rgba(255,220,120,0.35)'; for (let i = 0; i < 4; i++) { const a = tm * 3 + i * 1.6; x.fillRect(e.x + Math.cos(a) * r * 0.5 - 1, e.y + Math.sin(a * 1.3) * r * 0.4 - 4 - ((tm * 30 + i * 7) % 8), 2, 3); } R.lights.push({ x: e.x, y: e.y, r: r + 24, c: '#ff9040', a: 0.7 }); }
    else if (t === 'oil') { x.fillStyle = 'rgba(15,10,8,0.7)'; x.beginPath(); x.arc(e.x, e.y, r, 0, Math.PI * 2); x.fill(); x.fillStyle = 'rgba(120,80,160,0.3)'; x.fillRect(e.x - r * 0.4, e.y - 2, r * 0.6, 2); }
    else if (t === 'water') { x.fillStyle = 'rgba(40,70,130,0.55)'; x.beginPath(); x.arc(e.x, e.y, r, 0, Math.PI * 2); x.fill(); }
    else if (t === 'poison') { x.fillStyle = `rgba(90,${160 + Math.sin(tm * 5) * 20 | 0},60,0.4)`; x.beginPath(); x.arc(e.x, e.y, r, 0, Math.PI * 2); x.fill(); for (let i = 0; i < 3; i++) { x.fillStyle = 'rgba(160,240,120,0.4)'; x.fillRect(e.x + Math.cos(tm * 2 + i * 2) * r * 0.5, e.y + Math.sin(tm * 2.5 + i) * r * 0.4, 2, 2); } }
    else if (t === 'holy') { x.strokeStyle = 'rgba(255,230,150,0.8)'; x.lineWidth = 1.5; x.beginPath(); x.arc(e.x, e.y, r, 0, Math.PI * 2); x.stroke(); x.fillStyle = 'rgba(255,230,150,0.12)'; x.fill(); R.lights.push({ x: e.x, y: e.y, r: r + 20, c: '#ffe0a0', a: 0.6 }); }
    else if (t === 'dark') { x.fillStyle = 'rgba(40,10,70,0.6)'; x.beginPath(); x.arc(e.x, e.y, r, 0, Math.PI * 2); x.fill(); }
    else if (t === 'ice') { x.fillStyle = 'rgba(160,220,255,0.35)'; x.beginPath(); x.arc(e.x, e.y, r, 0, Math.PI * 2); x.fill(); }
    else if (t === 'steam') { x.fillStyle = 'rgba(220,220,230,0.5)'; x.beginPath(); x.arc(e.x, e.y, r, 0, Math.PI * 2); x.fill(); }
    else if (t === 'beam') { x.strokeStyle = 'rgba(255,60,120,0.9)'; x.lineWidth = 5; x.beginPath(); x.moveTo(e.x, e.y); x.lineTo(e.x + Math.cos(e.a) * e.r, e.y + Math.sin(e.a) * e.r); x.stroke(); x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.stroke(); R.lights.push({ x: e.x + Math.cos(e.a) * e.r / 2, y: e.y + Math.sin(e.a) * e.r / 2, r: e.r / 2 + 30, c: '#ff4080', a: 0.5 }); }
    else if (t === 'rain') { x.fillStyle = 'rgba(200,200,220,0.08)'; x.beginPath(); x.arc(e.x, e.y, r, 0, Math.PI * 2); x.fill(); for (let i = 0; i < 6; i++) { x.fillStyle = '#e8e0d0'; x.fillRect(e.x + Math.cos(tm * 7 + i * 1.1) * r * 0.8, e.y + ((tm * 200 + i * 37) % (r * 2)) - r, 1, 4); } }
    else if (t === 'ward') { x.strokeStyle = 'rgba(200,120,255,0.8)'; x.lineWidth = 1; x.setLineDash([3, 3]); x.beginPath(); x.arc(e.x, e.y, r, 0, Math.PI * 2); x.stroke(); x.setLineDash([]); }
    x.globalAlpha = 1;
  }
  function drawTelegraph(x, tg, e) {
    const [shape] = tg; const k = tg[tg.length - 1];
    const col = e.k === 'p' ? 'rgba(120,200,255,' : 'rgba(255,50,50,';
    x.lineWidth = 1;
    if (shape === 'c') { const [, cx, cy, r] = tg; x.fillStyle = col + '0.18)'; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); x.fillStyle = col + '0.35)'; x.beginPath(); x.arc(cx, cy, r * k, 0, Math.PI * 2); x.fill(); x.strokeStyle = col + '0.8)'; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke(); }
    else if (shape === 'l') { const [, cx, cy, a, len, w] = tg; x.save(); x.translate(cx, cy); x.rotate(a); x.fillStyle = col + '0.18)'; x.fillRect(0, -w / 2, len, w); x.fillStyle = col + '0.4)'; x.fillRect(0, -w / 2, len * k, w); x.strokeStyle = col + '0.8)'; x.strokeRect(0, -w / 2, len, w); x.restore(); }
    else if (shape === 'a') { const [, cx, cy, a, wd, r] = tg; x.fillStyle = col + '0.2)'; x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, r, a - wd / 2, a + wd / 2); x.closePath(); x.fill(); x.fillStyle = col + '0.4)'; x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, r * k, a - wd / 2, a + wd / 2); x.closePath(); x.fill(); }
    else if (shape === 'r') { const [, cx, cy, w, h] = tg; x.fillStyle = col + '0.18)'; x.fillRect(cx - w / 2, cy - h / 2, w, h); x.fillStyle = col + '0.4)'; x.fillRect(cx - w / 2, cy - h / 2, w, h * k); }
  }
  function sprite(key, dir, frame) { const s = G.SPR.get(key); return dir < 0 ? s.l[frame] : s.r[frame]; }
  function drawSprite(x, key, px, py, dir, moving, scale, alpha, flash) {
    const s = G.SPR.get(key); const sc = (scale || 1) * (s.big || 1);
    const frame = moving ? (Math.floor(R.time * 8) % 2) : 0;
    const img = flash ? (dir < 0 ? s.wl : s.wr) : sprite(key, dir, frame);
    const w = s.w * sc, h = s.h * sc;
    if (alpha != null) x.globalAlpha = alpha;
    x.drawImage(img, Math.round(px - w / 2), Math.round(py - h + 2), Math.round(w), Math.round(h));
    x.globalAlpha = 1;
    return { w, h };
  }
  function statusFx(x, e, st, top) {
    const tm = R.time;
    if (st & STATUS.burn) { x.fillStyle = Math.sin(tm * 25) > 0 ? '#ff8030' : '#ffd060'; for (let i = 0; i < 3; i++) x.fillRect(e.x - 4 + i * 4 + Math.sin(tm * 10 + i) * 2, e.y - 6 - ((tm * 40 + i * 9) % 12), 2, 3); R.lights.push({ x: e.x, y: e.y, r: 26, c: '#ff8040', a: 0.5 }); }
    if (st & STATUS.poison) { x.fillStyle = '#90e070'; for (let i = 0; i < 2; i++) x.fillRect(e.x - 3 + i * 5 + Math.sin(tm * 6 + i * 3) * 2, e.y - 10 - ((tm * 25 + i * 11) % 10), 2, 2); }
    if (st & STATUS.frozen) { x.fillStyle = 'rgba(160,220,255,0.55)'; x.fillRect(e.x - 7, e.y - top, 14, top + 1); x.strokeStyle = '#e0f4ff'; x.lineWidth = 1; x.strokeRect(e.x - 7, e.y - top, 14, top + 1); }
    if (st & STATUS.stun) { for (let i = 0; i < 3; i++) { const a = tm * 6 + i * 2.1; x.fillStyle = '#ffe060'; x.fillRect(e.x + Math.cos(a) * 6 - 1, e.y - top - 3 + Math.sin(a) * 2, 2, 2); } }
    if (st & STATUS.marked) { x.fillStyle = '#ff5050'; x.beginPath(); x.moveTo(e.x, e.y - top - 4 + Math.sin(tm * 8) * 1.5); x.lineTo(e.x - 3, e.y - top - 9 + Math.sin(tm * 8) * 1.5); x.lineTo(e.x + 3, e.y - top - 9 + Math.sin(tm * 8) * 1.5); x.closePath(); x.fill(); }
    if (st & STATUS.taunt) { R.text(x, '!', e.x + 6, e.y - top - 6, '#ff8040', 8, 'center', true); }
    if (st & STATUS.wet) { x.fillStyle = 'rgba(120,180,255,0.6)'; x.fillRect(e.x - 5, e.y - 2 + Math.sin(tm * 9) * 1, 2, 2); x.fillRect(e.x + 4, e.y - 1, 2, 2); }
    if (st & STATUS.oiled) { x.fillStyle = 'rgba(20,10,30,0.6)'; x.fillRect(e.x - 5, e.y - 1, 10, 2); }
    if (st & STATUS.shock) { x.strokeStyle = '#ffff80'; x.lineWidth = 1; x.beginPath(); x.moveTo(e.x - 5, e.y - top); x.lineTo(e.x - 1, e.y - top + 4); x.lineTo(e.x + 1, e.y - top + 2); x.lineTo(e.x + 5, e.y - top + 6); x.stroke(); }
    if (st & STATUS.root) { x.strokeStyle = '#70a040'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(e.x - 6, e.y + 2); x.lineTo(e.x - 2, e.y - 4); x.moveTo(e.x + 6, e.y + 2); x.lineTo(e.x + 2, e.y - 5); x.stroke(); }
    if (st & STATUS.buff) { x.fillStyle = 'rgba(255,120,80,0.6)'; x.fillRect(e.x - 1, e.y - top - 2 - ((tm * 20) % 6), 2, 2); }
    if (st & STATUS.shield) { x.strokeStyle = 'rgba(255,230,150,0.7)'; x.lineWidth = 1; x.beginPath(); x.arc(e.x, e.y - top / 2, top / 2 + 3, 0, Math.PI * 2); x.stroke(); }
  }
  function drawPlayer(x, e, mySlot) {
    const col = C.PLAYER_COLORS[e.s];
    if (e.gh) {
      const b = Math.sin(R.time * 3 + e.s) * 2;
      drawSprite(x, 'ghost', e.x, e.y - 4 + b, e.d, false, 1, 0.45 + Math.sin(R.time * 4) * 0.1);
      R.text(x, e.n, e.x, e.y - 24 + b, col, 6, 'center', true);
      if (e.cheer) R.text(x, '응원!', e.x, e.y - 30 + b, '#ffe080', 6, 'center', true);
      R.lights.push({ x: e.x, y: e.y - 8, r: 30, c: '#a0c0ff', a: 0.4 });
      return;
    }
    let key = e.c;
    if (e.c === 'druid' && e.f) key = e.f === 'bear' ? 'druidBear' : e.f === 'wolf' ? 'druidWolf' : e.f === 'crow' ? 'druidCrow' : 'druid';
    const flash = e.fl > 0;
    let alpha = 1;
    if (e.stl) alpha = 0.35; else if (e.inv && Math.floor(R.time * 20) % 2 === 0) alpha = 0.55;
    if (e.dn) {
      // 다운: 눕힌 스프라이트 + 타이머 링
      x.save(); x.translate(e.x, e.y); x.rotate(e.d < 0 ? Math.PI / 2 : -Math.PI / 2);
      drawSprite(x, key, 0, 6, e.d, false, 1, 0.9, flash); x.restore();
      x.strokeStyle = '#ff5050'; x.lineWidth = 1.5; x.beginPath(); x.arc(e.x, e.y - 6, 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (e.dt || 0)); x.stroke();
      if (e.rv > 0) { x.fillStyle = '#000a'; x.fillRect(e.x - 10, e.y - 22, 20, 4); x.fillStyle = '#7fcf7a'; x.fillRect(e.x - 10, e.y - 22, 20 * e.rv, 4); }
      R.text(x, e.n, e.x, e.y - 28, col, 6, 'center', true);
      R.text(x, 'F 부활', e.x, e.y + 10, '#ffffff', 6, 'center', true);
      return;
    }
    const rollSq = e.rl ? 0.8 : 1;
    const { h } = drawSprite(x, key, e.x, e.y + (e.rl ? 2 : 0), e.d, e.m, rollSq, alpha, flash);
    // 무기 (조준 방향 회전)
    const s = G.SPR.get(key);
    if (s.weapon && !e.rl && !e.stl) {
      const wp = G.SPR.wp[s.weapon];
      x.save(); x.translate(e.x + (e.d < 0 ? -3 : 3), e.y - 7); x.rotate(e.a + Math.PI / 2 + (e.sw ? (e.d < 0 ? -1 : 1) * Math.sin(e.sw * Math.PI) * 1.2 : 0));
      x.globalAlpha = alpha; x.drawImage(wp, -2, -wp.height + 1); x.globalAlpha = 1; x.restore();
    }
    // 방패 (기사 Q)
    if (e.q) { x.save(); x.translate(e.x, e.y - 6); x.rotate(e.a); x.fillStyle = '#9aa0b0'; x.fillRect(6, -7, 3, 14); x.fillStyle = '#c8ccd8'; x.fillRect(7, -5, 1, 10); x.restore(); }
    // 차지 링 (궁수)
    if (e.ch > 0) { x.strokeStyle = e.ch >= 1 ? '#ffe060' : '#ffffff'; x.lineWidth = 1; x.beginPath(); x.arc(e.x, e.y - 8, 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, e.ch)); x.stroke(); }
    statusFx(x, e, e.st || 0, h);
    // 이름 + 체력
    R.text(x, e.n, e.x, e.y - h - 6, col, 6, 'center', true);
    const hp = e.hp / e.mhp;
    x.fillStyle = '#000a'; x.fillRect(e.x - 9, e.y - h - 2, 18, 3);
    x.fillStyle = hp < 0.3 ? '#ff5050' : '#b8462e'; x.fillRect(e.x - 9, e.y - h - 2, Math.round(18 * Math.max(0, hp)), 3);
    if (e.sh > 0) { x.fillStyle = '#ffe080'; x.fillRect(e.x - 9, e.y - h - 2, Math.round(18 * Math.min(1, e.sh / e.mhp)), 1); }
    if (e.rv > 0) { x.fillStyle = '#000a'; x.fillRect(e.x - 10, e.y - h - 10, 20, 3); x.fillStyle = '#7fcf7a'; x.fillRect(e.x - 10, e.y - h - 10, 20 * e.rv, 3); }
    if (e.em) R.text(x, e.em, e.x, e.y - h - 16 + Math.sin(R.time * 5) * 1.5, '#fff', 9, 'center', true);
    if (e.hat) { x.fillStyle = '#e0b050'; x.beginPath(); x.moveTo(e.x - 5, e.y - h + 4); x.lineTo(e.x, e.y - h - 6); x.lineTo(e.x + 5, e.y - h + 4); x.closePath(); x.fill(); x.fillStyle = '#ff5050'; x.fillRect(e.x - 1, e.y - h - 6, 2, 2); }
    const lr = e.lr != null ? e.lr : 110;
    R.lights.push({ x: e.x, y: e.y - 6, r: lr, c: '#ffe8c0', a: 1 });
  }
  function drawEnemy(x, e) {
    const s = G.SPR.get(e.t); const sc = e.sz || 1;
    const flash = e.fl > 0;
    let alpha = 1; if (e.stl) alpha = 0.3;
    if (e.el) {
      const aff = G.AFFIXES[e.el.split(',')[0]]; const c = aff ? aff.color : '#fff';
      x.globalAlpha = 0.5 + Math.sin(R.time * 6) * 0.2;
      const img = e.d < 0 ? s.wl : s.wr; const w = s.w * (s.big || 1) * sc + 2, h = s.h * (s.big || 1) * sc + 2;
      x.save(); x.filter = 'none'; x.globalCompositeOperation = 'source-over';
      // 색 실루엣: 흰 실루엣을 색으로 틴트 (오프스크린 없이 근사: 외곽 4방향)
      x.globalAlpha = 0.35; for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { x.drawImage(img, Math.round(e.x - w / 2 + dx), Math.round(e.y - h + 3 + dy), Math.round(w), Math.round(h)); }
      x.restore(); x.globalAlpha = 1;
      x.strokeStyle = c; x.lineWidth = 1; x.globalAlpha = 0.6; x.beginPath(); x.ellipse(e.x, e.y + 1, 7 * sc * (s.big || 1), 3.5 * sc * (s.big || 1), 0, 0, Math.PI * 2); x.stroke(); x.globalAlpha = 1;
    }
    if (e.hd) { // 땅속 (촉수 등장 전)
      x.fillStyle = 'rgba(80,40,120,0.5)'; x.beginPath(); x.ellipse(e.x, e.y, 8, 4, 0, 0, Math.PI * 2); x.fill(); return;
    }
    const { h } = drawSprite(x, e.t, e.x, e.y + (e.fy || 0), e.d, e.m, sc, alpha, flash);
    if (e.sh > 0) { x.strokeStyle = 'rgba(200,160,255,0.8)'; x.lineWidth = 1; x.beginPath(); x.arc(e.x, e.y - h / 2, h / 2 + 3, 0, Math.PI * 2); x.stroke(); }
    statusFx(x, e, e.st || 0, h);
    if (e.hp < 1 && !e.bs) { x.fillStyle = '#000a'; x.fillRect(e.x - 8, e.y - h - 3, 16, 2); x.fillStyle = '#d04040'; x.fillRect(e.x - 8, e.y - h - 3, Math.round(16 * Math.max(0, e.hp)), 2); }
    if (e.el) { const names = e.el.split(',').map(a => (G.AFFIXES[a] || {}).name).filter(Boolean).join(' '); R.text(x, names, e.x, e.y - h - 8, (G.AFFIXES[e.el.split(',')[0]] || {}).color || '#fff', 6, 'center', true); }
    if (e.nm) R.text(x, e.nm, e.x, e.y - h - 8, '#ffd0d0', 7, 'center', true);
    if (e.k === 'm') R.text(x, '', e.x, e.y, '#fff', 5);
    if (e.gl) R.lights.push({ x: e.x, y: e.y - h / 2, r: e.gl, c: e.glc || '#ff6080', a: 0.6 });
  }
  function drawProj(x, e) {
    const t = e.t;
    x.save(); x.translate(e.x, e.y); x.rotate(e.a || 0);
    if (t === 'arrow') { x.fillStyle = '#d8d0c0'; x.fillRect(-6, -0.5, 12, 1); x.fillStyle = '#fff'; x.fillRect(5, -1, 2, 2); x.fillStyle = e.el === 'fire' ? '#ff8030' : e.el === 'ice' ? '#a0e0ff' : e.el === 'shock' ? '#ffff80' : '#a08060'; x.fillRect(-7, -1.5, 3, 3); }
    else if (t === 'bolt') { x.fillStyle = '#c090ff'; x.fillRect(-2, -2, 4, 4); x.fillStyle = '#fff'; x.fillRect(-1, -1, 2, 2); R.lights.push({ x: e.x, y: e.y, r: 16, c: '#c090ff', a: 0.5 }); }
    else if (t === 'orb') { x.fillStyle = '#ffe8a0'; x.beginPath(); x.arc(0, 0, 3, 0, Math.PI * 2); x.fill(); x.fillStyle = '#fff'; x.fillRect(-1, -1, 2, 2); R.lights.push({ x: e.x, y: e.y, r: 22, c: '#ffe0a0', a: 0.6 }); }
    else if (t === 'fire') { x.fillStyle = '#ff7030'; x.beginPath(); x.arc(0, 0, 4, 0, Math.PI * 2); x.fill(); x.fillStyle = '#ffe080'; x.beginPath(); x.arc(-1, 0, 2, 0, Math.PI * 2); x.fill(); R.lights.push({ x: e.x, y: e.y, r: 30, c: '#ff8040', a: 0.8 }); }
    else if (t === 'bone') { x.fillStyle = '#e8e0d0'; x.fillRect(-4, -1, 8, 2); x.fillRect(-5, -2, 2, 4); x.fillRect(3, -2, 2, 4); }
    else if (t === 'bullet') { x.fillStyle = '#ffe060'; x.fillRect(-4, -0.5, 8, 1); x.fillStyle = '#fff'; x.fillRect(2, -1, 2, 2); }
    else if (t === 'ice') { x.fillStyle = '#a0e0ff'; x.beginPath(); x.moveTo(4, 0); x.lineTo(0, 3); x.lineTo(-4, 0); x.lineTo(0, -3); x.closePath(); x.fill(); }
    else if (t === 'wind') { x.strokeStyle = 'rgba(200,255,200,0.8)'; x.lineWidth = 1.5; x.beginPath(); x.arc(0, 0, 5, -1, 1); x.stroke(); }
    else if (t === 'enemyArrow') { x.fillStyle = '#8a7a6a'; x.fillRect(-5, -0.5, 10, 1); x.fillStyle = '#ff6040'; x.fillRect(4, -1, 2, 2); }
    else if (t === 'enemyFire') { x.fillStyle = '#ff5020'; x.beginPath(); x.arc(0, 0, 4, 0, Math.PI * 2); x.fill(); R.lights.push({ x: e.x, y: e.y, r: 26, c: '#ff6030', a: 0.7 }); }
    else if (t === 'meteor') { x.restore(); x.fillStyle = 'rgba(0,0,0,0.4)'; x.beginPath(); x.ellipse(e.x, e.y, 10 * (1 - e.p), 5 * (1 - e.p), 0, 0, Math.PI * 2); x.fill(); const fy = e.y - 120 * e.p; x.fillStyle = '#ff6020'; x.beginPath(); x.arc(e.x + 30 * e.p, fy, 7, 0, Math.PI * 2); x.fill(); x.fillStyle = '#ffe080'; x.beginPath(); x.arc(e.x + 30 * e.p, fy, 3, 0, Math.PI * 2); x.fill(); R.lights.push({ x: e.x + 30 * e.p, y: fy, r: 50, c: '#ff8040', a: 0.8 }); return; }
    else if (t === 'bombT') { x.fillStyle = '#2a2a2a'; x.beginPath(); x.arc(0, -8 * Math.sin(Math.PI * (e.p || 0)), 3, 0, Math.PI * 2); x.fill(); x.fillStyle = '#ff8040'; x.fillRect(1, -11 * Math.sin(Math.PI * (e.p || 0)), 1, 2); }
    else { x.fillStyle = '#fff'; x.fillRect(-2, -2, 4, 4); }
    x.restore();
  }
  function drawPickup(x, e) {
    const img = G.SPR.pk[e.t] || G.SPR.pk.gold; const b = Math.sin(R.time * 4 + e.id) * 1.5;
    x.drawImage(img, Math.round(e.x - img.width / 2), Math.round(e.y - img.height - 2 + b));
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(e.x - 2, e.y, 4, 1);
    if (e.t !== 'gold') R.lights.push({ x: e.x, y: e.y - 3, r: 18, c: e.t === 'relic' ? '#c77dff' : e.t === 'equip' ? '#ffb347' : '#ffffff', a: 0.5 });
  }
  function drawObj(x, e) {
    if (e.t === 'tg') return;
    let key = e.t;
    if (e.t === 'chest' && e.st === 'open') key = 'chestOpen';
    if (e.t === 'chest' && e.st === 'locked') key = 'chestLocked';
    if (e.t === 'altar' && e.st === 'off') key = 'altarOff';
    if (e.t === 'seal' && e.st === 'on') key = 'sealOn';
    if (e.t === 'trap' || e.t === 'station' || e.t === 'npc') { }
    const { h } = drawSprite(x, key, e.x, e.y, 1, false, e.sz || 1, e.al != null ? e.al : 1, e.fl > 0);
    if (e.t === 'exit') { x.strokeStyle = `rgba(200,160,255,${0.5 + Math.sin(R.time * 4) * 0.3})`; x.lineWidth = 1; x.beginPath(); x.ellipse(e.x, e.y + 1, 10, 5, 0, 0, Math.PI * 2); x.stroke(); R.lights.push({ x: e.x, y: e.y - 8, r: 60, c: '#c0a0ff', a: 0.9 }); }
    if (e.t === 'torch') R.lights.push({ x: e.x, y: e.y - 10, r: 95 + Math.sin(R.time * 9) * 4, c: '#ffb060', a: 0.9 });
    if (e.t === 'altar' && e.st !== 'off') R.lights.push({ x: e.x, y: e.y - 8, r: 40, c: '#80ffe0', a: 0.8 });
    if (e.t === 'seal' && e.st === 'on') R.lights.push({ x: e.x, y: e.y - 4, r: 40, c: '#ffffff', a: 0.9 });
    if (e.t === 'seal' && e.st !== 'on') R.lights.push({ x: e.x, y: e.y - 4, r: 24, c: '#c080ff', a: 0.6 });
    if (e.t === 'station' || e.t === 'npc') R.lights.push({ x: e.x, y: e.y - 8, r: 50, c: '#ffd080', a: 0.7 });
    if (e.nm) R.text(x, e.nm, e.x, e.y - h - 5, e.hl ? '#ffe080' : '#d9d2c5', 6, 'center', true);
    if (e.pr) R.text(x, e.pr, e.x, e.y + 8, '#ffffff', 6, 'center', true);
    if (e.pg != null) { x.fillStyle = '#000a'; x.fillRect(e.x - 10, e.y + 3, 20, 3); x.fillStyle = '#80ffe0'; x.fillRect(e.x - 10, e.y + 3, 20 * e.pg, 3); }
  }
  function drawLights(x, view, map) {
    const amb = view.amb != null ? view.amb : 0.6;
    if (amb <= 0.01) return;
    const l = lctx;
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.globalCompositeOperation = 'source-over';
    l.clearRect(0, 0, lc.width, lc.height);
    l.fillStyle = `rgba(4,2,8,${amb})`; l.fillRect(0, 0, lc.width, lc.height);
    l.globalCompositeOperation = 'destination-out';
    const sc = 0.5;
    for (const li of R.lights) {
      const lx = (li.x - R.cam.left) * sc, ly = (li.y - R.cam.top) * sc, r = li.r * sc;
      if (lx < -r || ly < -r || lx > lc.width + r || ly > lc.height + r) continue;
      const g = l.createRadialGradient(lx, ly, 0, lx, ly, r);
      g.addColorStop(0, `rgba(255,255,255,${li.a})`); g.addColorStop(0.5, `rgba(255,255,255,${li.a * 0.5})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      l.fillStyle = g; l.beginPath(); l.arc(lx, ly, r, 0, Math.PI * 2); l.fill();
    }
    l.globalCompositeOperation = 'source-over';
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.imageSmoothingEnabled = true;
    x.drawImage(lc, 0, 0, C.W, C.H);
    x.imageSmoothingEnabled = false;
    // 색 조명 (가산)
    x.globalCompositeOperation = 'lighter';
    for (const li of R.lights) {
      if (!li.c || li.c === '#ffe8c0') continue;
      const lx = li.x - R.cam.left, ly = li.y - R.cam.top;
      const g = x.createRadialGradient(lx, ly, 0, lx, ly, li.r);
      g.addColorStop(0, hexA(li.c, 0.12 * li.a)); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.beginPath(); x.arc(lx, ly, li.r, 0, Math.PI * 2); x.fill();
    }
    x.globalCompositeOperation = 'source-over';
    x.setTransform(1, 0, 0, 1, -R.cam.left, -R.cam.top);
  }
  function hexA(h, a) { const n = parseInt(h.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
  R.hexA = hexA;
  return R;
})();
