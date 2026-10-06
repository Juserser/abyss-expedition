// 적 데이터 — ai 종류는 sim/enemyai.js 에 구현
// hp/atk 는 3인 기준 기본값(심연 1단계). r 은 반지름(px). spd 타일/초.
G.ENEMIES = {
  // 공용
  soldier:   { name: '잿더미 병사', hp: 60, atk: 9, spd: 3.2, r: 6, ai: 'melee', region: 0, xp: 1, sprite: 'soldier', desc: '느린 3연타. 기본 잡몹.', p: { wind: 0.5, hits: 3 } },
  archerE:   { name: '잿더미 궁병', hp: 40, atk: 10, spd: 3.0, r: 6, ai: 'ranged', region: 0, xp: 1, sprite: 'archerE', desc: '거리 유지, 예고선 후 발사. 힐러를 노린다.', p: { min: 90, max: 150, wind: 0.7, cd: 2.2, pref: 'heal' } },
  shieldE:   { name: '잿더미 방패병', hp: 90, atk: 8, spd: 2.6, r: 7, ai: 'melee', region: 0, xp: 2, sprite: 'shieldE', desc: '정면 피해 면역. 뒤를 치거나 도발로 돌린다.', p: { wind: 0.6, hits: 1, front: true } },
  // 지역 1 잿빛 성벽
  dog:       { name: '들개', hp: 28, atk: 7, spd: 5.6, r: 5, ai: 'pack', region: 1, xp: 1, sprite: 'dog', desc: '3마리 세트, 한 명을 집중 공격.', p: { wind: 0.3, group: 3 } },
  oiler:     { name: '기름 운반꾼', hp: 50, atk: 6, spd: 3.4, r: 6, ai: 'melee', region: 1, xp: 1, sprite: 'oiler', desc: '죽으면 기름 장판. 불과 만나면 폭발.', p: { wind: 0.5, hits: 1, onDeath: 'oil' } },
  ram:       { name: '파괴 공성추', hp: 140, atk: 16, spd: 2.4, r: 9, ai: 'charger', region: 1, xp: 3, sprite: 'ram', desc: '직선 돌진. 구르기 연습.', p: { wind: 1.0, dashSpd: 11, dashLen: 160, cd: 3 } },
  turret:    { name: '성벽 석궁탑', hp: 110, atk: 14, spd: 0, r: 8, ai: 'turret', region: 1, xp: 2, sprite: 'turret', desc: '고정, 광역 예고 포격.', p: { wind: 1.2, cd: 2.8, radius: 30, range: 200 } },
  rioter:    { name: '폭도', hp: 45, atk: 8, spd: 4.2, r: 6, ai: 'coward', region: 1, xp: 1, sprite: 'rioter', desc: '체력 낮으면 도망가 동료를 데려온다.', p: { wind: 0.45, hits: 2, flee: 0.3, callAfter: 3, call: ['soldier', 'soldier'] } },
  burner:    { name: '화형집행관', hp: 70, atk: 11, spd: 3.0, r: 7, ai: 'ranged', region: 1, xp: 2, sprite: 'burner', desc: '불 투척, 불 장판.', p: { min: 70, max: 130, wind: 0.8, cd: 2.6, elem: 'fire', zone: 'fire', projSpd: 110 } },
  // 지역 2 지하 묘지
  skeleton:  { name: '해골 검사', hp: 55, atk: 10, spd: 3.6, r: 6, ai: 'melee', region: 2, xp: 1, sprite: 'skeleton', tags: ['undead'], desc: '쓰러진 뒤 10초 후 재조립. 뼈를 밟아 부수면 방지.', p: { wind: 0.45, hits: 2, bones: 10 } },
  wraith:    { name: '망령', hp: 48, atk: 9, spd: 3.8, r: 6, ai: 'phaser', region: 2, xp: 2, sprite: 'wraith', tags: ['undead', 'holyweak'], desc: '벽 통과, 공격으로 체력 흡수. 성광에 2배 피해.', p: { wind: 0.5, drain: 0.5 } },
  monk:      { name: '촛불 수도사', hp: 60, atk: 5, spd: 2.8, r: 6, ai: 'support', region: 2, xp: 2, sprite: 'monk', tags: ['undead'], desc: '아군 적에게 보호막. 우선 처치.', p: { cd: 5, shield: 25, min: 80 } },
  spider:    { name: '관 거미', hp: 36, atk: 8, spd: 4.8, r: 5, ai: 'melee', region: 2, xp: 1, sprite: 'spider', desc: '관에서 튀어나옴, 독.', p: { wind: 0.35, hits: 1, elem: 'poison' } },
  boneGiant: { name: '뼈 거인', hp: 260, atk: 20, spd: 2.0, r: 12, ai: 'slammer', region: 2, xp: 4, sprite: 'boneGiant', tags: ['undead', 'heavy'], desc: '느림, 대지 강타. 빙결 분쇄에 약함.', p: { wind: 1.1, cd: 2.5, radius: 44, shatterWeak: true } },
  rats:      { name: '역병 쥐떼', hp: 12, atk: 4, spd: 5.2, r: 4, ai: 'pack', region: 2, xp: 0.3, sprite: 'rats', desc: '다수·약함. 광역으로 처리.', p: { wind: 0.25, group: 6, elem: 'poison' } },
  // 지역 3 심연
  tentacle:  { name: '심연 촉수', hp: 90, atk: 6, spd: 0, r: 8, ai: 'grabber', region: 3, xp: 2, sprite: 'tentacle', desc: '바닥에서 솟아 붙잡는다. 아군이 때려서 구출.', p: { wind: 0.8, range: 40, holdDps: 8 } },
  watcher:   { name: '눈알 감시자', hp: 75, atk: 18, spd: 2.2, r: 8, ai: 'laser', region: 3, xp: 3, sprite: 'watcher', desc: '시선 빔 예고 후 직선 레이저.', p: { min: 100, max: 180, wind: 1.1, cd: 3.2, len: 220, beam: 0.6 } },
  mirror:    { name: '그림자 분신', hp: 80, atk: 12, spd: 4.8, r: 6, ai: 'mirror', region: 3, xp: 3, sprite: 'mirror', desc: '플레이어 한 명을 복제. 그 직업처럼 싸운다.', p: {} },
  hound:     { name: '공허 사냥개', hp: 58, atk: 13, spd: 5.0, r: 6, ai: 'blinker', region: 3, xp: 2, sprite: 'hound', desc: '순간이동 뒤 배후 공격. 서로 등을 봐줘라.', p: { wind: 0.4, cd: 3.5 } },
  corrupted: { name: '잠식된 기사', hp: 180, atk: 17, spd: 2.8, r: 8, ai: 'melee', region: 3, xp: 4, sprite: 'corrupted', tags: ['heavy'], desc: '지역 1 보스의 축소판. 정면 무적.', p: { wind: 0.7, hits: 2, front: true } },
  maw:       { name: '심연의 입', hp: 150, atk: 15, spd: 0, r: 11, ai: 'puller', region: 3, xp: 3, sprite: 'maw', desc: '고정, 끌어당김. 범위 안에서 구르기 불가.', p: { range: 90, pull: 40, biteWind: 0.6, biteR: 22, cd: 2 } },
  // 소환물·기타
  skelMinion:{ name: '해골 졸개', hp: 30, atk: 6, spd: 3.6, r: 5, ai: 'melee', region: -1, xp: 0, sprite: 'skeleton', tags: ['undead'], desc: '', p: { wind: 0.4, hits: 1 } },
  mimic:     { name: '미믹', hp: 120, atk: 14, spd: 4.0, r: 8, ai: 'melee', region: -1, xp: 3, sprite: 'mimic', desc: '상자인 척하는 놈.', p: { wind: 0.4, hits: 2 } },
  echoGrad:  { name: '그라드의 환영', hp: 400, atk: 16, spd: 2.6, r: 11, ai: 'melee', region: -1, xp: 5, sprite: 'grad', tags: ['heavy'], desc: '', p: { wind: 0.7, hits: 2, front: true } },
  echoElun:  { name: '엘른의 환영', hp: 300, atk: 12, spd: 2.8, r: 8, ai: 'summoner', region: -1, xp: 5, sprite: 'elun', tags: ['undead'], desc: '', p: { cd: 5, min: 90, summon: ['skelMinion', 'skelMinion'], max: 4 } },
  echoEye:   { name: '눈의 환영', hp: 300, atk: 20, spd: 1.8, r: 10, ai: 'laser', region: -1, xp: 5, sprite: 'eye', desc: '', p: { min: 100, max: 200, wind: 1.0, cd: 3, len: 260, beam: 0.7 } },
};

// 정예 접두어
G.AFFIXES = {
  burning:  { name: '불타는', desc: '불 장판을 남긴다', color: '#ff7a2e' },
  frost:    { name: '서리의', desc: '공격 시 둔화', color: '#8fd8ff' },
  giant:    { name: '거대한', desc: '체력 2.5배, 넉백 면역', color: '#e0b050' },
  vampiric: { name: '흡혈의', desc: '피해의 50% 회복', color: '#c0304a' },
  splitting:{ name: '분열하는', desc: '죽으면 2마리', color: '#a0d070' },
  warding:  { name: '결계의', desc: '주변 적 보호막', color: '#c77dff' },
  frenzied: { name: '폭주하는', desc: '체력 30% 이하 공속 2배', color: '#ff4d4d' },
  plague:   { name: '역병의', desc: '공격 시 중독', color: '#70c060' },
  mirrorA:  { name: '반사의', desc: '원거리 투사체 반사 (근접으로)', color: '#dfe6ff' },
  shadow:   { name: '그림자', desc: '주기적으로 은신', color: '#6a5a8a' },
};
G.AFFIX_ORDER = ['burning', 'frost', 'giant', 'vampiric', 'splitting', 'warding', 'frenzied', 'plague', 'mirrorA', 'shadow'];

// 지역 정의
G.REGIONS = [
  { id: 1, name: '잿빛 성벽', music: 'r1', boss: 'grad', pool: ['soldier', 'archerE', 'shieldE', 'dog', 'oiler', 'ram', 'turret', 'rioter', 'burner'], hazards: ['oil', 'oil', 'water'], floor: '#2a2622', wall: '#4a403a', accent: '#6a3a2a', desc: '무너진 성문과 불탄 가옥. 재가 날린다.' },
  { id: 2, name: '지하 묘지', music: 'r2', boss: 'elun', pool: ['soldier', 'archerE', 'skeleton', 'wraith', 'monk', 'spider', 'boneGiant', 'rats'], hazards: ['water', 'water', 'coffin'], floor: '#1c1e2a', wall: '#2e3450', accent: '#3a5a7a', desc: '검푸른 납골당. 촛불이 흔들린다.' },
  { id: 3, name: '심연', music: 'r3', boss: 'eye', pool: ['shieldE', 'tentacle', 'watcher', 'mirror', 'hound', 'corrupted', 'maw', 'wraith'], hazards: ['dark', 'dark', 'oil'], floor: '#17121f', wall: '#2c1f3a', accent: '#5a2a7a', desc: '보라와 검정. 시야가 좁다.' },
  { id: 4, name: '왕좌의 방', music: 'final', boss: 'lord', pool: ['corrupted', 'hound', 'watcher', 'soldier'], hazards: ['dark'], floor: '#1a1016', wall: '#3a1a2a', accent: '#7a2a3a', desc: '심연의 군주가 기다린다.' },
];
