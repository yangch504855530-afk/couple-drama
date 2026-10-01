/* 《双人戏精》云同步传输层 — GitHub Gist 后端
 * 安全模型：Gist ID 硬编码（秘密 Gist）；GitHub token 由用户在页面里粘贴、只存本机 localStorage，
 * 绝不进源码/仓库。读：匿名可读（秘密 Gist）；写：需 gist 权限 token。
 * 传输层只做"搬运"，合并逻辑全部复用 DramaBinding.mergeEvents（幂等）。
 */
(function (global) {
  'use strict';

  const GIST_ID = 'd29296d166bbdfce292ece2d1372ebf6';
  const API = 'https://api.github.com/gists/' + GIST_ID;
  const CFG_KEY = 'cd.gist';
  const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
  const jget = (k, d) => { try { const v = LS(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const jset = (k, v) => LS(k, JSON.stringify(v));

  function cfg() { return jget(CFG_KEY, { token: '', auto: false, lastSync: '' }); }
  function setCfg(c) { jset(CFG_KEY, c); }

  function headers() {
    const c = cfg();
    const h = { 'Accept': 'application/vnd.github+json' };
    if (c.token) h['Authorization'] = 'Bearer ' + c.token;
    return h;
  }

  async function fetchGist() {
    const r = await fetch(API, { headers: headers() });
    if (!r.ok) throw new Error('Gist 读取失败 HTTP ' + r.status + (r.status === 404 ? '（检查 Gist ID）' : r.status === 401 ? '（token 无效）' : ''));
    const g = await r.json();
    const f = g.files && g.files['events.json'];
    if (!f) throw new Error('Gist 中缺少 events.json');
    return JSON.parse(f.content);
  }

  async function patchGist(data) {
    const c = cfg();
    if (!c.token) throw new Error('需要 GitHub token 才能写入');
    const r = await fetch(API, {
      method: 'PATCH',
      headers: Object.assign({ 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' }, { 'Authorization': 'Bearer ' + c.token }),
      body: JSON.stringify({ files: { 'events.json': { content: JSON.stringify(data, null, 1) } } })
    });
    if (!r.ok) throw new Error('Gist 写入失败 HTTP ' + r.status);
    return true;
  }

  /* —— v2.3 全量同步：分区写、并集读 —— */
  function collectLocal() {
    return {
      things: jget('cd.things', []),
      praise: jget('cd.praise', []),
      log: jget('cd.log', []),
      repair: jget('cd.repair', []),
      capsules: jget('cd.capsules', [])
    };
  }
  function applyMerged(m) {
    if (m.things) jset('cd.things', m.things);
    if (m.praise) jset('cd.praise', m.praise);
    if (m.log) jset('cd.log', m.log);
    if (m.repair) jset('cd.repair', m.repair);
    if (m.capsules) jset('cd.capsules', m.capsules);
  }
  function mergeFull(mine, theirs) {
    const out = {};
    ['things', 'repair'].forEach(k => {
      const map = new Map();
      ((mine[k] || []).concat(theirs[k] || [])).forEach(x => { const key = JSON.stringify([x.id, x.date]); if (!map.has(key)) map.set(key, x); });
      out[k] = Array.from(map.values());
    });
      ['praise', 'log', 'capsules'].forEach(k => {
        const map = new Map();
        ((mine[k] || []).concat(theirs[k] || [])).forEach(x => { const key = JSON.stringify([x.ts, x.text || x.note || '']); if (!map.has(key)) map.set(key, x); });
        out[k] = Array.from(map.values());
      });
      return out;
  }

  /* 拉取并合并：把云端房间里本房间的事件合并进本地（幂等）。
   * onMerged(added, remoteRoomEvents) 回调给视图刷新。 */
  async function pullMerge(onMerged) {
    const B = global.DramaBinding;
    const st = B.getState();
    if (!st) return null;
    const data = await fetchGist();
    const remote = (data.rooms && data.rooms[st.room]) || { events: [] };
    const merged = B.mergeEvents(st.events || [], remote.events || []);
    const added = merged.length - (st.events || []).length;
    if (added > 0) B.saveEvents(merged);
    const c = cfg(); c.lastSync = new Date().toLocaleString(); setCfg(c);
    if (added > 0 && typeof onMerged === 'function') onMerged(added);
    return { added, data };
  }

  /* 推送：读-改-写（先拉远端，合并本房间事件，再 PATCH 全量），降低双人并发覆盖风险 */
  async function push() {
    const B = global.DramaBinding;
    const st = B.getState();
    if (!st) return null;
    let data = null;
    try { data = await fetchGist(); } catch (e) { data = { version: 1, rooms: {} }; }
    const local = st.events || [];
    const remote = (data.rooms && data.rooms[st.room] && data.rooms[st.room].events) || [];
    const union = B.mergeEvents(remote, local);
    data.rooms = data.rooms || {};
    data.rooms[st.room] = { events: union };
    data.updated = new Date().toISOString();
    await patchGist(data);
    const c = cfg(); c.lastSync = new Date().toLocaleString(); setCfg(c);
    return { pushed: local.length };
  }

  /* 全量状态同步：把本机侧的每日数据/清单/夸夸/日志推到 room.state[mySide]，
   * 并把对方 side 合并进本地（各写各的区，无覆盖冲突）。
   * 胶囊只同步元数据（解锁日），全文永远留本地。 */
  async function syncState() {
    const B = global.DramaBinding;
    const st = B.getState();
    if (!st) return null;
    const mySide = st.me; // 用 player UUID 做侧标识
    const data = await fetchGist();
    data.rooms = data.rooms || {};
    const room = data.rooms[st.room] = data.rooms[st.room] || { events: [], state: {} };
    room.state = room.state || {};
    // 采集本机全量状态（不含对方 side、不含胶囊全文）
    const things = jget('cd.things', []);
    const praise = jget('cd.praise', []);
    const log = jget('cd.log', []);
    const capsulesMeta = jget('cd.capsules', []).map(c => ({ id: c.id, unlock: c.unlock, created: c.created, from: c.from }));
    room.state[mySide] = { things, praise, log, capsulesMeta, syncedTs: Date.now() };
    // 合并对方 side 到本地视图缓存
    const partnerSide = st.partnerId ? room.state[st.partnerId] : null;
    if (partnerSide) jset('cd.partnerView', partnerSide);
    data.updated = new Date().toISOString();
    await patchGist(data);
    const c = cfg(); c.lastSync = new Date().toLocaleString(); setCfg(c);
    return true;
  }

  /* 全量双向同步：events + sides（分区写、并集读） */
  async function syncAll(onMerged) {
    const B = global.DramaBinding;
    const st = B.getState();
    if (!st) return null;
    const mine = collectLocal();
    const data = await fetchGist();
    data.rooms = data.rooms || {};
    const room = data.rooms[st.room] = data.rooms[st.room] || { events: [] };
    room.sides = room.sides || {};
    const mergedEvents = B.mergeEvents(st.events || [], room.events || []);
    const added = mergedEvents.length - (st.events || []).length;
    const myKey = st.me;
    const cloudMine = room.sides[myKey] || {};
    const unionMine = mergeFull(cloudMine, mine);
    room.sides[myKey] = unionMine;
    st.events = mergedEvents; B.saveEvents(mergedEvents);
    room.events = mergedEvents;
    applyMerged(unionMine);
    const c = cfg(); c.lastSync = new Date().toLocaleString(); setCfg(c);
    await patchGist(data);
    if (added > 0 && typeof onMerged === 'function') onMerged(added);
    return { added, events: mergedEvents.length };
  }

  async function syncNow(onMerged) {
    await syncAll(onMerged);     // 全量双向（events+数据）
    return cfg().lastSync;
  }

  let timer = null;
  function startAuto(intervalSec, onMerged) {
    stopAuto();
    timer = setInterval(() => {
      syncNow(onMerged).catch(e => console.warn('[gist] auto sync:', e.message));
    }, Math.max(15, intervalSec || 30) * 1000);
  }
  function stopAuto() { if (timer) { clearInterval(timer); timer = null; } }

  global.GistSync = { cfg, setCfg, pullMerge, push, syncNow, syncAll, syncState, startAuto, stopAuto, GIST_ID };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { cfg, setCfg, pullMerge, push, syncNow, startAuto, stopAuto, GIST_ID };
  }
})(typeof window !== 'undefined' ? window : globalThis);
