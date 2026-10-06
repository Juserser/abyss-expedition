// 모든 밸런스 수치. 매직 넘버는 여기로.
window.G = window.G || {};
G.C = {
  VERSION: 1,
  PEER_PREFIX: 'abyss-exp-',
  W: 512, H: 288, TILE: 16,
  TICK: 1 / 60,
  SNAP_HZ: 20,          // 방장 → 참가자 스냅샷
  INTERP_MS: 100,       // 참가자 보간 지연
  MAX_PLAYERS: 3,
  PLAYER_COLORS: ['#ff6b5a', '#5aa0ff', '#7fcf7a'],
  PLAYER_COLOR_NAMES: ['빨강', '파랑', '초록'],

  // 플레이어 공통
  ROLL_TIME: 0.3, ROLL_CD: 1.2, ROLL_SPEED: 3.2,
  CRIT_BASE: 0.05, CRIT_DMG: 1.5,
  POTION_HEAL: 0.4, POTION_MAX: 3,
  MORALE_MAX: 100,
  MORALE: { dmg: 0.01, heal: 0.015, block: 0.02, revive: 15, react: 5 },
  ALL_IN_WINDOW: 10, ALL_IN_BONUS: 0.2, ALL_IN_DUR: 8,
  DOWN_TIMER: 30, DOWN_TIMER_2P: 45,
  REVIVE_TIME: 2.5, REVIVE_TIME_2P: 2.0, REVIVE_HP: 0.3,
  GHOST_CHEER_CD: 10, GHOST_CHEER_SPD: 0.1, GHOST_CHEER_DUR: 5,
  AIM_ASSIST_ANG: 0.35, AIM_ASSIST_RANGE: 7,

  // 인원 스케일링
  SCALE: { 1: { hp: 0.45, count: 0.55, dmg: 0.8 }, 2: { hp: 0.65, count: 0.75, dmg: 0.9 }, 3: { hp: 1, count: 1, dmg: 1 } },
  // 심연 단계
  DEPTH_HP: 0.12, DEPTH_DMG: 0.08, DEPTH_REWARD: 0.15, DEPTH_MAX: 10,
  CURSE_REWARD: 0.2,
  REGION_MULT: [1.0, 1.5, 2.5, 4.0],
  WIPE_LOSS: 0.7,

  // 런
  REGION_COLS: 7,
  NODE_WEIGHTS: { fight: 40, elite: 12, event: 18, shop: 10, fire: 10, treasure: 7, trial: 3 },
  CARD_PICK_TIME: 30, VOTE_TIME: 15, ROLL_TIME_LOOT: 10,
  SHOP_PRICES: { relic: [80, 200], potion: 30, equip: [150, 400], soulstone: 250, key: 60, bomb: 25, totem: 120 },
  ROGUE_DISCOUNT: 0.1,
  GOLD_PER_FIGHT: [40, 70], GOLD_PER_ELITE: [90, 140], GOLD_PER_BOSS: [200, 300],
  DROP_EQUIP: { elite: 0.35, boss: 1.0, treasure: 0.5 },
  ASH_PER_NODE: 3, ASH_PER_BOSS: 25, SOUL_PER_ELITE: 1, SOUL_PER_BOSS: 5,
  XP_PER_NODE: 20, XP_PER_BOSS: 80,
  WAVES_FIGHT: [2, 3], WAVES_ELITE: [2, 2],
  ARENA_W: 40, ARENA_H: 30,
  EXIT_AUTO: 8,

  // 상태이상
  BURN: { dur: 4, dps: 0.08 },     // dps = 공격자 공격력 배율/초
  POISON: { dur: 6, dps: 0.07 },
  FREEZE_DUR: 2, FREEZE_BOSS: 0.6,
  WET_DUR: 6, OIL_DUR: 8, SLOW_DUR: 2, SHOCK_CHAIN: 3,
  REACT: { explode: 2.2, shatter: 2.5, toxic: 0.12, shock: 0.8, steam: 0 },
  REACT_BONUS_MAGE: 0.4,
  THREAT: { dmg: 1, heal: 0.5, tankSkill: 3, taunt: 9999 },

  // 길드
  FACILITY_COST: [0, 60, 180, 400],
  GUILD_BUFF_CAP: 0.3,
  CRAFT_COST: { 0: 2, 1: 5, 2: 12, 3: 30 },
  UPGRADE_COST: [1, 2, 4, 7, 11],
  DISMANTLE: [1, 2, 5, 12],
  CLASS_XP_LV: lv => Math.round(100 * Math.pow(1.25, lv - 1)),
  CLASS_LV_MAX: 30,
};
