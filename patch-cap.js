/* v3.0 时间胶囊（裁决版：全文仅本地，元数据上云供对方可见倒计时） */
const fs = require('fs');
let log = [];

/* ===== app.js：胶囊状态 + 渲染 + 绑定 ===== */
let s = fs.readFileSync('js/app.js', 'utf8');

/* 渲染函数（加在 renderThings 前面，文件级别定义一次） */
if (!s.includes('function renderCapsules')) {
  const anchor = '  /* ---------- 📊 需求体检（主权化） ---------- */';
  if (!s.includes(anchor)) { console.error('capsule anchor miss'); process.exit(1); }
  const fn = [
    '  /* ---------- ⏳ 时间胶囊 ---------- */',
    '  function renderCapsules() {',
    '    const d = daily(), p = profile();',
    '    const caps = jget(\'cd.capsules\', []);',
    '    const t = today();',
    '    const rows = caps.map(c => {',
    '      const dd = Math.ceil((new Date(c.unlock + \'T12:00:00\') - new Date(t + \'T12:00:00\')) / 86400000);',
    '      const toName = c.to === \'her\' ? p.her : (c.to === \'you\' ? p.you : p.her);',
    '      if (dd > 0) return `<div class="cap locked">🔒 给 ${esc(toName)} 的胶囊 · 还有 <b>${dd}</b> 天可拆</div>`;',
    '      return `<div class="cap ready">🔓 <b>可拆了！</b>（${c.unlock} 封存）<button class="btn-mini" data-open="${c.id}">拆信</button></div>`;',
    '    }).join(\'\');',
    '    const opened = jget(\'cd.openedCapsules\', []);',
    '    return `<div class="card capsule">',
    '      <h3>⏳ 时间胶囊</h3>',
    '      <p class="hint">写一段话封存起来，选个日子才会出现。写给 TA，或写给未来的你们。</p>',
    '      <textarea id="cap-text" class="need-input" maxlength="200" placeholder="写给未来的 TA / 未来的我们…"></textarea>',
    '      <div class="draw-bar">',
    '        <select id="cap-unlock"><option value="7">1 周后可拆</option><option value="30">1 个月后可拆</option><option value="90">3 个月后可拆</option></select>',
    '        <select id="cap-to"><option value="her">给 ${esc(p.her)}</option><option value="you">给 ${esc(p.you)}</option><option value="us">给未来的我们</option></select>',
    '        <button class="btn-mini" id="cap-seal">🔒 封存</button>',
    '      </div>',
    '      ${rows}',
    '    </div>`;',
    '  }',
    '',
    '  function bindCapsules() {',
    '    const seal = document.getElementById(\'cap-seal\');',
    '    if (!seal) return;',
    '    seal.addEventListener(\'click\', () => {',
    '      const text = (document.getElementById(\'cap-text\') || {}).value || \'\';',
    '      if (!text.trim()) { if (window.toast) toast(\'先写点内容再封存。\', true); return; }',
    '      const days = parseInt((document.getElementById(\'cap-unlock\') || {}).value || \'7\', 10);',
    '      const unlockD = new Date(); unlockD.setDate(unlockD.getDate() + days);',
    '      const us = new Date().toISOString().slice(0, 10);',
    '      const unlock = unlockD.getFullYear() + \'-\' + String(unlockD.getMonth() + 1).padStart(2, \'0\') + \'-\' + String(unlockD.getDate()).padStart(2, \'0\');',
    '      const caps = jget(\'cd.capsules\', []);',
    '      const c = { id: (window.DramaBinding.uuid ? window.DramaBinding.uuid() : String(Date.now())), text: text.trim().slice(0, 500), unlock, created: us, to: (document.getElementById(\'cap-to\') || {}).value || \'her\', opened: false };',
    '      caps.push(c); jset(\'cd.capsules\', caps);',
    '      if (window.GistSync) window.GistSync.syncState().catch(() => {}); // 元数据上云（不含全文）',
    '      if (window.toast) toast(\'🔒 已封存。\' + days + \' 天后可拆。\');',
    '      renderToday();',
    '    });',
    '    document.querySelectorAll(\'[data-open]\').forEach(b => b.addEventListener(\'click\', () => {',
    '      const caps = jget(\'cd.capsules\', []);',
    '      const c = caps.find(x => x.id === b.dataset.open);',
    '      if (c && !c.opened) { c.opened = true; jset(\'cd.capsules\', caps);',
    '        if (window.toast) toast(\'🔓 \\' + \'n\' + esc(c.text)); renderToday(); }',
    '    }));',
    '  }',
    ''
  ].join('\n');
  s = s.replace(anchor, fn + '\n' + anchor);
  log.push('capsule fns');
}

/* 今日剧场 html：免战卡前插入时间胶囊卡（含"TA 的胶囊"提示） */
if (!s.includes('class="card capsule"')) {
  const o = '      <div class="card">\n        <h3>🎫 免战牌</h3>';
  if (!s.includes(o)) { console.error('free card anchor miss'); process.exit(1); }
  const n = [
    '      <div class="card capsule" id="capsule-slot">${renderCapsules()}</div>',
    '',
    '      <div class="card">',
    '        <h3>🎫 免战牌</h3>'
  ].join('\n');
  s = s.replace(o, n);
  log.push('capsule card');
}
fs.writeFileSync('js/app.js', s);
log.push('render fn');
console.log('step1:', log.join(', '));
