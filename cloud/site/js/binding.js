/* 《双人戏精》绑定模块 v2.1 — 零后端过渡方案
 * 房间码 + 匿名 UUID + 事件日志 + 同步码（微信可发的文本包）。
 * 设计约束（POINTS/BINDING 评审）：
 *  - 零注册：只有匿名 player UUID + 6 位房间码，无手机号
 *  - 分手是一等公民：解除绑定即清除绑定数据，本地演出记录自留
 *  - 同步是"手动脉冲"：生成同步码发给对方 → 对方导入合并（幂等，按事件 id 去重）
 *  - 未来接 Cloudflare D1/Supabase 时，仅替换 transport（genSync/importSync 变自动拉取），事件模型不变
 */
(function (global) {


  const KEY = 'cd.binding';
  const MEM = {}; // localStorage 不可用（Node 测试/隐私模式）时的内存兜底
  const LS = (k, v) => {
    try {
      if (typeof localStorage === 'undefined') {
        if (v === undefined) return (k in MEM) ? MEM[k] : null;
        MEM[k] = String(v); return;
      }
      if (v === undefined) return localStorage.getItem(k);
      localStorage.setItem(k, v);
    } catch (e) { return null; }
  };
  const jget = (k, d) => { try { const v = LS(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const jset = (k, v) => LS(k, JSON.stringify(v));

  function uuid() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return 'xxxx-xxxx-xxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
  }
  function rand6() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混淆字符
    let s = '';
    for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
    return s;
  }
  const pad2 = n => String(n).padStart(2, '0');
  const localToday = () => { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };

  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = ''; bytes.forEach(b => bin += String.fromCharCode(b));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64decode(b64) {
    const norm = b64.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(norm + '==='.slice((norm.length + 3) % 4));
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function getState() { return jget(KEY, null); }
  function saveState(st) { jset(KEY, st); }

  /* 创建小剧场：返回 {room, code(邀请码文本)} */
  function createRoom(myName) {
    const st = { room: uuid(), me: uuid(), myName: myName || '我', partnerName: '', events: [], createdTs: Date.now() };
    saveState(st);
    return { st, invite: makeInvite(st) };
  }

  /* 邀请码：房间标识 + 创建者当前事件（对方加入即获得全部历史） */
  function makeInvite(st) {
    return 'DRAMA1I.' + b64encode(JSON.stringify({
      room: st.room, by: st.me, name: st.myName, events: st.events, ts: Date.now()
    }));
  }

  /* 加入：解析邀请码，保留双方事件并集 */
  function join(inviteText, myName) {
    const text = String(inviteText || '').trim();
    if (!text.startsWith('DRAMA1I.')) return { ok: false, error: '这不是有效的邀请码' };
    try {
      const inv = JSON.parse(b64decode(text.slice('DRAMA1I.'.length)));
      if (!inv.room) return { ok: false, error: '邀请码缺少房间信息' };
      // 加入新剧场 = 干净开始：只带邀请码内的事件，不带入旧房间/单机遗留（避免跨房污染）
      const events = (inv.events || []).slice();
      saveState({ room: inv.room, me: uuid(), myName: myName || '我', partnerName: inv.name || 'TA',
        events, createdTs: Date.now() });
      return { ok: true };
    } catch (e) { return { ok: false, error: '邀请码解析失败：' + e.message }; }
  }

  /* 事件去重合并（按 id），按 ts 升序 */
  function mergeEvents(a, b) {
    const seen = new Set((a || []).map(e => e.id));
    const out = (a || []).slice();
    (b || []).forEach(e => { if (e && e.id && !seen.has(e.id)) { seen.add(e.id); out.push(e); } });
    return out.sort((x, y) => (x.ts || 0) - (y.ts || 0));
  }

  /* 发射一条自己的事件 */
  function emit(type, payload) {
    const st = getState(); if (!st) return null;
    const ev = { id: uuid(), ts: Date.now(), date: localToday(),
      by: st.me, byName: st.myName, type, payload: payload || null };
    st.events.push(ev); saveState(st);
    return ev;
  }

  /* 生成同步码：打包双方全部事件（数据量小，全量最稳） */
  function genSync() {
    const st = getState(); if (!st) return null;
    return 'DRAMA1S.' + b64encode(JSON.stringify({
      room: st.room, by: st.me, name: st.myName, events: st.events, ts: Date.now()
    }));
  }

  /* 导入对方同步码：合并事件，记录对方名；返回新增条数 */
  function importSync(codeText) {
    const text = String(codeText || '').trim();
    if (!text.startsWith('DRAMA1S.')) return { ok: false, error: '不是有效的同步码' };
    try {
      const inc = JSON.parse(b64decode(text.slice('DRAMA1S.'.length)));
      const st = getState();
      if (!st || st.room !== inc.room) return { ok: false, error: '同步码与当前小剧场不匹配' };
      const before = st.events.length;
      st.events = mergeEvents(st.events, inc.events || []);
      st.partnerName = inc.name || st.partnerName || 'TA';
      saveState(st);
      return { ok: true, added: st.events.length - before };
    } catch (e) { return { ok: false, error: '同步码解析失败：' + e.message }; }
  }

  /* 对方状态投影（从事件流提取，绝不包含未共享内容） */
  function partnerState() {
    const st = getState(); if (!st) return null;
    const me = st.me;
    const today = localToday();
    const partnerEvents = st.events.filter(e => e.by !== me);
    const byMeId = new Set(st.events.filter(e => e.by === me && e.type === 'repair_ack').map(e => e.payload && e.payload.ref));
    // count 是"今日累计快照"（每次发射带最新计数），取最大值即今日累计
    const missEvents = partnerEvents.filter(e => e.type === 'miss' && e.date === today);
    const miss = missEvents.length ? Math.max.apply(null, missEvents.map(e => (e.payload && e.payload.count) || 1)) : 0;
    const need = partnerEvents.filter(e => e.type === 'need').slice(-1)[0] || null; // 对方最近一条需要
    // 需求状态机：被回应(acked)/已完成(fulfilled)/已跳过(skipped)/待回应(active) + 等待天数
    const needFollowUp = need ? st.events
      .filter(e => (e.type === 'need_ack' || e.type === 'need_fulfilled' || e.type === 'need_skipped') && e.payload && e.payload.ref === need.id)
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))[0] : null;
    const needStatus = need ? {
      state: needFollowUp ? (needFollowUp.type === 'need_ack' ? 'acked' : needFollowUp.type === 'need_fulfilled' ? 'fulfilled' : 'skipped') : 'active',
      waitingDays: Math.max(0, Math.floor((new Date(today + 'T12:00:00') - new Date(need.date + 'T12:00:00')) / 86400000))
    } : null;
    const needAckedByMe = need ? st.events.some(e => e.by === me && e.type === 'need_ack' && e.payload && e.payload.ref === need.id) : false;
    // 我今天标的需要是否已被对方回应
    const myNeedToday = st.events.filter(e => e.by === me && e.type === 'need').slice(-1)[0] || null; // 最近一条需要（跨午夜仍有效——昨晚标的今早被回应也成立）
    const myNeedFollowUp = myNeedToday ? st.events
      .filter(e => (e.type === 'need_ack' || e.type === 'need_fulfilled' || e.type === 'need_skipped') && e.payload && e.payload.ref === myNeedToday.id)
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))[0] : null;
    const myNeedStatus = myNeedToday ? {
      state: myNeedFollowUp ? (myNeedFollowUp.type === 'need_ack' ? 'acked' : myNeedFollowUp.type === 'need_fulfilled' ? 'fulfilled' : 'skipped') : 'active',
      waitingDays: Math.max(0, Math.floor((new Date(today + 'T12:00:00') - new Date(myNeedToday.date + 'T12:00:00')) / 86400000))
    } : null;
    const myNeedAckedByPartner = myNeedStatus ? myNeedStatus.state === 'acked' : false;
    const pendingRepair = partnerEvents.filter(e => e.type === 'repair' && !byMeId.has(e.id)).slice(-1)[0] || null;
    const things = partnerEvents.filter(e => e.type === 'thing').map(e => e.payload && e.payload.index).filter(x => x !== undefined && x !== null);
    const praises = partnerEvents.filter(e => e.type === 'praise' && e.date === today).length;
    const freeUsedToday = partnerEvents.filter(e => e.type === 'free' && e.date === today).length;
    const questDone = partnerEvents.filter(e => e.type === 'quest_done' && e.date === today).length > 0;
    return { partnerName: st.partnerName, miss, need, needStatus, needAckedByMe, myNeedStatus,
      myNeedAckedByPartner, myNeed: myNeedToday, pendingRepair, things, praises, freeUsedToday, questDone, total: partnerEvents.length };
  }

  function ackRepair(eventId) {
    const st = getState(); if (!st) return;
    emit('repair_ack', { ref: eventId });
  }

  function unbind() {
    LS(KEY, null); try { localStorage.removeItem(KEY); } catch (e) {}
  }

  const PREFIX_INVITE = 'DRAMA1I.', PREFIX_SYNC = 'DRAMA1S.';

  /* ---------- 浏览器渲染 ---------- */
  if (typeof document !== 'undefined') {
    const esc2 = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    let copyText = '';
    function toastMsg(html, isErr) {
      let el = document.getElementById('toast');
      if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
      el.innerHTML = html; el.className = 'show' + (isErr ? ' err' : '');
      clearTimeout(el._tm); el._tm = setTimeout(() => { el.className = ''; }, isErr ? 7000 : 4000);
    }
    function copyToClipboard(text) {
      copyText = text;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => toastMsg('📋 已复制，去微信发给 TA 吧')).catch(() => showCopyBox());
      } else showCopyBox();
      function showCopyBox() {
        const box = document.getElementById('copy-fallback');
        if (box) { box.style.display = 'block'; box.value = text; box.select(); }
      }
    }
    function renderInto(slotSel, profile) {
      const slot = document.querySelector(slotSel); if (!slot) return;
      const st = getState();
      const p = profile || { you: '你', her: '她' };
      if (!st) {
        slot.innerHTML = `<div class="card bind-card">
          <h3>🤝 绑定另一半 <span class="count">异地也能用 · 无需下载 · 无需注册</span></h3>
          <p class="hint">创建小剧场后把邀请码发给 TA，TA 粘贴加入即可。之后用「同步码」互发动态——发一次微信，同步一次。</p>
          <div class="draw-bar">
            <button class="suit-btn" id="bd-create">🎬 创建我们的小剧场</button>
            <button class="suit-btn" id="bd-join-toggle">我有邀请码</button>
          </div>
          <div id="bd-join" style="display:none">
            <input class="need-input" id="bd-join-input" placeholder="粘贴 TA 发给你的邀请码">
            <div class="draw-bar"><button class="btn-mini" id="bd-join-go">加入</button></div>
          </div>
        </div>`;
        document.getElementById('bd-create').addEventListener('click', () => {
          const { invite } = createRoom(p.you);
          renderBound(stAfterCreate(invite), profile, invite);
        });
        document.getElementById('bd-join-toggle').addEventListener('click', () => {
          const j = document.getElementById('bd-join');
          j.style.display = j.style.display === 'none' ? 'block' : 'none';
        });
        document.getElementById('bd-join-go').addEventListener('click', () => {
          const res = join(document.getElementById('bd-join-input').value, p.her);
          if (!res.ok) { toastMsg('❌ ' + esc2(res.error), true); return; }
          toastMsg('✅ 绑定成功！记得生成同步码发给 TA，让 TA 也完成绑定。');
          renderInto(slotSel, profile);
        });
        return;
      }
      renderBound(st, profile, null);
    }
    function stAfterCreate(invite) { const st = getState(); st._invite = invite; return st; }
    function renderBound(st, profile, invite) {
      const slot = document.querySelector('#binding-slot'); if (!slot) return;
      const ps = partnerState();
      slot.innerHTML = `<div class="card bind-card bound">
        <h3>🤝 已绑定：${esc2(st.myName)} × ${esc2(st.partnerName || '等待 TA 加入')}</h3>
        ${st.partnerName ? '' : '<p class="hint">把下面的邀请码发给 TA，TA 粘贴加入后你们就绑定啦。</p>'}
        ${invite ? `<textarea class="need-input" readonly id="bd-invite-text">${esc2(invite)}</textarea>
          <button class="btn-mini" id="bd-copy-invite">📋 复制邀请码</button>` : ''}
        ${ps ? `<div class="partner-state">
          <b>💭 ${esc2(ps.partnerName)} 的状态</b>
          <ul>
            ${ps.miss ? `<li>今天想了你 <b>${ps.miss}</b> 次</li>` : ''}
            ${ps.need ? `<li>今日需要：${esc2(ps.need.payload.text)}</li>` : ''}
            ${ps.pendingRepair ? `<li>🪜 TA 递来台阶：<b>${esc2(ps.pendingRepair.payload.text)}</b>
              <button class="btn-mini" id="bd-ack">💛 接住</button></li>` : ''}
            ${ps.things.length ? `<li>TA 点亮了 ${new Set(ps.things).size}/50 件小事</li>` : ''}
            ${ps.praises ? `<li>💌 TA 给你存了 ${ps.praises} 句夸夸</li>` : ''}
            ${ps.questDone ? '<li>📜 TA 完成了今日剧本</li>' : ''}
            ${ps.freeUsedToday ? `<li>🛡️ TA 打了 ${ps.freeUsedToday} 张免战牌（不追问）</li>` : ''}
            ${(!ps.miss && !ps.need && !ps.pendingRepair && !ps.things.length && !ps.praises && !ps.questDone && !ps.freeUsedToday) ? '<li>还没有新动态——生成你的同步码发给 TA 吧</li>' : ''}
          </ul></div>` : ''}
        <div class="draw-bar">
          <button class="suit-btn" id="bd-sync-gen">📤 生成同步码发给 TA</button>
          <button class="suit-btn" id="bd-sync-imp">📥 导入 TA 的同步码</button>
          <button class="mini danger" id="bd-unbind">💔 解除绑定</button>
        </div>
        <details class="cloud-box"><summary>☁️ 云同步（自动，需一次性配置 GitHub token）</summary>
          <div id="gist-cfg">${(() => {
            const gs = window.GistSync;
            if (!gs) return '<p class="hint">云同步模块未加载</p>';
            const c = gs.cfg();
            if (!c.token) return '<p class="hint">粘贴一个只有 <b>gist</b> 权限的 GitHub token（GitHub → Settings → Developer settings → Tokens(classic)）。token 只存在你这台设备，不上传、不进源码。</p>' +
              '<input class="need-input" id="gist-token" placeholder="ghp_… 或 github_pat_…（勾选 gist 权限）">' +
              '<button class="btn-mini" id="gist-save">💾 保存并开启自动同步（30 秒）</button>';
            return '<p class="hint">✅ 自动同步已开启（每 30 秒）。上次同步：' + esc2(c.lastSync || '—') + '</p>' +
              '<button class="btn-mini" id="gist-now">☁️ 立即同步</button>' +
              '<button class="btn-mini" id="gist-off">停用并清除 token</button>';
          })()}
          </div>
        </details>
        <textarea class="need-input" id="copy-fallback" style="display:none" readonly></textarea>
      </div>`;
      if (invite) document.getElementById('bd-copy-invite').addEventListener('click', () => copyToClipboard(invite));
      document.getElementById('bd-sync-gen').addEventListener('click', () => {
        const code = genSync(); if (!code) return;
        copyToClipboard(code); toastMsg('📤 同步码已复制——微信发给 TA，TA 导入后就同步了');
        const fb = document.getElementById('copy-fallback'); fb.style.display = 'block'; fb.value = code;
      });
      document.getElementById('bd-sync-imp').addEventListener('click', () => {
        const text = prompt('粘贴 TA 发给你的同步码：'); if (!text) return;
        const res = importSync(text);
        if (!res.ok) { toastMsg('❌ ' + esc2(res.error), true); return; }
        toastMsg('📥 已同步 ' + res.added + ' 条 TA 的动态'); renderInto('#binding-slot', profile);
      });
      const ack = document.getElementById('bd-ack');
      if (ack) ack.addEventListener('click', () => { if (ps) ackRepair(ps.pendingRepair.id); toastMsg('💛 台阶被接住了'); renderInto('#binding-slot', profile); });
      document.getElementById('bd-unbind').addEventListener('click', () => {
        if (!confirm('确定解除绑定？双方本地数据各自保留，云端房间数据将删除。')) return;
        unbind(); renderInto('#binding-slot', profile); toastMsg('💔 已解除绑定。祝你们都好。');
      });
      const gs = window.GistSync;
      const bindCloud = () => {
        const tk = document.getElementById('gist-token');
        if (tk && !tk.value.trim()) { toastMsg('❌ 先粘贴 token', true); return; }
        if (tk) gs.setCfg(Object.assign(gs.cfg(), { token: tk.value.trim(), auto: true }));
        else gs.setCfg(Object.assign(gs.cfg(), { auto: true }));
        gs.startAuto(30, () => renderInto('#binding-slot', profile));
        toastMsg('☁️ 自动同步已开启（30 秒）'); renderInto('#binding-slot', profile);
      };
      const offCloud = () => {
        gs.setCfg(Object.assign(gs.cfg(), { token: '', auto: false }));
        gs.stopAuto(); toastMsg('☁️ 云同步已停用'); renderInto('#binding-slot', profile);
      };
      const bindCloudEvents = () => {
        const sv = document.getElementById('gist-save');
        if (sv) sv.addEventListener('click', bindCloud);
        const now = document.getElementById('gist-now');
        if (now) now.addEventListener('click', () => {
          gs.syncNow(() => renderInto('#binding-slot', profile))
            .then(() => { toastMsg('☁️ 已同步'); renderInto('#binding-slot', profile); })
            .catch(e => toastMsg('❌ ' + e.message, true));
        });
        const of3 = document.getElementById('gist-off');
        if (of3) of3.addEventListener('click', offCloud);
      };
      bindCloudEvents();
    }
  }

  global.DramaBinding = { getState, saveEvents: (evs) => saveState(Object.assign(getState() || {}, { events: evs })), ackNeed: (ref) => emit('need_ack', { ref }), createRoom, makeInvite, join, emit, genSync, importSync,
    partnerState, ackRepair, unbind, mergeEvents, PREFIX_INVITE, PREFIX_SYNC, b64encode, b64decode, uuid, rand6 };
  if (typeof document !== 'undefined') global.DramaBinding.renderInto = renderInto;
  if (typeof document !== "undefined" && global.DramaBinding.renderInto) {
    const gs = window.GistSync;
    if (gs && gs.cfg().token && gs.cfg().auto && !gs._autoStarted) {
      gs._autoStarted = true;
      gs.startAuto(30, () => renderInto('#binding-slot', null)); // v4.0 修复：原回调引用不存在的 profile 标识符，每 30 秒 ReferenceError 一次
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = global.DramaBinding;
})(typeof window !== 'undefined' ? window : globalThis);
