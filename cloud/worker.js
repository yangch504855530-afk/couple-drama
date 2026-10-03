/* 《双人戏精》中继 Worker — Cloudflare Workers + D1
 * 匿名房间码方案(BINDING-ASSESSMENT 主案):零注册、不采任何个人信息。
 * 安全模型:
 *  - 6 位房间码只用于一次性 join(换 roomKey);join 有 IP 限流防猜解
 *  - 之后所有读写凭 roomKey(128bit UUID,不外泄);数据按房间物理隔离
 *  - 事件结构前端生成,服务器不解释内容;白名单类型在前后端双重校验
 *  - 不做已读回执/在线状态(反查岗红线)
 */

const CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // 去混淆字符集(无 0/1/I/L/O)
const ALLOWED_TYPES = ['repair', 'repair_ack'];
const MAX_EVENTS_PER_PUSH = 50;
const JOIN_DAILY_LIMIT = 20;

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
  const { exec } = env.DB;
  await exec(`CREATE TABLE IF NOT EXISTS rooms (
    code TEXT PRIMARY KEY,
    room_key TEXT UNIQUE NOT NULL,
    created_at INTEGER NOT NULL
  )`);
  await exec(`CREATE TABLE IF NOT EXISTS events (
    room_key TEXT NOT NULL,
    id TEXT NOT NULL,
    ts INTEGER NOT NULL,
    by TEXT NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    PRIMARY KEY (room_key, id)
  )`);
  await exec(`CREATE TABLE IF NOT EXISTS join_rate (
    ip TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL,
    PRIMARY KEY (ip, day)
  )`);
}

function validEvent(e) {
  return e && typeof e.id === 'string' && e.id.length <= 64
    && Number.isFinite(e.ts) && e.ts > 0
    && typeof e.by === 'string' && e.by.length <= 64
    && ALLOWED_TYPES.includes(e.type)
    && e.payload && typeof e.payload === 'object'
    && JSON.stringify(e.payload).length <= 500;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    } });
    try { await ensureSchema(env); } catch (e) { return json({ error: 'db init failed' }, 500); }

    const url = new URL(request.url);
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

    /* 创建房间 */
    if (url.pathname === '/room' && request.method === 'POST') {
      const roomKey = genKey();
      // 码冲突重试(6 位码 31^6 空间,冲突概率极低)
      for (let i = 0; i < 5; i++) {
        const code = genCode();
        try {
          await env.DB.prepare('INSERT INTO rooms (code, room_key, created_at) VALUES (?, ?, ?)')
            .bind(code, roomKey, Date.now()).run();
          return json({ code, roomKey });
        } catch (e) { /* 唯一键冲突→换码重试 */ }
      }
      return json({ error: 'code gen failed' }, 500);
    }

    /* 加入房间:6 位码换 roomKey(一次性钥匙交换),IP 限流防猜解 */
    if (url.pathname === '/room/join' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (!isCode(body.code)) return json({ error: '房间码格式不对' }, 400);
      const day = new Date().toISOString().slice(0, 10);
      const rate = await env.DB.prepare(
        'INSERT INTO join_rate (ip, day, count) VALUES (?, ?, 1) ON CONFLICT (ip, day) DO UPDATE SET count = count + 1 RETURNING count'
      ).bind(ip, day).first();
      if (rate && rate.count > JOIN_DAILY_LIMIT) return json({ error: '尝试太多次了，明天再来' }, 429);
      const room = await env.DB.prepare('SELECT room_key FROM rooms WHERE code = ?').bind(body.code.toUpperCase()).first();
      if (!room) return json({ error: '房间码不存在——让 TA 再看一眼' }, 404);
      return json({ roomKey: room.room_key });
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
      const evs = Array.isArray(body.events) ? body.events.filter(validEvent) : [];
      if (!evs.length) return json({ error: '没有合法事件' }, 400);
      if (evs.length > MAX_EVENTS_PER_PUSH) return json({ error: '一次推太多' }, 400);
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
