/* v2.3 全量双人同步补丁（自足版：锚点已核实） */
const fs = require('fs');
const log2 = [];

/* ===== 1) github-sync.js ===== */
let g = fs.readFileSync('js/github-sync.js', 'utf8');

/* 1a) helpers：collectLocal/applyMerged/mergeFull（插在 pullMerge 注释前） */
if (!g.includes('collectLocal')) {
  const anchor = '  /* 拉取并合并：把云端房间里本房间的事件合并进本地（幂等）。';
  if (!g.includes(anchor)) { console.error('helpers anchor miss'); process.exit(1); }
  const helpers = [
    "  /* —— v2.3 全量同步：分区写、并集读 —— */",
    "  function collectLocal() {",
    "    return {",
    "      things: jget('cd.things', []),",
    "      praise: jget('cd.praise', []),",
    "      log: jget('cd.log', []),",
    "      repair: jget('cd.repair', []),",
    "      capsules: jget('cd.capsules', [])",
    "    };",
    "  }",
    "  function applyMerged(m) {",
    "    if (m.things) jset('cd.things', m.things);",
    "    if (m.praise) jset('cd.praise', m.praise);",
    "    if (m.log) jset('cd.log', m.log);",
    "    if (m.repair) jset('cd.repair', m.repair);",
    "    if (m.capsules) jset('cd.capsules', m.capsules);",
    "  }",
    "  function mergeFull(mine, theirs) {",
    "    const out = {};",
    "    ['things', 'repair'].forEach(k => {",
    "      const map = new Map();",
    "      ((mine[k] || []).concat(theirs[k] || [])).forEach(x => { const key = JSON.stringify([x.id, x.date]); if (!map.has(key)) map.set(key, x); });",
    "      out[k] = Array.from(map.values());",
    "    });",
    "      ['praise', 'log', 'capsules'].forEach(k => {",
    "        const map = new Map();",
    "        ((mine[k] || []).concat(theirs[k] || [])).forEach(x => { const key = JSON.stringify([x.ts, x.text || x.note || '']); if (!map.has(key)) map.set(key, x); });",
    "        out[k] = Array.from(map.values());",
    "      });",
    "      return out;",
    "  }",
    "",
    '  /* 拉取并合并：把云端房间里本房间的事件合并进本地（幂等）。'
  ].join('\n');
  g = g.replace(anchor, helpers);
  log2.push('helpers');
} else log2.push('helpers skip');

/* 1b) syncAll（插在 syncNow 前） */
if (!g.includes('async function syncAll')) {
  const anchor = '  async function syncNow(onMerged) {';
  if (!g.includes(anchor)) { console.error('syncAll anchor miss'); process.exit(1); }
  const fn = [
    "  /* 全量双向同步：events + sides（分区写、并集读） */",
    "  async function syncAll(onMerged) {",
    "    const B = global.DramaBinding;",
    "    const st = B.getState();",
    "    if (!st) return null;",
    "    const mine = collectLocal();",
    "    const data = await fetchGist();",
    "    data.rooms = data.rooms || {};",
    "    const room = data.rooms[st.room] = data.rooms[st.room] || { events: [] };",
    "    room.sides = room.sides || {};",
    "    const mergedEvents = B.mergeEvents(st.events || [], room.events || []);",
    "    const added = mergedEvents.length - (st.events || []).length;",
    "    const myKey = st.me;",
    "    const cloudMine = room.sides[myKey] || {};",
    "    const unionMine = mergeFull(cloudMine, mine);",
    "    room.sides[myKey] = unionMine;",
    "    st.events = mergedEvents; B.saveEvents(mergedEvents);",
    "    room.events = mergedEvents;",
    "    applyMerged(unionMine);",
    "    const c = cfg(); c.lastSync = new Date().toLocaleString(); setCfg(c);",
    "    await patchGist(data);",
    "    if (added > 0 && typeof onMerged === 'function') onMerged(added);",
    "    return { added, events: mergedEvents.length };",
    "  }",
    "",
    '  async function syncNow(onMerged) {'
  ].join('\n');
  g = g.replace(anchor, fn);
  log2.push('syncAll');
} else log2.push('syncAll skip');

/* 1c) syncNow 简化为调 syncAll（幂等） */
if (!g.includes('await syncAll(onMerged)')) {
  const o = [
    "  async function syncNow(onMerged) {",
    "    await pullMerge(onMerged);   // 先收 TA 的",
    "    await push();                // 再发事件",
    "    await syncState();           // 全量状态",
    "    return cfg().lastSync;"
  ].join('\n');
  if (!g.includes(o)) { console.error('syncNow rewrite miss'); process.exit(1); }
  const n = [
    "  async function syncNow(onMerged) {",
    "    await syncAll(onMerged);     // 全量双向（events+数据）",
    "    return cfg().lastSync;"
  ].join('\n');
  g = g.replace(o, n);
  log2.push('syncNow rewrite');
} else log2.push('syncNow rewrite skip');

/* 1d) 导出 syncAll（幂等） */
if (!g.includes('syncAll, startAuto')) {
  g = g.replace('global.GistSync = { cfg, setCfg, pullMerge, push, syncNow, syncState, startAuto, stopAuto, GIST_ID };',
                'global.GistSync = { cfg, setCfg, pullMerge, push, syncNow, syncAll, syncState, startAuto, stopAuto, GIST_ID };');
  g = g.replace("module.exports = { cfg, setCfg, pullMerge, push, syncNow, syncState, startAuto, stopAuto, GIST_ID };",
                "module.exports = { cfg, setCfg, pullMerge, push, syncNow, syncAll, syncState, startAuto, stopAuto, GIST_ID };");
  log2.push('export');
} else log2.push('export skip');

fs.writeFileSync('js/github-sync.js', g);

/* ===== 2) app.js ===== */
let a = fs.readFileSync('js/app.js', 'utf8');

/* 2a) markDirty（防抖自动同步） */
if (!a.includes('function markDirty')) {
  const o = '  let toastTimer = null;';
  if (!a.includes(o)) { console.error('toastTimer anchor miss'); process.exit(1); }
  const n = [
    '  let toastTimer = null;',
    '  let dirtyTimer = null;',
    '  function markDirty() {',
    "    const gs = window.GistSync;",
    "    if (!(gs && gs.cfg().token && window.DramaBinding && window.DramaBinding.getState())) return;",
    '    clearTimeout(dirtyTimer);',
    '    dirtyTimer = setTimeout(() => { gs.syncAll().catch(e2 => console.warn("[sync]", e2.message)); }, 1500);',
    '  }'
  ].join('\n');
  a = a.replace(o, n);
  log2.push('markDirty');
} else log2.push('markDirty skip');

/* 2b) 各写操作后 markDirty（幂等插入） */
const dirtyAnchors = [
  ['      d.miss = (d.miss || 0) + 1; saveDaily(d);', 'miss'],
  ['      if (!d.needToday) d.needToday = { you: \'\', her: \'\' };', 'needToday'],
  ['      jset(\'cd.praise\', arr.slice(0, 100));', 'praise'],
  ["      jset('cd.repair', arr); renderToday();", 'repair'],
  ['      if (pr) { pr.caught = true; pr.caughtTs = Date.now(); jset(\'cd.repair\', arr);', 'repair-ack'],
  ["      jset('cd.things', jget('cd.things', []))", 'things-noop']
];
// things 点亮：找实际行
const thingsLine = a.split('\n').findIndex(l => l.includes("jset('cd.things'"));
if (thingsLine >= 0) {
  dirtyAnchors.push([a.split('\n')[thingsLine], 'things']);
}
dirtyAnchors.forEach(([anchor2, tag]) => {
  if (!a.includes(anchor2)) { log2.push(tag + ' skip(锚点未找到)'); return; }
  const lines2 = a.split('\n');
  for (let i = 0; i < lines2.length; i++) {
    if (lines2[i] === anchor2 && !lines2[i + 1].includes('markDirty')) {
      const indent = lines2[i].match(/^\s*/)[0];
      lines2.splice(i + 1, 0, indent + 'markDirty();');
      log2.push(tag + ' ✅');
      break;
    }
  }
});
a = lines2.join('\n');
fs.writeFileSync(pa, a);
log2.push('app marks');

fs.writeFileSync(pa, a);
console.log('app:', log2.filter(x => x.includes('✅') || x.includes('skip') === false).join(', ') || log2.join(', '));
