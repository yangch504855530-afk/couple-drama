/* 《双人戏精》视图层 v4.0「同框版」
 * 裁决(SCOPE-CUT-20261002)：一台手机打开就玩。主线=今日剧场(推荐场次/手气抽→演→收尾互夸→战报)；
 * 分支1=🪜 台阶(吵架急救，平时不出现)；分支2=🎁 百宝箱(小事清单/时间胶囊/卡池全集/我们的记录/设置)。
 * v4.0 下架：绑定/云同步/需求条/回应卡/体检/角色/想你了/关系气候(UI)——binding.js 与 github-sync.js 保留仓库但不再加载。
 * 规则红线：免战每人每天 2 张(E.FREE_PER_DAY)；休演与开演互斥；文案指名道姓，不裸用"你/TA"。
 */
(function () {
  'use strict';
  const D = window.DramaData, E = window.DramaEngine;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pad2 = n => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
  const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };

  const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
  const jget = (k, d) => { try { const v = LS(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const jset = (k, v) => LS(k, JSON.stringify(v));

  const profile = () => { const p = jget('cd.profile', { you: '你', her: '她', since: '', nextMeet: '' });
    if (!p.you) p.you = '你'; if (!p.her) p.her = '她'; return p; };
  const daily = () => {
    const k = 'cd.daily.' + today(); let d = jget(k, null);
    if (!d) d = { mainDone: false, sideDone: false, drawn: [], freeUsed: { you: 0, her: 0 }, energy: 'normal', restDay: false };
    // 状态规范化：开演与休演互斥（G2.2）
    if (d.restDay && (d.mainDone || d.sideDone)) { d.restDay = false; jset(k, d); }
    return d;
  };
  const saveDaily = d => jset('cd.daily.' + today(), d);
  const logAll = () => jget('cd.log', []);
  const CADENCES = [1, 2, 3, 7];
  const cadence = () => { const c = jget('cd.cadence', 1); return CADENCES.includes(c) ? c : 1; };
  const CADENCE_LABEL = { 1: '每天一场', 2: '两天一场', 3: '三天一场', 7: '每周一场' };
  const FREE_TOTAL = E.FREE_PER_DAY * 2;

  let toastTimer = null;
  let lastLucky = 0; // 手气抽冷却（防连点手滑烧卡池）
  function toast(html, isErr) {
    let el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
    el.innerHTML = html; el.className = 'show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.className = ''; }, isErr ? 6000 : 3200);
  }

  function switchTab(name) {
    curTab = name;
    if (RENDERERS[name]) { try { RENDERERS[name](); } catch (e) { console.error(e); toast('⚠️ 页面渲染出错：' + esc(e.message), true); } }
    document.querySelectorAll('section.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + name));
    document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    window.scrollTo({ top: 0 });
  }
  let curTab = 'today';

  /* v4.6.1:弃用原生 <input type="date">(各环境日历/滚轮行为不一,微信里选日要多点一次)——三下拉全环境一致 */
  function dateSelectsHtml(value) {
    const parts = (value || '').split('-');
    const y0 = +parts[0] || 0, m0 = +parts[1] || 0, d0 = +parts[2] || 0;
    const thisYear = new Date().getFullYear();
    let yOpts = '<option value="">年</option>';
    for (let i = thisYear; i >= thisYear - 60; i--) yOpts += `<option value="${i}"${y0 === i ? ' selected' : ''}>${i}</option>`;
    let mOpts = '<option value="">月</option>';
    for (let i = 1; i <= 12; i++) mOpts += `<option value="${i}"${m0 === i ? ' selected' : ''}>${i}月</option>`;
    let dOpts = '<option value="">日</option>';
    for (let i = 1; i <= 31; i++) dOpts += `<option value="${i}"${d0 === i ? ' selected' : ''}>${i}</option>`;
    return `<div class="date3"><select data-k="y">${yOpts}</select><select data-k="m">${mOpts}</select><select data-k="d">${dOpts}</select></div>`;
  }
  function readDate3(box) {
    if (!box) return '';
    const g = k => { const el = box.querySelector(`[data-k="${k}"]`); return el ? el.value : ''; };
    const y = g('y'), m = g('m'), d = g('d');
    if (!y || !m || !d) return '';
    return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  /* ---------- 🚪 首次引导(v4.6 三幕式:艺名→选台→邀请函;全程可跳过,邀请永不拦截) ---------- */
  const OB = { you: '', her: '', since: '' }; // 幕间暂存
  function obMask() {
    let mask = document.getElementById('onboard');
    if (!mask) { mask = document.createElement('div'); mask.id = 'onboard'; document.body.appendChild(mask); }
    return mask;
  }
  function obFinish(named, hintToast) {
    const pf = profile();
    if (named) {
      pf.you = OB.you || '你'; pf.her = OB.her || '她';
      if (OB.since) pf.since = OB.since;
      jset('cd.profile', pf);
    }
    jset('cd.onboarded', true);
    const mask = document.getElementById('onboard'); if (mask) mask.remove();
    renderAll(); switchTab('today');
    if (hintToast) toast(hintToast);
    const qs = document.querySelector('.quickstart');
    if (qs) setTimeout(() => qs.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
  }
  /* 幕一·艺名 */
  function showOnboarding() {
    const mask = obMask();
    mask.innerHTML = `
      <div class="onboard-card">
        <div class="ob-spot"></div>
        <div class="ob-logo">🎭</div>
        <h2>双人戏精</h2>
        <p class="ob-sub">一台手机也能开演的情侣小剧场<br>灯光已就位，就差你俩。</p>
        <div class="ob-names">
          <input id="ob-you" maxlength="6" placeholder="你的名字">
          <span>×</span>
          <input id="ob-her" maxlength="6" placeholder="TA 的名字">
        </div>
        <label class="ob-date">在一起的日子（选填）${dateSelectsHtml('')}</label>
        <button class="btn big" id="ob-next">入 座</button>
        <button class="ob-skip" id="ob-skip">先随便看看</button>
      </div>`;
    $('#ob-next').addEventListener('click', () => {
      OB.you = ($('#ob-you').value || '').trim().slice(0, 6);
      OB.her = ($('#ob-her').value || '').trim().slice(0, 6);
      OB.since = readDate3(mask.querySelector('.date3'));
      obStage2();
    });
    $('#ob-skip').addEventListener('click', () => obFinish(false));
    mask.addEventListener('click', e => { if (e.target === mask) obFinish(false); });
  }
  /* 幕二·选台(同框/异地分岔) */
  function obStage2() {
    const mask = obMask();
    mask.innerHTML = `
      <div class="onboard-card">
        <div class="ob-spot"></div>
        <h2 style="font-size:20px">你们怎么演？</h2>
        <p class="ob-sub">两种都可以，以后随时换。</p>
        <button class="ob-mode" id="ob-same">
          <b>🎭 同框演出</b><span>一台手机递来递去，今晚就能开演</span>
        </button>
        <button class="ob-mode" id="ob-far">
          <b>📱 异地对戏</b><span>两台手机——给 TA 发一张邀请函</span>
        </button>
        <button class="ob-skip" id="ob-skip2">先不选，直接进剧场</button>
      </div>`;
    $('#ob-same').addEventListener('click', () => {
      obFinish(true, '🎭 ' + esc(OB.you || '你') + ' × ' + esc(OB.her || '她') + '——现在就把手机递给 TA，开演！');
    });
    $('#ob-far').addEventListener('click', obStage3);
    $('#ob-skip2').addEventListener('click', () => obFinish(true));
    mask.onclick = e => { if (e.target === mask) obFinish(true); };
  }
  /* 幕三·邀请函(自动建房+canvas 邀请卡+可复制邀请链接;失败/跳过都不拦截) */
  function obStage3() {
    const mask = obMask();
    mask.innerHTML = `
      <div class="onboard-card">
        <div class="ob-spot"></div>
        <h2 style="font-size:20px">你的剧场，虚位以待</h2>
        <p class="ob-sub" id="ob-inv-msg">正在搭建你们的剧场…</p>
        <div id="ob-inv-body"></div>
        <button class="ob-skip" id="ob-skip3">TA 还没空？先自己演</button>
      </div>`;
    $('#ob-skip3').addEventListener('click', () => obFinish(true));
    mask.onclick = e => { if (e.target === mask) obFinish(true); };
    (async () => {
      try {
        const st = await window.CloudSync.createRoom();
        if (window.CloudSync.isBound()) window.CloudSync.startAuto(30, handleRemoteEvents);
        $('#ob-inv-msg').textContent = '邀请函已生成——长按保存，微信发给 TA：';
        $('#ob-inv-body').innerHTML = makeInviteCard(st.code)
          + '<button class="btn big" id="ob-copy-link" style="margin-top:10px">📋 复制邀请链接（点开即入座）</button>';
        const link = location.href.split('#')[0] + '#r=' + st.code;
        $('#ob-copy-link').addEventListener('click', () => {
          const done = () => toast('📋 链接已复制——微信发给 TA，TA 点开就能入座。');
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, () => { const ta = document.createElement('textarea'); ta.value = link; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done(); });
          else { const ta = document.createElement('textarea'); ta.value = link; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done(); }
        });
      } catch (e) {
        $('#ob-inv-msg').textContent = '剧场暂时没搭起来（' + esc(String(e.message || e)) + '）——先自己演，之后在百宝箱「双人同步」里再邀请 TA。';
      }
    })();
  }
  /* 邀请函 canvas:双追光+虚位以待+大号房间码+固定域名二维码(手动输码兜底) */
  function makeInviteCard(code) {
    const pf = { you: OB.you || '你', her: OB.her || '她' };
    const cv = document.createElement('canvas'); cv.width = 750; cv.height = 1200;
    const ctx = cv.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 1200);
    g.addColorStop(0, '#2a1c4d'); g.addColorStop(1, '#17102a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 750, 1200);
    // 双追光(品牌视觉:两束半透明光柱交叉)
    const sp1 = ctx.createRadialGradient(180, 160, 20, 180, 160, 420);
    sp1.addColorStop(0, 'rgba(232,176,75,.16)'); sp1.addColorStop(1, 'transparent');
    ctx.fillStyle = sp1; ctx.fillRect(0, 0, 750, 1200);
    const sp2 = ctx.createRadialGradient(580, 240, 20, 580, 240, 420);
    sp2.addColorStop(0, 'rgba(232,160,160,.13)'); sp2.addColorStop(1, 'transparent');
    ctx.fillStyle = sp2; ctx.fillRect(0, 0, 750, 1200);
    ctx.strokeStyle = 'rgba(232,176,75,.5)'; ctx.lineWidth = 2; ctx.strokeRect(24, 24, 702, 1152);
    const center = (t, y, font, color) => { ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.fillText(t, 375, y); };
    center('🎭 双人戏精', 130, 'bold 46px Georgia, "Noto Serif SC", serif', '#e8b04b');
    center('你的剧场，虚位以待', 210, 'bold 40px Georgia, "Noto Serif SC", serif', '#f2ecff');
    center(pf.you, 380, 'bold 52px Georgia, serif', '#ffd9a0');
    center('×', 440, '34px serif', '#b3a6d6');
    center(pf.her === '她' ? '—— 虚位以待 ——' : pf.her, 500, 'bold 52px Georgia, serif', pf.her === '她' ? '#7d6fa8' : '#ffd9a0');
    center('TA 的手机扫下方二维码进剧场', 620, '24px "Microsoft YaHei", sans-serif', '#b3a6d6');
    // 大号房间码(手动输入兜底)
    ctx.setLineDash([8, 6]); ctx.strokeStyle = '#e8b04b';
    ctx.strokeRect(150, 660, 450, 120); ctx.setLineDash([]);
    center(code, 740, 'bold 72px Georgia, serif', '#e8b04b');
    center('（在剧场里输入这串码，也能入座）', 815, '20px "Microsoft YaHei", sans-serif', '#b3a6d6');
    // 固定域名二维码
    drawQr(ctx, 285, 860, 6, 10); // 25*6=150+静区20 → 190 宽,居中 285..475
    center('yangch.website', 1090, 'bold 30px Georgia, serif', '#e8b04b');
    center('台阶直达 TA 手机 · 演砸了也是节目效果', 1135, '20px "Microsoft YaHei", sans-serif', '#b3a6d6');
    const url = cv.toDataURL('image/png');
    return `<img class="report-img" alt="邀请函" src="${url}">`;
  }
  /* 扫邀请链接自动入座:URL 带 #r=房间码 → 弹「接过戏票」(预填码+自报名字,一键加入) */
  function maybeJoinFromHash() {
    const m = (location.hash || '').match(/#r=([2-9A-HJKMNP-Z]{6})/i);
    if (!m) return false;
    const code = m[1].toUpperCase();
    history.replaceState(null, '', location.pathname + location.search); // 清掉 hash 防刷新重复弹
    if (window.CloudSync && window.CloudSync.isBound()) return false; // 已在座,不再弹
    const mask = obMask();
    mask.innerHTML = `
      <div class="onboard-card">
        <div class="ob-spot"></div>
        <div class="ob-logo">🎟️</div>
        <h2 style="font-size:20px">有人递来一张戏票</h2>
        <p class="ob-sub">房间码已带到：<b style="color:#e8b04b;font-size:20px;letter-spacing:3px">${esc(code)}</b></p>
        <input id="jt-name" class="jt-input" maxlength="6" placeholder="你的名字">
        <button class="btn big" id="jt-go">接过戏票，入座</button>
        <button class="ob-skip" id="jt-skip">先不加入</button>
        <p class="hint" id="jt-msg" style="margin-top:8px"></p>
      </div>`;
    mask.onclick = e => { if (e.target === mask) closeJoin(mask); };
    $('#jt-skip').addEventListener('click', () => closeJoin(mask));
    $('#jt-go').addEventListener('click', async () => {
      const name = ($('#jt-name').value || '').trim().slice(0, 6);
      if (name) { const pf = profile(); pf.you = name; jset('cd.profile', pf); }
      $('#jt-msg').textContent = '正在入座…';
      try {
        await window.CloudSync.joinRoom(null, code);
        window.CloudSync.startAuto(30, handleRemoteEvents);
        jset('cd.onboarded', true);
        mask.remove();
        renderAll(); switchTab('today');
        toast('🎭 角色已定，对手戏开演——TA 递的台阶会直接到你手机上。');
      } catch (e) {
        $('#jt-msg').textContent = '❌ ' + (e.message || '入座失败') + '——确认码没输错？或稍后再试。';
      }
    });
    return true;
  }
  function closeJoin(mask) {
    mask.remove();
    if (!jget('cd.onboarded', false)) showOnboarding(); // 没走过引导的,回到正常首启
  }

  /* ---------- 派生状态 ---------- */
  function deriveState() {
    const log = logAll();
    const doneDates = [...new Set(log.map(x => x.date))];
    const suitDone = {};
    log.forEach(x => { const c = D.CARDS.find(y => y.id === x.cardId); if (c) suitDone[c.suit] = (suitDone[c.suit] || 0) + 1; });
    let freeLast7 = 0; const restDays = new Set();
    for (let i = 0; i < 30; i++) {
      const key = daysAgo(i);
      const dd = jget('cd.daily.' + key, null);
      if (dd) {
        if (i < 7 && dd.freeUsed && typeof dd.freeUsed === 'object') freeLast7 += (dd.freeUsed.you || 0) + (dd.freeUsed.her || 0);
        if (dd.restDay) restDays.add(key);
      }
    }
    const repair = jget('cd.repair', []);
    const praise = jget('cd.praise', []);
    const weekPraise = praise.filter(x => x.date >= daysAgo(6));
    return {
      doneCount: log.length, doneDates, suitDone, freeLast7, restDays,
      daysTogether: E.daysTogether(profile().since || null, today()),
      streak: E.computeCadenceStreak(new Set(doneDates), today(), cadence(), restDays),
      lastDone: doneDates.length ? doneDates[doneDates.length - 1] : null,
      last30Done: doneDates.filter(d => d >= daysAgo(29)).length,
      repairSent: repair.length, repairCaught: repair.filter(x => x.caught === true).length,
      praiseCount: praise.length, praiseWeek: weekPraise.length, weekPraise
    };
  }

  /* ---------- 🎬 今日剧场 ---------- */
  function renderToday() {
    const d = daily(), p = profile(), st = deriveState();
    const q = E.pickDaily(D.CARDS, today(), d.energy);
    const todayLog = logAll().filter(x => x.date === today());
    const logCache = logAll();
    const strip = Array.from({ length: 30 }, (_, i) => {
      const key = daysAgo(29 - i);
      const cls = logCache.some(x => x.date === key) ? 'dot done' : (st.restDays.has(key) ? 'dot rest' : 'dot');
      return `<span class="${cls}" title="${key}"></span>`;
    }).join('');
    const pending = jget('cd.repair', []).find(x => x.date === today() && x.caught === null);
    const dueLine = st.lastDone === null ? '🎬 首演随时开始。' : (() => {
      const due = E.daysUntilDue(st.lastDone, today(), cadence());
      return due <= 0 ? '✨ 今天正好该演了——一张卡，一个夜晚。'
        : '🌙 距下一场还有 <b>' + due + '</b> 天（' + esc(CADENCE_LABEL[cadence()]) + '）；想提前演也随你。';
    })();
    const lastDrawn = (d.drawn && d.drawn.length) ? D.CARDS.find(c => c.id === d.drawn[d.drawn.length - 1]) : null;
    const remotePendings = jget('cd.remoteRepair', []).filter(x => x.date === today() && x.acked === null); // v4.2 远端台阶

    const root = $('#view-today');
    const isNew = st.doneCount < 3; // v4.6 首屏减重:前 3 场只当"戏单",杂项让路
    const loveCard = `
      <div class="love-days card">
        <div class="ld-num">${st.daysTogether === null
          ? '<b style="font-size:22px">💕</b><span style="font-size:13px;margin-left:8px">还没填纪念日 · 去「百宝箱 → 设置」</span>'
          : '<b>' + st.daysTogether + '</b><span>天</span>'}</div>
        <div class="ld-set">
          <div class="names">
            <input id="pf-you" value="${esc(p.you)}" maxlength="6" title="左边这位的名字">
            <span class="amp">×</span>
            <input id="pf-her" value="${esc(p.her)}" maxlength="6" title="右边这位的名字">
          </div>
          <div class="ld-next">${p.nextMeet ? (() => {
            const dd = Math.ceil((new Date(p.nextMeet + 'T12:00:00') - new Date(today() + 'T12:00:00')) / 86400000);
            return dd > 0 ? '距离下次见面还有 <b>' + dd + '</b> 天' : (dd === 0 ? '今天见面！' : '');
          })() : '纪念日与见面日可在「🎁 百宝箱 → 设置」里填'}</div>
        </div>
      </div>`;
    const questCard = `
      <div class="card quest">
        <h3>📜 今晚的场次 <span class="count">已演 ${todayLog.length} 场（加场不另计） ｜ 演了是收利，不演也没关系</span></h3>
        <p class="hint due-line">${dueLine}</p>
        ${st.doneCount === 0 ? `
        <div class="quickstart">
          <div class="qs-head">⚡ 第一次玩？<b>两分钟极简场</b>——读出来就算演，尬住也算节目效果</div>
          ${(() => {
            const qs = D.CARDS.filter(c => c.minutes <= 5);
            const pick3 = qs.slice().sort(() => Math.random() - 0.5).slice(0, 3);
            return '<div class="qs-cards">' + pick3.map(c =>
              `<button class="qs-card" data-qs="${c.id}"><b>${esc(c.title)}</b><span>${c.minutes} 分钟 · ${esc(D.SUITS[c.suit].name)}</span></button>`).join('') + '</div>';
          })()}
          <p class="hint">随便点一张，照着读完就算演完——没有观众，只有 TA。</p>
        </div>` : ''}
        ${q.main ? `<label class="q"><input type="checkbox" id="q-main" ${d.mainDone ? 'checked' : ''}>
          <span class="suit-dot" style="background:${D.SUITS.gentle.color}">🌅 主场</span>
          <b>${esc(q.main.title)}</b> — ${esc(q.main.text)}<br><span class="lowmode">低配演法：两个人把这段各念一遍，念完就算演 ✅</span></label>` : ''}
        ${q.side && !isNew ? `<details class="more-shows"><summary>更多场次</summary><label class="q"><input type="checkbox" id="q-side" ${d.sideDone ? 'checked' : ''}>
          <span class="suit-dot" style="background:${D.SUITS.fun.color}">🎭 加场</span>
          <b>${esc(q.side.title)}</b> — ${esc(q.side.text)}<br><span class="lowmode">低配演法：两个人把这段各念一遍，念完就算演 ✅</span></label></details>` : ''}
        <div class="dgrid" id="drawn-slot">${lastDrawn ? cardHtml(lastDrawn, d.drawn || []) : ''}</div>
        <div class="draw-bar">
          <button class="btn" id="lucky">🎲 手气抽一张</button>
          <button class="mini" id="tired">${d.energy === 'low' ? '⚡ 今晚累：只出轻场（点我恢复）' : '😼 今晚累了（只出 15 分钟轻场）'}</button>
        </div>
        <p class="hint">🎭 剧场规则：演砸了是节目效果，尬住了是名场面——这里没有观众，不用演给任何人看。</p>
        ${d.restDay
          ? `<div class="restbox">🌙 今晚休演——保养日不算缺席，连击不断。<button class="mini" id="unrest">取消休演</button></div>`
          : `<button class="mini rest-btn" id="rest">🌙 今天不演了（休演不断连击）</button>`}
      </div>`;
    const wrapCard = `
      <div class="card">
        <h3>🎬 收尾 <span class="count">演完一场，别忘了这两步</span></h3>
        <p class="hint">研究发现：稳定的亲密关系里，积极互动是消极互动的 5 倍以上。每天互存一句，存的时候不许带"但是"。</p>
        <div class="draw-bar">
          <button class="suit-btn praise-btn" id="pr-you">💛 给${esc(p.her)}存一句</button>
          <button class="suit-btn praise-btn" id="pr-her">💛 给${esc(p.you)}存一句</button>
        </div>
        <div id="praise-form" style="display:none;margin-top:8px">
          <p class="hint" id="praise-target"></p>
          <textarea id="praise-text" class="need-input" style="height:60px" maxlength="60" placeholder="一句就够，不许带'但是'…"></textarea>
          <div class="draw-bar"><button class="mini" id="praise-save">💛 存入</button><button class="mini" id="praise-cancel">取消</button></div>
        </div>
        <p class="hint">本周已存 <b>${st.praiseWeek}</b> 句 ｜ 累计 ${st.praiseCount} 句</p>
        <div class="draw-bar">
          <button class="btn" id="make-report" ${todayLog.length ? '' : 'disabled'}>📸 生成今晚战报</button>
        </div>
        ${todayLog.length ? '' : '<p class="hint">先演一场，才有战报可生成。</p>'}
        <div id="report-slot"></div>
      </div>`;
    const freeCard = `
      <div class="card">
        <h3>🎫 免战牌</h3>
        <p class="hint">打出后本回合作废，对方不许追问原因。每日每人 ${E.FREE_PER_DAY} 张，零点重置。</p>
        <div class="free-row">
          ${['you', 'her'].map(w => {
            const left = Math.max(0, E.FREE_PER_DAY - ((d.freeUsed && d.freeUsed[w]) || 0));
            return `<button class="free-btn ${left === 0 ? 'off' : ''}" data-who="${w}" ${left === 0 ? 'disabled' : ''}>
            🛡️ ${esc(p[w])}（剩 ${left} 张）</button>`;
          }).join('')}
        </div>
        <p class="hint">本日已用 ${((d.freeUsed && d.freeUsed.you) || 0) + ((d.freeUsed && d.freeUsed.her) || 0)}/${FREE_TOTAL} 张。</p>
      </div>`;
    root.innerHTML = `
      ${pending || remotePendings.length ? `<div class="card ladder-tip"><b>🪜 有台阶待回应</b>——去 <a href="#" id="tip-ladder">台阶页</a> 看看或回应。</div>` : ''}
      ${isNew ? (questCard + wrapCard) : (loveCard + questCard + wrapCard + freeCard)}`;

    // 名字：input+debounce 即时保存（G2.3），change 兜底；同步更新依赖标签（免战牌/夸夸按钮）
    const syncNameLabels = pf => {
      const dd = daily();
      document.querySelectorAll('.free-btn').forEach(b => {
        const left = Math.max(0, E.FREE_PER_DAY - ((dd.freeUsed && dd.freeUsed[b.dataset.who]) || 0));
        b.innerHTML = '🛡️ ' + esc(pf[b.dataset.who]) + '（剩 ' + left + ' 张）';
      });
      const py = $('#pr-you'), ph = $('#pr-her');
      if (py) py.textContent = '💛 给' + pf.her + '存一句';
      if (ph) ph.textContent = '💛 给' + pf.you + '存一句';
    };
    [$('#pf-you'), $('#pf-her')].forEach(inp => {
      if (!inp) return; // v4.6:新客首屏隐藏恋爱天数卡(名字框在其中),改引导里已采集
      let tm = null;
      const saveNames = () => {
        const pf = profile();
        pf.you = $('#pf-you').value.trim() || '你'; pf.her = $('#pf-her').value.trim() || '她';
        jset('cd.profile', pf);
        syncNameLabels(pf);
      };
      inp.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(saveNames, 400); });
      inp.addEventListener('change', () => { clearTimeout(tm); saveNames(); toast('✅ 名字已保存，本机记住你们了。'); });
    });

    $('#tip-ladder') && ($('#tip-ladder').onclick = e => { e.preventDefault(); switchTab('ladder'); });

    // N3 极简场:点击即入抽中池并滚动到卡位(演完按钮在卡上)
    document.querySelectorAll('.qs-card').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.qs;
      if (!d.drawn.includes(id)) { d.drawn.push(id); saveDaily(d); }
      const card = D.CARDS.find(c => c.id === id);
      toast('⚡ 这张就是你们的第一场：' + esc(card.title) + '——照着读完就算演完。');
      renderToday();
      setTimeout(() => { const el = document.querySelector('#drawn-slot .done-btn'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 80);
    }));

    [['#q-main', 'mainDone'], ['#q-side', 'sideDone']].forEach(([sel, key]) => {
      const el = $(sel); if (!el) return;
      el.addEventListener('change', () => {
        d[key] = el.checked; saveDaily(d);
        if (el.checked) toast('🎬 开演！');
        const log = logAll();
        const qi = log.findIndex(x => x.cardId === 'daily:quest' && x.date === today());
        if (d.mainDone && d.sideDone) {
          if (qi < 0) { log.unshift({ cardId: 'daily:quest', date: today(), ts: Date.now(), note: '' }); jset('cd.log', log); }
          const st2 = deriveState(); toast('🏆 今日场次杀青！' + (st2.streak > 1 ? '节拍连演 ' + st2.streak + ' 场。' : '记得领取精神奖励。'));
        } else if (qi >= 0) { log.splice(qi, 1); jset('cd.log', log); } // 卸勾回滚（G2.2）
        checkAchievements(); renderToday();
      });
    });
    $('#lucky').addEventListener('click', () => {
      if (Date.now() - lastLucky < 3000) { toast('刚抽过一张——先演这张，或缓一口气再抽。', true); return; }
      lastLucky = Date.now();
      let pool = d.energy === 'low' ? D.CARDS.filter(c => c.minutes <= 15) : D.CARDS.slice();
      // 48h 内递过台阶：五成概率偏温柔戏（递台阶后的安全牌）
      const recentRepair = jget('cd.repair', []).filter(x => x.date >= daysAgo(2)).length > 0;
      let picked = null;
      if (recentRepair && Math.random() < 0.5) picked = E.drawFromSuit(pool, 'gentle', d.drawn);
      if (!picked) picked = E.drawFromSuit(pool, null, d.drawn);
      if (!picked) { toast('今天的卡全抽完了——都是你们的了，明天再来。', true); return; }
      d.drawn.push(picked.id); saveDaily(d);
      toast('抽中【' + esc(D.SUITS[picked.suit].name) + '】<b>' + esc(picked.title) + '</b>：' + esc(picked.text));
      renderToday();
    });
    $('#tired').addEventListener('click', () => {
      d.energy = d.energy === 'low' ? 'normal' : 'low'; saveDaily(d); renderToday();
      if (d.energy === 'low') toast('😼 低迷日电量已记录——今天只出 15 分钟内的轻场，60 分钟的卡都藏起来了。');
    });
    const rb = $('#rest'); if (rb) rb.addEventListener('click', () => {
      if (d.mainDone || d.sideDone) {
        const n = logAll().filter(x => x.date === today()).length;
        toast(n > 0 ? '今天已经开演 ' + n + ' 场了，不需要休演——好好享受今晚。' : '今天已经开了场次，不需要休演——好好享受今晚。', true);
        return;
      }
      d.restDay = true; saveDaily(d); toast('🌙 好的剧场也懂散场。明晚，灯照常亮。'); renderToday();
    });
    const ub = $('#unrest'); if (ub) ub.addEventListener('click', () => { d.restDay = false; saveDaily(d); renderToday(); });
    $('#pr-you').addEventListener('click', () => showPraiseForm('you', 'her'));
    $('#pr-her').addEventListener('click', () => showPraiseForm('her', 'you'));
    const pfSave = $('#praise-save'); if (pfSave) pfSave.addEventListener('click', () => savePraise($('#praise-form').dataset.from, $('#praise-form').dataset.to));
    const pfCancel = $('#praise-cancel'); if (pfCancel) pfCancel.addEventListener('click', () => { $('#praise-form').style.display = 'none'; });
    const mr = $('#make-report');
    if (mr && !mr.disabled) mr.addEventListener('click', makeReport);
    document.querySelectorAll('.free-btn').forEach(b => b.addEventListener('click', () => {
      if (!d.freeUsed || typeof d.freeUsed !== 'object') d.freeUsed = { you: 0, her: 0 };
      const who = b.dataset.who;
      if ((d.freeUsed[who] || 0) >= E.FREE_PER_DAY) { toast(esc(p[who]) + '的免战牌今天用完了——按规则，戏码得演完。', true); return; }
      d.freeUsed[who] = (d.freeUsed[who] || 0) + 1; saveDaily(d);
      toast('🛡️ ' + esc(p[who]) + ' 打出免战牌，本回合作废，不追问。');
      renderToday();
    }));
    bindDone();
  }

  /* v4.4.2:夸夸改为页面内联输入(prompt() 在微信 iOS WebView 不稳定且手机体验差) */
  const PRAISE_SEEDS = ['今天 TA 替你挡的一件小事', 'TA 最近让你心动的一个瞬间', 'TA 做得越来越像 TA 想成为的样子的一处'];
  function showPraiseForm(from, to) {
    const form = $('#praise-form'); if (!form) return;
    form.style.display = 'block';
    const seed = PRAISE_SEEDS[Math.floor(Math.random() * PRAISE_SEEDS.length)];
    $('#praise-target').innerHTML = '给 <b>' + esc(profile()[to]) + '</b> 存一句夸夸（一句就够，不许带"但是"）<br>灵感：' + esc(seed) + '？';
    const ta = $('#praise-text'); ta.value = '';
    form.dataset.from = from; form.dataset.to = to;
    setTimeout(() => ta.focus(), 50);
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function savePraise(from, to) {
    const form = $('#praise-form'); if (!form) return;
    const ta = $('#praise-text');
    const text = (ta.value || '').trim();
    if (!text) { toast('先写一句——空着存不了。', true); return; }
    if (/但是|可是|不过/.test(text)) {
      toast('❌ 这句话里有"但是"——夸夸就纯粹一点，改一改再存？', true); return;
    }
    const arr = jget('cd.praise', []);
    arr.unshift({ ts: Date.now(), date: today(), from, to, text: text.slice(0, 60) });
    jset('cd.praise', arr.slice(0, 100));
    checkAchievements();
    toast('💛 已存入存折。被夸的人现在就可以看。');
    form.style.display = 'none';
    renderToday();
  }

  /* ---------- 📸 战报（canvas，纯前端零请求） ---------- */
  /* N5.1 真二维码:矩阵离线预生成(qrcode-generator lib, version2/ECC-M, 内容=https://yangch.website),
   * 运行时零依赖零计算,保证可扫。重新生成:见 tests/qr.test.js 头部注释。 */
  const QR_YANGCH = { size: 25, hex: 'fe2e3fc14e506ea06bb75c95dba62aec122507faaafe01870082bfe72eef8f87ee4d74117d9eef0a0d24588a2f8d7728d52db7aefa0060443f8b2a304a710ba11fbdd37b0ee99c1b04d9f1febc848' };
  function drawQr(ctx, x, y, modulePx, quietPx) {
    const q = quietPx === undefined ? Math.ceil(modulePx * 2.5) : quietPx; // 静区≥2模块,扫码器要求
    const s = QR_YANGCH.size;
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, s * modulePx + q * 2, s * modulePx + q * 2);
    ctx.fillStyle = '#17102a';
    for (let r = 0; r < s; r++) {
      for (let c = 0; c < s; c++) {
        const bitPos = r * s + c;
        const hexChar = parseInt(QR_YANGCH.hex[bitPos >> 2], 16);
        if ((hexChar >> (3 - (bitPos & 3))) & 1) {
          ctx.fillRect(x + q + c * modulePx, y + q + r * modulePx, modulePx, modulePx);
        }
      }
    }
  }
  function wrapText(ctx, text, maxWidth) {
    const lines = []; let line = '';
    for (const ch of String(text)) {
      if (ctx.measureText(line + ch).width > maxWidth && line) { lines.push(line); line = ch; }
      else line += ch;
    }
    if (line) lines.push(line);
    return lines;
  }
  function makeReport() {
    const p = profile();
    const todayLog = logAll().filter(x => x.date === today());
    if (!todayLog.length) { toast('先演一场，才有战报可生成。', true); return; }
    const cv = document.createElement('canvas'); cv.width = 900; cv.height = 1200;
    const ctx = cv.getContext('2d');
    // N5 梗图化:高对比底 + 大字标题 + 表情符号大字 + 引用块 + 底部醒目域名条
    const g = ctx.createLinearGradient(0, 0, 0, 1200);
    g.addColorStop(0, '#2a1c4d'); g.addColorStop(1, '#17102a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 900, 1200);
    ctx.strokeStyle = 'rgba(232,176,75,.5)'; ctx.lineWidth = 2; ctx.strokeRect(28, 28, 844, 1144);
    const center = (t, y, font, color) => { ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.fillText(t, 450, y); };
    // 梗图式大标题
    const mainCount = todayLog.length;
    center('🎭 今晚开演 ' + mainCount + ' 场', 150, 'bold 60px "Microsoft YaHei", sans-serif', '#e8b04b');
    center(p.you + ' × ' + p.her + ' ｜ ' + today(), 205, '26px "Microsoft YaHei", sans-serif', '#b3a6d6');
    ctx.strokeStyle = 'rgba(232,176,75,.35)'; ctx.beginPath(); ctx.moveTo(120, 240); ctx.lineTo(780, 240); ctx.stroke();
    // 大表情 + 戏码名(梗图视觉核心)
    let y = 330;
    todayLog.slice(0, 4).forEach(x => {
      const c = D.CARDS.find(cc => cc.id === x.cardId);
      const icon = x.cardId === 'daily:quest' ? '📜' : (c ? D.SUITS[c.suit].icon : '🎭');
      const title = x.cardId === 'daily:quest' ? '今日剧本杀青' : (c ? c.title : '一场好戏');
      center(icon, y + 60, '84px serif', '#f2ecff');
      center(title, y + 130, 'bold 40px "Microsoft YaHei", sans-serif', '#f2ecff');
      y += 170;
    });
    // 今晚金句(引用块)
    const praises = jget('cd.praise', []).filter(x => x.date === today());
    const quote = (todayLog.find(x => x.note) || {}).note || (praises[0] || {}).text || '演砸了也算节目效果,我们笑场了。';
    y = Math.max(y + 20, 950);
    ctx.fillStyle = 'rgba(232,176,75,.08)';
    ctx.fillRect(90, y - 40, 720, 110);
    ctx.strokeStyle = '#e8b04b'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(90, y - 40); ctx.lineTo(90, y + 70); ctx.stroke();
    ctx.font = 'bold 30px "Microsoft YaHei", sans-serif';
    const lines = wrapText(ctx, '「' + quote + '」', 660);
    ctx.fillStyle = '#ffd9a0'; ctx.textAlign = 'left';
    lines.slice(0, 2).forEach((ln, i) => ctx.fillText(ln, 115, y + i * 42));
    // 底部醒目域名条+真二维码(N5.1:扫码即玩,矩阵内嵌)
    ctx.fillStyle = '#e8b04b'; ctx.fillRect(0, 1084, 900, 116);
    drawQr(ctx, 40, 1092, 3, 8); // 25*3=75 模块 + 静区 → 白框 91px
    ctx.textAlign = 'center';
    ctx.font = 'bold 26px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#241a42';
    ctx.fillText('情侣小剧场 · 扫码即玩', 560, 1132);
    ctx.font = 'bold 34px "Microsoft YaHei", sans-serif';
    ctx.fillText('yangch.website', 560, 1174);
    const url = cv.toDataURL('image/png');
    const slot = $('#report-slot'); if (!slot) return;
    slot.innerHTML = `<img class="report-img" alt="今晚战报" src="${url}">
      <p class="hint">发到你们的聊天框,TA 的朋友看到域名就能玩。</p>`
      + saveHintHtml('双人戏精战报-' + today() + '.png', url);
    slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    toast('📸 战报生成好了——长按图片就能保存或转发。');
  }

  /* ---------- 🪜 台阶 ---------- */
  /* 远端事件(云中继 v4.2):TA 递来的台阶 → 真待接卡;TA 的接住 → 回流本地统计 */
  function handleRemoteEvents(remote) {
    let changed = false;
    const my = jget('cd.repair', []);
    remote.forEach(e => {
      if (e.type === 'repair') {
        const arr = jget('cd.remoteRepair', []);
        if (!arr.some(x => x.id === e.id)) {
          arr.push({ id: e.id, ts: e.ts, date: e.date || today(), text: e.payload.text, icon: e.payload.icon, by: e.by, acked: null });
          jset('cd.remoteRepair', arr);
          changed = true;
          toast('🪜 有一个台阶递来了：<b>' + esc(e.payload.icon + ' ' + e.payload.text) + '</b>——去台阶页回应。');
        }
      } else if (e.type === 'repair_ack') {
        const ref = e.payload && e.payload.ref;
        const target = my.find(x => x.bid === ref && x.caught === null);
        if (target) {
          target.caught = true; target.caughtTs = Date.now(); jset('cd.repair', my);
          changed = true;
          toast('💛 台阶被接住了——TA 回应了你。这一下比一百句道理都值钱。');
        }
      }
    });
    if (changed) { checkAchievements(); renderLadder(); }
  }

  function renderLadder() {
    const p = profile(), st = deriveState();
    const pending = jget('cd.repair', []).find(x => x.date === today() && x.caught === null);
    const remotePendings = jget('cd.remoteRepair', []).filter(x => x.date === today() && x.acked === null);
    const bound = !!(window.CloudSync && window.CloudSync.isBound());
    const root = $('#view-ladder');
    root.innerHTML = `
      <h2 class="vt">🪜 台阶 <span class="count">大道理都懂，缺的是下得来的台阶</span></h2>
      <div class="rulebox">递出去——把手机给 TA、喊 TA 来看、生成台阶卡，或${bound ? '（已绑定）直接递到 TA 手机上' : '（绑定后）直接递到 TA 手机上'}。<b>接不接都不追问，这是规则</b>。<br>
      累计递出 <b>${st.repairSent}</b> 次 · 被接住 <b>${st.repairCaught}</b> 次。</div>

      ${remotePendings.map(rp => `
      <div class="card">
        <h3>🪜 TA 递给你一个台阶</h3>
        <div class="repair-pending">
          <p class="rp-text">${esc(rp.icon)} <b>${esc(rp.text)}</b></p>
          <div class="rp-btns">
            <button class="btn rp-remote-catch" data-id="${esc(rp.id)}">💛 接住</button>
            <button class="mini rp-remote-later" data-id="${esc(rp.id)}">⏳ 晚点说</button>
          </div>
        </div>
        <p class="hint">「晚点说」也是一种回答——不伤人的拒绝方式。</p>
      </div>`).join('')}

      ${pending ? `
      <div class="card">
        <h3>🪜 台阶已递出，等 TA 回应</h3>
        <div class="repair-pending">
          <p class="rp-text">${pending.icon} <b>${esc(pending.text)}</b></p>
          <p class="hint" style="border:none;margin:4px 0 0">把手机给 TA、喊 TA 来看，或发台阶卡${bound ? '——已绑定，TA 手机上会直接出现' : ''}。</p>
        </div>
        <p class="hint">下面记录 <b>TA 的回应</b>——TA 本人亲手点，或持机人代 TA 点（这是你们的日记，不是考勤）：</p>
        <div class="rp-btns">
          <button class="btn rp-catch" id="rp-catch">💛 TA 接住了</button>
          <button class="mini" id="rp-later">⏳ TA 晚点说</button>
        </div>
        <p class="hint">「晚点说」也是一种回答——不伤人的拒绝方式，记录下来就好，不追问。</p>
        <div class="draw-bar" style="justify-content:center"><button class="mini" id="step-card">📸 生成台阶卡（发给 TA）</button></div>
        <div id="stepcard-slot"></div>
      </div>` : `
      <div class="card">
        <h3>递一个台阶</h3>
        <p class="hint">最难的第一句话，交给我们来说。点一个——绑定后直接到 TA 手机，没绑定就递手机或发台阶卡。</p>
        <div class="draw-bar">${D.REPAIRS.map(r =>
          `<button class="suit-btn rp-send" data-rp="${r.id}">${r.icon} ${r.text}</button>`).join('')}</div>
      </div>`}`;
    document.querySelectorAll('.rp-send').forEach(b => b.addEventListener('click', () => {
      const rp = D.REPAIRS.find(x => x.id === b.dataset.rp);
      if (!confirm('把「' + rp.text + '」递出去？接不接都不追问。')) return;
      const arr = jget('cd.repair', []);
      const bev = (window.CloudSync && window.CloudSync.isBound()) ? window.CloudSync.emit('repair', { text: rp.text, icon: rp.icon }) : null;
      arr.push({ ts: Date.now(), date: today(), type: rp.id, icon: rp.icon, text: rp.text, caught: null, bid: bev ? bev.id : null });
      jset('cd.repair', arr);
      toast('🪜 台阶已递出' + (bev ? '——TA 手机上马上会看到。' : '——把手机给 TA，或生成台阶卡发给 TA。'));
      renderLadder();
    }));
    document.querySelectorAll('.rp-remote-catch').forEach(b => b.addEventListener('click', () => {
      const arr = jget('cd.remoteRepair', []);
      const rp = arr.find(x => x.id === b.dataset.id);
      if (!rp) return;
      rp.acked = true; jset('cd.remoteRepair', arr);
      if (window.CloudSync && window.CloudSync.isBound()) window.CloudSync.emit('repair_ack', { ref: rp.id });
      toast('💛 接住了。这一下比一百句道理都值钱。');
      renderLadder();
    }));
    document.querySelectorAll('.rp-remote-later').forEach(b => b.addEventListener('click', () => {
      const arr = jget('cd.remoteRepair', []);
      const rp = arr.find(x => x.id === b.dataset.id);
      if (rp) { rp.acked = false; jset('cd.remoteRepair', arr); }
      toast('⏳ 好的，晚点说——不追问。');
      renderLadder();
    }));
    const rc = $('#rp-catch'); if (rc) rc.addEventListener('click', () => {
      const arr = jget('cd.repair', []);
      const pr = arr.find(x => x.date === today() && x.caught === null);
      if (!pr) { toast('今天没有待回应的台阶。', true); return; }
      pr.caught = true; pr.caughtTs = Date.now(); jset('cd.repair', arr);
      toast('💛 台阶被接住了。这一下比一百句道理都值钱。');
      checkAchievements(); renderLadder();
    });
    const rl = $('#rp-later'); if (rl) rl.addEventListener('click', () => {
      const arr = jget('cd.repair', []);
      const pr = arr.find(x => x.date === today() && x.caught === null);
      if (pr) { pr.caught = false; jset('cd.repair', arr); }
      toast('⏳ 好的，晚点说——不追问。'); renderLadder();
    });
    const sc = $('#step-card'); if (sc) sc.addEventListener('click', makeStepCard);
  }

  /* v4.4.1 修复:<a download>+dataURL 在微信 WebView 点击无反应、iOS Safari 不存相册。
   * 微信/移动端一律主推"长按图片保存"(100% 可靠),下载按钮仅保留在桌面浏览器。
   * v4.4.2:maxTouchPoints 兜底 iPad"请求桌面网站"模式(UA 无移动标识的触屏设备)。 */
  function isMobileish() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
      || (navigator.maxTouchPoints || 0) > 1;
  }
  function saveHintHtml(fileName, url) {
    const isWeChat = /MicroMessenger/i.test(navigator.userAgent);
    const longPress = '<p class="hint gold" style="font-size:14px">👆 <b>长按上面的图片</b> → 选「保存图片」/「发送给朋友」——微信里这样最稳。</p>';
    if (isWeChat || isMobileish()) return longPress;
    return longPress + `<div class="draw-bar" style="justify-content:center"><a class="btn dl-btn" download="${fileName}" href="${url}">⬇️ 保存到电脑</a></div>`;
  }

  /* ---------- 🪜 台阶卡（v4.1：给"拉不下脸走不到面前"的场景——生成图片微信直发，零后端） ---------- */
  function makeStepCard() {
    const pending = jget('cd.repair', []).find(x => x.date === today() && x.caught === null);
    if (!pending) { toast('没有待接的台阶。', true); return; }
    const cv = document.createElement('canvas'); cv.width = 750; cv.height = 1000;
    const ctx = cv.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 1000);
    g.addColorStop(0, '#2a1c4d'); g.addColorStop(1, '#17102a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 750, 1000);
    ctx.strokeStyle = 'rgba(232,176,75,.5)'; ctx.lineWidth = 2; ctx.strokeRect(24, 24, 702, 952);
    const center = (t, y, font, color) => { ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.fillText(t, 375, y); };
    center('🪜 一个台阶', 140, 'bold 44px "Microsoft YaHei", sans-serif', '#e8b04b');
    center(today(), 190, '22px "Microsoft YaHei", sans-serif', '#b3a6d6');
    center(pending.icon, 380, '120px "Microsoft YaHei", sans-serif', '#f2ecff');
    center('「' + pending.text + '」', 500, 'bold 54px "Microsoft YaHei", sans-serif', '#f2ecff');
    center('有人想和好，又拉不下脸——', 600, '26px "Microsoft YaHei", sans-serif', '#d8cfef');
    center('这是 TA 递给你的台阶。', 644, '26px "Microsoft YaHei", sans-serif', '#d8cfef');
    center('接不接，都不追问。', 730, 'bold 30px "Microsoft YaHei", sans-serif', '#ffd9a0');
    center('接住它，或者晚点说，都可以。', 776, '24px "Microsoft YaHei", sans-serif', '#b3a6d6');
    // 右下角小二维码(N5.1:收到卡的人扫码就能进)
    drawQr(ctx, 618, 895, 2, 5); // 25*2=50 + 静区10 → 白框70,右缘 688<726 边框内
    ctx.textAlign = 'left';
    ctx.font = '18px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#b3a6d6';
    ctx.fillText('双人戏精 · 一台手机的小剧场', 60, 940);
    const url = cv.toDataURL('image/png');
    const slot = $('#stepcard-slot'); if (!slot) return;
    slot.innerHTML = `<img class="report-img" alt="台阶卡" src="${url}">
      <p class="hint">把这张图发给 TA（微信直接发）——台阶就递到了。TA 回应后，在这台手机上代 TA 标记结果。</p>`
      + saveHintHtml('台阶卡-' + today() + '.png', url);
    slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    toast('🪜 台阶卡生成好了——长按图片就能保存或直接发送。');
  }

  /* ---------- 🎁 百宝箱 ---------- */
  function renderTreasure() {
    $('#view-treasure').innerHTML = `
      <h2 class="vt">🎁 百宝箱 <span class="count">没事想一起做点什么时，来翻</span></h2>
      <div class="toc-row">
        <button data-toc="things-slot">🗓 小事清单</button>
        <button data-toc="cap-slot">⏳ 时间胶囊</button>
        <button data-toc="pool-slot">🎴 卡池</button>
        <button data-toc="log-slot">📜 记录</button>
        <button data-toc="cloud-slot">🔗 同步</button>
        <button data-toc="backup-slot">📦 备份</button>
        <button data-toc="set-slot">⚙️ 设置</button>
      </div>
      <div id="streak-slot"></div>
      <div id="things-slot"></div>
      <div id="cap-slot"></div>
      <div id="pool-slot"></div>
      <div id="log-slot"></div>
      <div id="cloud-slot"></div>
      <div id="backup-slot"></div>
      <div id="set-slot"></div>`;
    document.querySelectorAll('.toc-row button').forEach(b => b.addEventListener('click', () => {
      const el = document.getElementById(b.dataset.toc);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    renderStreak();
    renderThings();
    if (window.DramaCapsules) window.DramaCapsules.render('#cap-slot', profile());
    renderPool();
    renderLog();
    renderCloudCard();
    renderBackupCard();
    renderSettings();
  }

  function renderStreak() {
    const st = deriveState();
    const log = logAll();
    const strip = Array.from({ length: 30 }, (_, i) => {
      const key = daysAgo(29 - i);
      const cls = log.some(x => x.date === key) ? 'dot done' : (st.restDays.has(key) ? 'dot rest' : 'dot');
      return `<span class="${cls}" title="${key}"></span>`;
    }).join('');
    $('#streak-slot').innerHTML = `
      <div class="card"><h3>🔥 我们的剧场 <span class="count">节拍连演 <b>${st.streak}</b> 场（${esc(CADENCE_LABEL[cadence()])}） ｜ 近 30 天开演 <b>${st.last30Done}</b> 天</span>
      <div class="strip">${strip}</div></div>`;
  }

  function renderThings() {
    const done = jget('cd.things', []);
    const doneSet = new Set(done);
    const pct = Math.round(done.length / D.SMALL_THINGS.length * 100);
    $('#things-slot').innerHTML = `
      <div class="card">
      <h3>🗓 一起做的小事 <span class="count">${done.length}/${D.SMALL_THINGS.length} · ${pct}%</span></h3>
      <p class="hint">不打卡不焦虑——想到就去，去了就点亮。全部点亮那天，记得截图存好。</p>
      <div class="things-bar"><span style="width:${pct}%"></span></div>
      <div class="things-grid">${D.SMALL_THINGS.map((t, i) => `
        <button class="thing ${doneSet.has(i) ? 'did' : ''}" data-i="${i}">
          <span class="tnum">${String(i + 1).padStart(2, '0')}</span> ${esc(t)}
        </button>`).join('')}</div></div>`;
    document.querySelectorAll('.thing').forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.i;
      const arr = jget('cd.things', []);
      const pos = arr.indexOf(i);
      if (pos >= 0) { arr.splice(pos, 1); b.classList.remove('did'); }
      else { arr.push(i); b.classList.add('did');
        if (arr.length === D.SMALL_THINGS.length) toast('🎉 全部点亮！你们把清单活成了真的。'); }
      jset('cd.things', arr);
      const pct2 = Math.round(arr.length / D.SMALL_THINGS.length * 100);
      const bar = document.querySelector('.things-bar span'); if (bar) bar.style.width = pct2 + '%';
      document.querySelector('#things-slot .count').textContent = arr.length + '/' + D.SMALL_THINGS.length + ' · ' + pct2 + '%';
    }));
  }

  /* 卡池全集（浏览 + 演完标记） */
  function cardHtml(c, drawnToday) {
    const s = D.SUITS[c.suit];
    const played = logAll().some(x => x.cardId === c.id && x.date === today());
    return `<div class="dcard" style="--c:${s.color}; background: linear-gradient(140deg, ${s.color}1f 0%, var(--card2) 58%)">
      <div class="dc-top"><span class="dc-suit" style="background:${s.color}">${s.icon} ${s.name}</span>
        <span class="dc-meta">${drawnToday.includes(c.id) ? '🎭 今日已抽 ｜ ' : ''}${c.minutes} 分钟 ｜ ${{ any: '随地', home: '居家', out: '户外', road: '路上' }[c.where]}</span></div>
      <h4>${esc(c.title)}</h4>
      <p>${esc(c.text)}</p>
      <button class="done-btn ${played ? 'did' : ''}" data-card="${c.id}">${played ? '✅ 今日已演' : '🎬 演完了'}</button>
    </div>`;
  }

  function renderPool() {
    const d = daily();
    const f = jget('cd.deckFilter', { suit: '', minutes: 0, where: '' });
    const drawnToday = d.drawn || [];
    const remainOf = k => D.CARDS.filter(c => c.suit === k && !drawnToday.includes(c.id)).length;
    let list = D.CARDS.slice();
    if (f.suit) list = list.filter(c => c.suit === f.suit);
    if (f.minutes) list = list.filter(c => c.minutes <= f.minutes);
    if (f.where === 'remote') list = list.filter(c => c.where === 'any');
    else if (f.where) list = list.filter(c => c.where === f.where || c.where === 'any');
    let energyNote = '';
    if (d.energy === 'low') {
      list = list.filter(c => c.minutes <= 15);
      energyNote = '<div class="warnbox">😼 今晚累模式：只显示 ≤15 分钟轻场。回今日剧场点「今晚累」可恢复。</div>';
    }
    $('#pool-slot').innerHTML = `
      <div class="card">
      <h3>🎴 戏码卡池全集 <span class="count">${D.CARDS.length} 张 ｜ 今日已抽 ${drawnToday.length}</span></h3>
      <div class="rulebox">🎟️ 剧场规则：所有"对决"类戏码默认<b>无输赢</b>——只为了好笑，只收藏，不评分、不指导、不复盘。</div>
      ${energyNote}
      <div class="draw-bar">${Object.entries(D.SUITS).map(([k, s]) =>
        `<button class="suit-btn ${f.suit === k ? 'on' : ''}" data-suit="${k}" style="border-color:${s.color}">${s.icon} ${s.name} <span class="remain">剩${remainOf(k)}</span></button>`).join('')}</div>
      <div class="filter-row">
        <select id="f-min"><option value="0">任意时长</option><option value="5">≤5 分钟</option><option value="15">≤15 分钟</option><option value="30">≤30 分钟</option></select>
        <select id="f-where"><option value="">任何场景</option><option value="home">居家</option><option value="out">户外</option><option value="road">路上</option><option value="remote">🌍 异地/视频可做</option></select>
        <button class="mini" id="f-clear">清空筛选</button>
      </div>
      <div class="dgrid" id="dgrid">${list.map(c => cardHtml(c, drawnToday)).join('') || '<p class="hint">没有匹配的卡，放宽筛选试试。</p>'}</div></div>`;
    document.querySelectorAll('#pool-slot .suit-btn').forEach(b => b.addEventListener('click', () => {
      f.suit = f.suit === b.dataset.suit ? '' : b.dataset.suit; jset('cd.deckFilter', f); renderPool();
    }));
    $('#f-min').value = String(f.minutes || 0); $('#f-min').addEventListener('change', e => { f.minutes = +e.target.value; jset('cd.deckFilter', f); renderPool(); });
    $('#f-where').value = f.where || ''; $('#f-where').addEventListener('change', e => { f.where = e.target.value; jset('cd.deckFilter', f); renderPool(); });
    $('#f-clear').addEventListener('click', () => { jset('cd.deckFilter', { suit: '', minutes: 0, where: '' }); renderPool(); });
    bindDone();
  }

  function bindDone() {
    document.querySelectorAll('.done-btn').forEach(b => b.addEventListener('click', () => {
      if (b.classList.contains('did')) return;
      const id = b.dataset.card;
      const log = logAll();
      log.unshift({ cardId: id, date: today(), ts: Date.now(), note: '' });
      jset('cd.log', log);
      b.classList.add('did'); b.textContent = '✅ 今日已演';
      checkAchievements();
      const st = deriveState();
      toast('🎬 杀青！累计 ' + st.doneCount + ' 场' + (st.streak > 1 ? '，节拍连演 ' + st.streak + ' 场' : ''));
      renderToday(); // 刷新今日收尾区（战报按钮/已演场数）
    }));
  }

  /* 我们的记录（日志时间线 + 夸夸存折） */
  function renderLog() {
    const st = deriveState();
    const log = logAll();
    const praise = jget('cd.praise', []);
    $('#log-slot').innerHTML = `
      <div class="card">
      <h3>🎬 剧场日志 <span class="count">累计 ${st.doneCount} 场</span></h3>
      <p class="hint">每场演出可以留一句话。多年后翻回来，这就是你们的回忆银行。</p>
      ${log.length ? `<div class="timeline">${log.slice(0, 50).map((x, i) => {
        const c = D.CARDS.find(y => y.id === x.cardId);
        const label = x.cardId === 'daily:quest' ? '📜 今日剧本杀青' : (c ? D.SUITS[c.suit].icon + ' ' + esc(c.title) : '（已下架卡）');
        const suitColor = c ? D.SUITS[c.suit].color : 'var(--line)';
        return `<div class="titem" style="border-left:4px solid ${suitColor}"><div class="tdate">${x.date} ｜ ${label}</div>
          <input class="note" data-idx="${i}" placeholder="一句话感想（可选）" value="${esc(x.note || '')}" maxlength="50"></div>`;
      }).join('')}</div>` : '<p class="hint">还没开演。回今日剧场抽第一张吧。</p>'}
      <h3 style="margin-top:18px">💛 夸夸存折 <span class="count">本周 ${st.praiseWeek} 句 ｜ 累计 ${st.praiseCount} 句</span></h3>
      ${praise.length ? `<div class="praise-list">${praise.slice(0, 20).map(x =>
        `<div class="praise-item">${esc(profile()[x.from])} → ${esc(profile()[x.to])}（${x.date}）：${esc(x.text)}</div>`).join('')}</div>`
        : '<p class="hint">存折还是空的——回今日剧场收尾区存第一句。</p>'}
      </div>`;
    const inpVal = {};
    document.querySelectorAll('.note').forEach(inp => {
      const i = +inp.dataset.idx;
      const saveNote = idx => { const l = logAll(); if (l[idx]) { l[idx].note = inpVal[idx]; jset('cd.log', l); } };
      let tm = null;
      inp.addEventListener('input', () => { inpVal[i] = inp.value.trim(); clearTimeout(tm); tm = setTimeout(() => saveNote(i), 600); });
      inp.addEventListener('blur', () => { if (inpVal[i] !== undefined) saveNote(i); });
    });
  }

  /* 🔗 双人同步(云中继 v4.2):零注册房间码,首版仅台阶闭环 */
  function renderCloudCard() {
    const slot = $('#cloud-slot'); if (!slot) return;
    if (!window.CloudSync) { slot.innerHTML = ''; return; }
    const C = window.CloudSync;
    if (C.isBound()) {
      const st = C.state();
      slot.innerHTML = `
        <div class="card">
        <h3>🔗 双人同步 <span class="count">已连接</span></h3>
        <p class="hint">房间码 <b>${esc(st.code)}</b> ｜ 你递的台阶直接出现在 TA 手机上，TA 接住会自动记回你的统计。日志、免战牌、电量<b>永不同步</b>（情绪私有红线）。</p>
        <p class="hint">如需加入或创建新的小剧场，请先解除连接——一个小剧场只属于两个人。</p>
        <div class="draw-bar"><button class="mini danger" id="cloud-unbind">解除连接</button></div>
        </div>`;
      $('#cloud-unbind').addEventListener('click', () => {
        if (!confirm('解除与 TA 的连接？TA 将不再收到你的台阶（云端房间自动废弃，码不重用）。')) return;
        C.unbind(); C.stopAuto();
        toast('🔗 已解除连接。');
        renderCloudCard(); renderLadder();
      });
      return;
    }
    slot.innerHTML = `
      <div class="card">
      <h3>🔗 双人同步 <span class="count">台阶真正递到 TA 手机上</span></h3>
      ${C.defaultApi() ? `
      <p class="hint">零注册：创建小剧场拿到 6 位码，微信发给 TA——TA 在自己手机上输入，你们就连上了。此后台阶双向直达（TA 亲手接住，你的统计自动 +1）。不需要任何账号。</p>
      <div class="draw-bar">
        <button class="suit-btn" id="cloud-create">🎬 创建小剧场</button>
        <input id="cloud-code" maxlength="6" placeholder="我有房间码" style="width:110px;text-transform:uppercase;background:var(--bg2);border:1px solid var(--line);color:var(--ink);border-radius:10px;padding:7px 10px;font-size:13.5px">
        <button class="suit-btn" id="cloud-join">加入</button>
      </div>
      <div id="cloud-msg"></div>` : `
      <p class="hint">🚧 同步服务即将开放——部署完成后这里就能创建小剧场。</p>`}
      </div>`;
    if (!C.defaultApi()) return;
    $('#cloud-create').addEventListener('click', async () => {
      try {
        const st = await C.createRoom();
        C.startAuto(30, handleRemoteEvents);
        $('#cloud-msg').innerHTML = '<p class="hint gold">✅ 房间码：<b>' + esc(st.code) + '</b>——微信发给 TA，让 TA 在自己手机上「加入」。</p>';
        renderLadder();
      } catch (e) { $('#cloud-msg').innerHTML = '<p class="hint">❌ ' + esc(e.message) + '</p>'; }
    });
    $('#cloud-join').addEventListener('click', async () => {
      const code = ($('#cloud-code').value || '').trim();
      if (!code) { $('#cloud-msg').innerHTML = '<p class="hint">❌ 先填 TA 发你的 6 位房间码。</p>'; return; }
      try {
        await C.joinRoom(null, code);
        C.startAuto(30, handleRemoteEvents);
        toast('🔗 已连上 TA——台阶从此直达。');
        renderCloudCard(); renderLadder();
      } catch (e) { $('#cloud-msg').innerHTML = '<p class="hint">❌ ' + esc(e.message) + '</p>'; }
    });
  }

  /* 🔗 双人同步(云中继 v4.2) 结束 */

  /* ---------- 📦 备份与恢复(v4.3:数据主权在用户手里——零服务器、零账号,恢复码=全部数据+绑定钥匙) ---------- */
  function renderBackupCard() {
    const slot = $('#backup-slot'); if (!slot) return;
    // v4.5 温和备份提醒:数据有分量(≥10条记录或≥3封信)且距上次备份>7天 → 标题旁提示一句。不弹窗不强制,导出即静默。
    const lb = jget('cd.lastBackupTs', 0);
    const heavy = logAll().length >= 10 || jget('cd.praise', []).length >= 10 || jget('cd.capsules', []).length >= 3;
    const daysSince = lb ? Math.floor((Date.now() - lb) / 86400000) : null;
    const nudge = heavy && (daysSince === null || daysSince >= 7)
      ? '<p class="hint gold" style="margin:2px 0 8px">🕘 ' + (daysSince === null ? '还没备份过' : '上次备份是 ' + daysSince + ' 天前') + '——花 10 秒存一份恢复码，换机不丢回忆。</p>' : '';
    slot.innerHTML = `
      <div class="card">
      <h3>📦 备份与恢复 <span class="count">数据只存本机——换设备前先备份</span></h3>
      ${nudge}
      <p class="hint">导出的恢复码包含<b>全部数据与绑定钥匙</b>——像保存密码一样把它存进微信收藏/备忘录，不要发给他人。</p>
      <div class="draw-bar"><button class="suit-btn" id="bk-export">📤 导出恢复码</button></div>
      <div id="bk-out"></div>
      <p class="hint" style="margin-top:10px">换新手机/新浏览器？把恢复码粘贴到这里，一键回到原来的一切：</p>
      <textarea id="bk-in" class="need-input" style="height:64px" placeholder="把恢复码粘贴到这里…"></textarea>
      <div class="draw-bar"><button class="mini" id="bk-import">♻️ 恢复数据</button></div>
      </div>`;
    $('#bk-export').addEventListener('click', exportBackup);
    $('#bk-import').addEventListener('click', importBackup);
  }

  function exportBackup() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('cd.')) data[k] = localStorage.getItem(k);
    }
    jset('cd.lastBackupTs', Date.now()); // v4.5:记录本次备份,提醒静默 7 天
    const payload = { app: 'couple-drama', version: 1, exported: new Date().toISOString(), data };
    const text = JSON.stringify(payload);
    const out = $('#bk-out'); if (!out) return;
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    out.innerHTML = `
      <textarea id="bk-text" class="need-input" style="height:90px" readonly>${esc(text)}</textarea>
      <div class="draw-bar">
        <button class="mini" id="bk-copy">📋 复制全部</button>
        ${(() => { // v4.4.2:移动端/微信隐藏备份文件下载链接(同保存按钮坑)——主推复制到微信收藏/备忘录
          const isWeChat = /MicroMessenger/i.test(navigator.userAgent);
          if (isWeChat || isMobileish()) return '';
          return '<a class="mini" style="text-decoration:none;display:inline-block" download="双人戏精备份-' + today() + '.json" href="' + url + '">⬇️ 下载备份文件</a>';
        })()}
      </div>
      <p class="hint gold">✅ 恢复码已生成（约 ${Math.ceil(text.length / 1024)} KB）。${/MicroMessenger/i.test(navigator.userAgent) || isMobileish() ? '点「📋 复制全部」，粘贴到<b>微信收藏或备忘录</b>存好——这是你们全部回忆的钥匙。' : '存好它——这是你们全部回忆的钥匙。'}</p>`;
    $('#bk-copy').addEventListener('click', () => {
      const ta = $('#bk-text'); ta.select();
      const done = () => toast('📋 已复制——存进微信收藏/备忘录，换机不丢。');
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, () => { document.execCommand('copy'); done(); });
      else { document.execCommand('copy'); done(); }
    });
    out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function importBackup() {
    const raw = ($('#bk-in').value || '').trim();
    if (!raw) { toast('先把恢复码粘贴进来。', true); return; }
    let payload = null;
    try { payload = JSON.parse(raw); } catch (e) { toast('❌ 这不是有效的恢复码（格式不对）。', true); return; }
    if (!payload || payload.app !== 'couple-drama' || payload.version !== 1 || !payload.data || typeof payload.data !== 'object') {
      toast('❌ 恢复码内容不对——确认粘贴的是完整的一段？', true); return;
    }
    const keys = Object.keys(payload.data).filter(k => k.startsWith('cd.'));
    if (!keys.length) { toast('❌ 恢复码里没有数据。', true); return; }
    if (!confirm('将用这份备份覆盖当前设备的全部数据（现有记录会被替换）。确定恢复？')) return;
    try {
      const old = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('cd.')) old.push(k); }
      old.forEach(k => localStorage.removeItem(k));
      keys.forEach(k => { try { localStorage.setItem(k, String(payload.data[k])); } catch (e) { /* 单键超限跳过 */ } });
      toast('♻️ 恢复完成——欢迎回来。');
      setTimeout(() => location.reload(), 900); // 全量重载:所有模块重新读存储,绑定自动恢复
    } catch (e) { toast('❌ 恢复失败：' + esc(String(e.message || e)), true); }
  }

  /* 设置（名字/纪念日/节拍/清空） */
  function renderSettings() {
    const p = profile();
    $('#set-slot').innerHTML = `
      <div class="card">
      <h3>⚙️ 设置</h3>
      <div class="names" style="margin:8px 0">
        <input id="set-you" value="${esc(p.you)}" maxlength="6" title="左边这位的名字">
        <span class="amp">×</span>
        <input id="set-her" value="${esc(p.her)}" maxlength="6" title="右边这位的名字">
      </div>
      <label class="hint" style="display:block;margin:10px 0 4px">在一起的日子</label><div id="set-since-box">${dateSelectsHtml(p.since || '')}</div>
      <label class="hint" style="display:block;margin:10px 0 4px">下次见面</label><div id="set-next-box">${dateSelectsHtml(p.nextMeet || '')}</div>
      <h3 style="margin-top:14px">🥁 演出节拍 <span class="count">${esc(CADENCE_LABEL[cadence()])}</span></h3>
      <p class="hint">节奏由你定、随时改——它是对自己的承诺，不是欠游戏的债。提前演、隔一阵再演，都算数；<b>偶尔晚一两天，节拍也照样连上</b>。</p>
      <div class="seg">
        ${CADENCES.map(n => `<button class="seg-btn ${cadence() === n ? 'on' : ''}" data-cad="${n}">${n === 7 ? '每周一场' : n + ' 天一场'}</button>`).join('')}
      </div>
      <div class="cta-row"><button class="mini danger" id="reset-all">🗑️ 清空全部数据</button></div>
      </div>`;
    [$('#set-you'), $('#set-her')].forEach(inp => {
      let tm = null;
      const saveNames = () => { const pf = profile(); pf.you = $('#set-you').value.trim() || '你'; pf.her = $('#set-her').value.trim() || '她'; jset('cd.profile', pf); return pf; };
      inp.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(saveNames, 400); });
      inp.addEventListener('change', () => { clearTimeout(tm); saveNames(); renderToday(); toast('✅ 名字已保存。'); }); // renderToday 同步今日剧场标签
    });
    [ $('#set-since-box'), $('#set-next-box') ].forEach(box => {
      if (!box) return;
      box.addEventListener('change', () => {
        const pf = profile();
        pf.since = readDate3(document.getElementById('set-since-box'));
        pf.nextMeet = readDate3(document.getElementById('set-next-box'));
        jset('cd.profile', pf);
        toast('📅 重要的日子已记下。'); renderToday();
      });
    });
    document.querySelectorAll('#set-slot .seg-btn[data-cad]').forEach(b => b.addEventListener('click', () => {
      jset('cd.cadence', +b.dataset.cad);
      renderSettings(); renderStreak();
      toast('🥁 节奏已设为「' + CADENCE_LABEL[+b.dataset.cad] + '」——随时可改，不设违约。');
    }));
    $('#reset-all').addEventListener('click', () => {
      if (!confirm('确定清空全部演出记录、成就与设置？此操作只清本机数据，不可撤销。')) return;
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('cd.')) keys.push(k); }
      keys.forEach(k => localStorage.removeItem(k));
      toast('🧹 已清空，从头开演。');
      renderAll(); switchTab('today');
    });
  }

  function checkAchievements() {
    const st = deriveState();
    const got = E.evalAchievements(D.ACHIEVEMENTS, st);
    const seen = jget('cd.achSeen', []);
    got.filter(id => !seen.includes(id)).forEach(id => {
      const a = D.ACHIEVEMENTS.find(x => x.id === id);
      toast('🏆 解锁成就：' + a.icon + ' <b>' + a.name + '</b>');
    });
    jset('cd.achSeen', got);
  }

  function renderAll() { renderToday(); renderLadder(); renderTreasure(); }

  const RENDERERS = { today: renderToday, ladder: renderLadder, treasure: renderTreasure };

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('nav.tabs button').forEach(b =>
      b.addEventListener('click', () => switchTab(b.dataset.tab)));
    ['today', 'ladder', 'treasure'].forEach(name => {
      try { RENDERERS[name](); } catch (e) { console.error(e); toast('⚠️ ' + name + ' 页渲染出错：' + esc(e.message), true); }
    });
    try { checkAchievements(); } catch (e) { console.error(e); }
    if (window.CloudSync && window.CloudSync.isBound()) window.CloudSync.startAuto(30, handleRemoteEvents); // v4.2 绑定后自动拉远端台阶
    if (!maybeJoinFromHash() && !jget('cd.onboarded', false)) showOnboarding(); // v4.6:扫码入座优先,否则三幕式引导
    // v4.5 跨午夜检测:页面开着过零点/手机切回前台时自动刷新当日数据(QA 遗留项)
    let lastDay = today();
    const dayFlip = () => { if (today() !== lastDay) { lastDay = today(); renderAll(); switchTab(curTab); toast('🌅 新的一天——场次和免战牌已刷新。'); } };
    setInterval(dayFlip, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) dayFlip(); });
    switchTab('today');
  });
})();
