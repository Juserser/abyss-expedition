// 메타: 길드 시설, 특성, 저주, 주간 도전, 상, 업적, NPC 대사
G.META = (function () {
  const M = {};

  M.FACILITIES = {
    tavern:   { name: '술집', npc: '반쪽 귀 그레타', icon: '🍺', desc: '원정 출발, 심연 단계·저주, 주간 도전, 보스 러시', lv: ['원정 출발', '일일 퀘스트 3개 · 시작 금화 +30', '보스 러시 · 시작 물약 +1', '무한 심연 · 시작 금화 +60'] },
    forge:    { name: '대장간', npc: '벙어리 올랑', icon: '⚒️', desc: '혼석으로 장비 제작·강화·분해', lv: ['제작 · 강화 +2', '강화 +4 · 영웅 제작', '강화 +5 · 전설 제작', '강화 비용 -30%'] },
    storage:  { name: '창고', npc: null, icon: '📦', desc: '공용 장비 보관', lv: ['12칸', '24칸', '40칸', '60칸'] },
    training: { name: '훈련장', npc: '교관 하스', icon: '🏋️', desc: '직업 특성, 허수아비', lv: ['특성 2갈래', '특성 3갈래 · 재설정 무료', '특성 포인트 +2', '시작 사기 +25'] },
    hall:     { name: '전당', npc: null, icon: '🏛️', desc: '트로피·기록·스냅샷', lv: ['기록', '칭호 · 파티 체력 +3%', '파티 체력 +6%', '파티 방어 +4%'] },
    grave:    { name: '묘지', npc: '묘지기 발터', icon: '⚰️', desc: '전멸 비석, 강령술사 해금', lv: ['비석', '강령술사 해금 · 부활 채널 -10%', '다운 출혈 타이머 +10초', '런당 유령 응원 2배'] },
    library:  { name: '도서관', npc: null, icon: '📚', desc: '도감', lv: ['도감', '도감 10%마다 행운 +1%', '적 정보 표시', '금화 +10%'] },
  };
  M.STORAGE_CAP = [12, 24, 40, 60];
  M.FAC_ORDER = ['tavern', 'forge', 'storage', 'training', 'hall', 'grave', 'library'];

  // 길드 버프 합산 (캡 30%)
  M.guildBuffs = function (g) {
    const b = { hp: 0, def: 0, gold: 0, startGold: 0, startPotion: 0, startMorale: 0, reviveSpd: 0, downTimer: 0, luck: 0 };
    const f = g.fac;
    if (f.tavern >= 2) b.startGold += 30; if (f.tavern >= 3) b.startPotion += 1; if (f.tavern >= 4) b.startGold += 60;
    if (f.training >= 4) b.startMorale += 25;
    if (f.hall >= 2) b.hp += 0.03; if (f.hall >= 3) b.hp += 0.03; if (f.hall >= 4) b.def += 0.04;
    if (f.grave >= 2) b.reviveSpd += 0.1; if (f.grave >= 3) b.downTimer += 10;
    if (f.library >= 4) b.gold += 0.1;
    if (f.library >= 2) { const c = M.codexPct(g); b.luck += Math.floor(c * 10) * 0.01; }
    for (const k of ['hp', 'def', 'gold', 'luck']) b[k] = Math.min(G.C.GUILD_BUFF_CAP, b[k]);
    return b;
  };
  M.codexPct = function (g) {
    const tot = Object.keys(G.ENEMIES).filter(k => G.ENEMIES[k].region >= 0).length + G.RELICS.length + G.EVENTS.length + 4;
    const got = Object.keys(g.codex.enemies).length + Object.keys(g.codex.relics).length + Object.keys(g.codex.events).length + Object.keys(g.codex.bosses).length;
    return Math.min(1, got / tot);
  };

  // 특성: 직업당 3갈래 × 5단계 (한 갈래 안에서 순서대로 찍음)
  const T = (name, desc, mods, flag) => ({ name, desc, mods: mods || {}, flag });
  M.TALENTS = {
    knight: [
      { name: '철벽', t: [T('두꺼운 갑옷', '방어 +3%', { def: 0.03 }), T('강철 체력', '체력 +5%', { hp: 0.05 }), T('방패 숙련', '방패 올리기 감소 +5%', {}, 'shield85'), T('불굴', '체력 +6%', { hp: 0.06 }), T('성벽', '방어 +5%, 넉백 면역', { def: 0.05 }, 'noKnock')] },
      { name: '반격', t: [T('날카로운 검', '공격력 +4%', { atk: 0.04 }), T('반격 저장', '반격 저장 최대 150%', {}, 'counter150'), T('공격 속도', '공속 +6%', { aspd: 0.06 }), T('처벌', '도발된 적 피해 +10%', {}, 'tauntDmg10'), T('심판의 검', '공격력 +8%', { atk: 0.08 })] },
      { name: '지휘', t: [T('독려', '사기 충전 +8%', { morale: 0.08 }), T('넓은 도발', '도발 반경 +1타일', {}, 'tauntRange'), T('지휘관', '2타일 내 아군 방어 +4%', {}, 'cmdAura'), T('빠른 도발', '도발 쿨 -20%', {}, 'tauntCd'), T('철벽 지휘', '철벽 중 아군 사기 +20', {}, 'wallMorale')] },
    ],
    priest: [
      { name: '치유', t: [T('온화한 손', '치유 +5%', { heal: 0.05 }), T('넓은 파동', '파동 반경 +1타일', {}, 'waveRange'), T('기도 숙련', '치유 +7%', { heal: 0.07 }), T('빠른 기도', '쿨감 +5%', { cdr: 0.05 }), T('축복', '치유 +10%', { heal: 0.1 })] },
      { name: '성광', t: [T('빛의 힘', '공격력 +5%', { atk: 0.05 }), T('유도 강화', '성광 유도 강화', {}, 'homing2'), T('관통 성광', '성광이 1회 관통', {}, 'orbPierce'), T('정화의 빛', '공격력 +7%', { atk: 0.07 }), T('천벌', '언데드 피해 +50%', {}, 'smite50')] },
      { name: '수호', t: [T('튼튼함', '체력 +5%', { hp: 0.05 }), T('빠른 부활', '부활 채널 -10%', { reviveSpd: 0.1 }), T('보호막 숙련', '보호막 +25%', {}, 'shield25'), T('결계 강화', '결계 지속 +2초', {}, 'wardLong'), T('천사', '부활 시 대상 3초 무적', {}, 'reviveInv3')] },
    ],
    archer: [
      { name: '저격', t: [T('정확', '치명 +3%', { crit: 0.03 }), T('먼 거리', '저격수 보너스 +10%', {}, 'sniper10'), T('급소', '치명 피해 +20%', { critDmg: 0.2 }), T('안정', '공격력 +6%', { atk: 0.06 }), T('일격', '풀차지 피해 +30%', {}, 'fullCharge30')] },
      { name: '속사', t: [T('빠른 손', '공속 +5%', { aspd: 0.05 }), T('연사 강화', '연속 사격 +2발', {}, 'volleyPlus2'), T('활 숙련', '공속 +7%', { aspd: 0.07 }), T('화살통', '쿨감 +6%', { cdr: 0.06 }), T('폭풍', '연속 사격 쿨 -30%', {}, 'volleyCd')] },
      { name: '추적', t: [T('표식 연장', '표식 +2초', {}, 'markPlus2'), T('발놀림', '이동 +5%', { spd: 0.05 }), T('약점 노출', '표식 피해 +5%', {}, 'mark30'), T('사냥꾼', '표식 적 처치 시 사기 +10', {}, 'markKillMorale'), T('추적자', '표식 쿨 -30%', {}, 'markCd')] },
    ],
    mage: [
      { name: '화염', t: [T('뜨거운 불', '불 피해 +10%', {}, 'fire10'), T('넓은 화염구', '화염구 반경 +20%', {}, 'fbRange20'), T('연소', '불 장판 지속 +1초', {}, 'fireLong1'), T('마력', '공격력 +7%', { atk: 0.07 }), T('지옥불', '불 피해 +20%', {}, 'fire20')] },
      { name: '서리', t: [T('찬 바람', '빙결 +0.5초', {}, 'freeze05'), T('서리 갑옷', '방어 +4%', { def: 0.04 }), T('깊은 서리', '서리 파동 반경 +20%', {}, 'novaRange'), T('냉기', '쿨감 +6%', { cdr: 0.06 }), T('절대 영도', '빙결 적 받는 피해 +20%', {}, 'frozenDmg')] },
      { name: '반응', t: [T('화학자', '반응 +10%', { react: 0.1 }), T('촉매', '반응 시 사기 +3', {}, 'reactMorale'), T('연금술', '반응 +15%', { react: 0.15 }), T('마나 순환', '반응 시 쿨 -0.5초', {}, 'reactCd05'), T('대폭발', '폭발 반응 반경 +30%', {}, 'explodeRange')] },
    ],
    rogue: [
      { name: '암살', t: [T('날카로움', '치명 +4%', { crit: 0.04 }), T('배후', '배후 피해 +15%', {}, 'back15'), T('치명 숙련', '치명 피해 +25%', { critDmg: 0.25 }), T('급소', '치명 +5%', { crit: 0.05 }), T('처형', '암살 피해 +30%', {}, 'assass30')] },
      { name: '그림자', t: [T('빠른 발', '이동 +5%', { spd: 0.05 }), T('긴 은신', '은신 +0.5초', {}, 'stealth05'), T('회피', '구르기 쿨 -15%', { rollCd: -0.15 }), T('그림자 숙련', '그림자 걸음 쿨 -20%', {}, 'shadowCd'), T('암영', '은신 중 이동 +40%', {}, 'stealthSpd')] },
      { name: '도구', t: [T('독 숙련', '중독 피해 +20%', {}, 'poison20'), T('덫 숙련', '덫 피해 +30%', {}, 'trap30'), T('좋은 손', '상자 보상 +1 금화 더미', {}, 'chestBonus'), T('탐욕', '금화 +10%', { gold: 0.1 }), T('거장', '덫 저장 +1', {}, 'trapPlus1')] },
    ],
    berserker: [
      { name: '분노', t: [T('강한 팔', '공격력 +5%', { atk: 0.05 }), T('피 냄새 강화', '피 냄새 +5%', {}, 'blood5'), T('야성', '공속 +6%', { aspd: 0.06 }), T('격노', '공격력 +7%', { atk: 0.07 }), T('광기', '광란 지속 +2초', {}, 'frenzy2')] },
      { name: '생존', t: [T('질긴 가죽', '체력 +5%', { hp: 0.05 }), T('흡혈 본능', '흡혈 2%', {}, 'ls2'), T('두꺼운 피부', '방어 +4%', { def: 0.04 }), T('불굴', '체력 +8%', { hp: 0.08 }), T('죽음 거부', '런당 1회 다운 대신 체력 30%', {}, 'secondWindOnce')] },
      { name: '돌격', t: [T('긴 돌진', '돌진 +2타일', {}, 'dashLong'), T('돌진 피해', '돌진 피해 +30%', {}, 'dash30'), T('함성 숙련', '함성 쿨 -20%', {}, 'shoutCd'), T('지휘 함성', '함성 효과 +5%', {}, 'shout20'), T('전쟁광', '돌진 쿨 -30%', {}, 'dashCd')] },
    ],
  };
  // 해금 직업은 공용 특성 템플릿
  const GEN = [
    { name: '공격', t: [T('강화 I', '공격력 +4%', { atk: 0.04 }), T('속도', '공속 +5%', { aspd: 0.05 }), T('강화 II', '공격력 +6%', { atk: 0.06 }), T('치명', '치명 +4%', { crit: 0.04 }), T('강화 III', '공격력 +8%', { atk: 0.08 })] },
    { name: '생존', t: [T('체력 I', '체력 +5%', { hp: 0.05 }), T('방어', '방어 +3%', { def: 0.03 }), T('체력 II', '체력 +6%', { hp: 0.06 }), T('회피', '구르기 쿨 -15%', { rollCd: -0.15 }), T('체력 III', '체력 +8%', { hp: 0.08 })] },
    { name: '기술', t: [T('쿨감 I', '쿨감 +4%', { cdr: 0.04 }), T('사기', '사기 +8%', { morale: 0.08 }), T('쿨감 II', '쿨감 +5%', { cdr: 0.05 }), T('이동', '이동 +5%', { spd: 0.05 }), T('쿨감 III', '쿨감 +7%', { cdr: 0.07 })] },
  ];
  for (const c of ['paladin', 'necro', 'gunner', 'druid']) M.TALENTS[c] = GEN;

  // 저주 (출발 전 선택, 최대 5개)
  M.CURSES = [
    { id: 'noFireHeal', name: '차가운 재', desc: '모닥불 회복 불가', rew: 0.2 },
    { id: 'noShop', name: '폐업', desc: '상점 노드 없음', rew: 0.2 },
    { id: 'noCheer', name: '침묵의 유령', desc: '유령 응원 불가', rew: 0.2 },
    { id: 'timer', name: '모래시계', desc: '전투 노드 3분 제한, 초과 시 초당 피해', rew: 0.2 },
    { id: 'markOnly', name: '눈먼 칼', desc: '표식 없는 정예·보스 받는 피해 -40%', rew: 0.2 },
    { id: 'eliteMore', name: '정예 행렬', desc: '정예 노드 2배, 일반 전투에도 정예', rew: 0.2 },
    { id: 'lessHp', name: '허약', desc: '최대 체력 -25%', rew: 0.2 },
    { id: 'noPotion', name: '깨진 병', desc: '물약 사용 불가', rew: 0.2 },
    { id: 'fastEnemy', name: '서두르는 죽음', desc: '적 이동속도 +30%', rew: 0.2 },
    { id: 'oneRevive', name: '마지막 숨', desc: '전투당 부활 1회', rew: 0.2 },
    { id: 'noCards', name: '망각', desc: '강화 카드 2택1', rew: 0.2 },
    { id: 'darkness', name: '칠흑', desc: '시야 반경 절반', rew: 0.2 },
  ];
  M.CURSE_BY = {}; M.CURSES.forEach(c => (M.CURSE_BY[c.id] = c));

  // 주간 도전 (주차 해시로 선택)
  M.WEEKLIES = [
    { id: 'axes', name: '도끼 셋', desc: '전원 광전사. 지역 2까지', classes: ['berserker'], region: 2, curses: ['fastEnemy'] },
    { id: 'glass', name: '유리 파티', desc: '체력 -25%, 공격력 +40%', classes: null, region: 2, curses: ['lessHp'], buff: { atk: 0.4 } },
    { id: 'priests', name: '순례', desc: '전원 사제. 지역 1', classes: ['priest'], region: 1, curses: [] },
    { id: 'rush', name: '시간 제한', desc: '모래시계 + 상점 없음, 지역 3', classes: null, region: 3, curses: ['timer', 'noShop'] },
    { id: 'archers', name: '화살 폭풍', desc: '전원 궁수, 정예 행렬', classes: ['archer'], region: 2, curses: ['eliteMore'] },
    { id: 'dark', name: '칠흑의 밤', desc: '칠흑 + 침묵의 유령, 지역 3', classes: null, region: 3, curses: ['darkness', 'noCheer'] },
    { id: 'mages', name: '원소 폭주', desc: '전원 마법사, 반응 +100%', classes: ['mage'], region: 2, curses: [], buff: { react: 1 } },
    { id: 'tank', name: '철벽 행진', desc: '전원 기사, 모래시계', classes: ['knight'], region: 2, curses: ['timer'] },
  ];
  M.weekly = () => M.WEEKLIES[G.U.hashStr(G.U.weekKey()) % M.WEEKLIES.length];

  // 결과 화면 상 (stats 키, 최대값 기준, 0이면 미수여)
  M.AWARDS = [
    { id: 'mvp', icon: '👑', name: 'MVP', desc: '종합 1위' },
    { id: 'dmg', icon: '⚔️', name: '학살자', key: 'dmg', desc: '최다 피해' },
    { id: 'heal', icon: '✨', name: '구원자', key: 'heal', desc: '최다 치유' },
    { id: 'tank', icon: '🛡️', name: '방패', key: 'tank', desc: '최다 피해 흡수' },
    { id: 'grave', icon: '🪦', name: '묘비상', key: 'downs', desc: '최다 다운' },
    { id: 'greedy', icon: '💸', name: '먹튀상', key: 'goldLeft', desc: '금화 최다 보유 후 미사용' },
    { id: 'coward', icon: '🐔', name: '겁쟁이상', key: 'rolls', desc: '최다 구르기' },
    { id: 'wall', icon: '🧱', name: '벽박치기상', key: 'wallHits', desc: '벽 충돌 최다' },
    { id: 'shameless', icon: '🙈', name: '뻔뻔상', key: 'needAbuse', desc: '못 쓰는 장비에 니드' },
    { id: 'dictator', icon: '🗳️', name: '독재자상', key: 'voteWins', desc: '투표 승률 최고' },
    { id: 'fireman', icon: '🧯', name: '소방관상', key: 'fireSteps', desc: '불 장판 최다 밟기' },
    { id: 'reactor', icon: '💥', name: '화학자상', key: 'reacts', desc: '속성 반응 최다' },
    { id: 'medic', icon: '🚑', name: '구급상', key: 'revives', desc: '최다 부활' },
  ];

  M.ACHIEVEMENTS = [
    { id: 'firstRun', name: '첫 원정', desc: '원정 1회 완료', title: '신입 용병' },
    { id: 'firstBoss', name: '그라드 격파', desc: '지역 1 보스 처치', title: '성벽 돌파자' },
    { id: 'elun', name: '엘른 격파', desc: '지역 2 보스 처치', title: '묘지 청소부' },
    { id: 'eye', name: '눈 감기기', desc: '지역 3 보스 처치', title: '심연을 본 자' },
    { id: 'lord', name: '군주 처단', desc: '심연의 군주 처치', title: '왕국의 구원자' },
    { id: 'wipe5', name: '다섯 번의 죽음', desc: '전멸 5회', title: '단골 시체' },
    { id: 'depth5', name: '심연 5', desc: '심연 단계 5 클리어', title: '심연 잠수부' },
    { id: 'depth10', name: '심연 10', desc: '심연 단계 10 클리어', title: '심연의 주인' },
    { id: 'noDown', name: '무결점', desc: '아무도 다운되지 않고 보스 처치', title: '완벽주의자' },
    { id: 'react50', name: '화학 실험', desc: '한 런에 반응 50회', title: '연금술사' },
    { id: 'rush', name: '보스 러시', desc: '보스 러시 클리어', title: '보스 사냥꾼' },
    { id: 'codex50', name: '도감 절반', desc: '도감 50%', title: '학자' },
    { id: 'rich', name: '부자', desc: '한 런 금화 1000 획득', title: '졸부' },
    { id: 'duoBoss2', name: '둘이서', desc: '2인으로 지역 2 보스 처치', title: '단짝' },
  ];

  M.NPC_LINES = {
    greta: ['또 왔군. 술은 외상 안 돼.', '심연에서 돌아온 놈은 둘 중 하나야. 부자거나 시체거나.', '오늘은 몇 명이야? 둘? …알아서 해.', '깊이 갈수록 보상은 커지고, 비석도 커져.'],
    olang: ['…', '…(망치를 가리킨다)', '…(혼석을 내밀라는 손짓)'],
    walter: ['여기 묻힌 놈들 다 자네 친구들이야. 아, 자네 자신도 있군.', '마지막 한마디는 잘 골라. 비석에 새겨지니까.', '누가 먼저 죽었는지는 내가 다 기록해 둔다.'],
    hass: ['허수아비는 반격하지 않아. 심연은 반격해.', '특성은 네 실력을 못 고쳐. 조금 가려줄 뿐이지.'],
  };
  return M;
})();
