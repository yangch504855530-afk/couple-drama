/* 《双人戏精》内容层 — 花色/卡组/角色/需求/成就
 * 构建时若注入 window.DRAMA_CARDS（96 张完整版）则优先使用，否则用内置 32 张兜底组。
 */
(function (global) {
  'use strict';

  const SUITS = {
    gentle: { name: '温柔戏', icon: '🌅', color: '#e8b04b', desc: '表达欣赏、化解摩擦、深度连接' },
    fun:    { name: '整活戏', icon: '🎭', color: '#d96c3f', desc: '扮演、脑洞、笑出声' },
    photo:  { name: '出片戏', icon: '📸', color: '#9a6fd0', desc: '把拍照变成两个人的游戏' },
    road:   { name: '公路戏', icon: '🚗', color: '#c9a227', desc: '自驾/乘车/路上专属' },
    home:   { name: '居家戏', icon: '🍳', color: '#7fb069', desc: '宅家/做饭/家务的协作博弈' },
    rain:   { name: '室内戏', icon: '🌧️', color: '#5b8fb9', desc: '雨天/晚上/安静的室内游戏' },
    money:  { name: '消费戏', icon: '💰', color: '#c97b84', desc: '花钱与预算的趣味博弈' },
    night:  { name: '夜幕戏', icon: '🛌', color: '#8a7fb0', desc: '睡前仪式与悄悄话' },
  };

  /* 兜底卡组 32 张（完整 96 张版由构建注入 window.DRAMA_CARDS） */
  const FALLBACK_CARDS = [
    { id: 'g1', suit: 'gentle', title: '今日颁奖', text: '日落档：各说一件"今天你做得挺好的地方"。只许一件，不许跟"但是"。', minutes: 5, where: 'any' },
    { id: 'g2', suit: 'gentle', title: '交出方向盘', text: '接下来 2 小时由对方决定全部安排，你只负责跟随和鼓掌。', minutes: 60, where: 'any' },
    { id: 'g3', suit: 'gentle', title: '辛苦陈述', text: '互相说说"这几天你辛苦在哪"。只陈述，不辩论，不纠正，听完说"收到"。', minutes: 15, where: 'any' },
    { id: 'g4', suit: 'gentle', title: '锁屏仪式', text: '把对方拍得最好的一张设成你的锁屏，当场给对方看。', minutes: 5, where: 'any' },
    { id: 'g5', suit: 'gentle', title: '如果重过今天', text: '"假如今天能重过"：各说一个会改的小细节，和一件绝不改的。', minutes: 15, where: 'any' },
    { id: 'g6', suit: 'gentle', title: '十分钟海', text: '并排坐 10 分钟不说话，只看海/窗外。谁先开口谁明早负责叫醒服务。', minutes: 15, where: 'out' },
    { id: 'g7', suit: 'gentle', title: '我希望…', text: '把今天最想吐槽的事，用"我希望…"开头重新说一遍。对方只许回答"好"。', minutes: 5, where: 'any' },
    { id: 'g8', suit: 'gentle', title: '自创奖项', text: '互相颁一个"今日奖项"，奖名自创——比如"最佳忍住不吐槽奖"。', minutes: 5, where: 'any' },
    { id: 'f1', suit: 'fun', title: '财阀夫妇', text: '未来 1 小时你们是"异国财阀夫妇微服私访"，每 10 分钟对一次暗号（暗号自创）。', minutes: 60, where: 'out' },
    { id: 'f2', suit: 'fun', title: '口吻复读机', text: '用对方的口吻复述今天最累的瞬间。要像，但不许人身攻击。', minutes: 15, where: 'any' },
    { id: 'f3', suit: 'fun', title: '毛孩子出道', text: '给今天遇到的第一只猫/狗起名字，并拍一张"官方定妆照"。', minutes: 5, where: 'out' },
    { id: 'f4', suit: 'fun', title: '歌词对话', text: '只用歌词对话 10 分钟。外文歌也行，编就完了。', minutes: 15, where: 'any' },
    { id: 'f5', suit: 'fun', title: '一本正经采访', text: '互相采访：你是记者，问 3 个问题，对方必须一本正经地胡说八道。', minutes: 15, where: 'any' },
    { id: 'f6', suit: 'fun', title: '读心失败', text: '猜对方今天心里最想的一顿饭/一个地方。猜错表演深蹲 3 个。', minutes: 5, where: 'any' },
    { id: 'f7', suit: 'fun', title: '百元礼物', text: '路边挑一件 100 元以内的小礼物送给对方，限时 10 分钟。', minutes: 30, where: 'out' },
    { id: 'f8', suit: 'fun', title: '三词谜题', text: '用 3 个词形容今天的对方，让对方猜哪一个是你瞎编的。', minutes: 5, where: 'any' },
    { id: 'p1', suit: 'photo', title: '拍照对决', text: '各给对方拍 3 张，全程不许指导。日落前各选"今日最佳"并说理由。', minutes: 30, where: 'out' },
    { id: 'p2', suit: 'photo', title: '浮夸合照', text: '手机架好（或手持广角），自拍一张双人合照，表情要求：浮夸。', minutes: 5, where: 'any' },
    { id: 'p3', suit: 'photo', title: '假装在欧洲', text: '找 3 个"假装在别国"的机位拍成明信片，发朋友圈让对方配文。', minutes: 60, where: 'out' },
    { id: 'p4', suit: 'photo', title: '剪影对决', text: '日落逆光各拍一张剪影，谁更"高级"由猜拳决定。', minutes: 15, where: 'out' },
    { id: 'p5', suit: 'photo', title: '走进画面', text: '"走进画面"练习：一方从画面外走来回头，连拍 20 张选 1 张。今天不许说"不够自然"。', minutes: 15, where: 'out' },
    { id: 'p6', suit: 'photo', title: '离谱纪念照', text: '拍一张"只有我们俩在这儿才会拍"的照片。越离谱越好。', minutes: 15, where: 'any' },
    { id: 'p7', suit: 'photo', title: '你是导演', text: '对方当导演：机位姿势全由对方定，你只按快门并保持沉默。', minutes: 30, where: 'any' },
    { id: 'p8', suit: 'photo', title: '老照片续集', text: '选一张你们的旧合照，现场摆同款构图拍"续集"。', minutes: 15, where: 'any' },
    { id: 'r1', suit: 'road', title: '路障外交', text: '遇到堵车/路障演习：谁负责交涉？输的人负责下一次加油全流程。', minutes: 5, where: 'road' },
    { id: 'r2', suit: 'road', title: '副驾 DJ', text: '副驾点 3 首歌不许跳过，听完要说"有品位"。', minutes: 15, where: 'road' },
    { id: 'r3', suit: 'road', title: '手势导航', text: '手势导航 10 分钟：副驾不许说话，只用手势指路。', minutes: 15, where: 'road' },
    { id: 'r4', suit: 'road', title: '公路电影', text: '"如果是公路电影"：你们这部电影叫什么？各起一个片名，平票算导演赢。', minutes: 15, where: 'road' },
    { id: 'h1', suit: 'home', title: '厨房双人舞', text: '一起做一道两人都没做过的菜。翻车了也算完成，成品拍照存档。', minutes: 60, where: 'home' },
    { id: 'w1', suit: 'rain', title: '关灯三词', text: '关灯互相用三个词形容今天，对方猜哪个是编的。', minutes: 15, where: 'home' },
    { id: 'm1', suit: 'money', title: '心情采购', text: '给对方 50 元预算 10 分钟，买"最能代表你今天心情"的东西并说明理由。', minutes: 30, where: 'out' },
    { id: 'n1', suit: 'night', title: '80 岁日常', text: '今晚由一方讲一个"我们 80 岁时的日常"三分钟小故事，不许打断。', minutes: 15, where: 'home' },
  ];

  const injected = (typeof global.DRAMA_CARDS === 'object' && global.DRAMA_CARDS && global.DRAMA_CARDS.length >= 80)
    ? global.DRAMA_CARDS : FALLBACK_CARDS;
  const CARDS = injected;

  /* 角色 8 枚（校园版） */
  const ROLES = [
    { id: 'study',  icon: '📚', name: '自习监督员', duty: '占座、提醒上课、期末抽背', perk: '监督时对方玩手机有权没收一颗糖' },
    { id: 'food',   icon: '🍜', name: '食堂情报官', duty: '侦察新窗口/限时菜/免排队时段', perk: '选砸了不被追责' },
    { id: 'night',  icon: '🌙', name: '晚安播报员', duty: '睡前电台、互道晚安、叫醒服务', perk: '晚安话题由 TA 定' },
    { id: 'errand', icon: '🏃', name: '首席跑腿员', duty: '带饭、取快递、代答到提醒', perk: '跑腿费按奶茶结算' },
    { id: 'press',  icon: '🎤', name: '首席八卦记者', duty: '记录高光时刻与憨憨瞬间', perk: '丑照发布前有一票否决权' },
    { id: 'mood',   icon: '🎪', name: '气氛组组长', duty: '讲冷笑话、组织小活动', perk: '冷场免责一次' },
    { id: 'money',  icon: '🧋', name: '奶茶小管家', duty: '拼单凑满减、管小金库', perk: '每周一次免审批奶茶' },
    { id: 'medic',  icon: '⛑️', name: '首席队医', duty: '降温提醒、送药、情绪急救', perk: '随时喊停 10 分钟休息' },
  ];

  /* 需求 6 项（校园版） */
  const NEEDS = [
    { id: 'together', icon: '🫂', name: '想要陪伴', suitHint: 'gentle', low: '说"随便"但盯着别人的合照', charge: '一起自习/散步一小时，不玩手机' },
    { id: 'boba',     icon: '🧋', name: '奶茶续航', suitHint: 'money', low: '叹气变多、语气变冲', charge: '一杯奶茶或热可可，慢喝' },
    { id: 'battery',  icon: '🔋', name: '考试周电量', suitHint: 'rain', low: '复习时坐不住、烦躁', charge: '取消一次约会当缓冲、早点睡' },
    { id: 'food',     icon: '🫖', name: '被投喂', suitHint: 'home', low: '嘴上说"不饿"但盯着菜单', charge: '带一份夜宵或食堂新菜' },
    { id: 'praise',   icon: '💬', name: '被认可', suitHint: 'gentle', low: '变沉默，或开始吐槽', charge: '具体地说一件今天对方做得好的地方' },
    { id: 'spark',    icon: '🎁', name: '惊喜感', suitHint: 'fun', low: '对一切评价"还行"', charge: '路边小礼物、绕路 5 分钟看夕阳' },
  ];

  /* 50 件校园小事（点亮清单） */
  const SMALL_THINGS = [
    '一起上一节完全没听过的课', '图书馆并排自习一个下午', '食堂新窗口打卡并写一句锐评', '一起夜跑 3 公里',
    '期末互相抽背知识点', '一起淋一场雨跑回宿舍', '在自习室塞给对方一张纸条', '考试周连续投喂夜宵一周',
    '一起坐一次校园观光车', '拍一组"食堂大片"并发出去', '在操场看一次星星', '帮对方领一次堆成山的快递',
    '互相当一天"生活委员"', '一起去看一次校园展览', '冬天共享一副手套', '挤同一把伞从食堂走回宿舍',
    '一起参加一次社团活动', '生日零点第一个说生日快乐', '一起看一场校园晚会', '把对方介绍给自己的室友',
    '一起完成一次小组 pre', '抢到一个图书馆神仙座位', '第一次用校园卡给对方刷卡', '一起去看一次樱花或银杏',
    '一起拼单凑满减成功', '深夜视频连线一起写作业', '一起坐一次绿皮火车', '在对方学校见面时逛一次菜市场',
    '为"共同梦想物品"一起存钱', '互相改造对方一套穿搭', '双排一局游戏全程没吵架', '认真说一次"这件事你是对的"',
    '一起做一次校园志愿者', '看一次教学楼的日落', '早餐送到对方宿舍楼下', '一起制定并执行完一份复习计划',
    '一起养一盆植物并给它起名', '收集对方的三句口头禅', '用对方的照片当一周壁纸', '一起绕校园最远的路散步',
    '在奶茶店点对方的同款', '记住对方的鞋码并买对一次袜子', '看一次凌晨的操场', '毕业前在对方学院楼下合影',
    '一起给未来的你们写一封信', '在对方考试前画一个加油符', '一起早起看一次升旗', '教对方一项自己的拿手技能',
    '一起整理一次对方的相册', '把这条清单全部点亮 🎉',
  ];

  /* 成就 14 枚（check 接收 state，详见 engine.evalAchievements） */
  const ACHIEVEMENTS = [
    { id: 'first',    icon: '🎬', name: '开锣', hint: '完成第 1 张戏码', check: s => s.doneCount >= 1 },
    { id: 'streak3',  icon: '🔥', name: '三连击', hint: '连续 3 个节拍有演出', check: s => s.streak >= 3 },
    { id: 'streak7',  icon: '🌶️', name: '七连击', hint: '连续 7 个节拍有演出', check: s => s.streak >= 7 },
    { id: 'streak21', icon: '🌙', name: '廿一日连台', hint: '连续 21 个节拍有演出', check: s => s.streak >= 21 },
    { id: 'funAll',   icon: '🎭', name: '整活人', hint: '集齐 12 张整活戏', check: s => (s.suitDone.fun || 0) >= 12 },
    { id: 'gentleAll',icon: '🌅', name: '温柔收藏家', hint: '集齐 12 张温柔戏', check: s => (s.suitDone.gentle || 0) >= 12 },
    { id: 'c25',      icon: '🎥', name: '首演廿五场', hint: '累计完成 25 张', check: s => s.doneCount >= 25 },
    { id: 'c50',      icon: '🏮', name: '老戏骨', hint: '累计完成 50 张', check: s => s.doneCount >= 50 },
    { id: 'c100',     icon: '👑', name: '卷王之王', hint: '累计完成 100 张', check: s => s.doneCount >= 100 },
    { id: 'peace',    icon: '🕊️', name: '和平使者', hint: '一周零免战牌，且累计完成 5 场演出', check: s => s.freeLast7 === 0 && s.doneCount >= 5 },
    { id: 'allSuits', icon: '🎪', name: '全花色制霸', hint: '8 个花色各完成 1 张', check: s => Object.keys(SUITS).every(k => (s.suitDone[k] || 0) >= 1) },
    { id: 'bridge',   icon: '🪜', name: '修桥人', hint: '递出 10 次台阶且 7 次被接住', check: s => s.repairSent >= 10 && s.repairCaught >= 7 },
    { id: 'bank',     icon: '💛', name: '存款人', hint: '夸夸存折累计存入 20 句', check: s => s.praiseCount >= 20 },
  ];

  const REPAIRS = [
    { id: 'peace', icon: '💛', text: '我想和好' },
    { id: 'time',  icon: '⏳', text: '给我十分钟' },
    { id: 'hug',   icon: '🤗', text: '抱一下' },
  ];
  global.DramaData = { SUITS, CARDS, ROLES, NEEDS, ACHIEVEMENTS, REPAIRS, SMALL_THINGS, isFullDeck: CARDS.length >= 80 };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.DramaData;
})(typeof window !== 'undefined' ? window : globalThis);
