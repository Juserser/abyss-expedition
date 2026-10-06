// 계정(닉네임+비밀코드) · 길드 데이터(복제본) · 설정 · 백업 코드 — 전부 localStorage, 서버 없음
G.Acct = (function () {
  const A = {};
  const PRE = 'abyss:';
  const ls = {
    get: k => { try { return JSON.parse(localStorage.getItem(PRE + k) || 'null'); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(PRE + k, JSON.stringify(v)); return true; } catch (e) { console.warn('save failed', e); return false; } },
    del: k => { try { localStorage.removeItem(PRE + k); } catch (e) {} },
    keys: () => { try { return Object.keys(localStorage).filter(k => k.startsWith(PRE)).map(k => k.slice(PRE.length)); } catch (e) { return []; } },
  };
  A.me = null;      // 현재 계정 데이터
  A.guild = null;   // 현재 길드 데이터 (복제본)

  const hash = s => G.U.hashStr('abyss|' + s).toString(36);

  // ───── 계정
  A.freshAcct = name => ({
    v: G.C.VERSION, name, hash: '', created: G.U.today(), lastClass: 'knight', lastGuild: '',
    chars: {}, titles: [], title: '', penalty: false,
    stats: { runs: 0, clears: 0, wipes: 0, kills: 0, downs: 0, deaths: 0, revives: 0, dmg: 0, heal: 0, tank: 0, gold: 0, mvp: 0, blame: 0, playTime: 0, bestDepth: 0, awards: {} },
  });
  A.freshChar = () => ({ lv: 1, xp: 0, talents: [], equip: { w: null, a: null, t: null }, runs: 0 });
  A.charOf = (acct, cls) => { if (!acct.chars[cls]) acct.chars[cls] = A.freshChar(); return acct.chars[cls]; };
  function migrateAcct(d) {
    const f = A.freshAcct(d.name);
    for (const k in f) if (d[k] === undefined) d[k] = f[k];
    for (const k in f.stats) if (d.stats[k] === undefined) d.stats[k] = f.stats[k];
    for (const c in d.chars) { const fc = A.freshChar(); for (const k in fc) if (d.chars[c][k] === undefined) d.chars[c][k] = fc[k]; }
    d.v = G.C.VERSION; return d;
  }
  A.listAccounts = () => ls.keys().filter(k => k.startsWith('acct:')).map(k => k.slice(5));
  A.login = function (name, code) {
    name = (name || '').trim(); code = (code || '').trim();
    if (name.length < 2 || name.length > 8) return { err: '닉네임은 2~8자' };
    if (!/^\d{6}$/.test(code)) return { err: '비밀코드는 숫자 6자리' };
    let d = ls.get('acct:' + name);
    if (d) { if (d.hash !== hash(code)) return { err: '비밀코드가 다릅니다' }; d = migrateAcct(d); }
    else { d = A.freshAcct(name); d.hash = hash(code); }
    A.me = d; A.code = code; A.saveMe();
    return { ok: true, isNew: !ls.get('acct:' + name + ':seen') };
  };
  A.saveMe = () => { if (A.me) { ls.set('acct:' + A.me.name, A.me); ls.set('acct:' + A.me.name + ':seen', 1); } };
  A.logout = () => { A.me = null; A.guild = null; };

  // ───── 길드
  A.freshGuild = (name, code) => ({
    v: G.C.VERSION, code: code || genGuildCode(), name: name || '이름 없는 용병단', color: 0, ver: 1, ts: Date.now(), created: G.U.today(),
    ash: 0, soul: 0,
    fac: { tavern: 1, forge: 1, storage: 1, training: 1, hall: 1, grave: 1, library: 1 },
    storage: [], unlocked: ['knight', 'priest', 'archer', 'mage', 'rogue', 'berserker'],
    hall: { runs: 0, clears: 0, wipes: 0, bestDepth: 0, bestRush: 0, bestEndless: 0, bossKills: {}, snapshots: [], records: [], weekly: {} },
    graveyard: [], codex: { enemies: {}, relics: {}, events: {}, bosses: {}, cards: {} }, members: [], ach: [], quests: { day: '', list: [] },
  });
  function genGuildCode() { const A_ = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from({ length: 8 }, () => A_[Math.floor(Math.random() * A_.length)]).join(''); }
  function migrateGuild(d) {
    const f = A.freshGuild(d.name, d.code);
    for (const k in f) if (d[k] === undefined) d[k] = f[k];
    for (const k in f.fac) if (d.fac[k] === undefined) d.fac[k] = 1;
    for (const k in f.hall) if (d.hall[k] === undefined) d.hall[k] = f.hall[k];
    for (const k in f.codex) if (!d.codex[k]) d.codex[k] = {};
    d.v = G.C.VERSION; return d;
  }
  A.listGuilds = () => ls.keys().filter(k => k.startsWith('guild:')).map(k => ls.get(k)).filter(Boolean).map(migrateGuild).sort((a, b) => b.ts - a.ts);
  A.loadGuild = code => { const d = ls.get('guild:' + code); return d ? migrateGuild(d) : null; };
  A.createGuild = name => { const g = A.freshGuild(name); A.saveGuild(g); return g; };
  A.saveGuild = g => { if (!g) return; ls.set('guild:' + g.code, g); if (A.me) { A.me.lastGuild = g.code; A.saveMe(); } };
  A.deleteGuild = code => ls.del('guild:' + code);
  // 변경 시 버전 올리기 (방장만 호출)
  A.bump = g => { g.ver = (g.ver || 1) + 1; g.ts = Date.now(); A.saveGuild(g); };
  // 두 복제본 중 최신
  A.newer = (a, b) => { if (!a) return b; if (!b) return a; return (b.ver > a.ver || (b.ver === a.ver && b.ts > a.ts)) ? b : a; };
  A.adoptGuild = g => { g = migrateGuild(g); const mine = A.loadGuild(g.code); const best = A.newer(mine, g); A.guild = best; A.saveGuild(best); return best; };

  // ───── 런 이어하기 (방장 기기)
  A.saveRun = (code, run) => ls.set('run:' + code, run);
  A.loadRun = code => ls.get('run:' + code);
  A.clearRun = code => ls.del('run:' + code);

  // ───── 백업 코드 (계정 + 소속 길드들을 비밀코드로 XOR → base64)
  function xor(s, key) { let o = ''; for (let i = 0; i < s.length; i++) o += String.fromCharCode(s.charCodeAt(i) ^ key.charCodeAt(i % key.length)); return o; }
  const b64e = s => btoa(unescape(encodeURIComponent(s)));
  const b64d = s => decodeURIComponent(escape(atob(s)));
  A.exportBackup = function () {
    if (!A.me) return '';
    const guilds = A.listGuilds();
    const payload = JSON.stringify({ app: 'abyss', acct: A.me, guilds });
    return 'ABYSS1.' + b64e(xor(payload, A.code || '000000'));
  };
  A.importBackup = function (text, name, code) {
    text = (text || '').trim();
    if (!text.startsWith('ABYSS1.')) throw new Error('형식이 다릅니다');
    const o = JSON.parse(xor(b64d(text.slice(7)), code));
    if (!o || o.app !== 'abyss' || !o.acct) throw new Error('비밀코드가 다르거나 손상된 코드');
    if (o.acct.name !== name) throw new Error('닉네임이 백업과 다릅니다 (' + o.acct.name + ')');
    const d = migrateAcct(o.acct); d.hash = hash(code);
    ls.set('acct:' + d.name, d); ls.set('acct:' + d.name + ':seen', 1);
    for (const g of (o.guilds || [])) { const mine = A.loadGuild(g.code); A.saveGuild(A.newer(mine, migrateGuild(g))); }
    return d;
  };
  A.downloadBackup = function () {
    const txt = A.exportBackup(); if (!txt) return;
    const blob = new Blob([txt], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `심연원정대_${A.me.name}_${G.U.today().replace(/\./g, '')}.txt`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  // ───── 기기 설정
  A.loadSettings = function () {
    const s = ls.get('settings') || {};
    G.settings = Object.assign({ master: 0.8, sfx: 0.8, music: 0.45, shake: 1, dmgNum: true, aimAssist: true, lastName: '', lastCode: '' }, s);
    G.A.vol.master = G.settings.master; G.A.vol.sfx = G.settings.sfx; G.A.vol.music = G.settings.music;
  };
  A.saveSettings = function () {
    ls.set('settings', G.settings);
    G.A.vol.master = G.settings.master; G.A.vol.sfx = G.settings.sfx; G.A.vol.music = G.settings.music; G.A.applyVol();
  };
  return A;
})();
