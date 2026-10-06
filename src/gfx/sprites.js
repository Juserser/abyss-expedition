// 픽셀 스프라이트 — 템플릿 + 팔레트로 정의, 오프스크린 캔버스로 베이크
G.SPR = (function () {
  const S = {};
  const T = {};   // 템플릿 rows
  const P = {};   // 팔레트 공통

  // ───── 템플릿 (12×16 인간형)
  T.human = [
    '....hhhh....',
    '...hhhhhh...',
    '...hffffh...',
    '...hfkffk...',
    '....ffff....',
    '...aaaaaa...',
    '..aaaaaaaa..',
    '.aaaaaaaaaa.',
    '.a.aaaaaa.a.',
    '...aaaaaa...',
    '...aaaaaa...',
    '...bb..bb...',
    '...bb..bb...',
    '...bb..bb...',
    '..ooo..ooo..',
    '............',
  ];
  T.hooded = [
    '....hhhh....',
    '...hhhhhh...',
    '..hhhhhhhh..',
    '..hhfkffkh..',
    '...hffffh...',
    '...hhhhhh...',
    '..hhhhhhhh..',
    '.hhhhhhhhhh.',
    '.h.hhhhhh.h.',
    '..hhhhhhhh..',
    '..hhhhhhhh..',
    '..hhhhhhhh..',
    '..hhhhhhhh..',
    '..hhhhhhhh..',
    '..oo....oo..',
    '............',
  ];
  T.robed = [
    '....hhhh....',
    '...hhhhhh...',
    '...hffffh...',
    '...hfkffk...',
    '....ffff....',
    '...aaaaaa...',
    '..aaaaaaaa..',
    '.aaaaaaaaaa.',
    '.a.aaaaaa.a.',
    '...aaaaaa...',
    '...aaaaaa...',
    '...aaaaaa...',
    '..aaaaaaaa..',
    '..aaaaaaaa..',
    '.aaaaaaaaaa.',
    '............',
  ];
  T.heavy = [
    '....hhhh....',
    '..hhhhhhhh..',
    '..hhffffhh..',
    '..hhfkffkh..',
    '...hffffh...',
    '..aaaaaaaa..',
    '.aaaaaaaaaa.',
    'aaaaaaaaaaaa',
    'aa.aaaaaa.aa',
    '.aaaaaaaaaa.',
    '..aaaaaaaa..',
    '..bbb..bbb..',
    '..bbb..bbb..',
    '..bbb..bbb..',
    '.oooo..oooo.',
    '............',
  ];
  T.beast = [
    '............',
    '............',
    '............',
    '............',
    '..........hh',
    '.........hhh',
    '..aaaaaaahhk',
    '.aaaaaaaaahh',
    '.aaaaaaaaaa.',
    '.aaaaaaaaaa.',
    '..aaaaaaaa..',
    '..a.a..a.a..',
    '..b.b..b.b..',
    '..b.b..b.b..',
    '..o.o..o.o..',
    '............',
  ];
  T.small = [
    '............', '............', '............', '............', '............', '............', '............', '............',
    '............',
    '.....aaa....',
    '....aaaaak..',
    '...aaaaaaa..',
    '..a.aaaaa...',
    '....b.b.b...',
    '....o.o.o...',
    '............',
  ];
  T.spider = [
    '............', '............', '............', '............', '............', '............',
    '............',
    '.b..b..b..b.',
    '..b.b..b.b..',
    '...aaaaaa...',
    '..aaakkaaa..',
    '.b.aaaaaa.b.',
    'b..aaaaaa..b',
    '....a..a....',
    '...b....b...',
    '............',
  ];
  T.float = [
    '............',
    '....hhhh....',
    '...hhhhhh...',
    '..hhkhhkhh..',
    '..hhhhhhhh..',
    '..hhhhhhhh..',
    '...hhhhhh...',
    '...hhhhhh...',
    '..hhhhhhhh..',
    '..hh.hh.hh..',
    '..h..hh..h..',
    '.....h......',
    '............',
    '............',
    '............',
    '............',
  ];
  T.eye = [
    '............',
    '...aaaaaa...',
    '..aaaaaaaa..',
    '.aaawwwwaaa.',
    '.aawwkkwwaa.',
    'aaawwkkkwaaa',
    'aaawwkkkwaaa',
    '.aawwkkwwaa.',
    '.aaawwwwaaa.',
    '..aaaaaaaa..',
    '...aaaaaa...',
    '....a..a....',
    '...a....a...',
    '............',
    '............',
    '............',
  ];
  T.tentacle = [
    '............',
    '......aa....',
    '.....aaa....',
    '....aaaa....',
    '....aaa.....',
    '...aaaa.....',
    '...aaaa.....',
    '..aaaaa.....',
    '..aaaaa.....',
    '..aaaaaa....',
    '.aaaaaaa....',
    '.aaaaaaaa...',
    'aaaaaaaaaa..',
    'aakaaaaakaa.',
    'aaaaaaaaaaaa',
    '............',
  ];
  T.maw = [
    '............',
    '............',
    '............',
    '............',
    '.aaaaaaaaaa.',
    'aakaaaaaakaa',
    'aaaaaaaaaaaa',
    'aawwaawwaawa',
    'aaww.w.w.wwa',
    'aa........aa',
    'aaw.w.ww.waa',
    'aawwwwwwwwaa',
    '.aaaaaaaaaa.',
    '..aaaaaaaa..',
    '............',
    '............',
  ];
  T.turret = [
    '............',
    '............',
    '.....ww.....',
    '....wwww....',
    '...aaaaaa...',
    '..aaaaaaaa..',
    '..aakaakaa..',
    '..aaaaaaaa..',
    '...aaaaaa...',
    '..bbbbbbbb..',
    '..bbbbbbbb..',
    '.bbbbbbbbbb.',
    '.bbbbbbbbbb.',
    'bbbbbbbbbbbb',
    'bbbbbbbbbbbb',
    '............',
  ];
  T.chest = [
    '............', '............', '............', '............', '............',
    '..aaaaaaaa..',
    '.aaaaaaaaaa.',
    '.aabbbbbbaa.',
    '.aaaaaaaaaa.',
    '.aaaakkaaaa.',
    '.aaaakkaaaa.',
    '.aaaaaaaaaa.',
    '.aaaaaaaaaa.',
    '.bbbbbbbbbb.',
    '............',
    '............',
  ];
  T.mimic = [
    '............', '............', '............', '............',
    '..aaaaaaaa..',
    '.aaaaaaaaaa.',
    '.aakaaaakaa.',
    '.aaaaaaaaaa.',
    '.wwwwwwwwww.',
    '.w.w.w.w.w..',
    '............',
    '.w.w.w.w.w..',
    '.aaaaaaaaaa.',
    '.bbbbbbbbbb.',
    '..b......b..',
    '............',
  ];
  T.bones = [
    '............', '............', '............', '............', '............', '............', '............', '............', '............', '............',
    '..w...ww....',
    '.www.w..w...',
    '..w..w..w.w.',
    '....w.ww.www',
    '..ww......w.',
    '............',
  ];
  T.exit = [
    '....aaaa....',
    '..aaaaaaaa..',
    '.aaawwwwaaa.',
    '.aawwwwwwaa.',
    'aaawwwwwwaaa',
    'aaawwwwwwaaa',
    'aaawwwwwwaaa',
    'aaawwwwwwaaa',
    'aaawwwwwwaaa',
    'aaawwwwwwaaa',
    'aaawwwwwwaaa',
    'aaawwwwwwaaa',
    'aaawwwwwwaaa',
    'aaawwwwwwaaa',
    'aaaaaaaaaaaa',
    '............',
  ];
  T.altar = [
    '............', '............', '............', '............',
    '....wwww....',
    '...wwwwww...',
    '....wwww....',
    '.....aa.....',
    '..aaaaaaaa..',
    '..aaaaaaaa..',
    '...aaaaaa...',
    '...aaaaaa...',
    '...aaaaaa...',
    '..aaaaaaaa..',
    '.aaaaaaaaaa.',
    '............',
  ];
  T.seal = [
    '............', '............', '............', '............', '............', '............', '............', '............',
    '...aaaaaa...',
    '..aawwwwaa..',
    '.aaw.ww.waa.',
    '.aaww..wwaa.',
    '.aaw.ww.waa.',
    '..aawwwwaa..',
    '...aaaaaa...',
    '............',
  ];
  T.coffin = [
    '............', '............', '............', '............',
    '....aaaa....',
    '...aaaaaa...',
    '..aaaaaaaa..',
    '..aabbbbaa..',
    '..aaaaaaaa..',
    '..aaaaaaaa..',
    '..aaaaaaaa..',
    '...aaaaaa...',
    '...aaaaaa...',
    '...aaaaaa...',
    '....aaaa....',
    '............',
  ];
  T.torch = [
    '............', '............', '............',
    '.....ww.....',
    '....wwww....',
    '....wkkw....',
    '.....kk.....',
    '.....aa.....',
    '.....aa.....',
    '.....aa.....',
    '.....aa.....',
    '.....aa.....',
    '.....aa.....',
    '....bbbb....',
    '....bbbb....',
    '............',
  ];
  T.trap = [
    '............', '............', '............', '............', '............', '............', '............', '............', '............', '............',
    '............',
    '...a.aa.a...',
    '..aakkkkaa..',
    '...aaaaaa...',
    '............',
    '............',
  ];
  T.totem = [
    '............', '............',
    '....aaaa....',
    '...aakkaa...',
    '...aaaaaa...',
    '....wwww....',
    '...wwwwww...',
    '..wwwwwwww..',
    '..wwkwwkww..',
    '..wwwwwwww..',
    '...wwwwww...',
    '....bbbb....',
    '....bbbb....',
    '...bbbbbb...',
    '..bbbbbbbb..',
    '............',
  ];
  T.corpse = [
    '............', '............', '............', '............', '............', '............', '............', '............', '............', '............',
    '............',
    '..aaaaa.....',
    '.aakaaaaaa..',
    '.aaaaaaaaaa.',
    '..a..a..aa..',
    '............',
  ];
  T.barrel = [
    '............', '............', '............', '............', '............',
    '...aaaaaa...',
    '..aaaaaaaa..',
    '..abbbbbba..',
    '..aaaaaaaa..',
    '..aaaaaaaa..',
    '..abbbbbba..',
    '..aaaaaaaa..',
    '..aaaaaaaa..',
    '...aaaaaa...',
    '............',
    '............',
  ];
  T.gold = ['....', '.ww.', 'wkkw', 'wkkw', '.ww.', '....'];
  T.potion = ['.ww.', '.ww.', 'waaw', 'waaw', 'waaw', '.ww.'];
  T.relic = ['.ww.', 'wkkw', 'wkkw', 'wkkw', '.ww.', '....'];
  T.equip = ['...w', '..ww', '.ww.', 'kw..', 'kk..', '....'];
  T.key = ['.ww.', 'w..w', '.ww.', '.w..', '.ww.', '.w..'];
  T.bomb = ['..k.', '.ww.', 'wwww', 'wwww', 'wwww', '.ww.'];
  T.soul = ['.ww.', 'wwww', 'wkkw', 'wkkw', 'wwww', '.ww.'];

  // ───── 무기 (오른쪽 방향 기준, 손잡이 왼쪽)
  const W = {
    sword:  ['..w..', '..w..', '..w..', '..w..', '.kkk.', '..b..'],
    greatsword: ['...ww', '...ww', '...ww', '...ww', '...ww', '..kkkk', '...b.'],
    mace:   ['.www.', 'wwwww', '.www.', '..b..', '..b..', '..b..'],
    bow:    ['...w.', '..w..', '.w...', '..w..', '...w.', '.....'],
    staff:  ['.kk..', 'kwwk.', '.kk..', '..b..', '..b..', '..b..'],
    dagger: ['..w..', '..w..', '.kkk.', '..b..', '.....', '.....'],
    axe:    ['.www.', 'wwww.', '.wwb.', '...b.', '...b.', '...b.'],
    bone:   ['.w...', 'ww...', '.wb..', '..b..', '...b.', '....k'],
    gun:    ['.....', 'kkkkk', 'kkkk.', '.b...', '.b...', '.....'],
    claw:   ['w.w.w', '.w.w.', '..k..', '..b..', '.....', '.....'],
    orb:    ['.www.', 'wwwww', 'wwwww', '.www.', '..b..', '..b..'],
  };

  // ───── 스프라이트 정의: key → { t: 템플릿, pal, w: 무기, size }
  const D = {};
  const skin = { f: '#d8b89a', k: '#1a1012' };
  D.knight =    { t: 'heavy', pal: { h: '#8a8f9a', a: '#5a6270', b: '#3a3f48', o: '#2a2a30', ...skin }, w: 'sword' };
  D.priest =    { t: 'robed', pal: { h: '#e8dcc0', a: '#cfc3a8', b: '#9a8f78', o: '#5a5040', ...skin }, w: 'staff' };
  D.archer =    { t: 'hooded', pal: { h: '#3f5a3a', o: '#2a2a20', ...skin }, w: 'bow' };
  D.mage =      { t: 'robed', pal: { h: '#4a3a7a', a: '#3a2a6a', b: '#2a1a4a', o: '#1a1030', ...skin }, w: 'orb' };
  D.rogue =     { t: 'hooded', pal: { h: '#2a2a32', o: '#151518', ...skin }, w: 'dagger' };
  D.berserker = { t: 'heavy', pal: { h: '#7a3a2a', a: '#8a4a3a', b: '#4a2a20', o: '#2a1a14', ...skin }, w: 'axe' };
  D.paladin =   { t: 'heavy', pal: { h: '#c8b070', a: '#d8c890', b: '#8a7a50', o: '#4a4030', ...skin }, w: 'mace' };
  D.necro =     { t: 'robed', pal: { h: '#2a3a2a', a: '#1e2a1e', b: '#141a14', o: '#0a0f0a', f: '#b8c8b0', k: '#70ff70' }, w: 'bone' };
  D.gunner =    { t: 'human', pal: { h: '#5a3a2a', a: '#6a4a3a', b: '#3a2a20', o: '#2a1a14', ...skin }, w: 'gun' };
  D.druid =     { t: 'hooded', pal: { h: '#4a6a2a', o: '#2a3a1a', ...skin }, w: 'claw' };
  D.druidBear = { t: 'beast', pal: { h: '#5a3a20', a: '#4a3018', b: '#3a2010', o: '#2a1808', k: '#ffd080' }, big: 1.4 };
  D.druidWolf = { t: 'beast', pal: { h: '#8a8a90', a: '#6a6a70', b: '#4a4a50', o: '#2a2a30', k: '#ffd040' } };
  D.druidCrow = { t: 'float', pal: { h: '#1a1a22', k: '#ffd040' } };
  D.ghost =     { t: 'float', pal: { h: '#9ab0c8', k: '#ffffff' } };

  const ash = { f: '#9a8a7a', k: '#ff6040' };
  D.soldier =   { t: 'human', pal: { h: '#4a4a4a', a: '#5a5048', b: '#3a3430', o: '#222', ...ash }, w: 'sword' };
  D.archerE =   { t: 'hooded', pal: { h: '#4a4040', o: '#222', ...ash }, w: 'bow' };
  D.shieldE =   { t: 'heavy', pal: { h: '#5a5a5a', a: '#6a6a66', b: '#3a3a3a', o: '#222', ...ash }, w: 'sword' };
  D.dog =       { t: 'beast', pal: { h: '#6a5a4a', a: '#5a4a3a', b: '#3a3020', o: '#2a2010', k: '#ff6040' }, big: 0.85 };
  D.oiler =     { t: 'human', pal: { h: '#3a3a3a', a: '#2a2a2a', b: '#1a1a1a', o: '#111', ...ash } };
  D.ram =       { t: 'heavy', pal: { h: '#6a5a4a', a: '#7a6a5a', b: '#4a3a2a', o: '#2a2010', f: '#5a4a3a', k: '#ff8040' }, big: 1.5 };
  D.turret =    { t: 'turret', pal: { a: '#6a6a6a', b: '#4a4a48', w: '#8a7a5a', k: '#ff6040' }, big: 1.3 };
  D.rioter =    { t: 'human', pal: { h: '#6a4a3a', a: '#7a5a4a', b: '#4a3a2a', o: '#222', ...ash }, w: 'dagger' };
  D.burner =    { t: 'hooded', pal: { h: '#6a2a1a', o: '#2a1010', f: '#9a8a7a', k: '#ffb040' }, w: 'staff' };
  D.skeleton =  { t: 'human', pal: { h: '#e8e0d0', a: '#c8c0b0', b: '#b8b0a0', o: '#888', f: '#e8e0d0', k: '#000' }, w: 'sword' };
  D.wraith =    { t: 'float', pal: { h: '#6a7a9a', k: '#c0ffff' } };
  D.monk =      { t: 'robed', pal: { h: '#3a3a4a', a: '#4a4a5a', b: '#2a2a3a', o: '#1a1a2a', f: '#b0b0c0', k: '#ffe080' }, w: 'staff' };
  D.spider =    { t: 'spider', pal: { a: '#2a2a2a', b: '#1a1a1a', k: '#ff4040' } };
  D.boneGiant = { t: 'heavy', pal: { h: '#d8d0c0', a: '#c0b8a8', b: '#a09888', o: '#706858', f: '#d8d0c0', k: '#000' }, big: 2.2 };
  D.rats =      { t: 'small', pal: { a: '#5a5a5a', b: '#3a3a3a', o: '#2a2a2a', k: '#ff4040' } };
  D.tentacle =  { t: 'tentacle', pal: { a: '#3a2a5a', k: '#c080ff' }, big: 1.4 };
  D.watcher =   { t: 'eye', pal: { a: '#3a2a4a', w: '#e8e0f0', k: '#ff3060' }, big: 1.3 };
  D.mirror =    { t: 'human', pal: { h: '#1a1a2a', a: '#1a1a2a', b: '#101018', o: '#0a0a10', f: '#1a1a2a', k: '#ff40a0' }, w: 'sword' };
  D.hound =     { t: 'beast', pal: { h: '#2a1a3a', a: '#1a1028', b: '#100818', o: '#080410', k: '#c040ff' } };
  D.corrupted = { t: 'heavy', pal: { h: '#3a2a4a', a: '#4a3a5a', b: '#2a1a3a', o: '#1a1020', f: '#5a4a6a', k: '#ff40a0' }, w: 'greatsword', big: 1.2 };
  D.maw =       { t: 'maw', pal: { a: '#2a1a3a', w: '#e8e0f0', k: '#ff3060' }, big: 1.6 };
  D.mimic =     { t: 'mimic', pal: { a: '#7a5a3a', b: '#4a3a2a', w: '#f0e8d8', k: '#ff4040' }, big: 1.2 };
  D.grad =      { t: 'heavy', pal: { h: '#4a4a5a', a: '#5a5a6a', b: '#3a3a4a', o: '#222', f: '#3a3a4a', k: '#ff6040' }, w: 'greatsword', big: 2.8 };
  D.elun =      { t: 'robed', pal: { h: '#2a2a3a', a: '#3a3a4a', b: '#2a2a3a', o: '#1a1a2a', f: '#c0c0d0', k: '#80ffe0' }, w: 'staff', big: 2.0 };
  D.eye =       { t: 'eye', pal: { a: '#2a1a3a', w: '#f0e8ff', k: '#ff2050' }, big: 3.2 };
  D.lord =      { t: 'heavy', pal: { h: '#1a0a1a', a: '#2a1a2a', b: '#1a0a14', o: '#0a0408', f: '#2a1a2a', k: '#ff2060' }, w: 'greatsword', big: 3.4 };
  D.skelMinion ={ t: 'human', pal: { h: '#c8c0b0', a: '#b0a898', b: '#a09888', o: '#777', f: '#c8c0b0', k: '#70ff70' }, w: 'sword', big: 0.9 };
  D.decoy =     { t: 'hooded', pal: { h: '#2a2a32', o: '#151518', f: '#1a1012', k: '#1a1012' } };

  D.chest =       { t: 'chest', pal: { a: '#7a5a3a', b: '#4a3a2a', k: '#e0b050' } };
  D.chestLocked = { t: 'chest', pal: { a: '#5a4a5a', b: '#3a2a3a', k: '#c0c0d0' } };
  D.chestOpen =   { t: 'chest', pal: { a: '#4a3a2a', b: '#2a1a10', k: '#2a1a10' } };
  D.exit =        { t: 'exit', pal: { a: '#5a4a6a', w: '#c0a0ff' } };
  D.altar =       { t: 'altar', pal: { a: '#3a3a4a', w: '#80ffe0' } };
  D.altarOff =    { t: 'altar', pal: { a: '#3a3a4a', w: '#2a2a3a' } };
  D.seal =        { t: 'seal', pal: { a: '#4a3a5a', w: '#c080ff' } };
  D.sealOn =      { t: 'seal', pal: { a: '#4a3a5a', w: '#ffffff' } };
  D.bones =       { t: 'bones', pal: { w: '#e8e0d0' } };
  D.coffin =      { t: 'coffin', pal: { a: '#3a3a4a', b: '#5a5a6a' } };
  D.torch =       { t: 'torch', pal: { w: '#ffd060', k: '#ff7020', a: '#5a3a20', b: '#3a3a3a' } };
  D.trap =        { t: 'trap', pal: { a: '#3a3a3a', k: '#70c060' } };
  D.totem =       { t: 'totem', pal: { a: '#5a5a5a', w: '#7a6a4a', b: '#4a3a2a', k: '#ff6040' } };
  D.corpse =      { t: 'corpse', pal: { a: '#4a4040', k: '#000' } };
  D.corpseP =     { t: 'corpse', pal: { a: '#6a6a7a', k: '#80e0ff' } };
  D.barrel =      { t: 'barrel', pal: { a: '#5a4a3a', b: '#2a2a2a' } };
  D.station =     { t: 'altar', pal: { a: '#4a4030', w: '#e0b050' } };
  D.npc =         { t: 'human', pal: { h: '#6a5a4a', a: '#4a4a4a', b: '#3a3a3a', o: '#222', f: '#d8b89a', k: '#1a1012' } };

  // 픽업 (작은 것)
  const PK = {
    gold: { t: 'gold', pal: { w: '#ffd36b', k: '#c08020' } },
    potion: { t: 'potion', pal: { w: '#c0c0d0', a: '#ff4060' } },
    relic: { t: 'relic', pal: { w: '#c77dff', k: '#ffffff' } },
    equip: { t: 'equip', pal: { w: '#d0d0e0', k: '#6a4a2a' } },
    key: { t: 'key', pal: { w: '#e0b050' } },
    bomb: { t: 'bomb', pal: { w: '#2a2a2a', k: '#ff8040' } },
    soul: { t: 'soul', pal: { w: '#80e0ff', k: '#ffffff' } },
  };

  // ───── 베이크
  function bake(rows, pal, flip, white, bob) {
    const h = rows.length, w = Math.max(...rows.map(r => r.length));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    const legRows = bob ? h - 5 : -1;
    for (let j = 0; j < h; j++) {
      const row = rows[j];
      for (let i = 0; i < row.length; i++) {
        const ch = row[i]; if (ch === '.' || ch === ' ') continue;
        const col = white ? '#ffffff' : (pal[ch] || '#ff00ff');
        x.fillStyle = col;
        let px = flip ? w - 1 - i : i, py = j;
        // 걷기 프레임: 다리 행을 좌우 교차로 1픽셀 어긋나게
        if (bob && j >= legRows && j < h - 1) { if (i < w / 2) py = Math.min(h - 1, j + (j % 2)); else py = Math.max(legRows, j - (j % 2)); }
        x.fillRect(px, py, 1, 1);
      }
    }
    return c;
  }
  S.ch = {}; S.pk = {}; S.wp = {};
  S.init = function () {
    for (const k in D) {
      const d = D[k], rows = T[d.t];
      const s = { w: rows[0].length, h: rows.length, big: d.big || 1, weapon: d.w || null };
      s.r = [bake(rows, d.pal, false, false, false), bake(rows, d.pal, false, false, true)];
      s.l = [bake(rows, d.pal, true, false, false), bake(rows, d.pal, true, false, true)];
      s.wr = bake(rows, d.pal, false, true); s.wl = bake(rows, d.pal, true, true);
      S.ch[k] = s;
    }
    for (const k in PK) { const d = PK[k]; S.pk[k] = bake(T[d.t], d.pal, false); }
    for (const k in W) { S.wp[k] = bake(W[k], { w: '#d8d8e0', k: '#8a7a5a', b: '#5a4a3a' }, false); }
    // 글꼴: 캔버스 기본 폰트 사용 (픽셀 느낌은 작은 크기 + 정수 좌표로)
  };
  S.get = k => S.ch[k] || S.ch.soldier;
  return S;
})();
