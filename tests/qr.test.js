'use strict';
/* N5.1 内嵌二维码结构测试。
 * 矩阵由 qrcode-generator(v1.4.4) 离线生成:qrcode(0,'M').addData('https://yangch.website')
 * 重新生成方法:临时目录 npm i qrcode-generator 后跑生成脚本,把 size/hex 更新进 js/app.js 的 QR_YANGCH。
 * 本测试做结构校验(定位图案/时序线/暗模块比例),保证内嵌矩阵没被手改坏——扫不出比没有更糟。 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
let passed = 0, failed = 0;
const t = (n, f) => { try { f(); passed++; console.log('  ✅ ' + n); } catch (e) { failed++; console.error('  ❌ ' + n + ' — ' + e.message); } };

// 从 app.js 源码里提取 QR_YANGCH(不引 DOM)
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const m = src.match(/const QR_YANGCH = \{ size: (\d+), hex: '([0-9a-f]+)' \}/);
assert(m, 'QR_YANGCH 定义未找到');
const size = +m[1], hex = m[2];
const bit = i => { const v = parseInt(hex[i >> 2], 16); return ((v >> (3 - (i & 3))) & 1) === 1; };
const isDark = (r, c) => r >= 0 && c >= 0 && r < size && c < size && bit(r * size + c);

console.log('== 二维码结构 ==');
t('矩阵尺寸合法(version 2 = 25×25)且 hex 长度匹配', () => {
  assert.equal(size, 25);
  assert.ok(hex.length === Math.ceil(size * size / 4), 'hex 长度 ' + hex.length);
});
t('三个定位图案(Finder)结构正确:7×7 边框全暗/5×5 环/3×3 心', () => {
  const corners = [[0, 0], [0, size - 7], [size - 7, 0]];
  for (const [R, C] of corners) {
    for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) {
      const ring = Math.max(Math.abs(i - 3), Math.abs(j - 3)); // 0-1=3×3暗心 2=白环 3=外框暗
      const expect = ring <= 1 || ring === 3;
      assert.equal(isDark(R + i, C + j), expect, `finder(${R},${C}) at ${i},${j}`);
    }
  }
});
t('时序线(Timing)第 6 行/列交替', () => {
  for (let i = 8; i < size - 8; i++) {
    assert.equal(isDark(6, i), i % 2 === 0, 'timing row ' + i);
    assert.equal(isDark(i, 6), i % 2 === 0, 'timing col ' + i);
  }
});
t('暗模块比例在 40%-60%(可扫性下限)', () => {
  let dark = 0; for (let i = 0; i < size * size; i++) if (bit(i)) dark++;
  const ratio = dark / (size * size);
  assert.ok(ratio > 0.4 && ratio < 0.6, 'dark ratio ' + ratio.toFixed(2));
});

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed ? 1 : 0);
