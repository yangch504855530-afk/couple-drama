/* app.js markDirty 补丁（精简幂等版） */
const fs = require('fs');
const p = 'js/app.js';
let a = fs.readFileSync(p, 'utf8');
const done = [];

if (!a.includes('function markDirty')) {
  const o = '  let toastTimer = null;';
  const i = a.indexOf(o);
  if (i < 0) { console.error('miss toastTimer'); process.exit(1); }
  const insert = [
    o,
    '  let dirtyTimer = null;',
    '  function markDirty() {',
    '    const gs = window.GistSync;',
    "    if (!(gs && gs.cfg().token && window.DramaBinding && window.DramaBinding.getState())) return;",
    '    clearTimeout(dirtyTimer);',
    '    dirtyTimer = setTimeout(() => { gs.syncAll().catch(e2 => console.warn("[sync]", e2.message)); }, 1500);',
    '  }'
  ].join('\n');
  a = a.replace(o, insert);
  done.push('markDirty fn');
}

/* 各写操作后调 markDirty（幂等：只在缺 markDirty() 调用的锚点后插） */
const anchors = [
  '      d.miss = (d.miss || 0) + 1; saveDaily(d);',
  '      if (!d.needToday) d.needToday = { you: \'\', her: \'\' };',
  '      jset(\'cd.praise\', arr.slice(0, 100));',
  "      jset('cd.repair', arr); renderToday();"
];
anchors.forEach(anchor => {
  if (!a.includes(anchor)) { console.error('miss anchor: ' + anchor.slice(0, 30)); process.exit(1); }
});
anchors.forEach(anchor => {
  const lines = a.split('\n');
  let inserted = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === anchor && (lines[i + 1] === undefined || !lines[i + 1].includes('markDirty();'))) {
      const indent = lines[i].match(/^\s*/)[0];
      lines.splice(i + 1, 0, indent + 'markDirty();');
      inserted = true;
      done.push(anchor.slice(6, 26) + ' ✅');
      break;
    }
  }
  if (!inserted) done.push(anchor.slice(6, 26) + ' skip(已有)');
});
a = lines.join('\n');
fs.writeFileSync(p, a);
console.log('all:', done.join(' | '));
