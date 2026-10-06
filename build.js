/* 构建脚本：合并编剧 agent 的卡组 → 注入 window.DRAMA_CARDS → 内联产出 dist/couple-drama.html */
const fs = require('fs');
const path = require('path');
const root = __dirname;
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const SUIT_KEYS = ['gentle', 'fun', 'photo', 'road', 'home', 'rain', 'money', 'night'];
const WHERE_KEYS = ['any', 'home', 'out', 'road'];

/* 1) 合并两张内容 JSON */
let injected = null;
const files = ['docs/content/cards-travel.json', 'docs/content/cards-life.json'];
if (files.every(f => fs.existsSync(path.join(root, f)))) {
  const all = files.flatMap(f => JSON.parse(read(f)));
  const ids = new Set();
  const errors = [];
  all.forEach(c => {
    if (!c.id || ids.has(c.id)) errors.push('id 缺失/重复: ' + c.id);
    ids.add(c.id);
    if (!SUIT_KEYS.includes(c.suit)) errors.push(c.id + ' 花色非法: ' + c.suit);
    if (!c.title || c.title.length > 14) errors.push(c.id + ' title 缺失或超长');
    if (!c.text || c.text.length < 20 || c.text.length > 120) errors.push(c.id + ' text 长度非法');
    if (![5, 15, 30, 60].includes(c.minutes)) errors.push(c.id + ' minutes 非法: ' + c.minutes);
    if (!WHERE_KEYS.includes(c.where)) errors.push(c.id + ' where 非法: ' + c.where);
    if (!['high', 'normal'].includes(c.stamina)) errors.push(c.id + ' stamina 非法: ' + c.stamina);
    // v4.6 胜负词黑名单：剧场语言不设输赢惩罚（译法见 docs/THEATER-WORDS.md）
    const bad = (c.text || '').match(/(输|赢|罚|评分|猜拳|平票)/);
    if (bad) errors.push(c.id + ' text 含胜负/惩罚词「' + bad[0] + '」（对照 docs/THEATER-WORDS.md 改写）');
  });
  const perSuit = {};
  all.forEach(c => perSuit[c.suit] = (perSuit[c.suit] || 0) + 1);
  SUIT_KEYS.forEach(k => { if (perSuit[k] !== 12) errors.push(k + ' 只有 ' + (perSuit[k] || 0) + ' 张（应为 12）'); });
  if (errors.length) { console.error('卡组校验失败:\n' + errors.join('\n')); process.exit(1); }
  injected = all;
  console.log('卡组合并: ' + all.length + ' 张 ｜ 各花色 12 张 ✅');
} else {
  console.log('⚠️ 内容 JSON 未就绪，使用内置 32 张兜底组');
}

/* 2) 内联（JSON 中 < 转义为 \u003c，防 HTML 解析器提前闭合 script） */
let html = read('index.html');
html = html.replace('<link rel="stylesheet" href="css/style.css">', '<style>\n' + read('css/style.css') + '\n</style>');

const OPEN = '<' + 'script>';
const CLOSE = '<' + '/script>';
const injectScript = injected
  ? 'window.DRAMA_CARDS = ' + JSON.stringify(injected).split('<').join('\\u003c') + ';\n'
  : '';

const scripts = [['js/data.js', injectScript], ['js/engine.js', ''], ['js/capsules.js', ''], ['js/cloud-sync.js', ''], ['js/app.js', '']]; // v4.2:cloud-sync(云中继)上架;binding/github-sync 仍下架
for (const pair of scripts) {
  const file = pair[0], prefix = pair[1];
  const tag = '<script src="' + file + '"></' + 'script>';
  if (!html.includes(tag)) throw new Error('marker missing: ' + tag);
  html = html.replace(tag, OPEN + '\n/* ===== ' + file + ' ===== */\n' + prefix + read(file) + '\n' + CLOSE);
}
if (html.includes('src="js/') || html.includes('href="css/')) throw new Error('unresolved external ref');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'couple-drama.html');
fs.writeFileSync(out, html);
console.log('BUILT:', out, (html.length / 1024).toFixed(1) + ' KB');

/* v4.4.2:自动同步 cloud/site(Worker assets 本体)。
 * v4.8.1 修复(T1 实测抓出):site/index.html 必须用**构建产物**(含 DRAMA_CARDS 注入的自包含 HTML)——
 * 原先复制源 index.html 导致线上只有 32 张兜底卡。js/css 已全部内联,目录不再需要。 */
const siteDir = path.join(root, 'cloud', 'site');
fs.mkdirSync(siteDir, { recursive: true });
fs.writeFileSync(path.join(siteDir, 'index.html'), html); // 与 dist 同源:96 卡注入+全内联
for (const stale of ['css', 'js']) {
  const p = path.join(siteDir, stale);
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}
console.log('cloud/site synced ✅ (index.html=自包含构建产物 ' + (html.length / 1024).toFixed(1) + ' KB)');
