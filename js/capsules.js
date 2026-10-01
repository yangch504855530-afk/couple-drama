/* 《双人戏精》时间胶囊模块 v3.0
 * 裁决版设计：全文仅存本机（隐私），元数据（有信+解锁日）经 GistSync.syncState 上云让对方可见倒计时。
 * 浏览器挂 window.DramaCapsules = { render, bind }，由 app.js 在 renderToday 后调用。
 */
(function (global) {
  'use strict';

  const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
  const jget = (k, d) => { try { const v = LS(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const jset = (k, v) => LS(k, JSON.stringify(v));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  function list() { return jget('cd.capsules', []); }
  function save(list2) { jset('cd.capsules', list2); }

  function daysUntil(unlock) {
    return Math.ceil((new Date(unlock + 'T12:00:00') - new Date(today() + 'T12:00:00')) / 86400000);
  }

  function toastMsg(html, isErr) {
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
    el.innerHTML = html; el.className = 'show' + (isErr ? ' err' : '');
    clearTimeout(el._tm); el._tm = setTimeout(() => { el.className = ''; }, isErr ? 7000 : 4000);
  }

  /* 渲染：挂到 selector 容器。profile 传 {you, her} 供称呼。 */
  function render(selector, profile) {
    const slot = document.querySelector(selector); if (!slot) return;
    const p = profile || { you: '你', her: '她' };
    const caps = list();
    const t = today();
    const rows = caps.map(c => {
      const dd = daysUntil(c.unlock);
      const toName = c.to === 'you' ? p.you : p.her;
      if (c.opened && dd <= 0) {
        return '<div class="cap opened">🔓 <b>' + esc(c.text) + '</b><div class="cap-meta">' + esc(c.created) + ' 封存 · 已拆</div></div>';
      }
      if (dd > 0) {
        return '<div class="cap locked">🔒 给 ' + esc(toName) + ' 的胶囊 · 还有 <b>' + dd + '</b> 天可拆<div class="cap-meta">' + esc(c.created) + ' 封存</div></div>';
      }
      return '<div class="cap ready">🔓 <b>可拆了！</b>（' + esc(c.created) + ' 封存）<div class="cap-meta">' + esc(c.text) + '</div><button class="btn-mini" data-open="' + c.id + '">💛 拆信</button></div>';
    }).join('');
    slot.innerHTML = [
      '<div class="card capsule">',
      '  <h3>⏳ 时间胶囊</h3>',
      '  <p class="hint">写一段话封存起来，选个日子才会出现。写给 TA，或写给未来的你们。</p>',
      '  <textarea id="cap-text" class="need-input" maxlength="200" placeholder="写给未来的 TA / 未来的我们…"></textarea>',
      '  <div class="draw-bar">',
      '    <select id="cap-unlock"><option value="7">1 周后可拆</option><option value="30">1 个月后可拆</option><option value="90">3 个月后可拆</option></select>',
      '    <select id="cap-to"><option value="her">给 ' + esc(p.her) + '</option><option value="you">给 ' + esc(p.you) + '</option><option value="us">给未来的我们</option></select>',
      '    <button class="btn-mini" id="cap-seal">🔒 封存</button>',
      '  </div>',
      rows ? '<div class="cap-list">' + rows + '</div>' : ''
    ].join('\n');
    document.getElementById('cap-seal').addEventListener('click', () => {
      const text = (document.getElementById('cap-text').value || '').trim();
      if (!text) { toastMsg('先写点内容再封存。', true); return; }
      const days = parseInt((document.getElementById('cap-unlock') || {}).value || '7', 10);
      const ud = new Date(); ud.setDate(ud.getDate() + days);
      const unlock = ud.getFullYear() + '-' + String(ud.getMonth() + 1).padStart(2, '0') + '-' + String(ud.getDate()).padStart(2, '0');
      const caps = list();
      caps.push({ id: global.DramaBinding ? global.DramaBinding.uuid() : String(Date.now()), text: text.slice(0, 500), unlock, created: today(), to: (document.getElementById('cap-to') || {}).value || 'her', opened: false });
      save(caps);
      if (window.GistSync) window.GistSync.syncState().catch(() => {});
      toastMsg('🔒 已封存，' + days + ' 天后可拆。到时候见。');
      render(selector, profile);
    });
    document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => {
      const caps = list();
      const c = caps.find(x => x.id === b.dataset.open);
      if (c && !c.opened) {
        c.opened = true; save(caps);
        toastMsg('🔓 ' + esc(c.text));
        render(selector, profile);
      }
    }));
  }

  global.DramaCapsules = { render, list };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.DramaCapsules;
})(typeof window !== 'undefined' ? window : globalThis);
