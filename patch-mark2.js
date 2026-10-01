/* markDirty 补丁 2（只处理 praise 行，其余已应用） */
const fs = require('fs');
const p = 'js/app.js';
let a = fs.readFileSync(p, 'utf8');
const done = [];

const anchors = [
  '      jset(\'cd.praise\', arr.slice(0, 100));'
];
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
