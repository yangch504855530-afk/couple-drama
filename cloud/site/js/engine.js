/* 《双人戏精》引擎 — 纯函数（可测）
 * 每日确定性抽取 / 花色抽签 / 连击 / 成就求值。浏览器挂 window.DramaEngine。
 */
(function (global) {
  'use strict';

  function hashDate(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 每日主线(温柔戏) + 支线(整活戏)，同日期全设备一致
  function pickDaily(cards, dateStr, energy) {
    const maxMin = energy === 'low' ? 15 : Infinity; // 低迷日只出轻场
    const rnd = mulberry32(hashDate(dateStr));
    let gentle = cards.filter(c => c.suit === 'gentle' && c.minutes <= maxMin);
    let fun = cards.filter(c => c.suit === 'fun' && c.minutes <= maxMin);
    if (!gentle.length) gentle = cards.filter(c => c.suit === 'gentle');
    if (!fun.length) fun = cards.filter(c => c.suit === 'fun');
    if (!gentle.length || !fun.length) return { main: null, side: null };
    return { main: gentle[Math.floor(rnd() * gentle.length)], side: fun[Math.floor(rnd() * fun.length)] };
  }

  // 花色内抽签（排除已抽），耗尽返回 null
  function drawFromSuit(cards, suit, excludeIds, rnd) {
    const pool = cards.filter(c => (!suit || c.suit === suit) && !(excludeIds || []).includes(c.id));
    if (!pool.length) return null;
    return pool[Math.floor((typeof rnd === 'function' ? rnd() : Math.random()) * pool.length)];
  }

  // 连击：从今天往回数连续"有演出"的自然日（今天没演则从昨天起算，返回值不变——今天演了会 +1）
  function computeStreak(doneDatesSet, todayStr) {
    const d = new Date(todayStr + 'T12:00:00');
    if (!doneDatesSet.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1); // 今天还没演不掉连击
    let streak = 0;
    for (;;) {
      const key = d.toISOString().slice(0, 10);
      if (doneDatesSet.has(key)) { streak++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return streak;
  }

  // 节奏版连击：cadenceDays=节奏（几天一场）。间隔 ≤ cadenceDays+1 个自然日即延续；
  // 今天还没演不清零（从昨天往回找最近一场，只要它距今天 ≤ cadenceDays+1 就仍算在场内）。
  // restDays：休演日集合——休演日不算断链（合法保养）。
  function computeCadenceStreak(doneDatesSet, todayStr, cadenceDays, restDaysSet) {
    const cd = Math.max(1, cadenceDays || 1);
    const grace = cd + 1; // 容忍窗口：节奏日之后 cd+1 天内演仍连续
    const rest = restDaysSet || new Set();
    const dates = Array.from(doneDatesSet).sort();
    if (!dates.length) return 0;
    const today = new Date(todayStr + 'T12:00:00');
    const last = new Date(dates[dates.length - 1] + 'T12:00:00');
    const restBetween = (fromDate, toDate) => {
      let n = 0; const probe = new Date(fromDate);
      while (probe < toDate) { probe.setDate(probe.getDate() + 1);
        if (rest.has(probe.toISOString().slice(0, 10))) n++; }
      return n;
    };
    // 最近一场距今：超出容忍窗口（可被休演日延长）则连击清零
    const gapToToday = Math.round((today - last) / 86400000);
    if (gapToToday > grace + restBetween(last, today)) return 0;
    // 从最近一场向回逐场计数：相邻两场间隔 ≤ grace + 之间休演数即延续
    let streak = 1;
    for (let i = dates.length - 1; i > 0; i--) {
      const a = new Date(dates[i] + 'T12:00:00'), b = new Date(dates[i - 1] + 'T12:00:00');
      const gap = Math.round((a - b) / 86400000);
      if (gap <= grace + restBetween(b, a)) streak++;
      else break;
    }
    return streak;
  }

  // 距下一场演出还差几天（负数=已到/过期，0=今天）
  function daysUntilDue(lastDoneDateStr, todayStr, cadenceDays) {
    if (!lastDoneDateStr) return 0;
    const cd = Math.max(1, cadenceDays || 1);
    const last = new Date(lastDoneDateStr + 'T12:00:00');
    const due = new Date(last); due.setDate(due.getDate() + cd);
    const t = new Date(todayStr + 'T12:00:00');
    return Math.ceil((due - t) / 86400000);
  }

  // 恋爱天数：从纪念日（含当天）到今天的自然天数（未设置返回 null）
  function daysTogether(anniversaryStr, todayStr) {
    if (!anniversaryStr) return null;
    const a = new Date(anniversaryStr + 'T12:00:00');
    const t = new Date(todayStr + 'T12:00:00');
    if (isNaN(a) || isNaN(t) || t < a) return 0;
    return Math.floor((t - a) / 86400000) + 1;
  }

  // 需求条状态循环 充足(0)→偏低(1)→告急(2)→充足
  function nextNeedLevel(lv) { return ((lv || 0) + 1) % 3; }

  // 免战牌容量
  const FREE_PER_DAY = 2;

  function evalAchievements(defs, state) {
    const got = [];
    for (const a of defs) {
      try { if (a.check(state)) got.push(a.id); } catch (e) { /* 单枚坏定义不拖垮全部 */ }
    }
    return got;
  }

  /* 需求加权的抽卡：对方有等待中的需要时，优先抽中能回应它的花色。
   * needText 里的需求库名称 → suitHint 匹配；自由文本回退 gentle（情感需求的安全牌）。
   * 概率随等待天数上升：当天 35%、1-2 天 55%、≥3 天 80%。
   * 返回 {card, boosted, suit} 或 null。 */
  function pickWithNeedBoost(cards, drawn, need, waitingDays, suitHint, rnd) {
    if (!need) return null;
    const r = typeof rnd === 'function' ? rnd() : Math.random();
    const hint = suitHint || 'gentle';
    let pBoost = waitingDays >= 3 ? 0.8 : (waitingDays >= 1 ? 0.55 : 0.35);
    const boostedPool = cards.filter(c => c.suit === hint && !(drawn || []).includes(c.id));
    const normalPool = cards.filter(c => !(drawn || []).includes(c.id));
    if (!normalPool.length) return null;
    if (boostedPool.length && r < pBoost) {
      return { card: boostedPool[Math.floor((typeof rnd === 'function' ? rnd() : Math.random()) * boostedPool.length)], boosted: true, suit: hint };
    }
    const c = normalPool[Math.floor((typeof rnd === 'function' ? rnd() : Math.random()) * normalPool.length)];
    return { card: c, boosted: false, suit: c.suit };
  }

  // 关系气候：只看积极存款，不打分（Gottman 5:1 的天气化隐喻）。v4.0 修复原"雨天分支永不可达"的区间漏洞
  function climate(weeklyPraise) {
    const n = weeklyPraise || 0;
    if (n === 0) return { icon: '🌤️', text: '待记录' };
    if (n >= 5) return { icon: '☀️', text: '晴天' };
    if (n >= 3) return { icon: '⛅', text: '转晴中（再存 ' + (5 - n) + ' 句放晴）' };
    return { icon: '🌧️', text: '雨天（存一句，就晴一点）' };
  }

  global.DramaEngine = { hashDate, mulberry32, pickDaily, drawFromSuit, computeStreak, computeCadenceStreak, daysUntilDue, daysTogether, nextNeedLevel, evalAchievements, climate, pickWithNeedBoost, FREE_PER_DAY };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.DramaEngine;
})(typeof window !== 'undefined' ? window : globalThis);
