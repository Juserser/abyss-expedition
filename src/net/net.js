// 온라인: PeerJS(WebRTC) — 방장 1 + 참가자 최대 2 (스타 토폴로지), 방장 권위
G.Net = (function () {
  const N = {};
  N.role = null; N.peer = null; N.code = null; N.ping = 0;
  N.conns = [];          // 방장: { id, conn, open, ping } / 참가자: [hostConn]
  const cb = {};
  const ICE = { iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ] };
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const genCode = () => Array.from({ length: 4 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
  let nextId = 1;

  N.on = (ev, fn) => { cb[ev] = fn; };
  const emit = (ev, ...a) => cb[ev] && cb[ev](...a);

  function wire(entry) {
    const conn = entry.conn, parts = {};
    conn.on('data', raw => {
      let m;
      try { m = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return; }
      if (!m) return;
      if (m.__c) {
        const p = parts[m.__c] || (parts[m.__c] = []);
        p[m.i] = m.s;
        if (p.filter(x => x != null).length === m.k) { delete parts[m.__c]; try { m = JSON.parse(p.join('')); } catch (e) { return; } }
        else return;
      }
      if (m.t === 'ping') { sendTo(conn, { t: 'pong', ts: m.ts }); return; }
      if (m.t === 'pong') { entry.ping = Math.round(performance.now() - m.ts); if (N.role === 'guest') N.ping = entry.ping; return; }
      emit('data', entry.id, m);
    });
    conn.on('close', () => {
      entry.open = false;
      N.conns = N.conns.filter(c => c !== entry);
      emit('close', entry.id);
    });
    conn.on('error', e => { console.warn('conn error', e); });
  }

  let chunkId = 1;
  function sendTo(conn, obj) {
    if (!conn || !conn.open) return false;
    const s = JSON.stringify(obj);
    try {
      if (s.length < 60000) conn.send(s);
      else {
        const id = chunkId++, size = 50000, k = Math.ceil(s.length / size);
        for (let i = 0; i < k; i++) conn.send(JSON.stringify({ __c: id, i, k, s: s.slice(i * size, (i + 1) * size) }));
      }
    } catch (e) { return false; }
    return true;
  }
  N.send = function (id, obj) {           // 방장: 특정 참가자에게
    const e = N.conns.find(c => c.id === id); return e ? sendTo(e.conn, obj) : false;
  };
  N.broadcast = function (obj) { for (const e of N.conns) sendTo(e.conn, obj); };
  N.toHost = function (obj) { return N.conns[0] ? sendTo(N.conns[0].conn, obj) : false; };
  N.open = () => N.conns.some(c => c.open);
  N.count = () => N.conns.filter(c => c.open).length;
  N.buffered = () => N.conns.reduce((a, c) => a + (c.conn && c.conn.dataChannel ? c.conn.dataChannel.bufferedAmount : 0), 0);
  N.pingOf = id => { const e = N.conns.find(c => c.id === id); return e ? e.ping : 0; };

  N.host = function (tries) {
    tries = tries || 0;
    N.role = 'host';
    N.code = genCode();
    emit('status', '방을 여는 중…');
    const peer = new Peer(G.C.PEER_PREFIX + N.code, { config: ICE, debug: 1 });
    N.peer = peer;
    peer.on('open', () => { emit('code', N.code); emit('status', '동료를 기다리는 중…'); });
    peer.on('connection', conn => {
      if (N.conns.filter(c => c.open).length >= G.C.MAX_PLAYERS - 1 || N.locked) {
        conn.on('open', () => { sendTo(conn, { t: 'full' }); setTimeout(() => { try { conn.close(); } catch (e) {} }, 500); });
        return;
      }
      const entry = { id: nextId++, conn, open: false, ping: 0 };
      N.conns.push(entry); wire(entry);
      conn.on('open', () => { entry.open = true; emit('connect', entry.id); });
    });
    peer.on('disconnected', () => { if (!peer.destroyed) setTimeout(() => { try { peer.reconnect(); } catch (e) {} }, 1000); });
    peer.on('error', e => {
      if (e.type === 'unavailable-id' && tries < 5) { peer.destroy(); N.host(tries + 1); return; }
      console.warn('peer error', e.type, e);
      if (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error') emit('status', '연결 서버에 닿지 않습니다. 인터넷을 확인하세요.');
    });
  };

  N.join = function (code) {
    N.role = 'guest';
    N.code = code.toUpperCase();
    emit('status', '연결하는 중…');
    const go = () => {
      const conn = N.peer.connect(G.C.PEER_PREFIX + N.code, { serialization: 'raw', reliable: true });
      const entry = { id: 0, conn, open: false, ping: 0 };
      N.conns = [entry]; wire(entry);
      let opened = false;
      conn.on('open', () => { opened = true; entry.open = true; emit('connect', 0); });
      setTimeout(() => { if (!opened && N.conns[0] === entry) { emit('status', '연결이 안 됩니다. 코드를 확인하거나 다시 시도하세요.'); emit('fail'); } }, 12000);
    };
    if (N.peer && !N.peer.destroyed && N.peer.open) { go(); return; }
    if (N.peer) try { N.peer.destroy(); } catch (e) {}
    const peer = new Peer({ config: ICE, debug: 1 });
    N.peer = peer;
    peer.on('open', go);
    peer.on('disconnected', () => { if (!peer.destroyed) setTimeout(() => { try { peer.reconnect(); } catch (e) {} }, 1000); });
    peer.on('error', e => {
      console.warn('peer error', e.type, e);
      if (e.type === 'peer-unavailable') { emit('status', '그 코드의 방을 찾을 수 없습니다.'); emit('fail'); }
      else if (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error') { emit('status', '연결 서버에 닿지 않습니다.'); emit('fail'); }
    });
  };

  N.kick = function (id) { const e = N.conns.find(c => c.id === id); if (e) try { e.conn.close(); } catch (x) {} };
  N.close = function () {
    for (const e of N.conns) try { e.conn.close(); } catch (x) {}
    try { if (N.peer) N.peer.destroy(); } catch (e) {}
    N.conns = []; N.peer = null; N.role = null; N.locked = false;
  };

  setInterval(() => {
    const ts = performance.now();
    for (const e of N.conns) if (e.open) sendTo(e.conn, { t: 'ping', ts });
  }, 2000);
  return N;
})();
