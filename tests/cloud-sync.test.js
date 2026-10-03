'use strict';
const assert = require('assert');
const path = require('path');
const { mergeEvents } = require(path.join(__dirname, '..', 'js', 'cloud-sync.js'));
let passed = 0, failed = 0;
const t = (n, f) => { try { f(); passed++; console.log('  ✅ ' + n); } catch (e) { failed++; console.error('  ❌ ' + n + ' — ' + e.message); } };

console.log('== 云中继（纯函数） ==');
t('mergeEvents 幂等：重复导入不重复计', () => {
  const evs = [{ id: 'a', ts: 1, by: 'x', type: 'repair', payload: { text: '抱一下' } }];
  const once = mergeEvents([], evs);
  const twice = mergeEvents(once, evs);
  assert.equal(once.length, 1);
  assert.equal(twice.length, 1);
});
t('mergeEvents 并集：双方事件都保留，ts 升序', () => {
  const a = [{ id: 'a', ts: 5, by: 'x', type: 'repair', payload: { text: '抱一下' } }];
  const b = [{ id: 'b', ts: 3, by: 'y', type: 'repair_ack', payload: { ref: 'a' } }];
  const m = mergeEvents(a, b);
  assert.equal(m.length, 2);
  assert.deepEqual(m.map(e => e.id), ['b', 'a']); // ts 升序
});
t('mergeEvents 乱序/空输入安全', () => {
  assert.deepEqual(mergeEvents([], []), []);
  const m = mergeEvents(null, null);
  assert.deepEqual(m, []);
});
t('mergeEvents 相同 id 不同 ts：先到者赢（幂等语义）', () => {
  const a = [{ id: 'a', ts: 1, by: 'x', type: 'repair', payload: { text: '旧' } }];
  const b = [{ id: 'a', ts: 9, by: 'x', type: 'repair', payload: { text: '新' } }];
  assert.equal(mergeEvents(a, b)[0].payload.text, '旧');
});

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed ? 1 : 0);
