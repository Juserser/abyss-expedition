// 장비 (절차 생성) · 소모품
G.Items = (function () {
  const I = {};
  I.RARITY = ['일반', '희귀', '영웅', '전설'];
  I.RARITY_COLOR = ['#d9d2c5', '#6fa8ff', '#c77dff', '#ffb347'];
  I.SLOT_NAME = { w: '무기', a: '방어구', t: '장신구' };
  // 무기 이름 (직업별)
  const WEAPON = {
    knight: ['장검', '기사검', '성채의 검'], priest: ['성구', '기도봉', '성광 지팡이'], archer: ['단궁', '장궁', '사냥꾼의 활'],
    mage: ['지팡이', '마도서', '원소 지팡이'], rogue: ['단검', '쌍검', '암살자의 칼'], berserker: ['손도끼', '대도끼', '처형 도끼'],
    paladin: ['철퇴', '성전 망치', '심판의 철퇴'], necro: ['뼈 지팡이', '해골 지팡이', '사령 지팡이'], gunner: ['권총', '리볼버', '용병의 총'], druid: ['나무 지팡이', '발톱', '야생의 지팡이'],
  };
  const ARMOR = ['누더기 갑옷', '가죽 갑옷', '사슬 갑옷', '판금 갑옷', '잿빛 갑주', '심연의 갑주'];
  const TRINKET = ['반지', '목걸이', '부적', '귀걸이', '인장', '문장'];
  const PREFIX = ['녹슨', '단단한', '빛나는', '저주받은', '잿빛', '피묻은', '차가운', '불타는', '고요한', '군주의'];
  // 모드 풀: [키, 슬롯별 가능, 희귀도별 범위]
  const MODS = [
    { k: 'atk', slots: 'wt', rng: [[0.04, 0.08], [0.08, 0.14], [0.12, 0.2], [0.18, 0.28]], name: '공격력' },
    { k: 'hp', slots: 'at', rng: [[0.04, 0.08], [0.08, 0.14], [0.12, 0.2], [0.18, 0.28]], name: '최대 체력' },
    { k: 'def', slots: 'a', rng: [[0.02, 0.04], [0.04, 0.07], [0.06, 0.1], [0.09, 0.14]], name: '방어' },
    { k: 'spd', slots: 'at', rng: [[0.02, 0.04], [0.04, 0.07], [0.06, 0.1], [0.08, 0.14]], name: '이동속도' },
    { k: 'cdr', slots: 'wt', rng: [[0.02, 0.04], [0.04, 0.07], [0.06, 0.1], [0.08, 0.14]], name: '쿨감' },
    { k: 'crit', slots: 'wt', rng: [[0.02, 0.04], [0.04, 0.07], [0.06, 0.1], [0.08, 0.14]], name: '치명타율' },
    { k: 'aspd', slots: 'w', rng: [[0.03, 0.05], [0.05, 0.09], [0.08, 0.13], [0.12, 0.18]], name: '공격 속도' },
    { k: 'luck', slots: 't', rng: [[0.03, 0.06], [0.06, 0.1], [0.09, 0.15], [0.13, 0.2]], name: '행운' },
    { k: 'heal', slots: 'wt', rng: [[0.03, 0.06], [0.06, 0.1], [0.09, 0.15], [0.13, 0.2]], name: '치유량' },
    { k: 'morale', slots: 't', rng: [[0.03, 0.06], [0.06, 0.1], [0.09, 0.15], [0.13, 0.2]], name: '사기 충전' },
    { k: 'gold', slots: 't', rng: [[0.04, 0.08], [0.08, 0.12], [0.1, 0.16], [0.14, 0.22]], name: '금화 획득' },
  ];
  I.MOD_NAME = {}; MODS.forEach(m => (I.MOD_NAME[m.k] = m.name));
  I.MOD_NAME.react = '반응 피해'; I.MOD_NAME.range = '사거리'; I.MOD_NAME.critDmg = '치명 피해'; I.MOD_NAME.potion = '물약'; I.MOD_NAME.summon = '소환물';

  let seq = 0;
  I.gen = function (rng, opts) {
    opts = opts || {};
    const slot = opts.slot || rng.pick(['w', 'a', 't']);
    let rar = opts.rarity != null ? opts.rarity : rollRarity(rng, opts.luck || 0, opts.tier || 1);
    const cls = slot === 'w' ? (opts.cls || rng.pick(Object.keys(WEAPON))) : null;
    let base;
    if (slot === 'w') base = WEAPON[cls][Math.min(2, rar)];
    else if (slot === 'a') base = ARMOR[Math.min(5, rar + rng.int(0, 1) + (opts.tier || 1) - 1)];
    else base = TRINKET[rng.int(0, TRINKET.length - 1)];
    const name = (rar >= 1 ? rng.pick(PREFIX) + ' ' : '') + base;
    const nMods = 1 + rar + (rng.chance(0.3) ? 1 : 0);
    const pool = rng.shuffle(MODS.filter(m => m.slots.includes(slot)));
    const mods = {};
    for (let i = 0; i < Math.min(nMods, pool.length); i++) { const m = pool[i], r = m.rng[rar]; mods[m.k] = Math.round(rng.range(r[0], r[1]) * 1000) / 1000; }
    if (slot === 'w' && !mods.atk) mods.atk = Math.round(rng.range(MODS[0].rng[rar][0], MODS[0].rng[rar][1]) * 1000) / 1000;
    return { id: 'it' + Date.now().toString(36) + (seq++).toString(36) + Math.floor(rng() * 1e6).toString(36), slot, cls, rar, name, mods, up: 0, lock: '' };
  };
  function rollRarity(rng, luck, tier) {
    const w = [60, 28, 10, 2].map((v, i) => v * (i > 0 ? 1 + luck + (tier - 1) * 0.35 : 1));
    return rng.weighted([0, 1, 2, 3], i => w[i]);
  }
  I.effMods = function (it) {
    const m = {}; const k = 1 + (it.up || 0) * 0.12;
    for (const key in it.mods) m[key] = it.mods[key] * k;
    return m;
  };
  I.desc = function (it) {
    const m = I.effMods(it);
    return Object.keys(m).map(k => `${I.MOD_NAME[k] || k} +${Math.round(m[k] * 100)}%`).join(' · ');
  };
  I.label = it => `${it.name}${it.up ? ' +' + it.up : ''}`;
  I.canUse = (it, cls) => !it.cls || it.cls === cls;
  I.sellValue = it => G.C.DISMANTLE[it.rar] + Math.floor((it.up || 0) * 1.5);

  I.CONSUMABLES = {
    potion: { name: '물약', icon: '🧪', desc: '체력 40% 회복' },
    bomb: { name: '폭탄', icon: '💣', desc: '던지면 폭발 (공격력 300%) + 기름 점화' },
    key: { name: '열쇠', icon: '🗝️', desc: '잠긴 상자를 연다' },
    soulstone: { name: '영혼석', icon: '💠', desc: '사망한 아군 1명을 그 자리에서 복귀시킨다' },
    totem: { name: '용병 방패 토템', icon: '🗿', desc: '설치하면 8초간 적의 시선을 끈다 (탱커 대용)' },
  };
  return I;
})();
