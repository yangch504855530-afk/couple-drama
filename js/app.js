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
    if (RENDERERS[name]) { try { RENDERERS[name](); } catch (e) { console.error(e); toast('⚠️ 页面渲染出错：' + esc(e.message), true); } }
    document.querySelectorAll('section.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + name));
    document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    window.scrollTo({ top: 0 });
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

    const root = $('#view-today');
    root.innerHTML = `
      ${pending ? `<div class="card ladder-tip"><b>🪜 有一个台阶等着被接</b>——有人递了台阶，还没人接。去 <a href="#" id="tip-ladder">台阶页</a> 看看。</div>` : ''}

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
      </div>

      <div class="card quest">
        <h3>📜 今晚的场次 <span class="count">已演 ${todayLog.length} 场（加场不另计） ｜ 演了是收利，不演也没关系</span></h3>
        <p class="hint due-line">${dueLine}</p>
        ${q.main ? `<label class="q"><input type="checkbox" id="q-main" ${d.mainDone ? 'checked' : ''}>
          <span class="suit-dot" style="background:${D.SUITS.gentle.color}">🌅 主场</span>
          <b>${esc(q.main.title)}</b> — ${esc(q.main.text)}</label>` : ''}
        ${q.side ? `<label class="q"><input type="checkbox" id="q-side" ${d.sideDone ? 'checked' : ''}>
          <span class="suit-dot" style="background:${D.SUITS.fun.color}">🎭 加场</span>
          <b>${esc(q.side.title)}</b> — ${esc(q.side.text)}</label>` : ''}
        <div class="dgrid" id="drawn-slot">${lastDrawn ? cardHtml(lastDrawn, d.drawn || []) : ''}</div>
        <div class="draw-bar">
          <button class="btn" id="lucky">🎲 手气抽一张</button>
          <button class="mini" id="tired">${d.energy === 'low' ? '⚡ 今晚累：只出轻场（点我恢复）' : '😼 今晚累了（只出 15 分钟轻场）'}</button>
        </div>
        ${d.restDay
          ? `<div class="restbox">🌙 今晚休演——保养日不算缺席，连击不断。<button class="mini" id="unrest">取消休演</button></div>`
          : `<button class="mini rest-btn" id="rest">🌙 今天不演了（休演不断连击）</button>`}
      </div>

      <div class="card">
        <h3>🎬 收尾 <span class="count">演完一场，别忘了这两步</span></h3>
        <p class="hint">研究发现：稳定的亲密关系里，积极互动是消极互动的 5 倍以上。每天互存一句，存的时候不许带"但是"。</p>
        <div class="draw-bar">
          <button class="suit-btn" id="pr-you">💛 给${esc(p.her)}存一句</button>
          <button class="suit-btn" id="pr-her">💛 给${esc(p.you)}存一句</button>
        </div>
        <p class="hint">本周已存 <b>${st.praiseWeek}</b> 句 ｜ 累计 ${st.praiseCount} 句</p>
        <div class="draw-bar">
          <button class="btn" id="make-report" ${todayLog.length ? '' : 'disabled'}>📸 生成今晚战报</button>
        </div>
        ${todayLog.length ? '' : '<p class="hint">先演一场，才有战报可生成。</p>'}
        <div id="report-slot"></div>
      </div>

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
      d.restDay = true; saveDaily(d); toast('🌙 今晚休演，连击不断。好好休息。'); renderToday();
    });
    const ub = $('#unrest'); if (ub) ub.addEventListener('click', () => { d.restDay = false; saveDaily(d); renderToday(); });
    $('#pr-you').addEventListener('click', () => savePraise('you', 'her'));
    $('#pr-her').addEventListener('click', () => savePraise('her', 'you'));
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

  function savePraise(from, to) {
    const seeds = ['今天 TA 替你挡的一件小事', 'TA 最近让你心动的一个瞬间', 'TA 做得越来越像 TA 想成为的样子的一处'];
    const askMsg = '给' + profile()[to] + '存一句夸夸（一句就够，不许带"但是"）' + String.fromCharCode(10) + '灵感：' + seeds[Math.floor(Math.random() * seeds.length)] + '？';
    const text = (prompt(askMsg) || '').trim();
    if (!text) return;
    if (/但是|可是|不过/.test(text)) {
      toast('❌ 这句话里有"但是"——夸夸就纯粹一点，重存一句？', true); return;
    }
    const arr = jget('cd.praise', []);
    arr.unshift({ ts: Date.now(), date: today(), from, to, text: text.slice(0, 60) });
    jset('cd.praise', arr.slice(0, 100));
    checkAchievements();
    toast('💛 已存入存折。被夸的人现在就可以看。');
    renderToday();
  }

  /* ---------- 📸 战报（canvas，纯前端零请求） ---------- */
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
    const g = ctx.createLinearGradient(0, 0, 0, 1200);
    g.addColorStop(0, '#2a1c4d'); g.addColorStop(1, '#17102a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 900, 1200);
    ctx.strokeStyle = 'rgba(232,176,75,.5)'; ctx.lineWidth = 2; ctx.strokeRect(28, 28, 844, 1144);
    const center = (t, y, font, color) => { ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.fillText(t, 450, y); };
    center('🎭 双人戏精 · 战报', 150, 'bold 52px "Microsoft YaHei", sans-serif', '#e8b04b');
    center(today(), 205, '26px "Microsoft YaHei", sans-serif', '#b3a6d6');
    center(p.you + ' × ' + p.her, 275, 'bold 40px "Microsoft YaHei", sans-serif', '#f2ecff');
    ctx.strokeStyle = 'rgba(232,176,75,.35)'; ctx.beginPath(); ctx.moveTo(120, 320); ctx.lineTo(780, 320); ctx.stroke();
    center('今晚上演', 380, '24px "Microsoft YaHei", sans-serif', '#b3a6d6');
    let y = 440;
    todayLog.slice(0, 5).forEach(x => {
      const c = D.CARDS.find(cc => cc.id === x.cardId);
      const label = x.cardId === 'daily:quest' ? '📜 今日剧本杀青' : (c ? D.SUITS[c.suit].icon + ' ' + c.title : '🎭 一场好戏');
      center(label, y, 'bold 32px "Microsoft YaHei", sans-serif', '#f2ecff'); y += 54;
    });
    const praises = jget('cd.praise', []).filter(x => x.date === today());
    const quote = (todayLog.find(x => x.note) || {}).note || (praises[0] || {}).text || '今晚，我们演了一场好戏。';
    y = Math.max(y + 40, 760);
    ctx.font = 'italic 28px "Microsoft YaHei", sans-serif';
    const lines = wrapText(ctx, '「' + quote + '」', 700);
    ctx.fillStyle = '#ffd9a0';
    lines.slice(0, 4).forEach((ln, i) => { ctx.textAlign = 'center'; ctx.fillText(ln, 450, y + i * 44); });
    center('双人戏精 · 一台手机的小剧场', 1130, '22px "Microsoft YaHei", sans-serif', '#b3a6d6');
    const url = cv.toDataURL('image/png');
    const slot = $('#report-slot'); if (!slot) return;
    slot.innerHTML = `<img class="report-img" alt="今晚战报" src="${url}">
      <p class="hint">手机长按图片即可保存；也可以点下面的按钮下载。</p>
      <div class="draw-bar"><a class="btn dl-btn" download="双人戏精战报-${today()}.png" href="${url}">⬇️ 保存战报</a></div>`;
    slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    toast('📸 战报生成好了——存一张，发到你们的聊天框里。');
  }

  /* ---------- 🪜 台阶 ---------- */
  function renderLadder() {
    const p = profile(), st = deriveState();
    const pending = jget('cd.repair', []).find(x => x.date === today() && x.caught === null);
    const root = $('#view-ladder');
    root.innerHTML = `
      <h2 class="vt">🪜 台阶 <span class="count">大道理都懂，缺的是下得来的台阶</span></h2>
      <div class="rulebox">递出去，把手机递给 TA，由 TA 决定接不接——<b>接不接都不追问，这是规则</b>。<br>
      累计递出 <b>${st.repairSent}</b> 次 · 被接住 <b>${st.repairCaught}</b> 次。</div>
      ${pending ? `
      <div class="card">
        <h3>🪜 有一个台阶递给你</h3>
        <div class="repair-pending">
          <p class="rp-text">${pending.icon} <b>${esc(pending.text)}</b></p>
          <div class="rp-btns">
            <button class="btn rp-catch" id="rp-catch">💛 接住</button>
            <button class="mini" id="rp-later">晚点说</button>
          </div>
        </div>
        <p class="hint">「晚点说」也是一种回答——不伤人的拒绝方式。</p>
      </div>` : `
      <div class="card">
        <h3>递一个台阶</h3>
        <p class="hint">最难的第一句话，交给我们来说。点一个，然后把手机递给 TA。</p>
        <div class="draw-bar">${D.REPAIRS.map(r =>
          `<button class="suit-btn rp-send" data-rp="${r.id}">${r.icon} ${r.text}</button>`).join('')}</div>
      </div>`}`;
    document.querySelectorAll('.rp-send').forEach(b => b.addEventListener('click', () => {
      const rp = D.REPAIRS.find(x => x.id === b.dataset.rp);
      if (!confirm('把「' + rp.text + '」递出去？递出后把手机交给 TA，接不接都不追问。')) return;
      const arr = jget('cd.repair', []);
      arr.push({ ts: Date.now(), date: today(), type: rp.id, icon: rp.icon, text: rp.text, caught: null });
      jset('cd.repair', arr);
      toast('🪜 台阶已递出——现在，把手机递给 TA。');
      renderLadder();
    }));
    const rc = $('#rp-catch'); if (rc) rc.addEventListener('click', () => {
      const arr = jget('cd.repair', []);
      const pr = arr.find(x => x.date === today() && x.caught === null);
      if (!pr) { toast('今天没有待接的台阶。', true); return; }
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
  }

  /* ---------- 🎁 百宝箱 ---------- */
  function renderTreasure() {
    $('#view-treasure').innerHTML = `
      <h2 class="vt">🎁 百宝箱 <span class="count">没事想一起做点什么时，来翻</span></h2>
      <div id="streak-slot"></div>
      <div id="things-slot"></div>
      <div id="cap-slot"></div>
      <div id="pool-slot"></div>
      <div id="log-slot"></div>
      <div id="set-slot"></div>`;
    renderStreak();
    renderThings();
    if (window.DramaCapsules) window.DramaCapsules.render('#cap-slot', profile());
    renderPool();
    renderLog();
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
      <label class="hint">在一起的日子 <input type="date" id="set-since" value="${esc(p.since || '')}"></label>
      <label class="hint">下次见面 <input type="date" id="set-next" value="${esc(p.nextMeet || '')}"></label>
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
    const since = $('#set-since'), nxt = $('#set-next');
    [since, nxt].forEach(inp => inp.addEventListener('change', () => {
      const pf = profile(); pf.since = since.value; pf.nextMeet = nxt.value; jset('cd.profile', pf);
      toast('📅 重要的日子已记下。'); renderToday();
    }));
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
    switchTab('today');
  });
})();
