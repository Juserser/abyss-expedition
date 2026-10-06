// 앱: 타이틀/로비, 네트워크 동기화(방장 권위), 루프, 장면(길드 홀/런), FX, 입력
G.App = (function () {
  const App = {};
  const C = G.C, U = G.U, R = G.R, S = G.Sim, W = G.World, UI = G.UI, H = G.Hall, OV = G.OV, Net = G.Net, A = G.Acct, HUD = G.HUD;
  const $ = id => document.getElementById(id);
  App.mode = 'front'; App.mySlot = 0; App.scene = null; App.guild = null; App.view = null; App.roster = []; App.savedRun = null;
  let outbox = [], tick = 0, acc = 0, lastT = 0;
  let guestMap = null, guestMapKey = '', prevView = null, curView = null, snapAt = 0, snapGap = 1000 / C.SNAP_HZ;
  let pred = null, lastSentPk = '', lastSentAt = 0;
  const guestInputs = {};  // slot → packet (방장)
  const bots = {};
  App.debug = /debug=1/.test(location.search);
  const botCount = +(location.search.match(/bots=(\d)/) || [0, 0])[1];

  // ───── FX (방장: 로컬 재생 + 참가자에게 전송 / 참가자: 수신 재생)
  const FX = {
    snd: n => G.A.play(n),
    music: n => (n === 'none' ? G.A.stopMusic() : G.A.music(n)),
    burst: (x, y, n, color, speed, life) => R.burst(x, y, n, { color, speed: speed || 40, life: life || 0.5, grav: 40, drag: 2, size: 2 }),
    dmg: (x, y, v, kind, color) => {
      if (G.settings.dmgNum === false && kind !== 1 && kind !== 2) return;
      const col = kind === 1 ? '#ffd36b' : kind === 2 ? '#ff6b6b' : kind === 3 ? '#7fcf7a' : (color || '#ffffff');
      R.floatText(x + (Math.random() - 0.5) * 8, y, (kind === 3 ? '+' : '') + v, col, kind === 1 ? 10 : 7, { pop: kind === 1, life: kind === 1 ? 0.9 : 0.65 });
    },
    txt: (x, y, s, color, size, o) => R.floatText(x, y, s, color, size, Object.assign({ life: 1.3, vy: -18 }, o || {})),
    shake: v => R.shake(v),
    shakeFor: (slot, v) => { if (slot === App.mySlot) R.shake(v); },
    hitstop: t => { const sim = currentSim(); if (sim) sim.hitstop = Math.max(sim.hitstop || 0, t); },
    tile: (i, j, t) => { const m = currentMap(); if (!m) return; m.tiles[j * m.w + i] = t; m.ver++; R.updateTile(m, i, j); },
    ring: (x, y, r0, r1, color, life) => R.part({ shape: 'ring', x, y, r0, r1, color, life: life || 0.4, size: 2 }),
    flash: (c, a) => HUD.flash(c, a),
    banner: (a, b) => HUD.banner(a, b),
    wave: (n, total) => { if (total > 1 && n > 1) HUD.banner(`웨이브 ${n}/${total}`, ''); },
    boom: (x, y, rad, big) => {
      R.part({ shape: 'ring', x, y: y - 4, r0: 3, r1: rad, color: '#ffe0a0', life: 0.3, size: 3 });
      R.burst(x, y - 4, big ? 30 : 16, { color: ['#ff7a2e', '#ffd36b', '#ffffff', '#ff5c5c'], speed: rad * 3, life: 0.45, drag: 4, size: 3 });
      R.burst(x, y - 4, big ? 12 : 6, { color: ['#3a3040', '#1a1420'], speed: rad * 1.2, life: 0.9, drag: 2, size: 4, up: 20 });
      R.shake(big ? 6 : 2);
    },
    die: (x, y, big) => { R.burst(x, y - 6, big ? 40 : 12, { color: ['#4a4040', '#8a7a6a', '#2a2020', '#c0b0a0'], speed: big ? 70 : 35, life: 0.8, drag: 2, size: 2, up: 25 }); if (big) R.shake(8); },
    react: (x, y, name, color) => { R.floatText(x, y - 6, name, color || '#fff', 11, { pop: true, life: 1.0, vy: -14 }); R.part({ shape: 'ring', x, y, r0: 4, r1: 30, color: color || '#fff', life: 0.35, size: 2 }); },
    arc: (x, y, r, ang, width, color) => { for (let i = 0; i < 12; i++) { const a = ang - width / 2 + (width * i) / 11; R.part({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.8, vx: Math.cos(a) * 16, vy: Math.sin(a) * 16, life: 0.2, color, size: 2 }); } },
    after: (ch, x, y, f) => { const s = G.SPR.ch[ch]; if (s) R.part({ shape: 'img', img: f > 0 ? s.r[0] : s.l[0], x, y: y + 2, life: 0.22, alpha: 0.45 }); },
    bolt: (x0, y0, x1, y1) => { const n = Math.max(3, Math.floor(Math.hypot(x1 - x0, y1 - y0) / 6)); for (let i = 0; i <= n; i++) { const k = i / n; R.part({ x: x0 + (x1 - x0) * k + (Math.random() - 0.5) * 6, y: y0 + (y1 - y0) * k + (Math.random() - 0.5) * 6, life: 0.18, color: i % 2 ? '#fff6a0' : '#ffffff', size: 2 }); } },
    spawnRing: (x, y) => R.part({ shape: 'ring', x, y, r0: 2, r1: 14, color: '#8a4a9a', life: 0.8, size: 1 }),
    revive: (x, y) => { R.burst(x, y - 8, 16, { color: ['#7fcf7a', '#ffffff'], speed: 40, life: 0.7, up: 30, size: 2 }); R.part({ shape: 'ring', x, y, r0: 4, r1: 26, color: '#7fcf7a', life: 0.5, size: 2 }); },
    healFx: (x, y) => R.burst(x, y - 8, 4, { color: ['#7fcf7a', '#c0ffc0'], speed: 15, life: 0.5, up: 25, size: 1 }),
    rain: (x, y, r, life) => { R.part({ shape: 'ring', x, y, r0: r, r1: r, color: '#d9d2c5', life, size: 1 }); for (let i = 0; i < 30; i++) R.part({ x: x + (Math.random() - 0.5) * r * 2, y: y - 80 - Math.random() * 60, vy: 260, life: life * Math.random(), color: '#d8d0c0', size: 1, shrink: false }); },
    ult: (x, y, name, slot) => { R.floatText(x, y - 24, name, C.PLAYER_COLORS[slot], 10, { pop: true, life: 1.2, vy: -10 }); R.part({ shape: 'ring', x, y, r0: 4, r1: 40, color: C.PLAYER_COLORS[slot], life: 0.5, size: 2 }); R.shake(3); },
    ping: (slot, x, y, idx) => HUD.addPing(slot, x, y, idx),
    toast: s => UI.toast(s),
  };
  G.FX = FX;
  G.fx = function (name, ...args) { const f = FX[name]; if (f) f(...args); if (App.mode === 'host' && Net.open()) outbox.push([name, ...args]); };
  function currentSim() { const sc = App.scene; if (!sc) return null; return sc.type === 'hall' ? sc.hall.sim : sc.run.sim; }
  function currentMap() { if (App.mode === 'guest') return guestMap; const sim = currentSim(); return sim ? sim.map : null; }

  // ───── 초기화 / 프론트
  App.init = function () {
    A.loadSettings(); R.init(); G.SPR.init(); UI.bindSettings(); G.In.attach(R.screen);
    $('acct-name').value = G.settings.lastName || ''; $('acct-code').value = G.settings.lastCode || '';
    const accts = A.listAccounts(); if (accts.length) $('acct-list').textContent = '이 기기의 계정: ' + accts.join(', ');
    $('btn-login').onclick = login; $('acct-code').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
    $('btn-backup').onclick = () => { if (!A.me) { const r = login(); if (!r) return; } const txt = A.exportBackup(); UI.notice(`<p>백업 코드 (복사해서 보관. 다른 기기에서 같은 닉네임·비밀코드로 복원)</p><textarea style="width:100%;height:80px;font-size:10px">${txt}</textarea>`, [{ t: '파일로 저장', cls: 'blue', fn: () => A.downloadBackup() }, { t: '닫기', cls: 'ghost' }]); };
    $('btn-restore').onclick = () => { UI.notice('<p>백업 코드를 붙여넣으세요 (닉네임·비밀코드 입력란도 채워야 합니다)</p><textarea id="restore-in" style="width:100%;height:80px;font-size:10px"></textarea>', [{ t: '복원', fn: () => { try { const d = A.importBackup($('restore-in').value, $('acct-name').value.trim(), $('acct-code').value.trim()); $('acct-status').textContent = `${d.name} 복원 완료. 입장하세요.`; } catch (e) { $('acct-status').textContent = '복원 실패: ' + e.message; } } }, { t: '취소', cls: 'ghost' }]); };
    $('btn-help').onclick = () => pane('help'); $('btn-help-back').onclick = () => pane(A.me ? 'main' : 'acct');
    $('btn-logout').onclick = () => { A.logout(); pane('acct'); };
    $('btn-host').onclick = hostRoom; $('btn-join').onclick = () => { pane('join'); $('join-code').value = G.settings.lastCode2 || ''; $('join-code').focus(); };
    $('btn-join-back').onclick = () => pane('main'); $('btn-join-go').onclick = joinRoom; $('join-code').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });
    $('btn-copy').onclick = () => { const url = location.href.split('?')[0] + '?join=' + Net.code; (navigator.clipboard ? navigator.clipboard.writeText(`심연 원정대 방 코드: ${Net.code}\n${url}`) : Promise.reject()).then(() => UI.toast('초대 링크 복사')).catch(() => UI.toast('코드: ' + Net.code)); };
    $('btn-ready').onclick = () => { const me = App.roster.find(r => r.slot === App.mySlot); if (!me) return; if (App.mode === 'host') { if (App.roster.every(r => r.slot === 0 || r.ready)) startGame(); else UI.toast('모두 준비해야 출발'); } else { me.ready = !me.ready; Net.toHost({ t: 'ready', v: me.ready }); renderLobby(); } };
    $('btn-leave').onclick = () => leaveRoom();
    UI.onAct = onAct; UI.onChat = onChat;
    G.In.cb.chat = () => { if (App.mode !== 'front') UI.openChat(); };
    G.In.cb.chatKey = code => UI.chatKey(code);
    G.In.cb.map = () => { HUD.minimap = !HUD.minimap; };
    G.In.cb.esc = () => { if (OV.menu) OV.close(); else if ($('settings').classList.contains('hidden')) $('settings').classList.remove('hidden'); else $('settings').classList.add('hidden'); };
    G.In.cb.wheel = onWheel;
    document.addEventListener('visibilitychange', () => { if (document.hidden && App.mode === 'host') { if (!App.bgTimer) App.bgTimer = setInterval(() => frame(performance.now()), 1000 / 30); } else if (App.bgTimer) { clearInterval(App.bgTimer); App.bgTimer = null; } });
    const m = location.search.match(/join=([A-Z0-9]{4})/i); if (m) G.settings.lastCode2 = m[1].toUpperCase();
    pane('acct');
    requestAnimationFrame(frame);
    // 디버그 자동 진행: ?auto=hall|run[&menu=forge][&bots=2]
    const auto = (location.search.match(/auto=(\w+)/) || [])[1];
    if (auto) {
      $('acct-name').value = '테스터'; $('acct-code').value = '000000'; login();
      if (!A.listGuilds().length) { guildSel = 'new'; }
      hostRoom(); startGame();
      const menu = (location.search.match(/menu=(\w+)/) || [])[1];
      if (menu) setTimeout(() => OV.open(menu), 800);
      if (auto === 'run' || auto === 'boss') {
        setTimeout(() => { H.openSetup(App.scene.hall, App.guild); for (const k in App.scene.hall.setup.ready) App.scene.hall.setup.ready[k] = true; App.startRun(false); if (auto === 'boss') { const run = App.scene.run; run.vote = null; run.ov = null; G.Run.startBoss(run, (location.search.match(/boss=(\w+)/) || [, 'grad'])[1]); run.ovT = 0.01; } const ff = +(location.search.match(/ff=(\d+)/) || [0, 0])[1]; if (ff) { const run = App.scene.run; if (run.vote) G.Run.resolveVote(run, 0); for (let i = 0; i < ff; i++) hostStep(C.TICK); } }, 1200);
        setInterval(() => { const v = App.view; if (!v || !v.ov) return; if (v.ov.type === 'vote' && v.ov.votes[0] === undefined) onAct('vote', '0'); else if (v.ov.type === 'pick' && v.ov.picked[0] === undefined) { const o = v.ov.offers[0]; onAct('pick', o && o[0] ? o[0].id : null); } else if (v.ov.type === 'shop' && !v.ov.done[0]) onAct('shopDone'); if (v.roll && !v.roll.choices[0]) onAct('roll', 'pass'); }, 1500);
      }
    }
  };
  function pane(id) { ['acct', 'main', 'join', 'lobby', 'help'].forEach(p => $('pane-' + p).classList.toggle('hidden', p !== id)); $('front').classList.remove('hidden'); }
  function login() {
    const name = $('acct-name').value.trim(), code = $('acct-code').value.trim();
    const r = A.login(name, code);
    if (r.err) { $('acct-status').textContent = r.err; G.A.play('deny'); return false; }
    G.settings.lastName = name; G.settings.lastCode = code; A.saveSettings();
    $('acct-status').textContent = '';
    $('me-name').textContent = name; $('me-sub').textContent = `원정 ${A.me.stats.runs} · MVP ${A.me.stats.mvp} · 전멸 원인 ${A.me.stats.blame}${A.me.penalty ? ' · 🤡 바보 투구 착용 중' : ''}`;
    renderGuildPick(); pane('main'); G.A.unlock(); G.A.play('pick');
    if (G.settings.lastCode2 && location.search.includes('join=')) { pane('join'); $('join-code').value = G.settings.lastCode2; }
    return true;
  }
  let guildSel = null;
  function renderGuildPick() {
    const list = A.listGuilds(); const box = $('guild-pick'); box.innerHTML = '';
    if (!guildSel && list.length) guildSel = (list.find(g => g.code === A.me.lastGuild) || list[0]).code;
    for (const g of list) { const d = document.createElement('div'); d.className = 'guild-row' + (guildSel === g.code ? ' sel' : ''); d.innerHTML = `<span class="gname">🚩 ${UI.esc(g.name)}</span><span class="gsub">${g.code} · 잿조각 ${g.ash} · 원정 ${g.hall.runs} · ${UI.esc(g.members.join(', ') || '-')}</span>`; d.onclick = () => { guildSel = g.code; renderGuildPick(); }; box.appendChild(d); }
    const d = document.createElement('div'); d.className = 'guild-row' + (guildSel === 'new' ? ' sel' : ''); d.innerHTML = `<span class="gname">＋ 새 길드</span><input id="new-guild" maxlength="12" placeholder="길드 이름" style="padding:4px 8px;font-size:13px">`; d.onclick = e => { if (e.target.tagName !== 'INPUT') { guildSel = 'new'; renderGuildPick(); } }; box.appendChild(d);
    if (!list.length) guildSel = 'new';
    $('btn-host').disabled = false;
  }

  // ───── 방 만들기 / 참가
  function hostRoom() {
    let g;
    if (guildSel === 'new' || !guildSel) { const nm = ($('new-guild') && $('new-guild').value.trim()) || `${A.me.name}의 용병단`; g = A.createGuild(nm); }
    else g = A.loadGuild(guildSel);
    if (!g) { UI.toast('길드를 선택하세요'); return; }
    A.guild = g; App.guild = g; A.me.lastGuild = g.code; A.saveMe();
    App.savedRun = A.loadRun(g.code);
    App.mode = 'host'; App.mySlot = 0;
    App.roster = [{ slot: 0, name: A.me.name, cls: A.me.lastClass || 'knight', ready: true, cid: -1, metaByCls: metaAll(A.me), penalty: A.me.penalty, title: A.me.title }];
    for (let b = 0; b < botCount; b++) App.roster.push({ slot: b + 1, name: '봇' + (b + 1), cls: ['priest', 'archer'][b] || 'mage', ready: true, cid: -2, metaByCls: metaAll(A.freshAcct('봇')), bot: true });
    Net.on('code', code => { $('lobby-code').textContent = code; });
    Net.on('status', s => { $('lobby-status').textContent = s; });
    Net.on('connect', id => { /* hello 대기 */ });
    Net.on('data', onHostData); Net.on('close', onGuestClosed);
    Net.host(); pane('lobby'); renderLobby();
  }
  function joinRoom() {
    const code = $('join-code').value.trim().toUpperCase(); if (code.length !== 4) return;
    G.settings.lastCode2 = code; A.saveSettings();
    App.mode = 'guest';
    Net.on('status', s => { $('join-status').textContent = s; $('lobby-status').textContent = s; });
    Net.on('connect', () => { Net.toHost({ t: 'hello', name: A.me.name, metaByCls: metaAll(A.me), penalty: A.me.penalty, title: A.me.title, guilds: A.listGuilds().map(g => ({ code: g.code, ver: g.ver, ts: g.ts })) }); });
    Net.on('fail', () => { App.mode = 'front'; });
    Net.on('data', (id, m) => onGuestData(m)); Net.on('close', () => onHostClosed());
    Net.join(code);
  }
  function metaAll(acct) { const o = {}; for (const c of G.CLASS_ORDER) o[c] = H.metaOf(acct, c); return o; }
  function leaveRoom() { Net.close(); App.mode = 'front'; App.scene = null; App.roster = []; UI.hide(); UI.showChat(false); OV.menu = null; G.A.stopMusic(); G.In.enabled = false; pane('main'); renderGuildPick(); }

  // ───── 로비
  function renderLobby() {
    const box = $('lobby-roster'); box.innerHTML = '';
    for (let s = 0; s < 3; s++) { const r = App.roster.find(x => x.slot === s); const d = document.createElement('div'); d.className = 'slot' + (r ? '' : ' empty'); d.innerHTML = r ? `<b class="pc${s}">${UI.esc(r.name)}${r.penalty ? ' 🤡' : ''}</b>${G.CLASSES[r.cls].icon} ${G.CLASSES[r.cls].name} <small>Lv${r.lv || ((r.metaByCls || {})[r.cls] || {}).lv || 1}</small><div class="ready">${s === 0 ? '방장' : r.ready ? '준비 완료' : '대기'}${r.disconnected ? ' (끊김)' : ''}</div>` : '빈 자리'; box.appendChild(d); }
    const me = App.roster.find(r => r.slot === App.mySlot); const g = App.guild;
    const cp = $('class-pick'); cp.innerHTML = '';
    for (const c of G.CLASS_ORDER) { const d = G.CLASSES[c]; const locked = g && !g.unlocked.includes(c); const b = document.createElement('button'); b.className = 'btn' + (me && me.cls === c ? ' sel' : '') + (locked ? ' locked' : ''); b.innerHTML = `${d.icon} ${d.name}`; b.title = locked ? '잠김: ' + d.unlock.text : d.desc; b.disabled = !!locked; b.onclick = () => { pickClass(c); }; cp.appendChild(b); }
    if (me) { const d = G.CLASSES[me.cls]; $('class-desc').innerHTML = `<b>${d.icon} ${d.name}</b> · ${d.role} — ${UI.esc(d.desc)}<br>Q ${UI.esc(d.q.name)}: ${UI.esc(d.q.desc)}<br>E ${UI.esc(d.e.name)}: ${UI.esc(d.e.desc)}<br>R ${UI.esc(d.r.name)}: ${UI.esc(d.r.desc)}<br>패시브 ${UI.esc(d.passive.name)}: ${UI.esc(d.passive.desc)}`; }
    const roles = App.roster.map(r => G.CLASSES[r.cls].roleKey);
    const warn = []; if (!roles.includes('tank')) warn.push('탱커 없음 — 누가 맞을 건데?'); if (!roles.includes('heal') && !roles.includes('support')) warn.push('힐러 없음 — 물약 많이 사라'); if (App.roster.length === 1) warn.push('혼자는 권장하지 않음 (적 수치 크게 감소)');
    $('role-warn').textContent = warn.join(' · ');
    $('btn-ready').textContent = App.mode === 'host' ? '🏰 출발 (길드 홀로)' : (me && me.ready ? '준비 취소' : '준비');
    $('lobby-status').textContent = App.mode === 'host' ? `길드: ${g.name} · 동료 ${App.roster.length}/3` : $('lobby-status').textContent;
  }
  function pickClass(c) { const me = App.roster.find(r => r.slot === App.mySlot); if (!me) return; me.cls = c; A.me.lastClass = c; A.saveMe(); if (App.mode === 'host') broadcastLobby(); else Net.toHost({ t: 'cls', c }); renderLobby(); G.A.play('nav'); }
  function broadcastLobby() { Net.broadcast({ t: 'lobby', roster: App.roster.map(r => ({ slot: r.slot, name: r.name, cls: r.cls, ready: r.ready, penalty: r.penalty, lv: (r.metaByCls[r.cls] || {}).lv || 1, disconnected: r.disconnected })) }); renderLobby(); }

  // ───── 방장: 수신
  function onHostData(id, m) {
    const r = App.roster.find(x => x.cid === id);
    if (m.t === 'hello') {
      // 재접속?
      const old = App.roster.find(x => x.name === m.name && x.cid !== id);
      if (old) { if (!old.disconnected && old.cid >= 0) { Net.send(id, { t: 'kick', s: '같은 닉네임이 이미 접속 중' }); return; } old.cid = id; old.disconnected = false; old.metaByCls = m.metaByCls; sendWelcome(old); if (App.scene) { if (App.scene.type === 'run') G.Run.reconnect(App.scene.run, old.slot); else if (App.scene.type === 'hall' && !App.scene.hall.sim.players[old.slot]) H.addPlayer(App.scene.hall, App.players[old.slot]); Net.send(id, { t: 'start' }); chatSys(`${old.name} 재접속`); } else broadcastLobby(); return; }
      if (App.roster.length >= 3) { Net.send(id, { t: 'full' }); return; }
      const slot = [0, 1, 2].find(s => !App.roster.some(x => x.slot === s));
      const entry = { slot, name: m.name, cls: 'archer', ready: false, cid: id, metaByCls: m.metaByCls, penalty: m.penalty, title: m.title };
      App.roster.push(entry); sendWelcome(entry);
      // 길드 버전 비교
      const theirs = (m.guilds || []).find(g => g.code === App.guild.code);
      if (theirs && (theirs.ver > App.guild.ver || (theirs.ver === App.guild.ver && theirs.ts > App.guild.ts))) Net.send(id, { t: 'needGuild' });
      if (App.scene) { // 런 중 합류
        const p = makePlayer(entry, entry.cls); App.players[slot] = p;
        if (App.scene.type === 'run') { G.Run.addPlayer(App.scene.run, p); chatSys(`${m.name} 합류 — 다음 노드부터`); }
        else { H.addPlayer(App.scene.hall, p); chatSys(`${m.name} 길드 홀 입장`); }
        Net.send(id, { t: 'start', slot });
      } else { broadcastLobby(); chatSys(`${m.name} 입장`); }
      return;
    }
    if (!r) return;
    if (m.t === 'i') { guestInputs[r.slot] = m.p; return; }
    if (m.t === 'cls') { r.cls = m.c; if (App.scene && App.scene.type === 'hall') { const p = App.players[r.slot]; if (p) { p.cls = m.c; S.recalc(p); } } broadcastLobby(); return; }
    if (m.t === 'ready') { r.ready = !!m.v; broadcastLobby(); return; }
    if (m.t === 'rpc') { onRpc(r.slot, m.n, m.a || []); return; }
    if (m.t === 'hallRpc') { onHallRpc(r.slot, m.n, m.a || []); return; }
    if (m.t === 'meta') { r.metaByCls[m.c] = m.meta; const p = App.players[r.slot]; if (p && p.cls === m.c && App.scene && App.scene.type === 'hall') { p.meta = m.meta; S.recalc(p); } return; }
    if (m.t === 'chat') { chat(r.slot, r.name, m.s); return; }
    if (m.t === 'guildFull') { const g = A.adoptGuild(m.g); if (g.code === App.guild.code) { App.guild = g; A.guild = g; Net.broadcast({ t: 'guild', g }); UI.toast('길드 데이터 최신화'); } return; }
    if (m.t === 'ping2') { Net.send(id, { t: 'pong2', ts: m.ts }); return; }
  }
  function sendWelcome(entry) { Net.send(entry.cid, { t: 'welcome', slot: entry.slot, guild: App.guild, roster: App.roster.map(r => ({ slot: r.slot, name: r.name, cls: r.cls, ready: r.ready, penalty: r.penalty, lv: 1 })) }); broadcastLobby(); }
  function onGuestClosed(id) {
    const r = App.roster.find(x => x.cid === id); if (!r) return;
    if (App.scene) { r.disconnected = true; chatSys(`${r.name} 연결 끊김 (같은 코드로 재접속 가능)`); if (App.scene.type === 'run') G.Run.removePlayer(App.scene.run, r.slot); else if (App.scene.type === 'hall') { const p = App.players[r.slot]; if (p) S.removePlayer(App.scene.hall.sim, p); } }
    else { App.roster = App.roster.filter(x => x !== r); chatSys(`${r.name} 퇴장`); broadcastLobby(); }
  }
  function onRpc(slot, n, a) {
    const sc = App.scene; if (!sc) return;
    if (n === 'ping') { G.fx('ping', slot, a[1], a[2], a[0]); return; }
    if (n === 'emote') { const p = App.players[slot]; if (p) { p.emote = a[0]; p.emoteT = 2.5; } return; }
    if (sc.type === 'run') { G.Run.rpc(sc.run, slot, n, a); return; }
    if (sc.type === 'hall') {
      const hall = sc.hall;
      if (n === 'ready') { if (hall.setup) { H.setupReady(hall, slot, !hall.setup.ready[slot]); } return; }
      if (n === 'cls') { const r = App.roster.find(x => x.slot === slot); if (r && App.guild.unlocked.includes(a[0])) { r.cls = a[0]; const p = App.players[slot]; if (p) { p.cls = a[0]; p.meta = r.metaByCls[a[0]] || p.meta; S.recalc(p); } if (hall.setup) for (const k in hall.setup.ready) hall.setup.ready[k] = false; } return; }
      if (n === 'setup' && slot === 0) { H.setupChange(hall, a[0], a[1]); return; }
    }
  }
  function onHallRpc(slot, n, a) {
    const sc = App.scene; if (!sc || sc.type !== 'hall') return;
    const p = App.players[slot]; const r = App.roster.find(x => x.slot === slot);
    if (n === 'resetTalents') { if (App.guild.fac.training >= 2) { sendTo(slot, { t: 'toast', s: '특성 재설정 (무료)' }); sendTo(slot, { t: 'resetOk' }); } else if (App.guild.ash >= 20) { App.guild.ash -= 20; A.bump(App.guild); Net.broadcast({ t: 'guild', g: App.guild }); sendTo(slot, { t: 'resetOk' }); } else sendTo(slot, { t: 'toast', s: '잿조각 부족 (20)' }); return; }
    const res = H.action(App.guild, slot, p || { name: r ? r.name : '?', cls: r ? r.cls : 'knight' }, n, a);
    if (res.msg) { if (res.toastAll) { for (const x of App.roster) sendTo(x.slot, { t: 'toast', s: res.msg }); } else sendTo(slot, { t: 'toast', s: res.msg }); }
    if (res.ok) { Net.broadcast({ t: 'guild', g: App.guild }); if (slot === 0) { App.guild = A.guild; } }
    if (res.give) sendTo(slot, { t: 'giveItem', it: res.give, cls: p ? p.cls : (r ? r.cls : 'knight') });
    G.A.play(res.ok ? 'forge' : 'deny');
  }
  function sendTo(slot, m) {
    if (slot === App.mySlot && App.mode === 'host') { onGuestData(m); return; }
    const r = App.roster.find(x => x.slot === slot); if (r && r.cid >= 0) Net.send(r.cid, m);
  }

  // ───── 참가자: 수신
  function onGuestData(m) {
    if (m.t === 'welcome') { App.mySlot = m.slot; App.guild = A.adoptGuild(m.guild); if (App.guild.ver > m.guild.ver) Net.toHost({ t: 'guildFull', g: App.guild }); App.roster = m.roster; pane('lobby'); $('lobby-code').textContent = Net.code; const me = App.roster.find(r => r.slot === App.mySlot); if (me) { me.cls = A.me.lastClass && App.guild.unlocked.includes(A.me.lastClass) ? A.me.lastClass : 'archer'; Net.toHost({ t: 'cls', c: me.cls }); } renderLobby(); return; }
    if (m.t === 'needGuild') { Net.toHost({ t: 'guildFull', g: A.loadGuild(App.guild.code) }); return; }
    if (m.t === 'lobby') { App.roster = m.roster; renderLobby(); return; }
    if (m.t === 'full') { $('join-status').textContent = '방이 가득 찼습니다'; Net.close(); App.mode = 'front'; return; }
    if (m.t === 'kick') { $('join-status').textContent = m.s || '입장 거부'; Net.close(); App.mode = 'front'; return; }
    if (m.t === 'start') { if (m.slot != null) App.mySlot = m.slot; enterGame(); return; }
    if (m.t === 's') { prevView = curView; curView = m.v; snapAt = performance.now(); App.snapSeq = (App.snapSeq || 0) + 1; App.view = curView; for (const e of m.e) { const f = FX[e[0]]; if (f) f(...e.slice(1)); } if (m.pg != null) App.ping = m.pg; return; }
    if (m.t === 'guild') { App.guild = A.adoptGuild(m.g); return; }
    if (m.t === 'acct') { H.applyDelta(A.me, m.d); UI.toast(`정산: ${G.CLASSES[m.d.cls].name} 경험치 +${m.d.xp}`); sendMeta(m.d.cls); return; }
    if (m.t === 'toast') { UI.toast(m.s); return; }
    if (m.t === 'chat') { UI.chatAdd(m.sys ? m.s : `<b class="pc${m.slot}">${UI.esc(m.name)}</b>: ${UI.esc(m.s)}`, m.sys); return; }
    if (m.t === 'menu') { OV.open(m.id); return; }
    if (m.t === 'giveItem') { const ch = A.charOf(A.me, m.cls); const old = ch.equip[m.it.slot]; ch.equip[m.it.slot] = m.it; A.saveMe(); sendMeta(m.cls); if (old) App.hallRpc('put', [old]); return; }
    if (m.t === 'resetOk') { const cls = currentCls(); A.charOf(A.me, cls).talents = []; A.saveMe(); sendMeta(cls); return; }
    if (m.t === 'pong2') { App.ping = Math.round(performance.now() - m.ts); return; }
  }
  function onHostClosed() { if (App.mode !== 'guest') return; UI.notice('방장과 연결이 끊겼습니다. 방장이 다시 방을 열면 같은 코드로 재접속해 이어할 수 있습니다.', [{ t: '확인', fn: () => leaveRoom() }]); }
  function currentCls() { const v = App.view; const p = v && v.pl ? v.pl[App.mySlot] : null; return p ? p.c : (App.roster.find(r => r.slot === App.mySlot) || {}).cls || A.me.lastClass || 'knight'; }
  function sendMeta(cls) { const meta = H.metaOf(A.me, cls); if (App.mode === 'host') { const r = App.roster[0]; r.metaByCls[cls] = meta; const p = App.players[0]; if (p && p.cls === cls && App.scene && App.scene.type === 'hall') { p.meta = meta; S.recalc(p); } } else Net.toHost({ t: 'meta', c: cls, meta }); }

  // ───── 게임 시작 / 장면
  function makePlayer(r, cls) {
    const gb = G.META.guildBuffs(App.guild);
    const p = S.makePlayer({ slot: r.slot, cls, name: r.name, meta: r.metaByCls[cls] || { lv: 1, talents: [], mods: {} }, guild: gb, hat: !!r.penalty, gold: gb.startGold || 0, potions: 1 + (gb.startPotion || 0), morale: gb.startMorale || 0 });
    return p;
  }
  function startGame() {
    Net.locked = false;
    App.players = [null, null, null];
    for (const r of App.roster) App.players[r.slot] = makePlayer(r, r.cls);
    Net.broadcast({ t: 'start' });
    enterGame();
    App.scene = { type: 'hall', hall: H.create({ guild: App.guild, players: App.players }) };
    G.A.music('hall');
    chatSys(`길드 「${App.guild.name}」 홀에 들어왔다. 술집에서 원정을 준비하라. (F 상호작용 · Enter 채팅 · Tab 핑 · G 이모트 · M 지도)`);
  }
  function enterGame() { $('front').classList.add('hidden'); G.In.enabled = true; UI.showChat(true); R.clearFx(); lastT = performance.now(); }
  App.toHall = function () {
    if (App.mode !== 'host') return;
    App.players = [null, null, null];
    for (const r of App.roster) if (!r.disconnected) App.players[r.slot] = makePlayer(r, r.cls);
    App.scene = { type: 'hall', hall: H.create({ guild: App.guild, players: App.players }) };
    G.A.music('hall'); UI.hide(); App.lastWordsSent = false;
  };
  App.startRun = function (resume) {
    const hall = App.scene.hall; const s = hall.setup;
    const party = [];
    for (const r of App.roster) { if (r.disconnected) continue; const p = makePlayer(r, r.cls); App.players[r.slot] = p; party.push(p); }
    let run;
    if (resume && App.savedRun) { run = G.Run.restore(App.savedRun, App.players); App.savedRun = null; }
    else {
      const wk = s.mode === 'weekly' ? G.META.weekly() : null;
      run = G.Run.create({ seed: U.seed(), depth: s.depth, curses: s.curses.slice(), mode: s.mode, regionLimit: s.regionLimit, party, guildBuffs: G.META.guildBuffs(App.guild), weekly: wk, codexSeen: App.guild.codex.events });
    }
    run.codexEvents = []; run.lastBlame = App.guild.lastBlame || '';
    App.scene = { type: 'run', run }; UI.hide(); OV.menu = null;
    chatSys(`원정 시작 — 심연 ${run.depth}${run.curses.length ? ' · 저주 ' + run.curses.length : ''}${run.mode !== 'normal' ? ' · ' + run.mode : ''}`);
  };
  function onRunEvent(run, ev) {
    if (ev.t === 'save') { A.saveRun(App.guild.code, G.Run.snapshot(run)); run.visited = (run.visited || []).concat([run.curNode]).filter(x => x >= 0); }
    else if (ev.t === 'chat') chatSys(ev.s);
    else if (ev.t === 'toast') sendTo(ev.slot, { t: 'toast', s: ev.s });
    else if (ev.t === 'codex') run.codexEvents.push(ev);
    else if (ev.t === 'station') {}
    else if (ev.t === 'relicPickup') {}
    else if (ev.t === 'bossKill') chatSys(`👑 ${G.Bosses.DATA[ev.id].name} 처치!`);
    else if (ev.t === 'finished') {
      const { deltas, newAch } = H.settle(App.guild, run, ev.res, run.party, run.codexEvents);
      run.ov.newAch = newAch; run.ov.returned = run.returned;
      for (const slot in deltas) { if (+slot === 0) { H.applyDelta(A.me, deltas[slot]); sendMeta(deltas[slot].cls); const r = App.roster[0]; r.penalty = A.me.penalty; } else { sendTo(+slot, { t: 'acct', d: deltas[slot] }); const r = App.roster.find(x => x.slot === +slot); if (r) r.penalty = !!deltas[slot].blame; } }
      Net.broadcast({ t: 'guild', g: App.guild }); A.clearRun(App.guild.code); App.savedRun = null;
      G.A.play(ev.res.wiped ? 'wipe' : 'win'); if (!ev.res.wiped) G.A.music('hall'); else G.A.stopMusic();
      for (const a of newAch) chatSys(`🏆 업적: ${a.name} — 칭호 「${a.title}」`);
    }
  }
  function chatSys(s) { UI.chatAdd(s, true); Net.broadcast({ t: 'chat', s, sys: true }); }
  function chat(slot, name, s) { UI.chatAdd(`<b class="pc${slot}">${UI.esc(name)}</b>: ${UI.esc(s)}`); Net.broadcast({ t: 'chat', slot, name, s }); }
  function onChat(text) { if (App.mode === 'host') chat(0, A.me.name, text); else if (App.mode === 'guest') Net.toHost({ t: 'chat', s: text }); }
  function onWheel(kind, sel) {
    if (App.mode === 'front') return;
    const idx = sel === 0 ? 0 : sel - 1;
    if (kind === 'ping') { const [wx, wy] = R.toWorld(G.In.mouse.x, G.In.mouse.y); App.rpc('ping', idx, Math.round(wx), Math.round(wy)); }
    else App.rpc('emote', HUD.EMOTE[idx] || '👍');
  }
  App.rpc = function (n, ...a) { if (App.mode === 'host') onRpc(0, n, a); else Net.toHost({ t: 'rpc', n, a }); };
  App.hallRpc = function (n, a) { if (App.mode === 'host') onHallRpc(0, n, a); else Net.toHost({ t: 'hallRpc', n, a }); };

  // ───── DOM 액션
  function onAct(act, arg, el) {
    const sc = App.scene; const host = App.mode === 'host';
    if (act === 'vote') App.rpc('vote', +arg);
    else if (act === 'pick') App.rpc('pick', arg);
    else if (act === 'buy') App.rpc('buy', +arg);
    else if (act === 'shopDone') App.rpc('shopDone');
    else if (act === 'roll') App.rpc('roll', arg);
    else if (act === 'lastWords') { const v = ($('lw-in') || {}).value || ''; if (v.trim()) { App.rpc('lastWords', v.trim().slice(0, 30)); App.lastWordsSent = true; UI.toast('비석에 새겨질 것이다'); } }
    else if (act === 'toHall') { if (host && sc && sc.type === 'run' && sc.run.finished) App.toHall(); }
    else if (act === 'setupDepth') { if (host) H.setupChange(sc.hall, 'depth', +arg); }
    else if (act === 'setupCurse') { if (host) H.setupChange(sc.hall, 'curse', arg); }
    else if (act === 'setupMode') { if (host) H.setupChange(sc.hall, 'mode', arg); }
    else if (act === 'setupCancel') { if (host) { H.setupChange(sc.hall, 'cancel'); UI.hide(); } }
    else if (act === 'setupReady') App.rpc('ready');
    else if (act === 'setupCls') { const me = App.roster.find(r => r.slot === App.mySlot); if (me) { me.cls = arg; A.me.lastClass = arg; A.saveMe(); } App.rpc('cls', arg); }
    else if (act === 'setupStart') { if (host && H.setupAllReady(sc.hall)) App.startRun(false); }
    else if (act === 'resumeRun') { if (host) App.startRun(true); }
    else if (act === 'discardRun') { if (host) { A.clearRun(App.guild.code); App.savedRun = null; UI.toast('저장된 원정 삭제'); } }
    else if (act === 'openSetup') { if (host && sc && sc.type === 'hall') { OV.menu = null; H.openSetup(sc.hall, App.guild); } }
    else if (act === 'menuClose') OV.close();
    else if (act === 'menuTab') { OV.menu.tab = +arg; }
    else if (act === 'selItem') { OV.menu.sel = OV.menu.sel === arg ? null : arg; }
    else if (act === 'craftSlot') { OV.menu.craftSlot = arg; }
    else if (act === 'craft') App.hallRpc('craft', [+arg, OV.menu.craftSlot || 'w', currentCls()]);
    else if (act === 'facUp' || act === 'upgrade' || act === 'dismantle' || act === 'lock' || act === 'take') App.hallRpc(act, [arg]);
    else if (act === 'unequip') { const cls = currentCls(); const ch = A.charOf(A.me, cls); const it = ch.equip[arg]; if (!it) return; ch.equip[arg] = null; A.saveMe(); sendMeta(cls); App.hallRpc('put', [it]); }
    else if (act === 'talent') { const cls = currentCls(); const [b, i] = arg.split('.').map(Number); if (H.canTalent(A.me, cls, App.guild, b, i)) { A.charOf(A.me, cls).talents.push(arg); A.saveMe(); sendMeta(cls); G.A.play('levelup'); } else G.A.play('deny'); }
    else if (act === 'resetTalents') App.hallRpc('resetTalents', []);
    else if (act === 'title') { A.me.title = arg; A.saveMe(); UI.toast(arg ? '칭호: ' + arg : '칭호 해제'); }
    else if (act === 'bannerSave') App.hallRpc('banner', [($('guild-name') || {}).value || App.guild.name, App.guild.color]);
    else if (act === 'bannerColor') App.hallRpc('banner', [App.guild.name, +arg]);
  }

  // ───── 루프
  function frame(now) {
    requestAnimationFrame(frame);
    if (!lastT) lastT = now;
    let dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    if (App.mode === 'front') return;
    // 조준
    const myEnt = findMyEnt();
    if (myEnt) { const sx = myEnt.x - R.cam.left, sy = myEnt.y - 6 - R.cam.top; G.In.aim = Math.atan2(G.In.mouse.y - sy, G.In.mouse.x - sx); }
    if (App.mode === 'host') {
      acc += dt; let steps = 0;
      while (acc >= C.TICK && steps < 4) { hostStep(C.TICK); acc -= C.TICK; steps++; }
      if (steps === 4) acc = 0;
      App.view = sceneView();
      if (tick % Math.round(60 / C.SNAP_HZ) === 0 && Net.open()) { Net.broadcast({ t: 's', v: App.view, e: outbox, k: tick }); outbox = []; }
      else if (!Net.open()) outbox = [];
    } else {
      guestStep(dt);
    }
    render(dt);
  }
  function hostStep(dt) {
    tick++;
    const inputs = {}; inputs[0] = G.In.packet();
    for (const r of App.roster) { if (r.slot === 0) continue; if (r.bot) inputs[r.slot] = botInput(r.slot, dt); else if (guestInputs[r.slot]) inputs[r.slot] = guestInputs[r.slot]; }
    const sc = App.scene; if (!sc) return;
    if (sc.type === 'hall') {
      const hall = sc.hall; H.update(hall, inputs, dt);
      for (const ev of hall.events.splice(0)) { if (ev.t === 'station') { if (ev.id === 'dummy') continue; if (ev.id === 'greta' || ev.id === 'olang' || ev.id === 'walter' || ev.id === 'hass') { const lines = G.META.NPC_LINES[ev.id]; const o = hall.sim.ents.find(x => x.kind === 'o' && x.sid === ev.id); if (o) { o.say = lines[Math.floor(Math.random() * lines.length)]; o.sayT = 4; } continue; } if (ev.slot === 0) OV.open(ev.id); else sendTo(ev.slot, { t: 'menu', id: ev.id }); } }
      if (hall.setup && H.setupAllReady(hall) && App.roster.filter(r => !r.disconnected).length >= 1 && hall.setup.autoStart) App.startRun(false);
    } else if (sc.type === 'run') {
      const run = sc.run; G.Run.update(run, inputs, dt);
      for (const ev of run.events.splice(0)) onRunEvent(run, ev);
      if (tick % 90 === 0) for (const r of App.roster) if (r.bot) { const s = r.slot; if (run.vote && run.vote.votes[s] === undefined && Math.random() < 0.5) G.Run.rpc(run, s, 'vote', [Math.floor(Math.random() * run.vote.opts.length)]); if (run.pick && run.pick.picked[s] === undefined) { const o = run.pick.offers[s]; G.Run.rpc(run, s, 'pick', [o && o.length ? o[Math.floor(Math.random() * o.length)].id : null]); } if (run.shop && !run.shop.done[s]) G.Run.rpc(run, s, 'shopDone', []); if (run.roll && !run.roll.choices[s]) G.Run.rpc(run, s, 'roll', ['greed']); }
      if (run.musicWanted !== App.musicCur) { App.musicCur = run.musicWanted; G.fx('music', run.musicWanted); }
    }
  }
  function sceneView() {
    const sc = App.scene; if (!sc) return null;
    const v = sc.type === 'hall' ? H.view(sc.hall) : G.Run.view(sc.run);
    v.pings = App.roster.filter(r => r.cid >= 0).map(r => [r.slot, Net.pingOf(r.cid)]);
    return v;
  }
  function findMyEnt() { const v = App.view; if (!v || !v.ents) return null; const e = v.ents.find(x => x.k === 'p' && x.s === App.mySlot); if (e && App.mode === 'guest' && pred && !e.dn && !e.rl) return { x: pred.x, y: pred.y }; return e; }

  // 참가자: 입력 전송 + 예측
  function guestStep(dt) {
    if (!Net.open()) return;
    const pk = G.In.packet(); const js = JSON.stringify(pk); const now = performance.now();
    if (js !== lastSentPk || now - lastSentAt > 1000) { Net.toHost({ t: 'i', p: pk }); lastSentPk = js; lastSentAt = now; }
    const v = curView; if (!v) return;
    // 맵 재생성
    const key = v.mode === 'hall' ? 'hall' : v.mapSeed ? `${v.mapSeed}|${v.region}|${v.mapKind}|${v.bossId}` : '';
    if (key !== guestMapKey) { guestMapKey = key; guestMap = !key ? null : v.mode === 'hall' ? W.genHall() : W.genArena(v.mapSeed, v.region, v.mapKind === 'boss' ? { boss: true, noPillars: v.bossId === 'eye' } : v.mapKind === 'treasure' ? { rooms: 1, hazards: false } : {}); pred = null; R.invalidateMap(); }
    // 예측
    const me = v.ents.find(x => x.k === 'p' && x.s === App.mySlot); const hud = v.pl && v.pl[App.mySlot];
    if (me && hud && guestMap && !me.dn && !me.rl) {
      if (!pred) pred = { x: me.x, y: me.y };
      const spd = (hud.spd || 5) * C.TILE * (me.gh ? 1.2 : 1) * (hud.status & 4 || hud.status & 32 ? 0 : 1);
      const e2 = { x: pred.x, y: pred.y, r: 5 }; W.move(guestMap, e2, pk.x * spd * dt, pk.y * spd * dt, !!me.gh); pred.x = e2.x; pred.y = e2.y;
      if (App.predSeq !== App.snapSeq) { App.predSeq = App.snapSeq; const d = Math.hypot(pred.x - me.x, pred.y - me.y); if (d > 28) { pred.x = me.x; pred.y = me.y; } else { pred.x += (me.x - pred.x) * 0.25; pred.y += (me.y - pred.y) * 0.25; } }
    } else pred = null;
    if (now - App.lastPing2 > 2000 || !App.lastPing2) { App.lastPing2 = now; Net.toHost({ t: 'ping2', ts: now }); }
  }
  // 보간된 뷰 (참가자)
  function interpView() {
    const v = curView; if (!v) return null;
    if (!prevView || !prevView.ents) return v;
    const k = Math.min(1, (performance.now() - snapAt) / snapGap);
    const pm = new Map(); for (const e of prevView.ents) pm.set(e.id, e);
    const ents = v.ents.map(e => { const p = pm.get(e.id); if (!p || e.k === 'z' || e.k === 'o') return e; const o = Object.assign({}, e); o.x = p.x + (e.x - p.x) * k; o.y = p.y + (e.y - p.y) * k; return o; });
    return Object.assign({}, v, { ents });
  }
  function render(dt) {
    let v = App.mode === 'host' ? App.view : interpView();
    if (!v) return;
    if (App.mode === 'guest') { if (pred) { v.ents = v.ents.map(e => (e.k === 'p' && e.s === App.mySlot && !e.dn && !e.rl) ? Object.assign({}, e, { x: pred.x, y: pred.y }) : e); } v.ping = App.ping; }
    else if (v.pings) { const mine = v.pings; v.ping = mine.length ? Math.max(...mine.map(p => p[1])) : null; }
    const map = currentMap();
    const x = R.wctx;
    const worldPhase = v.mode === 'hall' || v.phase === 'combat';
    if (worldPhase && map) {
      const me = findMyEnt();
      const tx = me ? me.x : map.w * 8, ty = me ? me.y : map.h * 8;
      R.setCamera(tx, ty, map, dt, App.camSnapKey !== (v.mapSeed || v.mode)); App.camSnapKey = v.mapSeed || v.mode;
      if (v.mode === 'hall') { const sim = App.mode === 'host' ? currentSim() : null; v.hintObj = ''; const near = v.ents.find(e => e.k === 'o' && e.hl && (e.t === 'station' || e.t === 'npc')); if (near) v.hintObj = `F — ${near.nm}`; }
      v.mapForMini = map;
      R.drawWorld(v, map, dt, App.mySlot);
      R.uiBegin();
      HUD.draw(R.wctx, v, App.mySlot, dt);
      if (v.ov && v.ov.type === 'bossIntro') { x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(0, C.H / 2 - 30, C.W, 60); R.text(x, v.ov.name, C.W / 2, C.H / 2 - 8, '#ffd0d0', 16, 'center', true); R.text(x, v.ov.sub, C.W / 2, C.H / 2 + 10, '#d9d2c5', 8, 'center', true); }
    } else {
      x.setTransform(1, 0, 0, 1, 0, 0);
      if (v.map && v.phase !== 'results') HUD.drawNodeMap(x, v, App.mySlot);
      else { x.fillStyle = '#0b0a0f'; x.fillRect(0, 0, C.W, C.H); }
      HUD.draw(x, Object.assign({}, v, { ents: [] }), App.mySlot, dt);
    }
    R.present();
    OV.render(v, App);
    if (v.mode !== 'hall' && OV.menu) OV.menu = null;
    if (App.mode === 'guest' && v.mode === 'hall' && App.lastHallMode !== 'hall') { G.A.music('hall'); }
    if (App.mode === 'guest') { if (v.phase === 'combat' && v.region) { const m = v.boss ? (v.bossId === 'lord' ? 'final' : 'boss') : G.REGIONS[Math.min(3, v.region - 1)].music; if (App.musicCur !== m) { App.musicCur = m; G.A.music(m); } } else if (v.mode === 'hall') { if (App.musicCur !== 'hall') { App.musicCur = 'hall'; G.A.music('hall'); } } else if (v.phase === 'results') { if (App.musicCur !== 'none') { App.musicCur = 'none'; G.A.stopMusic(); } } else if (App.musicCur !== 'map') { App.musicCur = 'map'; G.A.music('map'); } }
    App.lastHallMode = v.mode;
  }

  // ───── 봇 (방장 테스트용: ?bots=2)
  function botInput(slot, dt) {
    const sim = currentSim(); const b = bots[slot] || (bots[slot] = { t: 0, x: 0, y: 0, n: [0, 0, 0, 0, 0, 0, 0, 0, 0], a: 0 });
    const p = sim ? sim.players[slot] : null; if (!sim || !p) return G.In.EMPTY;
    b.t -= dt;
    if (b.t <= 0) {
      b.t = 0.3 + Math.random() * 0.4;
      let tgt = null, bd = 1e9;
      for (const e of sim.ents) if (e.kind === 'e' && !e.dead && e.spawnT <= 0) { const d = U.dist(p.x, p.y, e.x, e.y); if (d < bd) { bd = d; tgt = e; } }
      const down = sim.players.find(q => q && q.down);
      const exit = sim.ents.find(e => e.kind === 'o' && (e.type === 'exit' || e.type === 'chest' && e.st !== 'open'));
      const lead = sim.players[0];
      let goal = down ? down : tgt ? tgt : exit ? exit : lead;
      const ranged = ['archer', 'mage', 'priest', 'necro', 'gunner'].includes(p.cls);
      if (goal) { const d = U.dist(p.x, p.y, goal.x, goal.y); const a = Math.atan2(goal.y - p.y, goal.x - p.x); const want = goal === tgt ? (ranged ? 90 : 14) : 10; if (d > want) { b.x = Math.cos(a); b.y = Math.sin(a); } else if (goal === tgt && ranged && d < 60) { b.x = -Math.cos(a); b.y = -Math.sin(a); } else { b.x = 0; b.y = 0; } b.a = tgt ? Math.atan2(tgt.y - p.y, tgt.x - p.x) : a; }
      if (tgt && Math.random() < 0.4 && p.cd.q <= 0) b.n[1]++; if (tgt && Math.random() < 0.4 && p.cd.e <= 0) b.n[2]++; if (p.morale >= 100 && tgt) b.n[3]++;
      if (tgt && bd < 30 && Math.random() < 0.2) b.n[4]++;
      if (p.hp < p.maxHp * 0.4 && p.potions > 0) b.n[6]++;
      if (p.ghost && Math.random() < 0.3) b.n[5]++;
    }
    const down = sim.players.find(q => q && q.down && U.dist(p.x, p.y, q.x, q.y) < 18);
    const near = sim.ents.some(e => e.kind === 'e' && !e.dead && U.dist(p.x, p.y, e.x, e.y) < (['archer', 'mage', 'priest', 'necro', 'gunner'].includes(p.cls) ? 150 : 24));
    return { x: b.x, y: b.y, a: b.a, b: (near ? 1 : 0) | (down ? 32 : 0), n: b.n.slice() };
  }
  App.botInput = botInput;
  return App;
})();
window.addEventListener('DOMContentLoaded', () => G.App.init());
