# 《双人戏精》设计文档 (DESIGN)

- 版本: v1.0 ｜ 日期: 2026-09-30

## 1. 架构

```
js/data.js     内容层: SUITS(8)/CARDS(96)/ROLES(8)/NEEDS(8)/ACHIEVEMENTS(12) + 兜底小卡组 (UMD)
js/engine.js   纯函数: hashDate/mulberry32/pickDaily/drawFromSuit/streak/achievements 求值 (UMD, 可测)
js/app.js      视图: 4 页签渲染 + localStorage 存档 (Pass-and-play 双档案: 你/她)
css/style.css  深夜剧场风（暗底金票）+ 移动端单列 + 打印隐藏
build.js       内联 → dist/couple-drama.html
tests/*.test.js  data 7 项 / engine 12 项
```

## 2. 数据模型

- Card `{id, suit, title, text, minutes: 5|15|30|60, where: any|home|out|road}`；id 规则 `<花色首字母><序号>`
- Need `{id, icon, name, low, charge}`；Role `{id, icon, name, duty, perk}`
- Achievement `{id, icon, name, check(state)}` — state 由引擎从存档派生

## 3. 引擎要点

- `pickDaily(date)`: FNV-1a(date) → mulberry32 → 主线=gentle 随机、支线=fun 随机（全设备一致）
- `drawFromSuit(suit, exclude)`: 花色内去重抽签，耗尽返回 null
- 连击: 任意"今日首次完成"推进当日计数；`streak(dates)` 按自然日连续性计算
- 成就每 30 秒惰性求值 + 每次完成动作后求值

## 4. 存档结构（localStorage）

```
cd.profile        {youName, herName}
cd.daily.<date>   {mainDone, sideDone, drawn:[ids], freeYou, freeHer, roles:{}, needs:{you:{},her:{}}, log:[{cardId,note,ts}]}
cd.stats          {doneDates:[], doneCount}
```

## 5. UI（4 页签，深夜剧场风）

🎬 今日剧场（主线/支线打勾、免战牌、角色、连击）/ 🎴 卡池（花色×时长×场景筛选、抽签台、收藏点亮）/ 📊 需求体检（双列点按循环、充能卡）/ 🏆 成就&日志。视觉: 暗紫夜幕+票根金+幕布红，卡牌用"戏票"隐喻。

## 6. 与旅行工具的关系

完全独立仓库/独立部署；"公路戏"花色保留自驾场景但文案不绑定任何城市/路线。
