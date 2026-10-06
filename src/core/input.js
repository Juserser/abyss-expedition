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

  I.packet = function () {
    let x = (any(BIND.right) ? 1 : 0) - (any(BIND.left) ? 1 : 0);
    let y = (any(BIND.down) ? 1 : 0) - (any(BIND.up) ? 1 : 0);
    let b = ((I.mouse.down || any(BIND.attackKey)) ? 1 : 0) | (any(BIND.q) ? 2 : 0) | (any(BIND.e) ? 4 : 0) | (any(BIND.r) ? 8 : 0) | (any(BIND.roll) ? 16 : 0) | (any(BIND.f) ? 32 : 0);
    const pad = pollPad();
    if (pad.x || pad.y) { x = pad.x; y = pad.y; }
    b |= pad.b;
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    if (I.wheel) { b = 0; }
    return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, a: Math.round((I.padAim != null ? I.padAim : I.aim) * 100) / 100, b, n: n.slice() };
  };
  I.EMPTY = { x: 0, y: 0, a: 0, b: 0, n: [0, 0, 0, 0, 0, 0, 0, 0, 0] };
  I.pressed = code => keys.has(code);
  return I;
})();
