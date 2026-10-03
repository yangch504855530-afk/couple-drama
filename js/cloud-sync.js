/* 《双人戏精》云中继前端 v4.2 — Cloudflare Workers + D1 匿名房间码
 * 主案(BINDING-ASSESSMENT):零注册。6 位码一次性 join 换 roomKey;事件白名单双重校验。
 * v4.2 首版同步范围(克制):仅台阶闭环(repair / repair_ack)——用户两轮提出的核心痛点。
 * 隐私红线:日志/感想/免战/电量永不上云;不做在线状态/已读回执。
 * 解绑一等公民:unbind 即本机清除 roomKey,云端房间自然废弃(6 位码不重用)。
 */
(function (global) {
  'use strict';

  const API_KEY = 'cd.cloud'; // { api, code, roomKey, me, lastPull }
  const DEFAULT_API = 'https://drama-relay.drama-relay.workers.dev'; // TODO: NS 切换后改 https://api.yangch.website(国内可达更稳)
  const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
  const jget = (k, d) => { try { const v = LS(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const jset = (k, v) => LS(k, JSON.stringify(v));
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  /* 事件合并(幂等,按 id 去重,ts 升序)——与 binding.js 同构的纯函数,独立维护+测试保护 */
  function mergeEvents(mine, incoming) {
    const map = new Map();
    (mine || []).concat(incoming || []).forEach(e => { if (e && e.id && !map.has(e.id)) map.set(e.id, e); });
    return Array.from(map.values()).sort((a, b) => a.ts - b.ts);
  }

  function state() { return jget(API_KEY, null); }
  function saveState(st) { jset(API_KEY, st); }
  function isBound() { const st = state(); return !!(st && st.roomKey && st.api); }

  async function api(path, opts) {
    const st = state();
    const base = (st && st.api) || '';
    const r = await fetch(base + path, Object.assign({
      headers: { 'Content-Type': 'application/json' },
    }, opts || {}));
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
    return data;
  }

  /* 创建房间:拿 6 位码 + roomKey */
  async function createRoom(apiBase) {
    const st = state() || { me: uuid(), lastPull: 0 };
    st.api = ((apiBase || DEFAULT_API) || '').replace(/\/+$/, '');
    const res = await api('/room', { method: 'POST', body: '{}' });
    st.code = res.code; st.roomKey = res.roomKey;
    saveState(st);
    return st;
  }

  /* 加入房间:6 位码换 roomKey */
  async function joinRoom(apiBase, code) {
    const st = state() || { me: uuid(), lastPull: 0 };
    st.api = (apiBase || '').replace(/\/+$/, '');
    const res = await api('/room/join', { method: 'POST', body: JSON.stringify({ code: String(code || '').trim() }) });
    st.code = String(code).trim().toUpperCase(); st.roomKey = res.roomKey;
    saveState(st);
    return st;
  }

  /* 解绑:本机清除(云端房间因码不重用自然废弃) */
  function unbind() { LS(API_KEY, null); }

  /* 发事件:白名单+轻队列(失败静默,下次 pull/push 重试) */
  let outbox = jget('cd.cloudOutbox', []);
  function emit(type, payload) {
    const st = state();
    if (!isBound()) return null;
    const ev = { id: uuid(), ts: Date.now(), date: today(), by: st.me, type, payload };
    const WHITELIST = ['repair', 'repair_ack'];
    if (!WHITELIST.includes(type)) return null;
    outbox.push(ev); jset('cd.cloudOutbox', outbox);
    flush();
    return ev;
  }
  let flushing = false;
  async function flush() {
    if (flushing || !isBound() || !outbox.length) return;
    flushing = true;
    try {
      const batch = outbox.slice(0, 50);
      await api('/events', { method: 'POST', body: JSON.stringify({ roomKey: state().roomKey, events: batch }) });
      outbox = outbox.slice(batch.length); jset('cd.cloudOutbox', outbox);
    } catch (e) { /* 静默:下次重试 */ }
    flushing = false;
  }

  /* 拉事件:增量;onEvents(events, isRemoteEvent) 由调用方处理远端事件 */
  async function pull(onEvents) {
    if (!isBound()) return 0;
    const st = state();
    const res = await api('/events?roomKey=' + encodeURIComponent(st.roomKey) + '&since=' + (st.lastPull || 0));
    const incoming = res.events || [];
    const remote = incoming.filter(e => e.by !== st.me);
    if (typeof onEvents === 'function' && remote.length) onEvents(remote);
    const maxTs = incoming.reduce((m, e) => Math.max(m, e.ts), st.lastPull || 0);
    st.lastPull = maxTs; saveState(st);
    return remote.length;
  }

  let timer = null;
  function startAuto(intervalSec, onEvents) {
    stopAuto();
    timer = setInterval(() => { pull(onEvents).catch(() => {}); }, Math.max(15, intervalSec || 30) * 1000);
    pull(onEvents).catch(() => {});
  }
  function stopAuto() { if (timer) { clearInterval(timer); timer = null; } }

  global.CloudSync = { state, isBound, createRoom, joinRoom, unbind, emit, pull, startAuto, stopAuto, mergeEvents, defaultApi: () => DEFAULT_API };
  if (typeof module !== 'undefined' && module.exports) module.exports = { mergeEvents };
})(typeof window !== 'undefined' ? window : globalThis);
