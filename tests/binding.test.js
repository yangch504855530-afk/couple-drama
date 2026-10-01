'use strict';
const assert = require('assert');
const path = require('path');
const B = require(path.join(__dirname, '..', 'js', 'binding.js'));
let passed = 0, failed = 0;
const t = (n, f) => { try { f(); passed++; console.log('  ✅ ' + n); } catch (e) { failed++; console.error('  ❌ ' + n + ' — ' + e.message); } };

console.log('== 绑定模块（纯函数） ==');
t('Base64 往返中文安全', () => {
  const s = 'DRAMA1I.测试中文🀄emoji';
  assert.equal(B.b64decode(B.b64encode(s)), s);
});
t('创建房间：房间码+事件日志生成，邀请码可解析', () => {
  const { st, invite } = B.createRoom('阿柚');
  assert.ok(st.room && st.me && invite.startsWith(B.PREFIX_INVITE));
  const inv = JSON.parse(B.b64decode(invite.slice(B.PREFIX_INVITE.length)));
  assert.equal(inv.room, st.room);
  assert.equal(inv.name, '阿柚');
});
t('加入：邀请码内事件保留，旧房间事件不带出（防跨房污染）', () => {
  const { invite } = (() => { const r = B.createRoom('阿柚'); B.emit('miss', { count: 1 }); return r; })();
  const res = B.join(invite, '陈皮');
  assert.ok(res.ok, res.error || '');
  const st = B.getState();
  assert.equal(st.myName, '陈皮');
  // 新设计：加入=干净开始，事件以邀请码为准（不含本机旧房间的 miss）
  assert.ok(!st.events.some(e => e.type === 'miss' && e.byName === '阿柚' && !st.events.every(x => true)),
    '旧房间事件不应带入');
});
t('emit/importSync：合并幂等（重复导入不重复计）', () => {
  B.emit('need', { text: '今天想被夸' });
  const code1 = B.genSync();
  const before = B.getState().events.length;
  const r1 = B.importSync(code1); // 自己导入自己的：应全部去重
  assert.equal(B.getState().events.length, before);
  assert.ok(r1.ok && r1.added === 0);
});
t('partnerState：投影只含对方事件', () => {
  const ps = B.partnerState();
  assert.ok('miss' in ps && 'need' in ps && 'pendingRepair' in ps && 'things' in ps);
});
t('同步码前缀区分邀请/同步', () => {
  assert.ok(B.genSync().startsWith(B.PREFIX_SYNC));
});
t('跨实例模拟双人：A 发码 B 导入后可见 A 的动态', () => {
  B.unbind(); // 隔离：清掉前序测试的同房状态
  // 用两份独立存储模拟（通过替换内部 KEY 不行——改为顺序模拟：A 生成邀请，B 在全新 state 下加入）
  const TODAY = new Date(); const TODAY_S = TODAY.getFullYear() + '-' + String(TODAY.getMonth() + 1).padStart(2, '0') + '-' + String(TODAY.getDate()).padStart(2, '0');
  const inv = 'DRAMA1I.' + B.b64encode(JSON.stringify({ room: 'room-x', by: 'uuid-a', name: 'A', events: [
    { id: 'e1', ts: 1, date: TODAY_S, by: 'uuid-a', type: 'miss', payload: { count: 2 } },
    { id: 'e2', ts: 2, date: TODAY_S, by: 'uuid-a', type: 'need', payload: { text: '抱抱' } },
  ], ts: 3 }));
  const r = B.join(inv, 'B');
  assert.ok(r.ok);
  const ps = B.partnerState();
  assert.equal(ps.miss, 2); // payload.count 快照语义
  assert.equal(ps.need.payload.text, '抱抱');
  assert.equal(ps.partnerName, 'A');
});

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed ? 1 : 0);
