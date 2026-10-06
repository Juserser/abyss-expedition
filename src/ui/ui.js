// DOM 도우미: 패널, 토스트, 알림, 채팅, 설정
G.UI = (function () {
  const UI = {};
  const $ = id => document.getElementById(id);
  const esc = s => G.U.esc(s == null ? '' : s);
  UI.esc = esc;
  let curKey = null;

  const panels = {};
  UI.show = function (key, html, opts) {
    opts = opts || {};
    const ov = $('ov');
    let panel = panels[key];
    if (!panel) { panel = document.createElement('div'); panel.className = 'panel ' + (opts.cls || ''); panel.dataset.key = key; ov.appendChild(panel); panels[key] = panel; }
    if (panel.dataset.html !== html) { const st = panel.scrollTop; panel.innerHTML = html; panel.dataset.html = html; panel.scrollTop = st; }
    panel.className = 'panel ' + (opts.cls || '');
    ov.classList.remove('hidden'); curKey = key;
    return panel;
  };
  UI.hide = function (key) {
    if (key) { const p = panels[key]; if (p) { p.remove(); delete panels[key]; } }
    else { for (const k in panels) { panels[k].remove(); delete panels[k]; } }
    if (!Object.keys(panels).length) { $('ov').classList.add('hidden'); curKey = null; }
  };
  // 이번 프레임에 그린 패널만 남기고 제거
  UI.prune = function (keep) { for (const k in panels) if (!keep.includes(k)) UI.hide(k); };
  let shown = null;
  UI.beginFrame = () => { shown = []; };
  UI.endFrame = () => { if (shown) UI.prune(shown); shown = null; };
  const _show = UI.show; UI.show = function (key, html, opts) { if (shown) shown.push(key); return _show(key, html, opts); };
  UI.current = () => curKey;
  UI.isOpen = key => !!panels[key];
  // 패널 안 클릭 위임: data-act="name" data-arg="..."
  $('ov').addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el || el.classList.contains('dis')) return;
    G.A.unlock();
    UI.onAct && UI.onAct(el.dataset.act, el.dataset.arg, el);
  });
  $('ov').addEventListener('change', e => { const el = e.target.closest('[data-change]'); if (el) UI.onAct && UI.onAct(el.dataset.change, el.value, el); });

  UI.toast = function (s) { const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = s; $('toasts').appendChild(t); setTimeout(() => t.remove(), 4000); };
  UI.notice = function (text, btns) {
    $('notice-text').innerHTML = text;
    const box = $('notice-btns'); box.innerHTML = '';
    (btns || [{ t: '확인' }]).forEach(b => { const el = document.createElement('button'); el.className = 'btn ' + (b.cls || 'red'); el.textContent = b.t; el.onclick = () => { $('notice').classList.add('hidden'); b.fn && b.fn(); }; box.appendChild(el); });
    $('notice').classList.remove('hidden');
  };
  UI.chatAdd = function (s, sys) { const log = $('chat-log'); const d = document.createElement('div'); if (sys) d.className = 'sys'; d.innerHTML = s; log.appendChild(d); while (log.children.length > 60) log.firstChild.remove(); log.scrollTop = log.scrollHeight; $('chat').classList.remove('hidden'); };
  UI.openChat = function () { $('chat').classList.remove('hidden'); const i = $('chat-in'); i.focus(); };
  UI.chatKey = function (code) { const i = $('chat-in'); if (code === 'Enter') { const v = i.value.trim(); i.value = ''; i.blur(); if (v) UI.onChat && UI.onChat(v); } else { i.value = ''; i.blur(); } };
  UI.showChat = v => $('chat').classList.toggle('hidden', !v);

  // 설정
  UI.bindSettings = function () {
    const s = G.settings;
    $('gear').onclick = () => { $('settings').classList.toggle('hidden'); };
    $('set-close').onclick = () => $('settings').classList.add('hidden');
    $('set-master').value = s.master * 100; $('set-music').value = s.music * 100; $('set-sfx').value = s.sfx * 100; $('set-shake').value = s.shake * 100; $('set-dmg').checked = s.dmgNum !== false; $('set-aim').checked = s.aimAssist !== false;
    const upd = () => { s.master = $('set-master').value / 100; s.music = $('set-music').value / 100; s.sfx = $('set-sfx').value / 100; s.shake = $('set-shake').value / 100; s.dmgNum = $('set-dmg').checked; s.aimAssist = $('set-aim').checked; G.Acct.saveSettings(); };
    ['set-master', 'set-music', 'set-sfx', 'set-shake', 'set-dmg', 'set-aim'].forEach(id => $(id).addEventListener('input', upd));
  };

  // 공용 조각
  UI.pc = slot => `pc${slot}`;
  UI.nameTag = (name, slot) => `<span class="${UI.pc(slot)}">${esc(name)}</span>`;
  UI.voteDots = (votes, idx) => { const out = []; for (const s in votes) if (votes[s] === idx) out.push(`<i class="vdot bg${s}"></i>`); return out.join(''); };
  UI.rarCls = r => `q${r}`;
  UI.itemHtml = (it, extra) => `<div class="item ${UI.rarCls(it.rar)}" ${extra || ''}><div class="nm">${esc(G.Items.label(it))}</div><div>${esc(G.Items.SLOT_NAME[it.slot])}${it.cls ? ' · ' + esc(G.CLASSES[it.cls].name) : ''} · ${esc(G.Items.RARITY[it.rar])}</div><div class="sub">${esc(G.Items.desc(it))}</div>${it.lock ? `<div class="sub">🔒 ${esc(it.lock)}</div>` : ''}</div>`;
  return UI;
})();
