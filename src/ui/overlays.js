// DOM 오버레이: 런 페이즈(투표/카드/상점/롤/결과) + 길드 홀 메뉴 (뷰 상태에서 렌더, 액션은 App 으로)
G.OV = (function () {
  const O = {};
  const UI = G.UI, esc = UI.esc, C = G.C, U = G.U, M = G.META;
  O.menu = null;      // 로컬 열린 홀 메뉴 { id, tab, sel }
  O.resultsShown = 0;
  let lastKey = '';

  const names = (view, s) => (view.pl && view.pl[s] ? view.pl[s].n : '?');
  const timerHtml = t => t != null ? `<span class="timer">${t}s</span>` : '';

  O.render = function (view, app) { UI.beginFrame(); try { renderInner(view, app); } finally { UI.endFrame(); } };
  function renderInner(view, app) {
    const mySlot = app.mySlot;
    const ov = view.ov, roll = view.roll;
    // 롤 패널 (사이드, 다른 오버레이와 독립)
    if (roll) {
      const it = roll.item; const my = roll.choices[mySlot];
      const canUse = !it.cls || it.cls === (view.pl[mySlot] || {}).c;
      const html = `<h2>🎲 전리품 ${timerHtml(roll.timer)}</h2><div class="item q${it.q}"><div class="nm">${esc(it.nm)}</div><div>${esc(G.Items.SLOT_NAME[it.slot])}${it.cls ? ' · ' + esc(G.CLASSES[it.cls].name) : ''}${canUse ? '' : ' <span style="color:#e07a4a">(못 씀)</span>'}</div><div class="sub">${esc(it.ds)}</div></div>
        <div class="row" style="margin-top:8px">${['need', 'greed', 'pass'].map(c => `<button class="btn ${my === c ? 'sel' : ''} ${c === 'need' ? 'red' : c === 'greed' ? 'blue' : 'ghost'}" data-act="roll" data-arg="${c}" ${my ? 'disabled' : ''}>${c === 'need' ? '니드' : c === 'greed' ? '그리드' : '패스'}</button>`).join('')}</div>
        <p class="hint">${Object.keys(roll.choices).map(s => `${UI.nameTag(names(view, s), s)}: ${{ need: '니드', greed: '그리드', pass: '패스' }[roll.choices[s]]}`).join(' · ') || '선택 대기'}</p>`;
      UI.show('roll', html, { cls: 'side' });
      if (!ov && !O.menu) return;
    }
    if (O.menu && view.mode === 'hall') { O.renderMenu(view, app); return; }
    if (view.setup && view.mode === 'hall') { O.renderSetup(view, app); return; }
    if (!ov) return;
    if (ov.type === 'vote') {
      const myVote = ov.votes[mySlot];
      const html = `<h2>${esc(ov.title || (ov.kind === 'node' ? '다음 노드' : '투표'))} ${timerHtml(ov.timer)}</h2>${ov.sub ? `<p>${esc(ov.sub)}</p>` : ''}<div class="opts">${ov.opts.map((o, i) => `<div class="opt ${myVote === i ? 'sel' : ''} ${o.dis ? 'dis' : ''}" data-act="vote" data-arg="${i}"><span class="t">${esc(o.t)}${o.sub ? `<div class="sub">${esc(o.sub)}</div>` : ''}</span><span class="votes">${UI.voteDots(ov.votes, i)}</span></div>`).join('')}</div><p class="hint">과반이면 즉시 확정 · 동률은 주사위</p>`;
      UI.show('vote', html, { cls: ov.kind === 'node' ? 'bottom' : '' });
    } else if (ov.type === 'pick') {
      const offers = ov.offers[mySlot] || []; const picked = ov.picked[mySlot];
      const others = Object.keys(ov.picked).filter(s => +s !== mySlot).map(s => `${UI.nameTag(names(view, s), s)} ✓`).join(' ');
      const html = `<h2>${esc(ov.title)} ${timerHtml(ov.timer)}</h2><div class="cards">${offers.length ? offers.map(c => `<div class="card r${c.r} ${picked === c.id ? 'picked' : ''}" data-act="pick" data-arg="${c.id}"><div class="nm">${esc(c.nm)}</div><div class="ds">${esc(c.ds)}</div><div class="tg">${esc(c.cls || (G.RELIC_RARITY_NAME[c.r] || ''))}</div></div>`).join('') : '<p class="hint">선택할 것이 없다</p>'}</div><p class="hint">${picked !== undefined ? '선택 완료. 대기 중… ' : ''}${others}</p>`;
      UI.show('pick', html);
    } else if (ov.type === 'shop') {
      const me = view.pl[mySlot] || {}; const disc = ov.disc[mySlot] || 0; const done = ov.done[mySlot];
      const html = `<h2>${esc(ov.title)} <small>내 금화 ${ov.gold[mySlot] || 0}${disc ? ` · 할인 ${disc}%` : ''}</small> ${timerHtml(ov.timer)}</h2>
        <div class="grid">${ov.items.map(it => { const pr = Math.round(it.pr * (1 - disc / 100)); const bad = it.cls && it.cls !== me.c; return `<div class="item q${it.q} ${it.sold ? 'sold' : ''}" data-act="buy" data-arg="${it.i}"><div class="nm">${esc(it.nm)}${it.stock > 1 ? ` ×${it.stock}` : ''}</div><div class="sub">${esc(it.ds)}${bad ? ' <span style="color:#e07a4a">(다른 직업)</span>' : ''}</div><div class="pr">${it.sold ? '품절' : pr + ' 금화'}</div></div>`; }).join('')}</div>
        <div class="row" style="margin-top:10px"><button class="btn red" data-act="shopDone" ${done ? 'disabled' : ''}>${done ? '대기 중…' : '다 샀다'}</button></div><p class="hint">${Object.keys(ov.done).map(s => UI.nameTag(names(view, s), s) + ' ✓').join(' ')}</p>`;
      UI.show('shop', html);
    } else if (ov.type === 'results') {
      O.renderResults(view, app, ov);
    }
  }

  O.renderResults = function (view, app, ov) {
    const res = ov.res; const nm = s => ov.names[s] || '?';
    const rows = res.stats.map(s => `<tr><td class="pc${s.slot}">${G.CLASSES[s.cls].icon} ${esc(s.name)}</td><td>${s.dmg}</td><td>${s.heal}</td><td>${s.tank}</td><td>${s.kills}</td><td>${s.reacts}</td><td>${s.revives}</td><td>${s.downs}</td><td>${s.goldLeft}</td></tr>`).join('');
    const awards = res.awards.map(a => `<span class="award">${a.icon} ${esc(a.name)} — <b class="pc${a.slot}">${esc(nm(a.slot))}</b>${a.val != null && a.id !== 'mvp' ? ` (${a.val})` : ''}</span>`).join('');
    const title = res.wiped ? '☠️ 전멸' : res.cleared ? (res.region >= 4 && !ov.returned ? '👑 심연의 군주 처단' : '🏠 귀환') : '종료';
    const blame = res.blame != null ? `<p style="color:#e07a4a">전멸 원인 제공자: <b class="pc${res.blame}">${esc(nm(res.blame))}</b> — 다음 원정 동안 바보 투구 착용</p>` : '';
    const lw = res.wiped && !app.lastWordsSent ? `<p class="label">마지막 한마디 (비석에 새겨짐)</p><div class="row"><input id="lw-in" maxlength="30" placeholder="유언…"><button class="btn ghost" data-act="lastWords">새기기</button></div>` : '';
    const html = `<h2>${title} <small>${G.REGIONS[Math.min(3, res.region - 1)].name} · 심연 ${res.depth} · ${U.fmtTime(res.time)} · 시드 ${res.seed}</small></h2>
      <p>잿조각 <b style="color:#e0b050">+${res.ash}</b> · 혼석 <b style="color:#80e0ff">+${res.soul}</b> · 직업 경험치 +${res.xp} · 보상 배율 ×${res.mult}${res.wiped ? ' (미확정 70% 손실)' : ''}</p>
      <table class="stats"><tr><th>이름</th><th>피해</th><th>치유</th><th>흡수</th><th>처치</th><th>반응</th><th>부활</th><th>다운</th><th>남은 금화</th></tr>${rows}</table>
      <div style="margin-top:8px">${awards || '<span class="hint">수여된 상 없음</span>'}</div>${blame}${lw}
      ${ov.newAch && ov.newAch.length ? `<p>🏆 업적: ${ov.newAch.map(a => esc(a.name) + ' (칭호: ' + esc(a.title) + ')').join(', ')}</p>` : ''}
      <div class="row" style="margin-top:10px">${app.mode === 'host' ? '<button class="btn red big" data-act="toHall">길드 홀로</button>' : '<button class="btn ghost" disabled>방장이 길드 홀로 돌아가길 기다리는 중…</button>'}</div>`;
    UI.show('results', html);
  };

  // ───── 원정 설정 (술집)
  O.renderSetup = function (view, app) {
    const s = view.setup; const host = app.mode === 'host'; const g = app.guild;
    const me = view.pl[app.mySlot] || {};
    const curses = M.CURSES.map(c => `<div class="opt ${s.curses.includes(c.id) ? 'sel' : ''} ${host && s.mode !== 'weekly' ? '' : 'dis'}" data-act="setupCurse" data-arg="${c.id}" style="padding:5px 8px"><span class="t">${esc(c.name)}<div class="sub">${esc(c.desc)}</div></span></div>`).join('');
    const modeName = { normal: '원정', weekly: `주간 도전: ${s.weekly.name}`, rush: '보스 러시', endless: '무한 심연' };
    const modes = s.modes.map(m => `<button class="btn ${s.mode === m ? 'sel' : ''}" data-act="setupMode" data-arg="${m}" ${host ? '' : 'disabled'}>${modeName[m].split(':')[0]}</button>`).join('');
    const clsBtns = G.CLASS_ORDER.map(c => { const d = G.CLASSES[c]; const locked = !g.unlocked.includes(c); return `<button class="btn ${me.c === c ? 'sel' : ''} ${locked ? 'locked' : ''}" data-act="setupCls" data-arg="${c}" ${locked ? 'disabled' : ''} title="${esc(d.desc)}">${d.icon} ${d.name}</button>`; }).join('');
    const ready = Object.keys(s.ready).map(sl => `${UI.nameTag(names(view, sl), sl)} ${s.ready[sl] ? '✅' : '⏳'}`).join(' · ');
    const rewardMult = (1 + (s.depth - 1) * C.DEPTH_REWARD) * (1 + s.curses.length * C.CURSE_REWARD);
    const html = `<h2>🍺 원정 준비 <small>${esc(modeName[s.mode])}${s.mode === 'weekly' ? ' — ' + esc(s.weekly.desc) + (s.weekly.done ? ' (이번 주 완료)' : '') : ''}</small></h2>
      <div class="tabs">${modes}</div>
      <p class="label">심연 단계 <small>(최대 ${s.maxDepth} · 보상 ×${rewardMult.toFixed(2)})</small></p>
      <div class="row">${[...Array(C.DEPTH_MAX)].map((_, i) => `<button class="btn tiny ${s.depth === i + 1 ? 'sel' : ''}" data-act="setupDepth" data-arg="${i + 1}" ${host && i + 1 <= s.maxDepth ? '' : 'disabled'}>${i + 1}</button>`).join('')}</div>
      <p class="label">저주 <small>(최대 5 · 하나당 보상 +20%)</small></p><div class="grid" style="grid-template-columns:repeat(3,1fr)">${curses}</div>
      <p class="label">내 직업</p><div class="class-pick">${clsBtns}</div>
      <p class="hint">${ready}</p>
      <div class="row" style="margin-top:8px"><button class="btn red big" data-act="setupReady">${s.ready[app.mySlot] ? '준비 취소' : '준비 완료'}</button>${host ? `<button class="btn blue big" data-act="setupStart" ${Object.values(s.ready).every(Boolean) ? '' : 'disabled'}>출발</button><button class="btn ghost" data-act="setupCancel">닫기</button>` : ''}</div>
      ${host && app.savedRun ? `<p class="hint">저장된 원정이 있습니다 (${esc(G.REGIONS[Math.min(3, app.savedRun.regionIdx)].name)} · 노드 ${app.savedRun.nodesDone}). <button class="btn tiny ghost" data-act="resumeRun">이어하기</button> <button class="btn tiny ghost" data-act="discardRun">버리기</button></p>` : ''}`;
    UI.show('setup', html);
  };

  // ───── 길드 홀 메뉴
  O.open = (id, tab) => { O.menu = { id, tab: tab || 0, sel: null }; G.A.play('nav'); };
  O.close = () => { O.menu = null; UI.hide(); G.A.play('back'); };
  O.renderMenu = function (view, app) {
    const m = O.menu, g = app.guild, acct = G.Acct.me, host = app.mode === 'host';
    const me = view.pl[app.mySlot] || {}; const cls = me.c || acct.lastClass;
    let html = '';
    const head = (t, sub) => `<h2>${t} <small>${sub || ''}</small><button class="btn tiny ghost close" data-act="menuClose">닫기 (Esc)</button></h2>`;
    const facHead = id => { const f = M.FACILITIES[id], lv = g.fac[id]; const cost = C.FACILITY_COST[lv]; return `<p>${f.icon} <b>${f.name} Lv${lv}</b> — ${esc(f.lv[lv - 1])}${lv < 4 ? ` · 다음: ${esc(f.lv[lv])} <button class="btn tiny ${g.ash >= cost ? 'red' : 'ghost'}" data-act="facUp" data-arg="${id}" ${host ? '' : 'disabled'}>업그레이드 (잿조각 ${cost})</button>` : ' · 최대'}</p><p class="hint">길드 잿조각 ${g.ash} · 혼석 ${g.soul}${host ? '' : ' · 시설 업그레이드는 방장이'}</p>`; };
    if (m.id === 'tavern') { html = head('🍺 술집', '반쪽 귀 그레타') + facHead('tavern') + `<p>"${esc(M.NPC_LINES.greta[Math.floor(Date.now() / 60000) % M.NPC_LINES.greta.length])}"</p><div class="row"><button class="btn red big" data-act="openSetup" ${host ? '' : 'disabled'}>원정 준비${host ? '' : ' (방장만)'}</button></div><p class="hint">주간 도전: ${esc(M.weekly().name)} — ${esc(M.weekly().desc)}${g.hall.weekly[U.weekKey()] ? ' ✅' : ''}</p>`; }
    else if (m.id === 'forge') {
      const maxR = g.fac.forge >= 3 ? 3 : g.fac.forge >= 2 ? 2 : 1;
      const craft = [0, 1, 2, 3].map(r => `<button class="btn tiny ${r <= maxR ? '' : 'locked'}" data-act="craft" data-arg="${r}" ${r <= maxR && host ? '' : 'disabled'}>${G.Items.RARITY[r]} (혼석 ${C.CRAFT_COST[r]})</button>`).join(' ');
      const slots = ['w', 'a', 't'].map(s => `<button class="btn tiny ${(m.craftSlot || 'w') === s ? 'sel' : ''}" data-act="craftSlot" data-arg="${s}">${G.Items.SLOT_NAME[s]}</button>`).join(' ');
      const list = g.storage.map(it => UI.itemHtml(it, `data-act="selItem" data-arg="${it.id}" style="${m.sel === it.id ? 'outline:2px solid #e0b050' : ''}"`)).join('');
      const sel = g.storage.find(it => it.id === m.sel);
      const selHtml = sel ? `<p><b>${esc(G.Items.label(sel))}</b> — 강화 비용 혼석 ${C.UPGRADE_COST[sel.up || 0] + sel.rar} <button class="btn tiny red" data-act="upgrade" data-arg="${sel.id}" ${host ? '' : 'disabled'}>강화</button> <button class="btn tiny ghost" data-act="dismantle" data-arg="${sel.id}" ${host ? '' : 'disabled'}>분해 (+${G.Items.sellValue(sel)})</button></p>` : '<p class="hint">창고 장비를 선택하면 강화·분해</p>';
      html = head('⚒️ 대장간', '벙어리 올랑') + facHead('forge') + `<p class="label">제작 — 슬롯: ${slots} · 내 직업 무기</p><p>${craft}</p>${selHtml}<div class="grid">${list || '<span class="hint">창고 비어 있음</span>'}</div>`;
    }
    else if (m.id === 'storage') {
      const ch = G.Acct.charOf(acct, cls);
      const mine = ['w', 'a', 't'].map(s => { const it = ch.equip[s]; return it ? UI.itemHtml(it, `data-act="unequip" data-arg="${s}"`) : `<div class="item"><div class="nm">${G.Items.SLOT_NAME[s]}</div><div class="sub">비어 있음</div></div>`; }).join('');
      const list = g.storage.map(it => UI.itemHtml(it, `data-act="selItem" data-arg="${it.id}" style="${m.sel === it.id ? 'outline:2px solid #e0b050' : ''}"`)).join('');
      const sel = g.storage.find(it => it.id === m.sel);
      const selHtml = sel ? `<p><b>${esc(G.Items.label(sel))}</b> <button class="btn tiny red" data-act="take" data-arg="${sel.id}" ${G.Items.canUse(sel, cls) ? '' : 'disabled'}>장착 (${G.CLASSES[cls].name})</button> <button class="btn tiny ghost" data-act="lock" data-arg="${sel.id}">${sel.lock ? '잠금 해제' : '잠금'}</button></p>` : '<p class="hint">선택 → 장착 또는 잠금. 내 장비를 누르면 창고로</p>';
      html = head('📦 창고', `${g.storage.length}/${M.STORAGE_CAP[g.fac.storage - 1]}`) + facHead('storage') + `<p class="label">내 장비 (${G.CLASSES[cls].name} Lv${ch.lv})</p><div class="slotbox">${mine}</div>${selHtml}<div class="grid">${list || '<span class="hint">비어 있음</span>'}</div>`;
    }
    else if (m.id === 'training') {
      const ch = G.Acct.charOf(acct, cls); const pts = G.Hall.talentPoints(acct, cls, g);
      const tal = M.TALENTS[cls] || [];
      const br = tal.map((b, bi) => `<div class="br ${bi >= (g.fac.training >= 2 ? 3 : 2) ? 'off' : ''}"><h4>${esc(b.name)}</h4>${b.t.map((t, i) => { const on = ch.talents.includes(`${bi}.${i}`); const can = G.Hall.canTalent(acct, cls, g, bi, i); return `<div class="tn ${on ? 'on' : can ? '' : 'off'}" data-act="talent" data-arg="${bi}.${i}"><b>${esc(t.name)}</b><div class="sub">${esc(t.desc)}</div></div>`; }).join('')}</div>`).join('');
      html = head('🏋️ 훈련장', '교관 하스') + facHead('training') + `<p><b>${G.CLASSES[cls].icon} ${G.CLASSES[cls].name} Lv${ch.lv}</b> · 경험치 ${ch.xp}/${C.CLASS_XP_LV(ch.lv)} · 특성 포인트 <b style="color:#e0b050">${pts}</b> <button class="btn tiny ghost" data-act="resetTalents">재설정${g.fac.training >= 2 ? '' : ' (잿조각 20)'}</button></p><div class="tal">${br}</div><p class="hint">허수아비(훈련장 옆)를 때리면 DPS가 표시된다</p>`;
    }
    else if (m.id === 'hall') {
      const recs = g.hall.records.slice(0, 12).map(r => `<tr><td>${esc(r.date)}</td><td>${esc(r.result)}</td><td>${r.region}지역 · 심연 ${r.depth}</td><td>${U.fmtTime(r.time)}</td><td>${esc(r.members.join(', '))}</td><td>${esc(r.mvp || '-')}</td></tr>`).join('');
      const ach = M.ACHIEVEMENTS.map(a => `<span class="award" style="${g.ach.includes(a.id) ? '' : 'opacity:.4'}">${g.ach.includes(a.id) ? '🏆' : '🔒'} ${esc(a.name)}<div class="sub">${esc(a.desc)}</div></span>`).join('');
      const titles = ['', ...acct.titles].map(t => `<button class="btn tiny ${(acct.title || '') === t ? 'sel' : ''}" data-act="title" data-arg="${esc(t)}">${t || '칭호 없음'}</button>`).join(' ');
      const bk = Object.keys(g.hall.bossKills).map(b => `${esc(G.Bosses.DATA[b] ? G.Bosses.DATA[b].name : b)} ×${g.hall.bossKills[b]}`).join(' · ');
      html = head('🏛️ 전당', `${esc(g.name)}`) + facHead('hall') + `<p>원정 ${g.hall.runs} · 클리어 ${g.hall.clears} · 전멸 ${g.hall.wipes} · 최고 심연 ${g.hall.bestDepth}${g.hall.bestEndless ? ' · 무한 ' + g.hall.bestEndless + '바퀴' : ''}</p><p class="hint">${bk || '아직 보스를 잡지 못했다'}</p><p class="label">내 칭호</p><p>${titles}</p><p class="label">업적</p><div>${ach}</div><p class="label">기록</p><table class="stats"><tr><th>날짜</th><th>결과</th><th>위치</th><th>시간</th><th>멤버</th><th>MVP</th></tr>${recs || '<tr><td colspan=6 class="hint">기록 없음</td></tr>'}</table>`;
    }
    else if (m.id === 'grave') {
      const list = g.graveyard.map(gr => `<div class="item"><div class="nm">🪦 ${esc(gr.date)} — ${esc(gr.region)} · 심연 ${gr.depth}</div><div class="sub">원인 제공자: <b>${esc(gr.blame || '?')}</b>${gr.cause ? ' · 사인: ' + esc(gr.cause) : ''}</div><div class="sub">${esc(gr.members.join(', '))}</div>${Object.keys(gr.lastWords || {}).length ? `<div class="sub">${Object.entries(gr.lastWords).map(([n, w]) => `"${esc(w)}" — ${esc(n)}`).join('<br>')}</div>` : ''}</div>`).join('');
      html = head('⚰️ 묘지', '묘지기 발터') + facHead('grave') + `<p>"${esc(M.NPC_LINES.walter[Math.floor(Date.now() / 60000) % 3])}"</p><div class="grid">${list || '<span class="hint">아직 비석이 없다. 오래 가진 않을 것이다.</span>'}</div>`;
    }
    else if (m.id === 'library') {
      const tabs = [['enemies', '적'], ['bosses', '보스'], ['relics', '유물'], ['events', '이벤트'], ['cards', '카드']];
      const t = tabs[m.tab] ? tabs[m.tab][0] : 'enemies';
      let body = '';
      if (t === 'enemies') body = Object.keys(G.ENEMIES).filter(k => G.ENEMIES[k].region >= 0).map(k => { const d = G.ENEMIES[k], n = g.codex.enemies[k]; return `<div class="item" style="${n ? '' : 'opacity:.4'}"><div class="nm">${n ? esc(d.name) : '???'}</div><div class="sub">${n ? esc(d.desc) + (g.fac.library >= 3 ? ` · 체력 ${d.hp} 공격 ${d.atk}` : '') : '지역 ' + (d.region || '공용')}</div>${n ? `<div class="sub">처치 ${n}</div>` : ''}</div>`; }).join('');
      else if (t === 'bosses') body = Object.keys(G.Bosses.DATA).map(k => { const d = G.Bosses.DATA[k], n = g.codex.bosses[k]; return `<div class="item" style="${n ? '' : 'opacity:.4'}"><div class="nm">${n ? esc(d.name) : '???'}</div><div class="sub">${n ? esc(d.intro) + ' · 처치 ' + n : ''}</div></div>`; }).join('');
      else if (t === 'relics') body = G.RELICS.map(r => { const n = g.codex.relics[r.id]; return `<div class="item q${r.r}" style="${n ? '' : 'opacity:.4'}"><div class="nm">${n ? esc(r.name) : '???'}</div><div class="sub">${n ? esc(r.desc) : G.RELIC_RARITY_NAME[r.r]}</div></div>`; }).join('');
      else if (t === 'events') body = G.EVENTS.map(e => { const n = g.codex.events[e.id]; return `<div class="item" style="${n ? '' : 'opacity:.4'}"><div class="nm">${n ? esc(e.title) : '???'}</div><div class="sub">${n ? esc(e.text) : ''}</div></div>`; }).join('');
      else body = Object.keys(G.CARD_BY).map(id => { const c = G.CARD_BY[id]; const n = g.codex.cards[id]; return `<div class="item" style="${n ? '' : 'opacity:.4'}"><div class="nm">${n ? esc(c.name) : '???'}</div><div class="sub">${n ? esc(c.desc) : ''}</div></div>`; }).join('');
      html = head('📚 도서관', `도감 ${Math.round(M.codexPct(g) * 100)}%`) + facHead('library') + `<div class="tabs">${tabs.map((tb, i) => `<button class="btn ${m.tab === i ? 'sel' : ''}" data-act="menuTab" data-arg="${i}">${tb[1]}</button>`).join('')}</div><div class="grid">${body}</div>`;
    }
    else if (m.id === 'banner') {
      html = head('🚩 길드 깃발', g.code) + `<p class="label">길드 이름</p><div class="row"><input id="guild-name" maxlength="12" value="${esc(g.name)}" ${host ? '' : 'disabled'}><button class="btn red" data-act="bannerSave" ${host ? '' : 'disabled'}>저장</button></div><p class="label">색</p><p>${['#b8462e', '#3f5a8a', '#4a7a3a', '#7a4a8a', '#8a7a2a', '#444'].map((c, i) => `<button class="btn tiny ${g.color === i ? 'sel' : ''}" data-act="bannerColor" data-arg="${i}" style="background:${c}" ${host ? '' : 'disabled'}>　</button>`).join(' ')}</p><p class="hint">길드 코드 <b>${g.code}</b> · 멤버: ${esc(g.members.join(', ') || '-')} · 생성 ${esc(g.created)}</p><p class="hint">길드 데이터는 접속한 모든 멤버의 기기에 복제됩니다. 누가 방장을 해도 이어집니다.</p>`;
    }
    else if (m.id === 'dummy') { O.menu = null; return; }
    else { html = head(m.id, '') + '<p>…</p>'; }
    UI.show('menu-' + m.id, html);
  };
  return O;
})();
