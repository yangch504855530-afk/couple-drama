/* v2.2.5 E 系列补丁（幂等版 2，锚点对准实际代码） */
const fs = require('fs');
const log = [];

/* ===== app.js ===== */
const pa = 'js/app.js';
let s = fs.readFileSync(pa, 'utf8');

/* E1：递台阶 emit('repair') + 本地条目存 bid */
if (!s.includes("emit('repair'")) {
  const o = [
    "      const arr = jget('cd.repair', []);",
    "      arr.push({ ts: Date.now(), date: today(), type: rp.id, icon: rp.icon, text: rp.text, from: 'you', caught: null });",
    "      jset('cd.repair', arr); renderToday();"
  ].join('\n');
  if (!s.includes(o)) { console.error('E1 miss'); process.exit(1); }
  const n = [
    "      const arr = jget('cd.repair', []);",
    "      const bev = (window.DramaBinding && window.DramaBinding.getState()) ? window.DramaBinding.emit('repair', { text: rp.text, icon: rp.icon }) : null;",
    "      arr.push({ ts: Date.now(), date: today(), type: rp.id, icon: rp.icon, text: rp.text, from: 'you', caught: null, bid: bev ? bev.id : null });",
    "      jset('cd.repair', arr); renderToday();"
  ].join('\n');
  s = s.replace(o, n);
  log.push('E1');
} else log.push('E1 skip');

/* E2：接住台阶 emit('repair_ack') + 接住后引导温柔戏 */
if (!s.includes("emit('repair_ack'")) {
  const o = [
    "    const rc = $('#rp-catch'); if (rc) rc.addEventListener('click', () => {",
    "      const arr = jget('cd.repair', []);",
    "      const pr = arr.find(x => x.date === today() && x.caught === null);",
    "      if (pr) { pr.caught = true; pr.caughtTs = Date.now(); jset('cd.repair', arr); }"
  ].join('\n');
  if (!s.includes(o)) { console.error('E2 miss'); process.exit(1); }
  const n = [
    "    const rc = $('#rp-catch'); if (rc) rc.addEventListener('click', () => {",
    "      const arr = jget('cd.repair', []);",
    "      const pr = arr.find(x => x.date === today() && x.caught === null);",
    "      if (pr) { pr.caught = true; pr.caughtTs = Date.now(); jset('cd.repair', arr);",
    "        if (pr.bid && window.DramaBinding) window.DramaBinding.emit('repair_ack', { ref: pr.bid });",
    "        toast('💛 台阶被接住了。要不要抽一张温柔戏送给 TA？去卡池抽吧 🎴'); return;",
    "      }"
  ].join('\n');
  s = s.replace(o, n);
  log.push('E2');
} else log.push('E2 skip');

/* E3：夸夸 emit('praise') */
if (!s.includes("emit('praise'")) {
  const o = [
    "    const arr = jget('cd.praise', []);",
    "    arr.unshift({ ts: Date.now(), date: today(), from, to, text: text.slice(0, 60) });",
    "    jset('cd.praise', arr.slice(0, 100));"
  ].join('\n');
  if (!s.includes(o)) { console.error('E3 miss'); process.exit(1); }
  const n = [
    "    const arr = jget('cd.praise', []);",
    "    arr.unshift({ ts: Date.now(), date: today(), from, to, text: text.slice(0, 60) });",
    "    jset('cd.praise', arr.slice(0, 100));",
    "    if (window.DramaBinding && window.DramaBinding.getState()) window.DramaBinding.emit('praise', { text: text.slice(0, 60), to });"
  ].join('\n');
  s = s.replace(o, n);
  log.push('E3');
} else log.push('E3 skip');

/* E4：免战牌 emit('free') */
if (!s.includes("emit('free'")) {
  const o = "      d.freeUsed[b.dataset.who] = (d.freeUsed[b.dataset.who] || 0) + 1; saveDaily(d);";
  if (!s.includes(o)) { console.error('E4 miss'); process.exit(1); }
  const n = o + "\n      if (window.DramaBinding && window.DramaBinding.getState()) window.DramaBinding.emit('free', { who: b.dataset.who });";
  s = s.replace(o, n);
  log.push('E4');
} else log.push('E4 skip');

/* E5：剧本杀青 emit('quest_done') */
if (!s.includes("emit('quest_done'")) {
  const o = [
    "          const log = logAll();",
    "          log.unshift({ cardId: 'daily:quest', date: today(), ts: Date.now(), note: '' });",
    "          jset('cd.log', log);",
    "        }"
  ].join('\n');
  if (!s.includes(o)) { console.error('E5 miss'); process.exit(1); }
  const n = [
    "          const log = logAll();",
    "          log.unshift({ cardId: 'daily:quest', date: today(), ts: Date.now(), note: '' });",
    "          jset('cd.log', log);",
    "          if (window.DramaBinding && window.DramaBinding.getState()) window.DramaBinding.emit('quest_done', {});",
    "        }"
  ].join('\n');
  s = s.replace(o, n);
  log.push('E5');
} else log.push('E5 skip');

/* E7：对方动态区显示 praise/free/quest */
if (!s.includes('ps.praises')) {
  const o = "            ${(!ps.miss && !ps.need && !ps.pendingRepair && !ps.things.length) ? '<li>还没有新动态——生成你的同步码发给 TA 吧</li>' : ''}";
  if (!s.includes(o)) { console.error('E7 miss'); process.exit(1); }
  const n = [
    "            ${ps.praises ? `<li>💌 TA 给你存了 ${ps.praises} 句夸夸</li>` : ''}",
    "            ${ps.questDone ? '<li>📜 TA 完成了今日剧本</li>' : ''}",
    "            ${ps.freeUsedToday ? `<li>🛡️ TA 打了 ${ps.freeUsedToday} 张免战牌（不追问）</li>` : ''}",
    "            ${(!ps.miss && !ps.need && !ps.pendingRepair && !ps.things.length && !ps.praises && !ps.questDone && !ps.freeUsedToday) ? '<li>还没有新动态——生成你的同步码发给 TA 吧</li>' : ''}"
  ].join('\n');
  s = s.replace(o, n);
  log.push('E7');
} else log.push('E7 skip');

/* E10：递台阶后 48h 抽卡偏温柔戏 */
if (!s.includes('repairGentleBoost')) {
  const o = [
    "      let hint = (ps && ps.need && ps.needStatus && ps.needStatus.state === 'active')",
    "        ? needSuitHint(ps.need.payload.text) : null;"
  ].join('\n');
  if (!s.includes(o)) { console.error('E10 miss'); process.exit(1); }
  const n = [
    "      let hint = (ps && ps.need && ps.needStatus && ps.needStatus.state === 'active')",
    "        ? needSuitHint(ps.need.payload.text) : null;",
    "      if (!hint) {",
    "        const recentRepair = jget('cd.repair', []).filter(x => x.date >= daysAgo(2)).length > 0;",
    "        if (recentRepair) hint = 'gentle'; // 递台阶后 48h：抽卡偏温柔戏（修复语境感知）",
    "      }"
  ].join('\n');
  s = s.replace(o, n);
  log.push('E10');
} else log.push('E10 skip');

fs.writeFileSync(pa, s);

/* ===== binding.js：投影加 praise/free/quest ===== */
const bp = 'js/binding.js';
let b = fs.readFileSync(bp, 'utf8');
if (!b.includes("e.type === 'praise'")) {
  const o = "    const things = partnerEvents.filter(e => e.type === 'thing').map(e => e.payload && e.payload.index).filter(x => x !== undefined && x !== null);";
  if (!b.includes(o)) { console.error('E6 miss'); process.exit(1); }
  const n = [
    "    const things = partnerEvents.filter(e => e.type === 'thing').map(e => e.payload && e.payload.index).filter(x => x !== undefined && x !== null);",
    "    const praises = partnerEvents.filter(e => e.type === 'praise' && e.date === today).length;",
    "    const freeUsedToday = partnerEvents.filter(e => e.type === 'free' && e.date === today).length;",
    "    const questDone = partnerEvents.filter(e => e.type === 'quest_done' && e.date === today).length > 0;"
  ].join('\n');
  b = b.replace(o, n);
}
const o2 = "      myNeedAckedByPartner, myNeed: myNeedToday, pendingRepair, things, total: partnerEvents.length };";
if (!b.includes(o2)) { console.error('E6b miss'); process.exit(1); }
b = b.replace(o2, "      myNeedAckedByPartner, myNeed: myNeedToday, pendingRepair, things, praises, freeUsedToday, questDone, total: partnerEvents.length };");
fs.writeFileSync(bp, b);
log.push('E6');

/* ===== engine.js：多云改"转晴中" ===== */
const ge = 'js/engine.js';
let e = fs.readFileSync(ge, 'utf8');
if (!e.includes('转晴中')) {
  const o = "    if (weeklyPraise >= 1) return { icon: '⛅', text: '多云' };";
  if (!e.includes(o)) { console.error('E8 miss'); process.exit(1); }
  const n = "    if (weeklyPraise >= 1) return { icon: '⛅', text: '转晴中（再存 ' + (5 - weeklyPraise) + ' 句放晴）' };";
  e = e.replace(o, n);
  fs.writeFileSync(ge, e);
  log.push('E8');
} else log.push('E8 skip');

/* ===== data.js：和平使者消歧 ===== */
const dd = 'js/data.js';
let dd2 = fs.readFileSync(dd, 'utf8');
if (!dd2.includes('累计完成 5 场演出')) {
  dd2 = dd2.replace("hint: '一周零免战牌且累计 5 张'", "hint: '一周零免战牌，且累计完成 5 场演出'");
  fs.writeFileSync(dd, dd2);
  log.push('E9');
} else log.push('E9 skip');

console.log('applied:', log.join(', '));
