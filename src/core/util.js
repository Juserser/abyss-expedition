// 수학/랜덤/도우미
G.U = (function () {
  const U = {};
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  U.dist2 = (ax, ay, bx, by) => (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
  U.ang = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
  U.approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));
  U.angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
  U.easeOut = t => 1 - (1 - t) * (1 - t);
  U.easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  U.r1 = v => Math.round(v * 10) / 10;
  U.pct = v => Math.round(v * 100) + '%';
  U.fmtTime = s => { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return h ? `${h}시간 ${m}분` : m ? `${m}분 ${ss}초` : `${ss}초`; };
  U.today = () => { const d = new Date(); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`; };
  U.weekKey = () => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const w1 = new Date(d.getFullYear(), 0, 4);
    const wk = 1 + Math.round(((d - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
    return `${d.getFullYear()}-W${String(wk).padStart(2, '0')}`;
  };
  U.hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  U.segDist = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay; const l2 = dx * dx + dy * dy || 1;
    const t = U.clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
  };
  U.josa = (word, pair) => {
    const c = word.charCodeAt(word.length - 1);
    const has = c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
    const [a, b] = pair.split('/');
    return word + (has ? a : b);
  };
  U.esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.sum = arr => arr.reduce((a, b) => a + b, 0);
  U.maxBy = (arr, f) => { let best = null, bv = -Infinity; for (const a of arr) { const v = f(a); if (v > bv) { bv = v; best = a; } } return best; };
  U.deep = o => JSON.parse(JSON.stringify(o));

  // 시드 RNG (mulberry32)
  U.RNG = function (seed) {
    let s = seed >>> 0;
    const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    r.int = (a, b) => a + Math.floor(r() * (b - a + 1));
    r.range = (a, b) => a + r() * (b - a);
    r.pick = arr => arr[Math.floor(r() * arr.length)];
    r.chance = p => r() < p;
    r.shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    r.weighted = (items, wf) => { let tot = 0; for (const it of items) tot += wf(it); let x = r() * tot; for (const it of items) { x -= wf(it); if (x <= 0) return it; } return items[items.length - 1]; };
    r.state = () => s;
    return r;
  };
  U.rng = U.RNG((Date.now() ^ (Math.random() * 1e9)) >>> 0);
  U.seed = () => (Math.floor(Math.random() * 0xffffffff)) >>> 0;

  let _id = 1;
  U.id = () => _id++;
  return U;
})();
