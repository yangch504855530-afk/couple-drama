/* 《双人戏精》中继 Worker — Cloudflare Workers + D1
 * 匿名房间码方案(BINDING-ASSESSMENT 主案):零注册、不采任何个人信息。
 * 安全模型:
 *  - 6 位房间码只用于一次性 join(换 roomKey);join 有 IP 限流防猜解
 *  - 之后所有读写凭 roomKey(128bit UUID,不外泄);数据按房间物理隔离
 *  - 事件结构前端生成,服务器不解释内容;白名单类型在前后端双重校验
 *  - 不做已读回执/在线状态(反查岗红线)
 */

const CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // 去混淆字符集(无 0/1/I/L/O)
const ALLOWED_TYPES = ['repair', 'repair_ack', 'praise'];
const MAX_EVENTS_PER_PUSH = 50;
// join 限流双闸:①同 (IP,天,码) 每天尝试(成功+失败)≤20;②同 (IP,天) 每天失败(码错/满员/超限)≤100
const JOIN_CODE_DAILY_LIMIT = 20;
const JOIN_FAIL_DAILY_LIMIT = 100;
// join 三种失败(码错/满员/超闸)统一为此响应,与"码不存在"逐字节一致,防房间码枚举预言机
const JOIN_FAIL_RESPONSE = { error: '房间码无效或已满员' };
const PRAISE_24H_LIMIT = 20; // v4.7 夸夸限流:单人(room_key+by)24h 含本批不超过 20 条,防一端刷屏

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  },
});

const genCode = () => {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
};
const genKey = () => crypto.randomUUID();
const isCode = s => typeof s === 'string' && /^[2-9A-HJKMNP-Z]{6}$/.test(s);

async function ensureSchema(env) {
  // 注意:D1 exec() 按换行切分语句,DDL 必须单行
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, room_key TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL)`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS events (room_key TEXT NOT NULL, id TEXT NOT NULL, ts INTEGER NOT NULL, by TEXT NOT NULL, type TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (room_key, id))`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS join_rate (ip TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (ip, day))`);
  // join 限流双闸计数表:join_code_rate 按 (ip,day,code) 计尝试;ip_fail 按 (ip,day) 计失败
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS join_code_rate (ip TEXT NOT NULL, day TEXT NOT NULL, code TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (ip, day, code))`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS ip_fail (ip TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (ip, day))`);
  // v4.3.1 房间成员表:一个房间最多 2 人;join 幂等(同一 member 重复加入不占新席位);leave 释放席位
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS room_members (room_key TEXT NOT NULL, member TEXT NOT NULL, joined_at INTEGER NOT NULL, PRIMARY KEY (room_key, member))`);
}

const ROOM_CAPACITY = 2;

const isMemberId = s => typeof s === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(s);

function validEvent(e) {
  return e && typeof e.id === 'string' && e.id.length <= 64
    && Number.isFinite(e.ts) && e.ts > 0
    && typeof e.by === 'string' && e.by.length <= 64
    && ALLOWED_TYPES.includes(e.type)
    && e.payload && typeof e.payload === 'object'
    && JSON.stringify(e.payload).length <= 500;
}

/* v4.7 夸夸载荷校验:text 必须 string,剔除控制符后 ≤60 字,否则该条按非法过滤 */
const stripCtrl = s => String(s).replace(/[\u0000-\u001F\u007F]/g, '');
function validPraise(e) {
  return e && e.payload && typeof e.payload.text === 'string'
    && stripCtrl(e.payload.text).length <= 60;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    } });
    try { await ensureSchema(env); } catch (e) { return json({ error: 'db init failed', detail: String(e && e.message || e) }, 500); }

    const url = new URL(request.url);
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

    /* 创建房间(创建者即第一位成员) */
    if (url.pathname === '/room' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (!isMemberId(body.me)) return json({ error: '缺少身份标识' }, 400);
      const roomKey = genKey();
      // 码冲突重试(6 位码 31^6 空间,冲突概率极低)
      for (let i = 0; i < 5; i++) {
        const code = genCode();
        try {
          await env.DB.prepare('INSERT INTO rooms (code, room_key, created_at) VALUES (?, ?, ?)')
            .bind(code, roomKey, Date.now()).run();
          await env.DB.prepare('INSERT OR IGNORE INTO room_members (room_key, member, joined_at) VALUES (?, ?, ?)')
            .bind(roomKey, body.me, Date.now()).run();
          return json({ code, roomKey });
        } catch (e) { /* 唯一键冲突→换码重试 */ }
      }
      return json({ error: 'code gen failed' }, 500);
    }

    /* 加入房间:6 位码换 roomKey。规则(join 限流双闸):
     * - 直接加入邀请人的房间;同一成员重复加入幂等(不占新席位、不报错)
     * - 闸① 同一 (IP,天,码) 每天尝试 ≤20 次(成功+失败都计);闸② 同一 (IP,天) 失败(码错/满员/超闸)≤100 次
     * - 码错/满员/超任一闸 → 统一同一 404 响应,防枚举预言机;创建房间不计入 join 计数 */
    if (url.pathname === '/room/join' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (!isCode(body.code)) return json({ error: '房间码格式不对' }, 400);
      if (!isMemberId(body.me)) return json({ error: '缺少身份标识' }, 400);
      const day = new Date().toISOString().slice(0, 10);
      const code = body.code.toUpperCase(); // isCode 仅放行大写,归一属防御性兜底
      const recordFail = () => env.DB.prepare(
        'INSERT INTO ip_fail (ip, day, count) VALUES (?, ?, 1) ON CONFLICT (ip, day) DO UPDATE SET count = count + 1'
      ).bind(ip, day).run();
      // 闸②:当日已失败次数预检(失败计数只增于失败,成功 join 不计)
      const failRow = await env.DB.prepare('SELECT count FROM ip_fail WHERE ip = ? AND day = ?').bind(ip, day).first();
      // 闸①:(IP,天,码) 原子计数,成功+失败都计
      const codeRate = await env.DB.prepare(
        'INSERT INTO join_code_rate (ip, day, code, count) VALUES (?, ?, ?, 1) ON CONFLICT (ip, day, code) DO UPDATE SET count = count + 1 RETURNING count'
      ).bind(ip, day, code).first();
      if ((failRow && failRow.count >= JOIN_FAIL_DAILY_LIMIT) || (codeRate && codeRate.count > JOIN_CODE_DAILY_LIMIT)) {
        await recordFail(); // 超闸本身亦计一次失败
        return json(JOIN_FAIL_RESPONSE, 404);
      }
      const room = await env.DB.prepare('SELECT room_key FROM rooms WHERE code = ?').bind(code).first();
      if (!room) {
        await recordFail();
        return json(JOIN_FAIL_RESPONSE, 404);
      }
      const already = await env.DB.prepare('SELECT 1 AS x FROM room_members WHERE room_key = ? AND member = ?')
        .bind(room.room_key, body.me).first();
      if (!already) {
        const cnt = await env.DB.prepare('SELECT COUNT(*) AS c FROM room_members WHERE room_key = ?')
          .bind(room.room_key).first();
        if (cnt && cnt.c >= ROOM_CAPACITY) {
          await recordFail();
          return json(JOIN_FAIL_RESPONSE, 404); // 满员与码错同响应,防枚举
        }
        await env.DB.prepare('INSERT OR IGNORE INTO room_members (room_key, member, joined_at) VALUES (?, ?, ?)')
          .bind(room.room_key, body.me, Date.now()).run();
      }
      return json({ roomKey: room.room_key });
    }

    /* 离开房间:释放席位(解绑时调用;数据与房间保留,凭码可随时回来) */
    if (url.pathname === '/room/leave' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (!genKeyPattern(body.roomKey)) return json({ error: 'roomKey 非法' }, 400);
      if (!isMemberId(body.me)) return json({ error: '缺少身份标识' }, 400);
      await env.DB.prepare('DELETE FROM room_members WHERE room_key = ? AND member = ?')
        .bind(body.roomKey, body.me).run();
      const left = await env.DB.prepare('SELECT COUNT(*) AS c FROM room_members WHERE room_key = ?')
        .bind(body.roomKey).first();
      return json({ ok: true, remaining: left ? left.c : 0 });
    }

    /* 拉事件:增量 */
    if (url.pathname === '/events' && request.method === 'GET') {
      const roomKey = url.searchParams.get('roomKey');
      const since = Number(url.searchParams.get('since') || 0);
      if (!genKeyPattern(roomKey)) return json({ error: 'roomKey 非法' }, 400);
      const rs = await env.DB.prepare(
        'SELECT id, ts, by, type, payload FROM events WHERE room_key = ? AND ts > ? ORDER BY ts ASC LIMIT 500'
      ).bind(roomKey, since).all();
      return json({ events: (rs.results || []).map(r => ({ id: r.id, ts: r.ts, by: r.by, type: r.type, payload: JSON.parse(r.payload) })) });
    }

    /* 推事件:幂等插入(按 id 去重),返回服务器全量未读数 */
    if (url.pathname === '/events' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (!genKeyPattern(body.roomKey)) return json({ error: 'roomKey 非法' }, 400);
      // v4.7:praise 类型额外校验载荷(text 非法按条过滤,不整批拒)
      const evs = Array.isArray(body.events)
        ? body.events.filter(e => validEvent(e) && (e.type !== 'praise' || validPraise(e)))
        : [];
      if (!evs.length) return json({ error: '没有合法事件' }, 400);
      if (evs.length > MAX_EVENTS_PER_PUSH) return json({ error: '一次推太多' }, 400);
      // v4.7 夸夸限流:本批含 praise 时,按 (room_key, by) 查 24h 已存数+本批数,超限 429
      const praiseInBatch = {};
      evs.forEach(e => { if (e.type === 'praise') praiseInBatch[e.by] = (praiseInBatch[e.by] || 0) + 1; });
      const since24h = Date.now() - 24 * 3600 * 1000;
      for (const by of Object.keys(praiseInBatch)) {
        const row = await env.DB.prepare(
          "SELECT COUNT(*) AS c FROM events WHERE room_key=? AND by=? AND type='praise' AND ts>?"
        ).bind(body.roomKey, by, since24h).first();
        if ((row ? row.c : 0) + praiseInBatch[by] > PRAISE_24H_LIMIT) {
          return json({ error: '夸夸太热情了,休息一下再发' }, 429);
        }
      }
      const stmts = evs.map(e => env.DB.prepare(
        'INSERT OR IGNORE INTO events (room_key, id, ts, by, type, payload) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(body.roomKey, e.id, e.ts, e.by, e.type, JSON.stringify(e.payload)));
      await env.DB.batch(stmts);
      return json({ ok: true, accepted: evs.length });
    }

    return json({ error: 'not found' }, 404);
  },
};

function genKeyPattern(s) {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
}
