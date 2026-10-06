// WebAudio 합성 효과음 & 시퀀서 BGM (외부 파일 없음)
G.A = (function () {
  const A = {};
  let ac = null, master, sfxBus, musBus, noiseBuf = null;
  A.vol = { master: 0.8, sfx: 0.8, music: 0.45 };

  A.unlock = function () {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.connect(ac.destination);
      sfxBus = ac.createGain(); sfxBus.connect(master);
      musBus = ac.createGain(); musBus.connect(master);
      A.applyVol();
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      if (cur) { nextT = ac.currentTime + 0.1; if (!timer) timer = setInterval(schedule, 50); }
    } catch (e) { ac = null; }
  };
  A.applyVol = function () {
    if (!ac) return;
    master.gain.value = A.vol.master; sfxBus.gain.value = A.vol.sfx * 0.55; musBus.gain.value = A.vol.music * 0.3;
  };

  function tone(f, dur, type, vol, slide, delay, bus) {
    if (!ac) return;
    const t0 = ac.currentTime + (delay || 0);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(f, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(bus || sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol, freq, delay, q) {
    if (!ac || !noiseBuf) return;
    const t0 = ac.currentTime + (delay || 0);
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 1200; f.Q.value = q || 1;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol || 0.2, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(sfxBus);
    s.start(t0); s.stop(t0 + dur + 0.02);
  }

  const last = {};
  const SFX = {
    step: () => noise(0.04, 0.025, 400),
    swing: () => noise(0.09, 0.12, 2000, 0, 0.7),
    heavy: () => { noise(0.14, 0.18, 900, 0, 0.6); tone(120, 0.12, 'square', 0.08, 0.5); },
    dagger: () => noise(0.05, 0.1, 3500, 0, 1.5),
    bow: () => { noise(0.06, 0.08, 2500); tone(900, 0.1, 'triangle', 0.06, 0.5); },
    bowCharge: () => tone(300, 0.3, 'sine', 0.05, 2.5),
    bolt: () => tone(1100, 0.07, 'sine', 0.08, 1.5),
    holy: () => tone(1320, 0.12, 'sine', 0.08, 1.3),
    gun: () => { noise(0.08, 0.25, 1500, 0, 0.5); tone(200, 0.06, 'square', 0.08, 0.4); },
    reload: () => { tone(600, 0.04, 'square', 0.05); tone(800, 0.05, 'square', 0.05, 1, 0.12); },
    hit: () => { noise(0.06, 0.14, 1800); tone(300, 0.06, 'square', 0.07, 0.6); },
    crit: () => { noise(0.08, 0.2, 2600); tone(900, 0.1, 'square', 0.1, 1.5); },
    kill: () => { noise(0.2, 0.18, 600, 0, 0.6); tone(220, 0.15, 'sawtooth', 0.06, 0.5); },
    hurt: () => { tone(200, 0.22, 'sawtooth', 0.14, 0.4); noise(0.12, 0.15, 800); },
    block: () => { tone(1500, 0.1, 'triangle', 0.1, 0.7); noise(0.05, 0.1, 4000); },
    roll: () => noise(0.16, 0.1, 900, 0, 0.5),
    down: () => { tone(330, 0.25, 'triangle', 0.15, 0.6); tone(220, 0.4, 'triangle', 0.14, 0.6, 0.2); tone(110, 0.7, 'sawtooth', 0.1, 0.6, 0.45); },
    dead: () => { tone(150, 1.2, 'sawtooth', 0.12, 0.4); noise(0.8, 0.15, 300); },
    revive: () => [392, 523, 659, 784].forEach((f, i) => tone(f, 0.2, 'triangle', 0.12, 1, i * 0.08)),
    levelup: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'square', 0.08, 1, i * 0.06)),
    pick: () => { tone(784, 0.08, 'square', 0.08); tone(1175, 0.14, 'square', 0.08, 1, 0.07); },
    gold: () => { tone(1568, 0.06, 'square', 0.07); tone(2093, 0.1, 'square', 0.06, 1, 0.05); },
    nav: () => tone(660, 0.04, 'square', 0.05),
    back: () => tone(440, 0.06, 'square', 0.05, 0.8),
    deny: () => { tone(200, 0.12, 'square', 0.08); tone(160, 0.14, 'square', 0.08, 1, 0.08); },
    buy: () => { tone(988, 0.07, 'square', 0.08); tone(1319, 0.12, 'square', 0.08, 1, 0.06); },
    boom: () => { noise(0.45, 0.35, 180, 0, 0.6); tone(90, 0.35, 'sine', 0.3, 0.4); },
    bigboom: () => { noise(0.8, 0.45, 120, 0, 0.5); tone(70, 0.6, 'sine', 0.4, 0.4); tone(140, 0.3, 'square', 0.1, 0.4); },
    fire: () => noise(0.3, 0.12, 700, 0, 0.4),
    ice: () => { tone(2000, 0.15, 'sine', 0.08, 0.5); noise(0.1, 0.08, 6000); },
    shatter: () => { noise(0.25, 0.25, 4000, 0, 2); tone(1800, 0.1, 'square', 0.08, 0.3); },
    poison: () => tone(400, 0.25, 'sine', 0.08, 0.6),
    shock: () => { noise(0.08, 0.2, 5000, 0, 3); tone(1800, 0.05, 'square', 0.06, 0.5); },
    heal: () => [659, 880, 1175].forEach((f, i) => tone(f, 0.15, 'sine', 0.1, 1, i * 0.06)),
    buff: () => [523, 784].forEach((f, i) => tone(f, 0.12, 'triangle', 0.09, 1, i * 0.07)),
    taunt: () => { tone(180, 0.3, 'sawtooth', 0.14, 1.4); noise(0.2, 0.1, 500); },
    shoot: () => tone(700, 0.08, 'square', 0.05, 0.6),
    warn: () => { tone(440, 0.08, 'square', 0.06); tone(440, 0.08, 'square', 0.06, 1, 0.12); },
    slam: () => { noise(0.3, 0.3, 150, 0, 0.8); tone(80, 0.3, 'sine', 0.3, 0.5); },
    roar: () => { tone(110, 0.7, 'sawtooth', 0.16, 0.6); noise(0.6, 0.15, 350); },
    bossdie: () => { for (let i = 0; i < 6; i++) noise(0.3, 0.25, 200 + i * 100, i * 0.12); [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, 'triangle', 0.09, 1, 0.7 + i * 0.1)); },
    ult: () => { [262, 330, 392, 523].forEach((f, i) => tone(f, 0.25, 'sawtooth', 0.09, 1, i * 0.05)); noise(0.5, 0.25, 400, 0.15, 0.5); },
    allin: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, 'square', 0.08, 1, i * 0.05)); noise(0.9, 0.3, 300, 0.2, 0.5); },
    react: () => { tone(600, 0.15, 'square', 0.1, 2); noise(0.3, 0.2, 1200); },
    stealth: () => tone(500, 0.2, 'sine', 0.06, 0.4),
    dash: () => noise(0.2, 0.14, 1000, 0, 0.5),
    trap: () => { tone(900, 0.05, 'square', 0.06); tone(600, 0.06, 'square', 0.06, 1, 0.06); },
    door: () => [330, 392, 494, 659].forEach((f, i) => tone(f, 0.25, 'triangle', 0.11, 1, i * 0.1)),
    chest: () => [523, 784, 1047, 1568].forEach((f, i) => tone(f, 0.2, 'square', 0.08, 1, i * 0.08)),
    mimic: () => { tone(200, 0.3, 'sawtooth', 0.14, 0.5); noise(0.3, 0.2, 600); },
    vote: () => tone(880, 0.06, 'square', 0.06),
    dice: () => { for (let i = 0; i < 5; i++) noise(0.04, 0.1, 3000 + i * 500, i * 0.06); },
    say: () => tone(700 + Math.random() * 300, 0.04, 'square', 0.04),
    ping: () => { tone(1200, 0.08, 'sine', 0.1); tone(1600, 0.1, 'sine', 0.08, 1, 0.08); },
    ach: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.2, 'triangle', 0.1, 1, i * 0.09)),
    wipe: () => [440, 415, 392, 349, 294].forEach((f, i) => tone(f, 0.4, 'sawtooth', 0.1, 1, i * 0.25)),
    win: () => [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'square', 0.09, 1, i * 0.13)),
    cheer: () => [659, 784].forEach((f, i) => tone(f, 0.1, 'triangle', 0.07, 1, i * 0.05)),
    forge: () => { noise(0.08, 0.2, 2500, 0, 2); tone(1400, 0.1, 'square', 0.06, 0.8); },
    laser: () => { tone(80, 0.5, 'sawtooth', 0.12, 4); noise(0.4, 0.15, 2000); },
    summon: () => { tone(200, 0.3, 'sawtooth', 0.1, 1.8); noise(0.2, 0.1, 400); },
    grab: () => { tone(150, 0.2, 'square', 0.1, 0.5); },
    pull: () => tone(120, 0.5, 'sine', 0.12, 1.5),
  };
  A.play = function (name) {
    if (!ac) return;
    const now = performance.now();
    if (last[name] && now - last[name] < 35) return;
    last[name] = now;
    const f = SFX[name]; if (f) f();
  };

  // ───── BGM 시퀀서 (16분음표 단위, 미디 번호, '.' 쉼표)
  const n = s => s.trim().split(/\s+/).map(x => (x === '.' ? 0 : +x));
  const SONGS = {
    hall: { bpm: 72, wave: 'triangle', bassWave: 'sine',
      mel: n('57 . . . 60 . . . 59 . . . 55 . . . 57 . . . 62 . . . 60 . . . . . . . 55 . . . 57 . . . 60 . 59 . 57 . . . 53 . . . 55 . . . 52 . . . . . . .'),
      bass: n('33 . . . . . . . 31 . . . . . . . 29 . . . . . . . 28 . . . . . . . 33 . . . . . . . 31 . . . . . . . 29 . . . . . . . 28 . . . . . . .'),
      drum: '................' },
    r1: { bpm: 100, wave: 'sawtooth', bassWave: 'triangle',
      mel: n('45 . 48 . 52 . 48 . 50 . 48 . 45 . . . 43 . 45 . 48 . 45 . 43 . 40 . 43 . . . 45 . 48 . 52 . 55 . 53 . 52 . 50 . 48 . 50 . 48 . 47 . 43 . 45 . . . . . . .'),
      bass: n('33 . 33 . 40 . 33 . 31 . 31 . 38 . 31 . 29 . 29 . 36 . 29 . 31 . 31 . 38 . 31 . 33 . 33 . 40 . 33 . 31 . 31 . 38 . 31 . 29 . 29 . 36 . 29 . 28 . 28 . 35 . 28 .'),
      drum: 'k.h.s.h.k.h.s.hh' },
    r2: { bpm: 84, wave: 'triangle', bassWave: 'sine',
      mel: n('52 . . . 55 . 53 . 52 . . . 48 . . . 50 . . . 53 . 52 . 50 . . . 47 . . . 52 . . . 59 . 57 . 55 . . . 53 . 52 . 50 . 48 . 47 . 48 . 50 . . . . . . .'),
      bass: n('28 . . . . . . . 24 . . . . . . . 26 . . . . . . . 23 . . . . . . . 28 . . . . . . . 24 . . . . . . . 26 . . . . . . . 31 . . . . . . .'),
      drum: 'k.......h...s...' },
    r3: { bpm: 112, wave: 'square', bassWave: 'sawtooth',
      mel: n('40 . 40 43 . 46 . 43 40 . 39 . 40 . . . 40 . 40 43 . 46 . 48 47 . 46 . 43 . . . 46 . 46 48 . 51 . 48 46 . 43 . 46 . . . 43 . 40 . 39 . 40 . 43 . 40 . . . . .'),
      bass: n('28 28 . 28 31 . 28 . 28 28 . 28 27 . 27 . 28 28 . 28 31 . 28 . 34 34 . 34 31 . 31 . 34 34 . 34 36 . 34 . 34 34 . 34 31 . 31 . 28 28 . 28 27 . 27 . 28 28 . 28 28 . 28 .'),
      drum: 'k.hsk.hsk.hsk.ss' },
    boss: { bpm: 136, wave: 'sawtooth', bassWave: 'sawtooth',
      mel: n('45 . 48 . 45 . 52 . 51 . 48 . 45 . 44 . 45 . 48 . 45 . 53 . 52 . 48 . 47 . 44 . 45 . 48 . 52 . 57 . 55 . 52 . 48 . 52 . 50 . 47 . 44 . 47 . 45 . . . . . . .'),
      bass: n('33 33 45 33 33 33 45 33 32 32 44 32 32 32 44 32 29 29 41 29 29 29 41 29 28 28 40 28 28 28 40 28 33 33 45 33 33 33 45 33 32 32 44 32 32 32 44 32 29 29 41 29 31 31 43 31 33 33 45 33 32 32 44 32'),
      drum: 'k.hsk.hsk.hsksss' },
    final: { bpm: 148, wave: 'sawtooth', bassWave: 'square',
      mel: n('38 . 38 . 41 . 38 . 44 . 43 . 41 . 38 . 36 . 36 . 39 . 36 . 43 . 41 . 39 . 36 . 38 . 38 . 41 . 38 . 45 . 44 . 41 . 38 . 46 . 45 . 44 . 43 . 41 . 39 . 38 . . .'),
      bass: n('26 26 38 26 26 26 38 26 26 26 38 26 26 26 38 26 24 24 36 24 24 24 36 24 24 24 36 24 24 24 36 24 26 26 38 26 26 26 38 26 26 26 38 26 26 26 38 26 22 22 34 22 22 22 34 22 24 24 36 24 24 24 36 24'),
      drum: 'kkhskkhskkhsksss' },
    map: { bpm: 80, wave: 'sine', bassWave: 'sine',
      mel: n('64 . . . . . . . 67 . . . . . . . 65 . . . . . . . 60 . . . . . . . 62 . . . . . . . 65 . . . . . . . 64 . . . . . . . 59 . . . . . . .'),
      bass: n('40 . . . . . . . . . . . . . . . 36 . . . . . . . . . . . . . . . 38 . . . . . . . . . . . . . . . 35 . . . . . . . . . . . . . . .'),
      drum: '................' },
  };
  let cur = null, step = 0, nextT = 0, timer = null;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  A.music = function (name) {
    if (cur === name) return;
    cur = name; step = 0;
    if (!ac) return;
    nextT = ac.currentTime + 0.1;
    if (!timer) timer = setInterval(schedule, 50);
  };
  A.stopMusic = function () { cur = null; };
  function schedule() {
    if (!ac || !cur) return;
    const s = SONGS[cur]; if (!s) return;
    const dt = 60 / s.bpm / 4;
    while (nextT < ac.currentTime + 0.2) {
      const mi = step % s.mel.length, bi = step % s.bass.length;
      const m = s.mel[mi], b = s.bass[bi];
      if (m > 0) { let len = 1; while (s.mel[(mi + len) % s.mel.length] === 0 && len < 4) len++; mnote(mtof(m), dt * len * 0.9, s.wave, 0.07, nextT); }
      if (b > 0) mnote(mtof(b), dt * 1.8, s.bassWave, 0.1, nextT);
      const d = s.drum[step % s.drum.length];
      if (d === 'k') mkick(nextT); else if (d === 'h') mhat(nextT, 0.025); else if (d === 's') mhat(nextT, 0.06, 1800);
      nextT += dt; step++;
    }
  }
  function mnote(f, dur, type, vol, t0) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.setValueAtTime(vol, t0 + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(musBus); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function mkick(t0) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(130, t0); o.frequency.exponentialRampToValueAtTime(40, t0 + 0.12);
    g.gain.setValueAtTime(0.25, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);
    o.connect(g); g.connect(musBus); o.start(t0); o.stop(t0 + 0.16);
  }
  function mhat(t0, vol, f) {
    if (!noiseBuf) return;
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const fl = ac.createBiquadFilter(); fl.type = 'highpass'; fl.frequency.value = f || 6000;
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
    s.connect(fl); fl.connect(g); g.connect(musBus); s.start(t0); s.stop(t0 + 0.06);
  }
  return A;
})();
