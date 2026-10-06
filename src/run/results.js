// 결과 정산: MVP, 재미상, 전멸 원인 제공자, 보상 계산
G.Results = (function () {
  const R = {};
  const C = G.C, U = G.U;

  // party: 플레이어 객체 배열(슬롯 순, null 가능)
  R.compute = function (run, party) {
    const ps = party.filter(Boolean);
    const stats = ps.map(p => Object.assign({ slot: p.slot, name: p.name, cls: p.cls }, p.stats, { goldLeft: p.gold }));
    const score = s => s.dmg * 1 + s.heal * 1.4 + s.tank * 1.2 + s.revives * 150 + s.reacts * 25 + s.kills * 10 - s.downs * 80;
    const mvp = ps.length ? U.maxBy(stats, score) : null;
    const awards = [];
    if (mvp && ps.length >= 2) awards.push({ id: 'mvp', icon: '👑', name: 'MVP', slot: mvp.slot, val: Math.round(score(mvp)) });
    for (const a of G.META.AWARDS) {
      if (!a.key || ps.length < 2) continue;
      const best = U.maxBy(stats, s => s[a.key] || 0);
      if (!best || !(best[a.key] > 0)) continue;
      if (a.key === 'voteWins' && best.voteWins < 2) continue;
      const MIN = { goldLeft: 80, rolls: 8, downs: 2, fireSteps: 3, wallHits: 2, needAbuse: 1, reacts: 5, revives: 1 };
      if (MIN[a.key] && best[a.key] < MIN[a.key]) continue;
      if (ps.length >= 2 && stats.filter(s => (s[a.key] || 0) === best[a.key]).length === ps.length) continue; // 전원 동률이면 미수여
      awards.push({ id: a.id, icon: a.icon, name: a.name, slot: best.slot, val: best[a.key], desc: a.desc });
    }
    // 전멸 원인: 먼저 다운된 순서 + 다운 횟수
    let blame = null;
    if (run.wiped && ps.length) {
      const order = run.downOrder || [];
      const sc = {}; ps.forEach(p => (sc[p.slot] = p.stats.downs * 2 + (order[0] === p.slot ? 3 : 0) - p.stats.revives));
      blame = ps.reduce((a, b) => (sc[b.slot] > sc[a.slot] ? b : a)).slot;
    }
    // 보상
    const regionIdx = Math.max(0, run.regionIdx || 0);
    const mult = C.REGION_MULT[Math.min(3, regionIdx)] * (1 + (run.depth - 1) * C.DEPTH_REWARD) * (1 + run.curses.length * C.CURSE_REWARD);
    let ash = Math.round(run.earned.ash * mult), soul = Math.round(run.earned.soul * mult), xp = Math.round(run.earned.xp * (1 + (run.depth - 1) * 0.1));
    const confirmedAsh = run.confirmed ? run.confirmed.ash : 0, confirmedSoul = run.confirmed ? run.confirmed.soul : 0;
    if (run.wiped) { ash = Math.round(ash * (1 - C.WIPE_LOSS)); soul = Math.round(soul * (1 - C.WIPE_LOSS)); }
    ash += confirmedAsh; soul += confirmedSoul;
    return { stats, mvp: mvp ? mvp.slot : -1, awards, blame, ash, soul, xp, mult: Math.round(mult * 100) / 100, time: run.time, nodes: run.nodesDone, kills: U.sum(ps.map(p => p.stats.kills)), wiped: !!run.wiped, cleared: !!run.cleared, region: regionIdx + 1, depth: run.depth, seed: run.seed };
  };

  // 업적 체크 (길드 기준). 반환: 새로 달성한 업적 목록
  R.achievements = function (guild, run, res, party) {
    const got = [];
    const has = id => guild.ach.includes(id);
    const add = id => { if (!has(id)) { guild.ach.push(id); got.push(G.META.ACHIEVEMENTS.find(a => a.id === id)); } };
    add('firstRun');
    if (run.bossesKilled.includes('grad')) add('firstBoss');
    if (run.bossesKilled.includes('elun')) add('elun');
    if (run.bossesKilled.includes('eye')) add('eye');
    if (run.bossesKilled.includes('lord')) add('lord');
    if (guild.hall.wipes >= 5) add('wipe5');
    if (run.cleared && run.depth >= 5) add('depth5');
    if (run.cleared && run.depth >= 10) add('depth10');
    if (run.bossesKilled.length && party.filter(Boolean).every(p => p.stats.downs === 0)) add('noDown');
    if (U.sum(party.filter(Boolean).map(p => p.stats.reacts)) >= 50) add('react50');
    if (run.mode === 'rush' && run.cleared) add('rush');
    if (G.META.codexPct(guild) >= 0.5) add('codex50');
    if (party.filter(Boolean).some(p => p.stats.goldPicked >= 1000)) add('rich');
    if (party.filter(Boolean).length === 2 && run.bossesKilled.includes('elun')) add('duoBoss2');
    return got.filter(Boolean);
  };
  return R;
})();
