'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const D = require(path.join(__dirname, '..', 'js', 'data.js'));
const E = require(path.join(__dirname, '..', 'js', 'engine.js'));
let passed = 0, failed = 0;
const t = (n, f) => { try { f(); passed++; console.log('  ✅ ' + n); } catch (e) { failed++; console.error('  ❌ ' + n + ' — ' + e.message); } };

console.log('== 数据层 ==');
t('兜底卡组完整（≥32 张、字段合法、8 花色全覆盖）', () => {
  const ids = new Set(D.CARDS.map(c => c.id));
  assert.equal(ids.size, D.CARDS.length);
  assert.ok(D.CARDS.length >= 32);
  D.CARDS.forEach(c => {
    assert.ok(D.SUITS[c.suit], c.id + ' 花色非法');
    assert.ok([5, 15, 30, 60].includes(c.minutes), c.id + ' minutes 非法');
    assert.ok(['any', 'home', 'out', 'road'].includes(c.where), c.id + ' where 非法');
    assert.ok(c.title && c.text && c.text.length >= 20, c.id + ' 文案缺失');
  });
  Object.keys(D.SUITS).forEach(k => assert.ok(D.CARDS.some(c => c.suit === k), k + ' 花色为空'));
});
t('编剧卡组（若已合并）：96 张、8×12、无重复', () => {
  const f1 = path.join(__dirname, '..', 'docs', 'content', 'cards-travel.json');
  const f2 = path.join(__dirname, '..', 'docs', 'content', 'cards-life.json');
  if (!fs.existsSync(f1) || !fs.existsSync(f2)) { console.log('    (内容 JSON 未就绪，跳过)'); return; }
  const all = JSON.parse(fs.readFileSync(f1, 'utf8')).concat(JSON.parse(fs.readFileSync(f2, 'utf8')));
  assert.equal(all.length, 96, '总数 ' + all.length);
  const ids = new Set(all.map(c => c.id));
  assert.equal(ids.size, 96);
  const per = {};
  all.forEach(c => per[c.suit] = (per[c.suit] || 0) + 1);
  Object.keys(D.SUITS).forEach(k => assert.equal(per[k], 12, k + ' 不是 12 张'));
  all.forEach(c => {
    assert.ok([5, 15, 30, 60].includes(c.minutes), c.id);
    assert.ok(['any', 'home', 'out', 'road'].includes(c.where), c.id);
    assert.ok(c.title.length <= 14, c.id + ' title 超长');
    assert.ok(c.text.length >= 20 && c.text.length <= 120, c.id + ' text 长度');
  });
});
t('8 角色 / 6 需求（校园版）/ 13 成就，字段完整', () => {
  assert.equal(D.ROLES.length, 8);
  D.ROLES.forEach(r => assert.ok(r.duty && r.perk && r.name));
  assert.equal(D.NEEDS.length, 6);
  assert.equal(D.SMALL_THINGS.length, 50);
  D.NEEDS.forEach(n => assert.ok(n.low && n.charge));
  assert.equal(D.ACHIEVEMENTS.length, 13); // v4.0 移除"体检官"（需求体检 UI 已下架，成就不可达）
  assert.equal(D.REPAIRS.length, 3);
  D.REPAIRS.forEach(r => assert.ok(r.text && r.icon));
});

console.log('== 引擎 ==');
t('pickDaily 确定性：同日同结果，主线温柔戏/支线整活戏', () => {
  for (const d of ['2026-10-01', '2026-10-02', '2026-11-20']) {
    const a = E.pickDaily(D.CARDS, d), b = E.pickDaily(D.CARDS, d);
    assert.equal(a.main.id, b.main.id); assert.equal(a.side.id, b.side.id);
    assert.equal(a.main.suit, 'gentle'); assert.equal(a.side.suit, 'fun');
  }
});
t('pickDaily 日期变化会换卡（7 天 ≥3 种）', () => {
  const s = new Set();
  for (let i = 1; i <= 7; i++) s.add(E.pickDaily(D.CARDS, '2026-10-' + String(i).padStart(2, '0')).main.id);
  assert.ok(s.size >= 3);
});
t('drawFromSuit 花色过滤 + 排除已抽 + 耗尽 null', () => {
  for (let i = 0; i < 15; i++) assert.equal(E.drawFromSuit(D.CARDS, 'road', []).suit, 'road');
  const roadIds = D.CARDS.filter(c => c.suit === 'road').map(c => c.id);
  const got = E.drawFromSuit(D.CARDS, 'road', roadIds.slice(0, roadIds.length - 1));
  assert.ok(got && !roadIds.slice(0, -1).includes(got.id));
  assert.equal(E.drawFromSuit(D.CARDS, 'road', roadIds), null);
});
t('drawFromSuit 花色为空=全池抽（修复盲评C严重bug）', () => {
  const got = E.drawFromSuit(D.CARDS, null, []);
  assert.ok(got && D.SUITS[got.suit]);
  const suits = new Set(Array.from({ length: 30 }, () => E.drawFromSuit(D.CARDS, null, []).suit));
  assert.ok(suits.size >= 4, '全池应覆盖多花色，实际 ' + suits.size);
});
t('computeStreak 连击：今天断签不毁昨天，连续日正确累计', () => {
  const today = '2026-10-05';
  const mk = ds => new Set(ds);
  assert.equal(E.computeStreak(mk(['2026-10-05', '2026-10-04', '2026-10-03']), today), 3);
  assert.equal(E.computeStreak(mk(['2026-10-04', '2026-10-03']), today), 2, '今天没演应从昨天续算');
  assert.equal(E.computeStreak(mk(['2026-10-03', '2026-10-02']), today), 0, '断一天即清零');
  assert.equal(E.computeStreak(mk([]), today), 0);
});
t('nextNeedLevel 循环 0→1→2→0', () => {
  assert.equal(E.nextNeedLevel(0), 1); assert.equal(E.nextNeedLevel(1), 2); assert.equal(E.nextNeedLevel(2), 0);
});
t('成就求值：首演/连击/全花色/和平使者', () => {
  const suits = {};
  ['gentle', 'fun', 'photo', 'road', 'home', 'rain', 'money', 'night'].forEach(k => suits[k] = 1);
  const base = { doneCount: 1, streak: 0, suitDone: {}, freeLast7: 0, needsTouches: 0 };
  const got1 = E.evalAchievements(D.ACHIEVEMENTS, base);
  assert.ok(got1.includes('first') && got1.length === 1);
  const hot = E.evalAchievements(D.ACHIEVEMENTS, Object.assign({}, base, { streak: 7, doneCount: 25 }));
  assert.ok(hot.includes('streak7') && hot.includes('c25') && hot.includes('streak3'));
  const allS = E.evalAchievements(D.ACHIEVEMENTS, Object.assign({}, base, { suitDone: suits, doneCount: 8 }));
  assert.ok(allS.includes('allSuits'));
  assert.ok(!E.evalAchievements(D.ACHIEVEMENTS, { doneCount: 9, streak: 0, suitDone: {}, freeLast7: 3, needsTouches: 0 }).includes('peace'));
  assert.ok(E.evalAchievements(D.ACHIEVEMENTS, { doneCount: 5, streak: 0, suitDone: {}, freeLast7: 0, needsTouches: 0 }).includes('peace'));
});

t('关系气候：0 待记录 / 1-2 雨天 / 3-4 转晴中 / ≥5 晴天（v4.0 修复原雨天分支永不可达）', () => {
  assert.equal(E.climate(0).icon, '🌤️');
  assert.equal(E.climate(2).icon, '🌧️');
  assert.equal(E.climate(3).icon, '⛅');
  assert.equal(E.climate(5).icon, '☀️');
});
t('成就 v2：修桥人（10 递 7 接）与存款人（20 句）', () => {
  const st = { doneCount: 0, streak: 0, suitDone: {}, freeLast7: 0, needsTouches: 0, repairSent: 10, repairCaught: 7, praiseCount: 20 };
  const got = E.evalAchievements(D.ACHIEVEMENTS, st);
  assert.ok(got.includes('bridge') && got.includes('bank'));
  assert.ok(!E.evalAchievements(D.ACHIEVEMENTS, Object.assign({}, st, { repairCaught: 6 })).includes('bridge'));
});
t('电量降载：低迷日场次全部 ≤15 分钟且确定性', () => {
  for (const d of ['2026-10-01', '2026-10-02']) {
    const a = E.pickDaily(D.CARDS, d, 'low'), b = E.pickDaily(D.CARDS, d, 'low');
    assert.equal(a.main.id, b.main.id);
    assert.ok(a.main.minutes <= 15 && a.side.minutes <= 15, '低迷日出重场: ' + a.main.minutes);
  }
  const n = E.pickDaily(D.CARDS, '2026-10-01');
  assert.ok(n.main.minutes !== undefined);
});
t('v1.2 节奏连击：1/2/3/7 天节拍的延续与断链', () => {
  const S = E.computeCadenceStreak;
  // 每天一场：昨天+前天，今天没演 → 容忍窗口内仍连
  assert.equal(S(new Set(['2026-10-04', '2026-10-05']), '2026-10-06', 1), 2);
  // 三天一场：间隔 3 天连续
  assert.equal(S(new Set(['2026-10-01', '2026-10-04', '2026-10-07']), '2026-10-07', 3), 3);
  // 三天一场：间隔 5 天断链
  assert.equal(S(new Set(['2026-10-01', '2026-10-06']), '2026-10-06', 3), 1);
  // 每周一场：间隔 7 天连续
  assert.equal(S(new Set(['2026-09-23', '2026-09-30']), '2026-09-30', 7), 2);
  // 休演日缓冲：4 天休演 + 3 天节奏不断
  assert.equal(S(new Set(['2026-10-01', '2026-10-06']), '2026-10-07', 3, new Set(['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'])), 2);
});
t('v1.2 演出日判定：daysUntilDue', () => {
  assert.equal(E.daysUntilDue('2026-10-04', '2026-10-04', 3), 3);
  assert.equal(E.daysUntilDue('2026-10-04', '2026-10-06', 3), 1);
  assert.equal(E.daysUntilDue('2026-10-04', '2026-10-07', 3), 0);
  assert.ok(E.daysUntilDue('2026-10-04', '2026-10-08', 3) < 0);
  assert.equal(E.daysUntilDue(null, '2026-10-08', 3), 0);
});
t('需求加权抽卡：等待越久匹配花色概率越高，耗尽回退', () => {
  const need = { text: '今天我需要：被认可', date: '2026-10-01' };
  let g = 0, n = 200;
  for (let i = 0; i < n; i++) {
    const r = E.pickWithNeedBoost(D.CARDS, [], need, 5, 'gentle', E.mulberry32(9000 + i));
    if (r.card.suit === 'gentle') g++;
  }
  assert.ok(g / n > 0.65, 'gentle 占比仅 ' + Math.round(g / n * 100) + '%');
  let g0 = 0;
  for (let i = 0; i < n; i++) {
    const r = E.pickWithNeedBoost(D.CARDS, [], need, 0, 'gentle', E.mulberry32(7000 + i));
    if (r.card.suit === 'gentle') g0++;
  }
  assert.ok(g0 < g, '当天档不应高于长等档');
  const allG = D.CARDS.filter(c => c.suit === 'gentle').map(c => c.id);
  const r2 = E.pickWithNeedBoost(D.CARDS, allG, need, 5, 'gentle', E.mulberry32(1));
  assert.ok(r2 && r2.card.suit !== 'gentle');
  const all = D.CARDS.map(c => c.id);
  assert.equal(E.pickWithNeedBoost(D.CARDS, all, need, 5, 'gentle'), null);
});
console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed ? 1 : 0);
