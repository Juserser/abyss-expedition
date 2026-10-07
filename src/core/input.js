// 입력: 키보드 + 마우스 + 게임패드 → 패킷 { x, y, a(조준각), b(누름 비트), n(누른 횟수 카운터) }
// 비트: 1 공격 2 Q 4 E 8 R 16 구르기 32 F 64 물약
// n 인덱스: 0 공격 1 Q 2 E 3 R 4 구르기 5 F 6 물약 7 핑(방향 포함 별도) 8 이모트
G.In = (function () {
  const I = {};
  const keys = new Set();
  I.enabled = false;
  I.mouse = { x: 0, y: 0, down: false, rdown: false };
  I.wheel = null;            // { kind:'ping'|'emote', x, y } 열려 있는 휠
  I.cb = {};
  const n = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  let padPrev = {};
  I.aim = 0;                 // 라디안, App 이 매 프레임 계산
  I.padAim = null;

  const BIND = {
    up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    q: ['KeyQ'], e: ['KeyE'], r: ['KeyR'], roll: ['Space', 'ShiftLeft', 'ShiftRight'], f: ['KeyF'], potion: ['Digit1'],
    ping: ['Tab'], emote: ['KeyG'], map: ['KeyM'], chat: ['Enter'], esc: ['Escape'], attackKey: ['KeyJ'],
  };
  const any = arr => arr.some(k => keys.has(k));

  window.addEventListener('keydown', e => {
    if (!I.enabled) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') { if (e.code === 'Escape' || e.code === 'Enter') { I.cb.chatKey && I.cb.chatKey(e.code); } return; }
    if (['Space', 'Tab', 'ShiftLeft', 'ShiftRight'].includes(e.code)) e.preventDefault();
    G.A.unlock();
    keys.add(e.code);
    if (e.repeat) return;
    if (BIND.q.includes(e.code)) n[1]++;
    if (BIND.e.includes(e.code)) n[2]++;
    if (BIND.r.includes(e.code)) n[3]++;
    if (BIND.roll.includes(e.code)) n[4]++;
    if (BIND.f.includes(e.code)) n[5]++;
    if (BIND.potion.includes(e.code)) n[6]++;
    if (BIND.attackKey.includes(e.code)) n[0]++;
    if (BIND.ping.includes(e.code)) { I.wheel = { kind: 'ping', x: I.mouse.x, y: I.mouse.y }; }
    if (BIND.emote.includes(e.code)) { I.wheel = { kind: 'emote', x: I.mouse.x, y: I.mouse.y }; }
    if (BIND.map.includes(e.code)) I.cb.map && I.cb.map();
    if (BIND.chat.includes(e.code)) I.cb.chat && I.cb.chat();
    if (BIND.esc.includes(e.code)) I.cb.esc && I.cb.esc();
  });
  window.addEventListener('keyup', e => {
    keys.delete(e.code);
    if (I.wheel && ((I.wheel.kind === 'ping' && BIND.ping.includes(e.code)) || (I.wheel.kind === 'emote' && BIND.emote.includes(e.code)))) {
      const w = I.wheel; I.wheel = null;
      const dx = I.mouse.x - w.x, dy = I.mouse.y - w.y;
      const sel = Math.hypot(dx, dy) < 12 ? 0 : 1 + Math.floor((((Math.atan2(dy, dx) + Math.PI * 2 + Math.PI / 8) % (Math.PI * 2)) / (Math.PI * 2)) * 8);
      I.cb.wheel && I.cb.wheel(w.kind, sel);
    }
  });
  window.addEventListener('blur', () => { keys.clear(); I.mouse.down = false; I.mouse.rdown = false; });

  // 마우스 (논리 좌표는 R.toLogical)
  I.attach = function (canvas) {
    const upd = e => { const p = G.R.toLogical(e.clientX, e.clientY); I.mouse.x = p[0]; I.mouse.y = p[1]; };
    canvas.addEventListener('mousemove', upd);
    canvas.addEventListener('mousedown', e => {
      if (!I.enabled) return; G.A.unlock(); upd(e);
      if (e.button === 0) { I.mouse.down = true; n[0]++; }
      else if (e.button === 2) { I.mouse.rdown = true; }
      else if (e.button === 1) { e.preventDefault(); I.wheel = { kind: 'ping', x: I.mouse.x, y: I.mouse.y }; }
      I.cb.click && I.cb.click(e.button);
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) I.mouse.down = false;
      else if (e.button === 2) I.mouse.rdown = false;
      else if (e.button === 1 && I.wheel && I.wheel.kind === 'ping') {
        const w = I.wheel; I.wheel = null;
        const dx = I.mouse.x - w.x, dy = I.mouse.y - w.y;
        const sel = Math.hypot(dx, dy) < 12 ? 0 : 1 + Math.floor((((Math.atan2(dy, dx) + Math.PI * 2 + Math.PI / 8) % (Math.PI * 2)) / (Math.PI * 2)) * 8);
        I.cb.wheel && I.cb.wheel('ping', sel);
      }
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  };

  function pollPad() {
    const pads = (navigator.getGamepads ? Array.from(navigator.getGamepads()) : []).filter(p => p && p.connected);
    if (!pads.length) { I.padAim = null; return { x: 0, y: 0, b: 0 }; }
    const p = pads[0];
    let x = p.axes[0] || 0, y = p.axes[1] || 0;
    if (Math.hypot(x, y) < 0.22) { x = 0; y = 0; }
    const ax = p.axes[2] || 0, ay = p.axes[3] || 0;
    I.padAim = Math.hypot(ax, ay) > 0.4 ? Math.atan2(ay, ax) : null;
    const bt = k => p.buttons[k] && p.buttons[k].pressed;
    const st = { a: bt(7), q: bt(4), e: bt(5), r: bt(6), roll: bt(0), f: bt(2), potion: bt(1), emote: bt(3) };
    const idx = { a: 0, q: 1, e: 2, r: 3, roll: 4, f: 5, potion: 6, emote: 8 };
    for (const k in st) { if (st[k] && !padPrev[k]) { if (k === 'emote') I.cb.wheel && I.cb.wheel('emote', 1); else n[idx[k]]++; } padPrev[k] = st[k]; }
    return { x, y, b: (st.a ? 1 : 0) | (st.q ? 2 : 0) | (st.e ? 4 : 0) | (st.r ? 8 : 0) | (st.roll ? 16 : 0) | (st.f ? 32 : 0) | (st.potion ? 64 : 0) };
  }

  // ───── 터치 (트윈 스틱): 화면 왼쪽 절반 = 이동, 오른쪽 절반 = 조준+공격. 버튼은 DOM(#touch)
  I.touch = { on: false, move: null, aim: null, hold: 0 };
  I.isTouch = () => ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  I.attachTouch = function (canvas) {
    const T = I.touch;
    const pos = t => G.R.toLogical(t.clientX, t.clientY);
    canvas.addEventListener('touchstart', e => {
      if (!I.enabled) return; e.preventDefault(); G.A.unlock(); T.on = true;
      for (const t of e.changedTouches) {
        const [lx, ly] = pos(t);
        const stick = { id: t.identifier, ox: lx, oy: ly, x: lx, y: ly };
        if (lx < G.C.W / 2) { if (!T.move) T.move = stick; } else { if (!T.aim) T.aim = stick; }
      }
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      if (!I.enabled) return; e.preventDefault();
      for (const t of e.changedTouches) for (const s of [T.move, T.aim]) if (s && s.id === t.identifier) { const [lx, ly] = pos(t); s.x = lx; s.y = ly; }
    }, { passive: false });
    const end = e => { for (const t of e.changedTouches) { if (T.move && T.move.id === t.identifier) T.move = null; if (T.aim && T.aim.id === t.identifier) T.aim = null; } };
    canvas.addEventListener('touchend', end); canvas.addEventListener('touchcancel', end);
    // 버튼: data-b = a q e r roll f potion ping emote map chat esc
    const BIT = { a: 1, q: 2, e: 4, r: 8, roll: 16, f: 32, potion: 64 }, IDX = { a: 0, q: 1, e: 2, r: 3, roll: 4, f: 5, potion: 6 };
    document.querySelectorAll('#touch [data-b]').forEach(btn => {
      const k = btn.dataset.b;
      const down = e => { e.preventDefault(); e.stopPropagation(); G.A.unlock(); btn.classList.add('on');
        if (k in IDX) { n[IDX[k]]++; T.hold |= BIT[k]; }
        else if (k === 'ping') I.cb.wheel && I.cb.wheel('ping', 1);
        else if (k === 'emote') I.cb.wheel && I.cb.wheel('emote', 1 + Math.floor(Math.random() * 8));
        else if (k === 'map') I.cb.map && I.cb.map();
        else if (k === 'chat') I.cb.chat && I.cb.chat();
        else if (k === 'esc') I.cb.esc && I.cb.esc(); };
      const up = e => { e.preventDefault(); btn.classList.remove('on'); if (k in BIT) T.hold &= ~BIT[k]; };
      btn.addEventListener('touchstart', down, { passive: false }); btn.addEventListener('touchend', up); btn.addEventListener('touchcancel', up);
      btn.addEventListener('mousedown', down); btn.addEventListener('mouseup', up); btn.addEventListener('mouseleave', up);
    });
  };
  function touchVec(s) { if (!s) return null; let dx = (s.x - s.ox) / 28, dy = (s.y - s.oy) / 28; const l = Math.hypot(dx, dy); if (l < 0.15) return { x: 0, y: 0, l: 0, a: 0 }; if (l > 1) { dx /= l; dy /= l; } return { x: dx, y: dy, l: Math.min(1, l), a: Math.atan2(dy, dx) }; }
  I.touchState = () => ({ move: touchVec(I.touch.move), aim: touchVec(I.touch.aim), mo: I.touch.move, ao: I.touch.aim });

  I.packet = function () {
    let x = (any(BIND.right) ? 1 : 0) - (any(BIND.left) ? 1 : 0);
    let y = (any(BIND.down) ? 1 : 0) - (any(BIND.up) ? 1 : 0);
    let b = ((I.mouse.down || any(BIND.attackKey)) ? 1 : 0) | (any(BIND.q) ? 2 : 0) | (any(BIND.e) ? 4 : 0) | (any(BIND.r) ? 8 : 0) | (any(BIND.roll) ? 16 : 0) | (any(BIND.f) ? 32 : 0);
    const pad = pollPad();
    if (pad.x || pad.y) { x = pad.x; y = pad.y; }
    b |= pad.b;
    // 터치
    const tm = touchVec(I.touch.move), ta = touchVec(I.touch.aim);
    if (tm && tm.l > 0) { x = tm.x; y = tm.y; }
    if (ta && ta.l > 0) { I.touchAim = ta.a; b |= 1; } else if (ta) { I.touchAim = null; }
    if (I.touch.aim && I.touchAim != null) I.aim = I.touchAim; else if (I.touch.on && I.touchAim == null && tm && tm.l > 0) I.aim = tm.a;
    b |= I.touch.hold;
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    if (I.wheel) { b = 0; }
    return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, a: Math.round((I.padAim != null ? I.padAim : I.aim) * 100) / 100, b, n: n.slice() };
  };
  I.EMPTY = { x: 0, y: 0, a: 0, b: 0, n: [0, 0, 0, 0, 0, 0, 0, 0, 0] };
  I.pressed = code => keys.has(code);
  return I;
})();
