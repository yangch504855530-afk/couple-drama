/* 《双人戏精》视图层 v2 — 依真实需求分析重构
 * 新增：递台阶(修复尝试)/需求主权+免检/今日休演/30天开演条/夸夸存折+关系气候/今晚电量降载
 * 设计原则：一切完成是"收利"不是"作业"；一切可视化用天气不用分数。
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
    if (!d) d = { mainDone: false, sideDone: false, drawn: [], freeUsed: { you: 0, her: 0 }, roles: {},
      needs: { you: {}, her: {} }, needsLock: { you: false, her: false }, energy: 'normal', restDay: false, needToday: { you: '', her: '' } };
    return d;
  };
  const saveDaily = d => jset('cd.daily.' + today(), d);
  const logAll = () => jget('cd.log', []);
  const stats = () => jget('cd.stats', { needsTouches: 0 });
  const CADENCES = [1, 2, 3, 7];
  // 从对方需要文本猜花色（快捷 chip 文本含需求名→精确匹配；自由文本回退 gentle）
  function needSuitHint(needText) {
    if (!needText) return null;
    const hit = Object.values(D.NEEDS).find(n => needText.includes(n.name));
    return hit ? hit.suitHint : 'gentle';
  }
  const cadence = () => { const c = jget('cd.cadence', 1); return CADENCES.includes(c) ? c : 1; };
  const CADENCE_LABEL = { 1: '每天一场', 2: '两天一场', 3: '三天一场', 7: '每周一场' };

  let toastTimer = null;
  let dirtyTimer = null;
  function markDirty() {
    const gs = window.GistSync;
    if (!(gs && gs.cfg().token && window.DramaBinding && window.DramaBinding.getState())) return;
    clearTimeout(dirtyTimer);
    dirtyTimer = setTimeout(() => { gs.syncAll().catch(e2 => console.warn('[sync]', e2.message)); }, 1500);
  }
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
        if (i < 7 && typeof dd.freeUsed === 'object') freeLast7 += (dd.freeUsed.you || 0) + (dd.freeUsed.her || 0);
        if (dd.restDay) restDays.add(key);
      }
    }
    const repair = jget('cd.repair', []);
    const praise = jget('cd.praise', []);
    const weekPraise = praise.filter(x => x.date >= daysAgo(6));
    return {
      doneCount: log.length, doneDates, suitDone, freeLast7, restDays,
      needsTouches: stats().needsTouches || 0,
      daysTogether: E.daysTogether(profile().since || null, today()),
      streak: E.computeCadenceStreak(new Set(doneDates), today(), cadence(), restDays), // 节拍连击：休演只保不创
      lastDone: doneDates.length ? doneDates[doneDates.length - 1] : null,
      last30Done: doneDates.filter(d => d >= daysAgo(29)).length, // 开演=真演了；休演日只在热力条青色显示
      repairSent: repair.length, repairCaught: repair.filter(x => x.caught === true).length,
      praiseCount: praise.length, praiseWeek: weekPraise.length, weekPraise
    };
  }

  /* ---------- 🎬 今日剧场 ---------- */
  function renderToday() {
    const d = daily(), p = profile(), st = deriveState();
    const q = E.pickDaily(D.CARDS, today(), d.energy);
    const pending = jget('cd.repair', []).find(x => x.date === today() && x.caught === null);
    const strip = Array.from({ length: 30 }, (_, i) => {
      const key = daysAgo(29 - i);
      const cls = logAll().some(x => x.date === key) ? 'dot done' : (st.restDays.has(key) ? 'dot rest' : 'dot');
      return `<span class="${cls}" title="${key}"></span>`;
    }).join('');
    const cl = E.climate(st.praiseWeek);
    const lastPraise = jget('cd.praise', []).slice(0, 3);

    const root = $('#view-today');
    root.innerHTML = `
      <div id="binding-slot"></div>

      <div class="card sos">
        <h3>🚨 吵架急救 <span class="count">点一个递给 TA，接不接都不追问</span></h3>
        <div class="draw-bar">${D.REPAIRS.map(r =>
          `<button class="suit-btn rp-send" data-rp="${r.id}">${r.icon} ${r.text}</button>`).join('')}</div>
      </div>

      <div class="love-days card">
        <div class="ld-num"><b>${st.daysTogether === null ? '——' : st.daysTogether}</b><span>天</span></div>
        <div class="ld-set">
          <label>在一起的日子 <input type="date" id="pf-since" value="${esc(p.since || '')}"></label>
          <label>下次见面 <input type="date" id="pf-next" value="${esc(p.nextMeet || '')}"></label>
          <div class="ld-next">${p.nextMeet ? (() => {
            const dd = Math.ceil((new Date(p.nextMeet + 'T12:00:00') - new Date(today() + 'T12:00:00')) / 86400000);
            return dd > 0 ? '距离下次见面还有 <b>' + dd + '</b> 天' : (dd === 0 ? '今天见面！' : '');
          })() : ''}</div>
        </div>
        <button class="miss-btn" id="miss-btn">💭 想你了（今日 ${d.miss || 0} 次）</button>
      </div>

      <div class="stage-head">
        <div class="streak">🔥 节拍连演 <b>${st.streak}</b> 场（${esc(CADENCE_LABEL[cadence()])}） ｜ 近 30 天开演 <b>${st.last30Done}</b> 天
          <span class="strip">${strip}</span></div>
        <div class="names">
          <input id="pf-you" value="${esc(p.you)}" maxlength="6" title="左边这位的名字">
          <span class="amp">×</span>
          <input id="pf-her" value="${esc(p.her)}" maxlength="6" title="右边这位的名字">
        </div>
      </div>

      <div class="card cadence">
        <h3>🥁 演出节拍 <span class="count">${esc(CADENCE_LABEL[cadence()])}</span></h3>
        <p class="hint">节奏由你定、随时改——它是对自己的承诺，不是欠游戏的债。提前演、隔一阵再演，都算数；<b>偶尔晚一两天，节拍也照样连上</b>。</p>
        <div class="seg">
          ${CADENCES.map(n => `<button class="seg-btn ${cadence() === n ? 'on' : ''}" data-cad="${n}">${n === 7 ? '每周一场' : n + ' 天一场'}</button>`).join('')}
        </div>
        <p class="hint due-line">${
          st.lastDone === null ? '🎬 首演随时开始。' :
          (() => { const due = E.daysUntilDue(st.lastDone, today(), cadence());
            return due <= 0 ? '✨ 今天正好该演了——一张卡，一个夜晚。'
              : '🌙 距下一场还有 <b>' + due + '</b> 天（' + CADENCE_LABEL[cadence()] + '）；想提前演也随你。'; })()
        }</p>
      </div>

      <div class="card need-today-wrap">
        <h3>🗓 今日需要 <span class="count">一件事 · 每天清零 · 只能自己标</span></h3>
        <p class="hint">不是任务工单，是求助信号。今天最想让对方为你做的一件小事。</p>
        ${(() => {
          const B = window.DramaBinding;
          if (!(B && B.getState())) return '';
          const ps = B.partnerState();
          if (!ps || !ps.myNeedStatus || !ps.myNeed) return '';
          const st = ps.myNeedStatus.state;
          const texts = ps.myNeedStatus.waitingDays === 0
            ? { active: ['🌱 刚说出', 'TA 看得到——被看见，就是回应的开始'] }
            : { active: ['⏳ 说出 ' + ps.myNeedStatus.waitingDays + ' 天了', '也许 TA 在忙——换个方式说说？'],
                acked: ['💛 已被回应', '这就是被看见的感觉'],
                fulfilled: ['✅ 已完成', '线下做到了也算数'],
                skipped: ['⏭ 已跳过', '没关系，需要会变'] };
          const t = texts[st] || texts.active;
          return '<div class="ack-banner">你说的「' + (ps.myNeed.payload && ps.myNeed.payload.text) + '」：<b>' + t[0] + '</b> —— ' + t[1] + '</div>';
        })()}
        <div class="need-grid">
          ${['you', 'her'].map(w => `
            <div class="need-today-col">
              <b>${esc(p[w])}</b>
              <input class="need-input" data-who="${w}" maxlength="30" placeholder="今天我需要…"
                value="${esc((d.needToday && d.needToday[w]) || '')}">
              <div class="need-quick">${D.NEEDS.slice(0, 4).map(n =>
                `<span class="chip" data-quick="${w}|${esc(n.name)}|${esc(n.charge)}">${n.icon} ${n.name}</span>`).join('')}</div>
            </div>`).join('')}
        </div>
      </div>

        ${(() => {
          const B = window.DramaBinding;
          if (!(B && B.getState())) return '';
          const ps = B.partnerState();
          if (!ps || !ps.need) return '<div class="respond-hint">💛 TA 今天还没标需要。TA 标了之后，这里会出现一张「回应卡」——你抽卡，就是抽“今天为 TA 做这一件”。</div>';
          const dateFact = '（' + (ps.need.date || '') + ' 说）';
          if (ps.needStatus.state === 'acked') return '<div class="ack-banner">💛 你已回应了 TA 的需要（' + (ps.need.payload && ps.need.payload.text) + '）。今晚别忘了。</div>';
          if (ps.needStatus.state === 'fulfilled') return '<div class="ack-banner">✅ 这条需要已完成——也许你们已经一起做到了。</div>';
          if (ps.needStatus.state === 'skipped') return '<div class="respond-hint">⏭ TA 已跳过这条需要。</div>';
          const waitHint = ps.needStatus.waitingDays >= 3 ? '<p class="hint">这条已经放了一会儿了——要不要坐下来聊聊？</p>' : '';
          return '<div class="respond-card"><b>💛 回应卡：TA 想要——</b><p>' + (ps.need.payload && ps.need.payload.text) + ' ' + dateFact + '</p>' + waitHint +
            '<p class="hint">用你自己的方式满足它。做完点下面，TA 就知道被接住了。</p>' +
            '<div class="draw-bar">' +
            '<button class="btn-mini" id="ack-need">💛 我来回应</button>' +
            '<button class="btn-mini" id="fulfill-need">✅ 已经满足了</button>' +
            '</div></div>';
        })()}
      </div>

      <div id="capsule-slot"></div>

      <div class="card energy">
        <h3>⚡ 今晚电量</h3>
        <p class="hint">先承认累不累，再决定演不演——低迷日电量会自动只出 15 分钟内的轻场。</p>
        <div class="seg">
          ${[['low', '😼 低迷'], ['normal', '🙂 正常'], ['high', '🤩 满血']].map(([k, t]) =>
            `<button class="seg-btn ${d.energy === k ? 'on' : ''}" data-e="${k}">${t}</button>`).join('')}
        </div>
      </div>

      ${d.restDay ? `
      <div class="card rest">
        <h3>🌙 今晚休演</h3>
        <p class="hint">休演是合法的，连击不断——关系的保养日不算缺席。明天见。</p>
        <button class="mini" id="unrest">取消休演</button>
      </div>` : `
      <div class="card quest">
        <h3>📜 今日可选场次 <span class="count">演了是收利，不演也没关系</span></h3>
        ${q.main ? `<label class="q"><input type="checkbox" id="q-main" ${d.mainDone ? 'checked' : ''}>
          <span class="suit-dot" style="background:${D.SUITS.gentle.color}">🌅 主场</span>
          <b>${esc(q.main.title)}</b> — ${esc(q.main.text)}</label>` : ''}
        ${q.side ? `<label class="q"><input type="checkbox" id="q-side" ${d.sideDone ? 'checked' : ''}>
          <span class="suit-dot" style="background:${D.SUITS.fun.color}">🎭 加场</span>
          <b>${esc(q.side.title)}</b> — ${esc(q.side.text)}</label>` : ''}
        <button class="mini rest-btn" id="rest">🌙 今天不演了（休演不断连击）</button>
      </div>`}

      <div class="card repair">
        <h3>🪜 递台阶</h3>
        <p class="hint">大道理都懂，缺的是下得来的台阶。点一个递过去，对方接不接都不追问。<br>
        累计递出 <b>${st.repairSent}</b> 次 · 被接住 <b>${st.repairCaught}</b> 次——被接住的每一次都是存款。</p>
        ${pending ? `
          <div class="repair-pending">
            <p class="rp-text">${pending.icon} <b>${esc(profile()[pending.from] || '')}</b> 递来一个台阶：<b>${esc(pending.text)}</b></p>
            <div class="rp-btns">
              <button class="btn rp-catch" id="rp-catch">💛 接住</button>
              <button class="mini" id="rp-later">晚点说</button>
            </div>
          </div>` : `
          <div class="draw-bar">${D.REPAIRS.map(r =>
            `<button class="suit-btn rp-send" data-rp="${r.id}">${r.icon} ${r.text}</button>`).join('')}</div>`}
      </div>

      <div class="card praise">
        <h3>💛 夸夸存折 <span class="count">关系气候 ${cl.icon} ${cl.text}</span></h3>
        <p class="hint">研究发现：稳定的亲密关系里，积极互动是消极互动的 5 倍以上。每天存一句，存的时候不许带"但是"。</p>
        <div class="draw-bar">
          <button class="suit-btn" id="pr-you">💛 给${esc(p.her)}存一句</button>
          <button class="suit-btn" id="pr-her">💛 给${esc(p.you)}存一句</button>
        </div>
        <p class="hint">本周已存 <b>${st.praiseWeek}</b> 句 ｜ 累计 ${st.praiseCount} 句</p>
        ${lastPraise.length ? `<div class="praise-list">${lastPraise.map(x =>
          `<div class="praise-item">${esc(profile()[x.from])} → ${esc(profile()[x.to])}：${esc(x.text)}</div>`).join('')}</div>` : ''}
      </div>

      <div class="card">
        <h3>🎫 免战牌</h3>
        <p class="hint">打出后本回合作废，对方不许追问原因。每日每人 2 张，零点重置。</p>
        <div class="free-row">
          ${['you', 'her'].map(w => {
            const left = Math.max(0, 2 - ((d.freeUsed && d.freeUsed[w]) || 0));
            return `<button class="free-btn ${left === 0 ? 'off' : ''}" data-who="${w}">
            🛡️ ${esc(p[w])}（剩 ${left} 张）</button>`;
          }).join('')}
        </div>
        <p class="hint">本日已用 ${((d.freeUsed.you) || 0) + ((d.freeUsed.her) || 0)}/4 张。</p>
      </div>

      <div class="card">
        <h3>🎫 今日角色（点按：待分配 → ${esc(p.you)} → ${esc(p.her)}）</h3>
        <div class="role-grid">${D.ROLES.map(r => `
          <div class="role-card"><div class="role-head">${r.icon} ${r.name}</div>
            <div class="hint">职责：${esc(r.duty)}</div><div class="hint gold">特权：${esc(r.perk)}</div>
            <button class="role-btn" data-role="${r.id}">${esc(d.roles[r.id] || '待分配')}</button>
          </div>`).join('')}</div>
      </div>

      <div class="cta-row">
        <button class="btn big" id="go-draw">🎴 去抽一张戏码</button>
      </div>`;

    const since = $('#pf-since'), nxt = $('#pf-next');
    [since, nxt].forEach(inp => inp.addEventListener('change', () => {
      const pf = profile();
      pf.since = since.value; pf.nextMeet = nxt.value; jset('cd.profile', pf);
      renderToday();
    }));
    const ackBtn = document.getElementById('ack-need');
    if (ackBtn) ackBtn.addEventListener('click', () => {
      const B = window.DramaBinding;
      const ps = B.partnerState();
      if (ps && ps.need) {
        B.ackNeed(ps.need.id);
        toast('💛 已回应。TA 打开页面会看到：你的需要，被接住了。');
        renderToday();
      }
    });
    const fulfillBtn = document.getElementById('fulfill-need');
    if (fulfillBtn) fulfillBtn.addEventListener('click', () => {
      const B = window.DramaBinding;
      const ps = B.partnerState();
      if (ps && ps.need) {
        B.emit('need_fulfilled', { ref: ps.need.id });
        toast('✅ 已标记完成。TA 会看到：你的需要，被满足了。');
        renderToday();
      }
    });
    $('#miss-btn').addEventListener('click', () => {
      d.miss = (d.miss || 0) + 1; saveDaily(d);
      const bound = window.DramaBinding && window.DramaBinding.getState();
      if (bound) window.DramaBinding.emit('miss', { count: d.miss });
      document.querySelector('.miss-btn').textContent = '💭 想你了（今日 ' + d.miss + ' 次）';
      const gistOn = window.GistSync && window.GistSync.cfg().token;
      toast('💭 想你了 ×' + d.miss + ' 已记录' + (gistOn ? '，云同步会带给 TA'
        : bound ? '。用「生成同步码」发给 TA，TA 导入后就能看到'
        : '。绑定 TA 后即可异地传达'));
    });
    const y = $('#pf-you'), h = $('#pf-her');
    [y, h].forEach(inp => inp.addEventListener('change', () => {
      const pf = profile(); pf.you = y.value.trim() || '你'; pf.her = h.value.trim() || '她';
      jset('cd.profile', pf); toast('✅ 名字已保存，本机记住你们了。');
      document.querySelectorAll('.free-btn').forEach(b => {
        const left = Math.max(0, 2 - ((d.freeUsed && d.freeUsed[b.dataset.who]) || 0));
        b.innerHTML = '🛡️ ' + esc(pf[b.dataset.who]) + '（剩 ' + left + ' 张）';
      });
      document.querySelectorAll('.need-col > b').forEach((el, i) => { el.textContent = i === 0 ? pf.you : pf.her; });
    }));
    document.querySelectorAll('.seg-btn[data-cad]').forEach(b => b.addEventListener('click', () => {
      jset('cd.cadence', +b.dataset.cad);
      renderToday();
      toast('🥁 节奏已设为「' + CADENCE_LABEL[+b.dataset.cad] + '」——随时可改，不设违约。');
    }));
    document.querySelectorAll('.need-input').forEach(inp => {
      let tm = null;
      inp.addEventListener('input', () => {
        clearTimeout(tm);
        tm = setTimeout(() => {
          if (!d.needToday) d.needToday = { you: '', her: '' };
          d.needToday[inp.dataset.who] = inp.value.trim().slice(0, 30);
          saveDaily(d);
          if (window.DramaBinding && window.DramaBinding.getState() && inp.dataset.who === 'you') {
  const ev = window.DramaBinding.emit('need', { text: d.needToday.you });
  if (ev) { d.needEventId = ev.id; saveDaily(d); }
}
        }, 500);
      });
    });
    document.querySelectorAll('.need-quick .chip').forEach(chip => chip.addEventListener('click', () => {
      const parts = chip.dataset.quick.split('|');
      const inp = document.querySelector('.need-input[data-who="' + parts[0] + '"]');
      if (inp) { inp.value = inp.value.trim() ? inp.value + '（' + parts[1] + '）' : '今天我需要：' + parts[1] + '（' + parts[2] + '）';
        inp.dispatchEvent(new Event('input')); }
    }));
    document.querySelectorAll('.seg-btn[data-e]').forEach(b => b.addEventListener('click', () => {
      d.energy = b.dataset.e; saveDaily(d); renderToday();
      if (d.energy === 'low') toast('😼 低迷日电量已记录——今天只出轻场，60 分钟的卡都藏起来了。');
    }));
    [['#q-main', 'mainDone'], ['#q-side', 'sideDone']].forEach(([sel, key]) => {
      const el = $(sel); if (!el) return;
      el.addEventListener('change', () => {
        d[key] = el.checked; saveDaily(d);
        if (d.mainDone && d.sideDone && !logAll().some(x => x.cardId === 'daily:quest' && x.date === today())) {
          const log = logAll();
          log.unshift({ cardId: 'daily:quest', date: today(), ts: Date.now(), note: '' });
          if (window.DramaBinding && window.DramaBinding.getState()) window.DramaBinding.emit('quest_done', {});
          jset('cd.log', log);
        }
        if (d.mainDone && d.sideDone) { const st2 = deriveState(); toast('🏆 今日场次杀青！' + (st2.streak > 1 ? '节拍连演 ' + st2.streak + ' 场。' : '记得领取精神奖励。')); }
        checkAchievements();
      });
    });
    const rb = $('#rest'); if (rb) rb.addEventListener('click', () => {
      d.restDay = true; saveDaily(d); toast('🌙 今晚休演，连击不断。好好休息。'); renderToday();
    });
    const ub = $('#unrest'); if (ub) ub.addEventListener('click', () => {
      d.restDay = false; saveDaily(d); renderToday();
    });
    document.querySelectorAll('.rp-send').forEach(b => b.addEventListener('click', () => {
      const rp = D.REPAIRS.find(x => x.id === b.dataset.rp);
      if (!confirm('把「' + rp.text + '」递给' + profile().her + '？对方接不接都不追问。')) return;
      const arr = jget('cd.repair', []);
      const bev = (window.DramaBinding && window.DramaBinding.getState()) ? window.DramaBinding.emit('repair', { text: rp.text, icon: rp.icon }) : null;
      arr.push({ ts: Date.now(), date: today(), type: rp.id, icon: rp.icon, text: rp.text, from: 'you', caught: null, bid: bev ? bev.id : null });
      jset('cd.repair', arr); renderToday();
    }));
    const rc = $('#rp-catch'); if (rc) rc.addEventListener('click', () => {
      const arr = jget('cd.repair', []);
      const pr = arr.find(x => x.date === today() && x.caught === null);
      if (!pr) { toast('今天没有待接住的台阶。', true); return; }
      pr.caught = true; pr.caughtTs = Date.now(); jset('cd.repair', arr);
      if (pr.bid && window.DramaBinding) window.DramaBinding.emit('repair_ack', { ref: pr.bid });
      toast('💛 台阶被接住了。这一下比一百句道理都值钱。');
      checkAchievements(); renderToday();
    });
    const rl = $('#rp-later'); if (rl) rl.addEventListener('click', () => {
      const arr = jget('cd.repair', []);
      const pr = arr.find(x => x.date === today() && x.caught === null);
      if (pr) { pr.caught = false; jset('cd.repair', arr); }
      toast('⏳ 好的，晚点说——不追问。'); renderToday();
    });
    $('#pr-you').addEventListener('click', () => savePraise('you', 'her'));
    $('#pr-her').addEventListener('click', () => savePraise('her', 'you'));
    document.querySelectorAll('.free-btn').forEach(b => b.addEventListener('click', () => {
      if (!d.freeUsed || typeof d.freeUsed !== 'object') d.freeUsed = { you: 0, her: 0 };
      if ((d.freeUsed[b.dataset.who] || 0) >= 2) { toast('你的免战牌今天用完了——按规则，戏码得演完。', true); return; }
      d.freeUsed[b.dataset.who] = (d.freeUsed[b.dataset.who] || 0) + 1; saveDaily(d);
      if (window.DramaBinding && window.DramaBinding.getState()) window.DramaBinding.emit('free', { who: b.dataset.who });
      toast('🛡️ ' + esc(p[b.dataset.who]) + ' 打出免战牌，本回合作废，不追问。');
      renderToday();
    }));
    document.querySelectorAll('.role-btn').forEach(b => b.addEventListener('click', () => {
      const pfNow = profile();
      const cycle = ['待分配', pfNow.you, pfNow.her];
      d.roles[b.dataset.role] = cycle[(cycle.indexOf(d.roles[b.dataset.role] || '待分配') + 1) % 3];
      saveDaily(d); renderToday();
    }));
    $('#go-draw').addEventListener('click', () => switchTab('deck'));
    if (window.DramaBinding) window.DramaBinding.renderInto('#binding-slot', profile());
    if (window.DramaCapsules) window.DramaCapsules.render('#capsule-slot', profile());
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
    if (window.DramaBinding && window.DramaBinding.getState()) window.DramaBinding.emit('praise', { text: text.slice(0, 60), to });
    checkAchievements(); renderToday();
  }

  /* ---------- 🎴 戏码卡池 ---------- */
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

  function renderDeck() {
    const d = daily();
    const f = jget('cd.deckFilter', { suit: '', minutes: 0, where: '' });
    let drawnToday = d.drawn || [];
    const remainOf = k => D.CARDS.filter(c => c.suit === k && !drawnToday.includes(c.id)).length;
    let list = D.CARDS.slice();
    if (f.suit) list = list.filter(c => c.suit === f.suit);
    if (f.minutes) list = list.filter(c => c.minutes <= f.minutes);
    if (f.where === 'remote') list = list.filter(c => c.where === 'any');
    else if (f.where) list = list.filter(c => c.where === f.where || c.where === 'any');
    let energyNote = '';
    if (d.energy === 'low') {
      list = list.filter(c => c.minutes <= 15);
      energyNote = '<div class="warnbox">😼 低迷日电量：已自动只出 ≤15 分钟轻场，60 分钟的卡今晚藏起来了。</div>';
    }
    $('#view-deck').innerHTML = `
      <h2 class="vt">🎴 戏码卡池 <span class="count">${D.CARDS.length} 张 ｜ 今日已抽 ${drawnToday.length}</span></h2>
      <div class="rulebox">🎟️ 剧场规则：所有"对决"类戏码默认<b>无输赢</b>——只为了好笑，只收藏，不评分、不指导、不复盘。</div>
      ${energyNote}
      <div class="draw-bar">${Object.entries(D.SUITS).map(([k, s]) =>
        `<button class="suit-btn ${f.suit === k ? 'on' : ''}" data-suit="${k}" style="border-color:${s.color}">${s.icon} ${s.name} <span class="remain">剩${remainOf(k)}</span></button>`).join('')}</div>
      <div class="filter-row">
        <select id="f-min"><option value="0">任意时长</option><option value="5">≤5 分钟</option><option value="15">≤15 分钟</option><option value="30">≤30 分钟</option></select>
        <select id="f-where"><option value="">任何场景</option><option value="home">居家</option><option value="out">户外</option><option value="road">路上</option><option value="remote">🌍 异地/视频可做</option></select>
        <button class="mini" id="f-clear">清空筛选</button>
      </div>
      <div class="draw-bar"><button class="btn" id="lucky">🎲 手气抽一张</button></div>
      <div class="dgrid" id="dgrid">${list.map(c => cardHtml(c, drawnToday)).join('') || '<p class="hint">没有匹配的卡，放宽筛选试试。</p>'}</div>`;
    document.querySelectorAll('.suit-btn').forEach(b => b.addEventListener('click', () => {
      f.suit = f.suit === b.dataset.suit ? '' : b.dataset.suit; jset('cd.deckFilter', f); renderDeck();
    }));
    $('#f-min').value = String(f.minutes || 0); $('#f-min').addEventListener('change', e => { f.minutes = +e.target.value; jset('cd.deckFilter', f); renderDeck(); });
    $('#f-where').value = f.where || ''; $('#f-where').addEventListener('change', e => { f.where = e.target.value; jset('cd.deckFilter', f); renderDeck(); });
    $('#f-clear').addEventListener('click', () => { jset('cd.deckFilter', { suit: '', minutes: 0, where: '' }); renderDeck(); });
    $('#lucky').addEventListener('click', () => {
      let pool = d.energy === 'low' ? D.CARDS.filter(c => c.minutes <= 15) : D.CARDS;
      if (f.where === 'remote') pool = pool.filter(c => c.where === 'any');
      else if (f.where) pool = pool.filter(c => c.where === f.where || c.where === 'any');
      // 需求加权：TA 有等待中的需要时，优先抽中能回应它的花色（概率随等待天数上升）
      const B = window.DramaBinding;
      const ps = (B && B.getState()) ? B.partnerState() : null;
      let hint = (ps && ps.need && ps.needStatus && ps.needStatus.state === 'active')
        ? needSuitHint(ps.need.payload.text) : null;
      if (!hint) {
        const recentRepair = jget('cd.repair', []).filter(x => x.date >= daysAgo(2)).length > 0;
        if (recentRepair) hint = 'gentle'; // 递台阶后 48h：抽卡偏温柔戏
      }
      let picked = null, boosted = false;
      if (hint && !(f.suit && f.suit !== hint)) {
        const rr = E.pickWithNeedBoost(pool, d.drawn, ps.need, ps.needStatus.waitingDays, hint);
        if (rr) { picked = rr.card; boosted = rr.boosted; }
      }
      if (!picked) {
        const c = E.drawFromSuit(pool, f.suit || null, d.drawn);
        if (!c) { toast('该范围的卡今天抽完了——都是你们的了。', true); return; }
        picked = c;
      }
      const c = picked;
      d.drawn.push(c.id); saveDaily(d);
      drawnToday = d.drawn;
      toast((boosted ? '🎯 这张偏向回应 TA 的需要【' + esc(D.SUITS[c.suit].name) + '】<b>' + esc(c.title) + '</b>：' + esc(c.text)
                      : '抽中【' + esc(D.SUITS[c.suit].name) + '】<b>' + esc(c.title) + '</b>：' + esc(c.text)));
      document.getElementById('dgrid').innerHTML = [c].concat(list.filter(x => x.id !== c.id)).map(x => cardHtml(x, drawnToday)).join('');
      bindDone();
      const countEl = document.querySelector('#view-deck .count');
      if (countEl) countEl.textContent = D.CARDS.length + ' 张 ｜ 今日已抽 ' + drawnToday.length;
      document.querySelectorAll('.suit-btn[data-suit]').forEach(b => {
        const k = b.dataset.suit;
        const remain = D.CARDS.filter(cc => cc.suit === k && !drawnToday.includes(cc.id)).length;
        const span = b.querySelector('.remain'); if (span) span.textContent = '剩' + remain;
      });
    });
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
    }));
  }

  /* ---------- 🗓 小事清单 ---------- */
  function renderThings() {
    const done = jget('cd.things', []);
    const doneSet = new Set(done);
    const pct = Math.round(done.length / D.SMALL_THINGS.length * 100);
    $('#view-things').innerHTML = `
      <h2 class="vt">🗓 一起做的 50 件校园小事 <span class="count">${done.length}/50 · ${pct}%</span></h2>
      <p class="hint">不打卡不焦虑——想到就去，去了就点亮。全部点亮那天，记得把页面截图存好。</p>
      <div class="things-bar"><span style="width:${pct}%"></span></div>
      <div class="things-grid">${D.SMALL_THINGS.map((t, i) => `
        <button class="thing ${doneSet.has(i) ? 'did' : ''}" data-i="${i}">
          <span class="tnum">${String(i + 1).padStart(2, '0')}</span> ${esc(t)}
        </button>`).join('')}</div>`;
    document.querySelectorAll('.thing').forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.i;
      const arr = jget('cd.things', []);
      const pos = arr.indexOf(i);
      if (pos >= 0) { arr.splice(pos, 1); b.classList.remove('did'); }
      else { arr.push(i); b.classList.add('did');
        if (arr.length === D.SMALL_THINGS.length) toast('🎉 50 件全部点亮！你们把清单活成了真的。');
        if (window.DramaBinding && window.DramaBinding.getState()) window.DramaBinding.emit('thing', { index: i }); }
      jset('cd.things', arr);
      const pct2 = Math.round(arr.length / D.SMALL_THINGS.length * 100);
      const bar = document.querySelector('.things-bar span'); if (bar) bar.style.width = pct2 + '%';
      document.querySelector('#view-things .count').textContent = arr.length + '/50 · ' + pct2 + '%';
    }));
  }

  /* ---------- 📊 需求体检（主权化） ---------- */
  function renderNeeds() {
    const d = daily(), p = profile();
    const labels = ['充足', '偏低', '告急'];
    const col = (who, label) => {
      const locked = (d.needsLock || {})[who];
      return `<div class="need-col"><b>${esc(label)}
        <button class="lock-btn ${locked ? 'on' : ''}" data-lock="${who}">${locked ? '🔒 今日免检' : '🔓 免检'}</button></b>
        ${D.NEEDS.map(n => {
          const lv = (d.needs[who] || {})[n.id] || 0;
          return `<div class="need-chip lv${lv} ${locked ? 'locked' : ''}" data-who="${who}" data-need="${n.id}">
            <div class="need-main"><span>${n.icon} ${n.name}</span><b>${labels[lv]}</b></div>
            <div class="need-low">低值表现：${esc(n.low)}</div></div>
          ${lv === 2 ? `<div class="charge">🩹 充能：${esc(n.charge)}<span class="charge-remote">异地版：连麦一起做，或拍照发给 TA</span></div>` : ''}`;
        }).join('')}
        <p class="hint">${locked ? '🔒 已开免检：TA 今天的状态不被读取，尊重。' : '我的状态我自己标；互相点名前先问一句。"告急"是求助，不是罪名。'}</p></div>`;
    };
    $('#view-needs').innerHTML = `
      <h2 class="vt">📊 需求体检</h2>
      <p class="hint">模拟人生式点按循环：充足 → 偏低 → 告急 → 充足。<b>主权原则：我的条只能我自己标。</b>给对方标前先问一句；TA 开了免检就不看。</p>
      <div class="need-cols">${col('you', p.you)}${col('her', p.her)}</div>`;
    document.querySelectorAll('.lock-btn').forEach(b => b.addEventListener('click', () => {
      if (!d.needsLock) d.needsLock = { you: false, her: false };
      d.needsLock[b.dataset.lock] = !d.needsLock[b.dataset.lock];
      saveDaily(d); renderNeeds();
      if (d.needsLock[b.dataset.lock]) toast('🔒 ' + esc(p[b.dataset.lock]) + ' 今日免检已开启——状态不被读取，是被允许的。');
    }));
    document.querySelectorAll('.need-chip').forEach(chip => chip.addEventListener('click', () => {
      const who = chip.dataset.who, nid = chip.dataset.need;
      if ((d.needsLock || {})[who]) { toast('🔒 ' + esc(p[who]) + ' 今日免检中——状态不被读取，是被允许的。'); return; }
      if (!d.needs[who]) d.needs[who] = {};
      if (who === 'her' && !confirm('这条是' + p.her + '的状态——建议 TA 自己标。确定代标吗？')) return;
      const lv = E.nextNeedLevel(d.needs[who][nid] || 0);
      d.needs[who][nid] = lv; saveDaily(d);
      const st = stats(); st.needsTouches = (st.needsTouches || 0) + 1; jset('cd.stats', st);
      if (lv === 2) { const n = D.NEEDS.find(x => x.id === nid); toast('🚨 ' + esc(p[who]) + '的「' + n.name + '」告急——今晚执行：' + esc(n.charge)); }
      checkAchievements(); renderNeeds();
    }));
  }

  /* ---------- 🏆 成就 & 日志 ---------- */
  function renderAwards() {
    const st = deriveState();
    const got = new Set(E.evalAchievements(D.ACHIEVEMENTS, st));
    const log = logAll();
    $('#view-awards').innerHTML = `
      <h2 class="vt">🏆 成就墙 <span class="count">${got.size}/${D.ACHIEVEMENTS.length}</span></h2>
      <div class="ach-grid">${D.ACHIEVEMENTS.map(a => `
        <div class="ach ${got.has(a.id) ? 'on' : ''}">${a.icon}<b>${a.name}</b><span class="ach-hint">${esc(a.hint || '')}</span><span>${got.has(a.id) ? '✅ 已达成' : '未达成'}</span></div>`).join('')}</div>
      <h2 class="vt" style="margin-top:18px">🎬 剧场日志</h2>
      <p class="hint">每场演出可以留一句话。多年后翻回来，这就是你们的回忆银行。</p>
      ${log.length ? `<div class="timeline">${log.slice(0, 50).map((x, i) => {
        const c = D.CARDS.find(y => y.id === x.cardId);
        const label = x.cardId === 'daily:quest' ? '📜 今日剧本杀青' : (c ? D.SUITS[c.suit].icon + ' ' + esc(c.title) : '（已下架卡）');
        const suitColor = c ? D.SUITS[c.suit].color : 'var(--line)';
        return `<div class="titem" style="border-left:4px solid ${suitColor}"><div class="tdate">${x.date} ｜ ${label}</div>
          <input class="note" data-idx="${i}" placeholder="一句话感想（可选）" value="${esc(x.note || '')}" maxlength="50"></div>`;
      }).join('')}</div>` : '<p class="hint">还没开演。去抽第一张吧。</p>'}
      <div class="cta-row"><button class="mini danger" id="reset-all">🗑️ 清空全部数据</button></div>`;
    const saveNote = idx => { const log = logAll(); if (log[idx]) { log[idx].note = inpVal[idx]; jset('cd.log', log); } };
    const inpVal = {};
    document.querySelectorAll('.note').forEach(inp => {
      const i = +inp.dataset.idx;
      let tm = null;
      inp.addEventListener('input', () => { inpVal[i] = inp.value.trim(); clearTimeout(tm); tm = setTimeout(() => saveNote(i), 600); });
      inp.addEventListener('blur', () => { if (inpVal[i] !== undefined) saveNote(i); });
    });
    $('#reset-all').addEventListener('click', () => {
      if (!confirm('确定清空全部演出记录、成就与设置？此操作不可撤销。')) return;
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('cd.')) keys.push(k); }
      keys.forEach(k => localStorage.removeItem(k));
      toast('🧹 已清空，从头开演。'); renderAll(); switchTab('today');
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

  const RENDERERS = {};
  function renderAll() { renderToday(); renderDeck(); renderThings(); renderNeeds(); renderAwards(); }
  Object.assign(RENDERERS, { today: renderToday, deck: renderDeck, things: renderThings, needs: renderNeeds, awards: renderAwards });

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('nav.tabs button').forEach(b =>
      b.addEventListener('click', () => switchTab(b.dataset.tab)));
    ['today', 'deck', 'things', 'needs', 'awards'].forEach(name => {
      try { RENDERERS[name](); } catch (e) { console.error(e); toast('⚠️ ' + name + ' 页渲染出错：' + esc(e.message), true); }
    });
    try { checkAchievements(); } catch (e) { console.error(e); }
    switchTab('today');
  });
})();
