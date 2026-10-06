// 월드: 전투 아레나 생성(시드), 노드 맵 생성, 길드 홀 레이아웃, 타일 충돌
G.World = (function () {
  const W = {};
  const C = G.C, TL = G.TL, T = C.TILE;

  function blank(w, h, fill) { const m = { w, h, tiles: new Uint8Array(w * h), ver: 1, rooms: [], objs: [], spawns: [] }; if (fill) m.tiles.fill(fill); return m; }
  const get = (m, i, j) => (i < 0 || j < 0 || i >= m.w || j >= m.h) ? TL.WALL : m.tiles[j * m.w + i];
  const set = (m, i, j, t) => { if (i >= 0 && j >= 0 && i < m.w && j < m.h) m.tiles[j * m.w + i] = t; };
  W.get = get; W.set = set;
  function rect(m, x, y, w, h, t) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(m, i, j, t); }

  // ───── 전투 아레나
  W.genArena = function (seed, region, opts) {
    opts = opts || {};
    const rng = G.U.RNG(seed);
    const m = blank(C.ARENA_W, C.ARENA_H, TL.WALL);
    m.seed = seed; m.region = region;
    const R = G.REGIONS[region - 1] || G.REGIONS[0];
    if (opts.boss) {
      const rw = 30, rh = 20, rx = 5, ry = 5;
      rect(m, rx, ry, rw, rh, TL.FLOOR);
      m.rooms.push({ x: rx, y: ry, w: rw, h: rh });
      // 기둥
      if (!opts.noPillars) for (const [px, py] of [[rx + 6, ry + 5], [rx + rw - 8, ry + 5], [rx + 6, ry + rh - 7], [rx + rw - 8, ry + rh - 7]]) rect(m, px, py, 2, 2, TL.WALL);
      m.spawn = { x: (rx + 4) * T, y: (ry + rh / 2) * T };
      m.bossSpawn = { x: (rx + rw - 6) * T, y: (ry + rh / 2) * T };
      for (let i = 0; i < 6; i++) m.spawns.push({ x: (rx + 8 + rng.int(0, rw - 12)) * T, y: (ry + 2 + rng.int(0, rh - 4)) * T });
      m.objs.push({ t: 'torch', x: (rx + 1) * T + 8, y: (ry + 1) * T + 14 }, { t: 'torch', x: (rx + rw - 2) * T + 8, y: (ry + 1) * T + 14 }, { t: 'torch', x: (rx + 1) * T + 8, y: (ry + rh - 2) * T + 14 }, { t: 'torch', x: (rx + rw - 2) * T + 8, y: (ry + rh - 2) * T + 14 });
      return m;
    }
    // 방 2~4개 + L자 통로
    const nRooms = opts.rooms || rng.int(2, 4);
    let tries = 0;
    while (m.rooms.length < nRooms && tries++ < 80) {
      const w = rng.int(8, 14), h = rng.int(6, 10);
      const x = rng.int(2, m.w - w - 2), y = rng.int(2, m.h - h - 2);
      if (m.rooms.some(r => x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y)) continue;
      m.rooms.push({ x, y, w, h });
    }
    m.rooms.sort((a, b) => a.x - b.x);
    for (const r of m.rooms) rect(m, r.x, r.y, r.w, r.h, TL.FLOOR);
    for (let i = 0; i + 1 < m.rooms.length; i++) {
      const a = m.rooms[i], b = m.rooms[i + 1];
      const ax = a.x + (a.w >> 1), ay = a.y + (a.h >> 1), bx = b.x + (b.w >> 1), by = b.y + (b.h >> 1);
      const cw = rng.int(2, 3);
      if (rng.chance(0.5)) { rect(m, Math.min(ax, bx), ay, Math.abs(bx - ax) + cw, cw, TL.FLOOR); rect(m, bx, Math.min(ay, by), cw, Math.abs(by - ay) + cw, TL.FLOOR); }
      else { rect(m, ax, Math.min(ay, by), cw, Math.abs(by - ay) + cw, TL.FLOOR); rect(m, Math.min(ax, bx), by, Math.abs(bx - ax) + cw, cw, TL.FLOOR); }
    }
    // 테두리 보장
    for (let i = 0; i < m.w; i++) { set(m, i, 0, TL.WALL); set(m, i, m.h - 1, TL.WALL); }
    for (let j = 0; j < m.h; j++) { set(m, 0, j, TL.WALL); set(m, m.w - 1, j, TL.WALL); }
    // 위험 지형 (방 안 덩어리)
    const hz = opts.hazards === false ? [] : R.hazards;
    for (const r of m.rooms) {
      if (rng.chance(0.65) && hz.length) {
        const kind = rng.pick(hz);
        if (kind === 'coffin') { for (let k = 0; k < rng.int(1, 3); k++) m.objs.push({ t: 'coffin', x: (r.x + rng.int(1, r.w - 2)) * T + 8, y: (r.y + rng.int(1, r.h - 2)) * T + 12 }); continue; }
        const tile = kind === 'oil' ? TL.OIL : kind === 'water' ? TL.WATER : TL.DARK;
        const cx = r.x + rng.int(2, r.w - 3), cy = r.y + rng.int(2, r.h - 3), rad = rng.int(1, 2);
        for (let j = -rad; j <= rad; j++) for (let i = -rad; i <= rad; i++) if (i * i + j * j <= rad * rad + 1 && get(m, cx + i, cy + j) === TL.FLOOR && rng.chance(0.85)) set(m, cx + i, cy + j, tile);
      }
      for (let k = 0; k < rng.int(0, 3); k++) { const i = r.x + rng.int(0, r.w - 1), j = r.y + rng.int(0, r.h - 1); if (get(m, i, j) === TL.FLOOR) set(m, i, j, TL.RUBBLE); }
      if (rng.chance(0.7)) m.objs.push({ t: 'torch', x: (r.x + rng.int(0, r.w - 1)) * T + 8, y: r.y * T + 14 });
      if (region === 1 && rng.chance(0.4)) m.objs.push({ t: 'barrel', x: (r.x + rng.int(1, r.w - 2)) * T + 8, y: (r.y + rng.int(1, r.h - 2)) * T + 12 });
    }
    const first = m.rooms[0], last = m.rooms[m.rooms.length - 1];
    m.spawn = { x: (first.x + first.w / 2) * T, y: (first.y + first.h / 2) * T };
    m.exit = { x: (last.x + last.w / 2) * T, y: (last.y + last.h / 2) * T };
    for (const r of m.rooms) for (let k = 0; k < 3; k++) m.spawns.push({ x: (r.x + rng.int(1, r.w - 2)) * T + 8, y: (r.y + rng.int(1, r.h - 2)) * T + 8 });
    return m;
  };

  // ───── 길드 홀 (고정 레이아웃)
  W.genHall = function () {
    const m = blank(40, 24, TL.WALL);
    m.seed = 7; m.region = 1; m.hall = true;
    rect(m, 2, 2, 36, 20, TL.FLOOR);
    // 안뜰(아래)과 술집(위) 분리 벽
    rect(m, 2, 12, 15, 1, TL.WALL); rect(m, 23, 12, 15, 1, TL.WALL);
    rect(m, 12, 2, 1, 4, TL.WALL); rect(m, 27, 2, 1, 4, TL.WALL);
    for (let i = 0; i < 12; i++) { set(m, 4 + i * 3, 21, TL.RUBBLE); }
    for (let i = 0; i < 6; i++) set(m, 5 + i * 6, 4, TL.LIT);
    m.spawn = { x: 20 * T, y: 16 * T };
    const st = (id, x, y, nm) => m.objs.push({ t: 'station', id, x: x * T + 8, y: y * T + 14, nm });
    st('tavern', 20, 5, '🍺 술집 · 출발');
    st('forge', 6, 5, '⚒️ 대장간');
    st('storage', 9, 9, '📦 창고');
    st('training', 33, 5, '🏋️ 훈련장');
    st('hall', 30, 9, '🏛️ 전당');
    st('grave', 6, 17, '⚰️ 묘지');
    st('library', 34, 17, '📚 도서관');
    st('banner', 20, 20, '🚩 깃발');
    m.objs.push({ t: 'npc', id: 'greta', x: 23 * T + 8, y: 5 * T + 14, nm: '그레타' }, { t: 'npc', id: 'olang', x: 4 * T + 8, y: 7 * T + 14, nm: '올랑' }, { t: 'npc', id: 'walter', x: 4 * T + 8, y: 19 * T + 14, nm: '발터' }, { t: 'npc', id: 'hass', x: 36 * T + 8, y: 7 * T + 14, nm: '하스' });
    for (const [x, y] of [[3, 3], [37, 3], [3, 14], [37, 14], [16, 3], [24, 3], [20, 13], [10, 21], [30, 21]]) m.objs.push({ t: 'torch', x: x * T + 8, y: y * T + 14 });
    for (let i = 0; i < 3; i++) m.objs.push({ t: 'dummy', x: (30 + i * 3) * T + 8, y: 3 * T + 14, nm: '허수아비' });
    return m;
  };

  // ───── 충돌
  W.solidTile = t => t === TL.WALL || t === TL.VOID;
  W.solidAt = (m, px, py) => W.solidTile(get(m, Math.floor(px / T), Math.floor(py / T)));
  // 원형 엔티티 이동, 벽 충돌 시 축별 분리. 반환: 벽에 부딪혔는지
  W.move = function (m, e, dx, dy, ghost) {
    if (ghost) { e.x = G.U.clamp(e.x + dx, 8, m.w * T - 8); e.y = G.U.clamp(e.y + dy, 8, m.h * T - 8); return false; }
    let hit = false;
    const r = e.r || 5;
    if (dx) { const nx = e.x + dx; if (!W.circleHits(m, nx, e.y, r)) e.x = nx; else { hit = true; } }
    if (dy) { const ny = e.y + dy; if (!W.circleHits(m, e.x, ny, r)) e.y = ny; else { hit = true; } }
    return hit;
  };
  W.circleHits = function (m, x, y, r) {
    const x0 = Math.floor((x - r) / T), x1 = Math.floor((x + r) / T), y0 = Math.floor((y - r) / T), y1 = Math.floor((y + r) / T);
    for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
      if (!W.solidTile(get(m, i, j))) continue;
      const cx = G.U.clamp(x, i * T, i * T + T), cy = G.U.clamp(y, j * T, j * T + T);
      if ((cx - x) * (cx - x) + (cy - y) * (cy - y) < r * r) return true;
    }
    return false;
  };
  W.los = function (m, x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 6);
    for (let i = 1; i < n; i++) { const k = i / n; if (W.solidAt(m, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k)) return false; }
    return true;
  };
  W.tileAt = (m, px, py) => get(m, Math.floor(px / T), Math.floor(py / T));
  W.randomFloor = function (m, rng, nearX, nearY, minD, maxD) {
    for (let t = 0; t < 60; t++) {
      const r = rng.pick(m.rooms);
      const x = (r.x + rng.int(0, r.w - 1)) * T + 8, y = (r.y + rng.int(0, r.h - 1)) * T + 8;
      if (W.solidAt(m, x, y)) continue;
      if (nearX != null) { const d = Math.hypot(x - nearX, y - nearY); if (d < (minD || 0) || d > (maxD || 1e9)) continue; }
      return { x, y };
    }
    return { x: m.spawn.x, y: m.spawn.y };
  };
  W.setTile = function (m, px, py, t) { const i = Math.floor(px / T), j = Math.floor(py / T); if (get(m, i, j) !== TL.WALL) { set(m, i, j, t); m.ver++; return [i, j]; } return null; };

  // ───── 노드 맵 (지역당 7열)
  W.genNodeMap = function (seed, region, opts) {
    opts = opts || {};
    const rng = G.U.RNG(seed ^ (region * 7919));
    const cols = [];
    const weights = Object.assign({}, C.NODE_WEIGHTS);
    if (opts.noShop) weights.shop = 0;
    if (opts.eliteMore) weights.elite *= 2;
    if (opts.moreShop) weights.shop += 5;
    let id = 0;
    for (let c = 0; c < C.REGION_COLS; c++) {
      const n = c === C.REGION_COLS - 1 ? 1 : c === 0 ? 2 : rng.int(2, 3);
      const col = [];
      for (let r = 0; r < n; r++) {
        let type;
        if (c === C.REGION_COLS - 1) type = 'boss';
        else if (c === 0) type = 'fight';
        else if (c === C.REGION_COLS - 2) type = rng.chance(0.5) ? 'fire' : rng.chance(0.5) ? 'shop' : 'fight';
        else type = rng.weighted(Object.keys(weights), k => weights[k]);
        if (type === 'elite' && c < 2) type = 'fight';
        col.push({ id: id++, col: c, row: r, type, next: [], x: 0, y: 0 });
      }
      cols.push(col);
    }
    // 연결: 각 노드 → 다음 열 1~2개, 다음 열 모든 노드가 최소 1개 연결
    for (let c = 0; c + 1 < cols.length; c++) {
      const a = cols[c], b = cols[c + 1];
      a.forEach((n, i) => {
        const j = Math.round(i * (b.length - 1) / Math.max(1, a.length - 1));
        n.next.push(b[j].id);
        if (b.length > 1 && rng.chance(0.5)) { const j2 = G.U.clamp(j + (rng.chance(0.5) ? 1 : -1), 0, b.length - 1); if (j2 !== j) n.next.push(b[j2].id); }
      });
      b.forEach((n, j) => { if (!a.some(x => x.next.includes(n.id))) { const near = a[Math.min(a.length - 1, Math.round(j * (a.length - 1) / Math.max(1, b.length - 1)))]; near.next.push(n.id); } });
    }
    // 같은 열에 같은 타입 몰리지 않게 약간 보정
    for (const col of cols) { if (col.length > 1 && col.every(n => n.type === col[0].type) && col[0].type !== 'boss' && col[0].type !== 'fight') col[1].type = 'fight'; }
    const nodes = [].concat(...cols);
    cols.forEach((col, c) => col.forEach((n, r) => { n.x = 20 + c * 54; n.y = 60 + (r - (col.length - 1) / 2) * 54 + (c % 2 ? 6 : -6); }));
    return { seed, region, cols, nodes, byId: Object.fromEntries(nodes.map(n => [n.id, n])) };
  };
  W.NODE_INFO = {
    fight: { icon: '⚔️', name: '전투' }, elite: { icon: '💀', name: '정예' }, event: { icon: '❓', name: '이벤트' }, shop: { icon: '💰', name: '상점' },
    fire: { icon: '🔥', name: '모닥불' }, treasure: { icon: '📦', name: '보물' }, trial: { icon: '🏆', name: '시련' }, boss: { icon: '👑', name: '보스' },
  };
  return W;
})();
