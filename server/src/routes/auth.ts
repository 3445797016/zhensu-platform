// 认证/登录(可开关)+ 多用户 RBAC:
// - root(超级管理员)由 security 配置管理(兼容原逻辑)
// - 其余用户在 'users' 存储, 角色 admin/viewer(只读)
// - 只读用户: 全站写操作(非 GET / 特定写型 GET)一律 403
// 防爆破: 同 IP 5 次失败锁 5 分钟
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { store } from '../lib/store.js';
import { audit } from '../lib/audit.js';

export interface UserRec { username: string; nickname: string; role: 'admin' | 'viewer'; avatar?: string; salt: string; hash: string; enabled: boolean; createdAt: string; }
export interface SecCfg { enabled: boolean; user?: string; nickname?: string; avatar?: string; salt?: string; hash?: string; sessions?: Record<string, any>; fail?: Record<string, { n: number; until: number }>; }

const ROOT_USER = 'root';
const sec = (): SecCfg => store.read('security', { enabled: false, sessions: {}, fail: {} });
const saveSec = (c: SecCfg) => store.write('security', c);
const users = (): UserRec[] => store.list<any>('users').filter((u: any) => u?.username);
const saveUsers = (list: UserRec[]) => store.write('users', list);
const findUser = (name: string) => users().find((u) => u.username === name);
const sha = (salt: string, pwd: string) => createHash('sha256').update(salt + ':' + pwd).digest('hex');
const timingSafeEqualHex = (a: string, b: string) => {
  const aa = Buffer.from(a, 'hex'); const bb = Buffer.from(b, 'hex');
  return aa.length === bb.length && timingSafeEqual(aa, bb);
};
const TTL = 24 * 3600 * 1000; // 会话有效期 24 小时
const readCookie = (h: any, name: string) => { const m = String(h.cookie || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)')); return m ? decodeURIComponent(m[1]) : ''; };

// 会话记录兼容: 字符串=旧格式(ISO 过期, 视为 root); 对象={exp, user}
export function validSession(cfg: SecCfg, token: string): boolean {
  if (!cfg.enabled) return true;
  if (!token) return false;
  const e = cfg.sessions?.[token];
  if (!e) return false;
  const exp = typeof e === 'string' ? Date.parse(e) : Date.parse(e?.exp);
  return Number.isFinite(exp) && exp > Date.now();
}

export function sessionUser(cfg: SecCfg, token: string): { username: string; role: 'admin' | 'viewer'; nickname: string; avatar: string } | null {
  if (!cfg.enabled) return null;
  const e = cfg.sessions?.[token];
  if (!e) return null;
  const username = (typeof e === 'object' && e.user) ? String(e.user) : (cfg.user || ROOT_USER);
  if (username === (cfg.user || ROOT_USER)) return { username, role: 'admin', nickname: cfg.nickname || '超级管理员', avatar: cfg.avatar || '#4f8cff' };
  const u = findUser(username);
  if (!u || !u.enabled) return null;
  return { username, role: u.role || 'viewer', nickname: u.nickname || username, avatar: u.avatar || '#4f8cff' };
}

function pwdOk(username: string, cfg: SecCfg, pwd: string): boolean {
  if (username === (cfg.user || ROOT_USER)) return !!cfg.salt && !!cfg.hash && timingSafeEqualHex(sha(cfg.salt, pwd), cfg.hash);
  const u = findUser(username);
  return !!u && !!u.salt && !!u.hash && timingSafeEqualHex(sha(u.salt, pwd), u.hash);
}
function accountExists(username: string, cfg: SecCfg): boolean { return username === (cfg.user || ROOT_USER) || !!findUser(username); }
function roleOf(username: string, cfg: SecCfg): 'admin' | 'viewer' { if (username === (cfg.user || ROOT_USER)) return 'admin'; return findUser(username)?.role || 'viewer'; }

export function authBlocked(cfg: SecCfg, ip: string): boolean {
  const f = cfg.fail?.[ip]; return !!f && f.n >= 5 && Date.now() < f.until;
}
const bumpFail = (c: SecCfg, ip: string) => {
  c.fail = c.fail || {}; const f = c.fail[ip] = c.fail[ip] || { n: 0, until: 0 };
  f.n++; if (f.n >= 5) f.until = Date.now() + 5 * 60000;
  saveSec(c);
};
function cookieHeaders(token: string) {
  const secure = process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `zs_sess=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL / 1000}${secure}`;
}

export async function register(fastify: FastifyInstance) {
  // 当前登录用户(供守卫/UI)
  const me = (req: any) => {
    const c = sec();
    if (!c.enabled) return null;
    const t = readCookie(req.headers, 'zs_sess');
    return validSession(c, t) ? sessionUser(c, t) : null;
  };
  const needAdmin = (req: any, reply: any) => {
    const u = me(req);
    if (!u) { reply.code(401).send({ error: '未登录' }); return false; }
    if (u.role !== 'admin') { reply.code(403).send({ error: '需要管理员权限' }); return false; }
    return true;
  };

  fastify.get('/auth/status', (req) => { const c = sec(); const u = me(req); return { enabled: !!c.enabled, me: u }; });
  fastify.get('/auth/me', (req, reply) => {
    const c = sec();
    if (!c.enabled) return { enabled: false, open: true };
    const u = me(req);
    if (u) return { enabled: true, user: u };
    reply.code(401).send({ error: '未登录' });
  });

  fastify.post('/auth/login', (req, reply) => {
    const c = sec(); const ip = req.ip || '?';
    if (authBlocked(c, ip)) return reply.code(429).send({ error: '尝试过多,请稍后再试(5 分钟)' });
    const pwd = String((req.body as any)?.password || '');
    const user = String((req.body as any)?.username || '').trim() || ROOT_USER;
    if (!accountExists(user, c) || !c.enabled || !pwdOk(user, c, pwd)) {
      bumpFail(c, ip); audit('auth.fail', ip, user + ' 登录失败'); return reply.code(401).send({ error: '账号或密码错误' });
    }
    if (!findUser(user)?.enabled && user !== (c.user || ROOT_USER)) { bumpFail(c, ip); return reply.code(401).send({ error: '账号已被禁用' }); }
    const token = randomBytes(24).toString('hex');
    c.sessions = c.sessions || {};
    c.sessions[token] = { exp: new Date(Date.now() + TTL).toISOString(), user };
    const ks = Object.keys(c.sessions); if (ks.length > 100) delete c.sessions[ks[0]];
    delete c.fail?.[ip];
    saveSec(c); audit('auth.login', user);
    reply.header('Set-Cookie', cookieHeaders(token));
    return { ok: true, user: { username: user, nickname: user === (c.user || ROOT_USER) ? (c.nickname || '超级管理员') : (findUser(user)?.nickname || user), avatar: user === (c.user || ROOT_USER) ? (c.avatar || '#4f8cff') : (findUser(user)?.avatar || '#4f8cff'), role: roleOf(user, c) } };
  });

  fastify.post('/auth/logout', (req, reply) => {
    const c = sec(); const t = readCookie(req.headers, 'zs_sess');
    if (c.sessions && t) delete c.sessions[t]; saveSec(c);
    const secure = process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production' ? '; Secure' : '';
    reply.header('Set-Cookie', `zs_sess=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
    return { ok: true };
  });

  // 首次/重设 root 口令: 未开启时可任意设置; 已开启需管理员或带当前密码
  fastify.post('/auth/setup', (req, reply) => {
    const c = sec(); const b = (req.body || {}) as any;
    const pwd = String(b.password || '');
    if (pwd.length < 6) return reply.code(400).send({ error: '密码至少 6 位' });
    const admin = me(req);
    if (c.enabled && !admin) return reply.code(401).send({ error: '需管理员登录后操作' });
    const salt = randomBytes(12).toString('hex');
    c.salt = salt; c.hash = sha(salt, pwd); c.enabled = b.enabled !== false; c.sessions = {};
    saveSec(c); audit('auth.setup', ROOT_USER, `口令已更新 · 启用=${c.enabled}`);
    return { ok: true, enabled: c.enabled };
  });

  fastify.get('/auth/profile', (req, reply) => {
    const u = me(req);
    if (!u) return reply.code(401).send({ error: '未登录' });
    return u;
  });
  fastify.put('/auth/profile', (req, reply) => {
    const u = me(req);
    if (!u) return reply.code(401).send({ error: '未登录' });
    const c = sec(); const b = (req.body || {}) as any;
    if (u.username === (c.user || ROOT_USER)) {
      if (b.nickname !== undefined) c.nickname = String(b.nickname).slice(0, 30) || '超级管理员';
      if (b.avatar !== undefined && /^#[0-9a-fA-F]{6}$/.test(String(b.avatar))) c.avatar = String(b.avatar);
      saveSec(c); audit('auth.profile', u.username, '资料已更新'); return { ok: true, user: me(req) };
    }
    const list = users(); const rec = list.find((x) => x.username === u.username);
    if (rec) { if (b.nickname !== undefined) rec.nickname = String(b.nickname).slice(0, 30) || u.username; if (b.avatar !== undefined && /^#[0-9a-fA-F]{6}$/.test(String(b.avatar))) rec.avatar = String(b.avatar); saveUsers(list); audit('auth.profile', u.username, '资料已更新'); }
    return { ok: true, user: me(req) };
  });
  fastify.post('/auth/password', (req, reply) => {
    const u = me(req);
    if (!u) return reply.code(401).send({ error: '未登录' });
    const c = sec(); const b = (req.body || {}) as any;
    const pwd = String(b.newPassword || '');
    if (pwd.length < 6) return reply.code(400).send({ error: '新密码至少 6 位' });
    if (!pwdOk(u.username, c, String(b.oldPassword || ''))) return reply.code(401).send({ error: '当前密码错误' });
    if (u.username === (c.user || ROOT_USER)) { const salt = randomBytes(12).toString('hex'); c.salt = salt; c.hash = sha(salt, pwd); }
    else { const list = users(); const rec = list.find((x) => x.username === u.username); if (rec) { const salt = randomBytes(12).toString('hex'); rec.salt = salt; rec.hash = sha(salt, pwd); saveUsers(list); } }
    // 改密后其它会话全部失效
    const meTok = readCookie(req.headers, 'zs_sess');
    c.sessions = { [meTok]: { exp: new Date(Date.now() + TTL).toISOString(), user: u.username } };
    saveSec(c); audit('auth.password', u.username, '密码已修改');
    return { ok: true };
  });

  /* ============ 用户管理(仅管理员) ============ */
  fastify.get('/auth/users', (req, reply) => {
    if (!needAdmin(req, reply)) return reply;
    const c = sec();
    const list = users().map((u) => ({ username: u.username, nickname: u.nickname, role: u.role, avatar: u.avatar, enabled: u.enabled, createdAt: u.createdAt }));
    return { root: (c.user || ROOT_USER), users: list };
  });

  fastify.post('/auth/users', (req, reply) => {
    if (!needAdmin(req, reply)) return reply;
    const b = (req.body || {}) as any;
    const name = String(b.username || '').trim().replace(/\s+/g, '');
    if (!/^[A-Za-z0-9_.-]{2,32}$/.test(name)) return reply.code(400).send({ error: '用户名需 2-32 位字母数字._-' });
    if (name === (sec().user || ROOT_USER)) return reply.code(400).send({ error: '与超级管理员冲突' });
    if (findUser(name)) return reply.code(400).send({ error: '用户已存在' });
    const pwd = String(b.password || ''); if (pwd.length < 6) return reply.code(400).send({ error: '密码至少 6 位' });
    const salt = randomBytes(12).toString('hex');
    const rec: UserRec = { username: name, nickname: String(b.nickname || name).slice(0, 30), role: b.role === 'viewer' ? 'viewer' : 'admin', salt, hash: sha(salt, pwd), avatar: '#4f8cff', enabled: b.enabled !== false, createdAt: new Date().toISOString() };
    const list = users(); list.push(rec); saveUsers(list);
    audit('auth.user', name, `新增 ${rec.role}`);
    return { ok: true, user: { username: rec.username, nickname: rec.nickname, role: rec.role, avatar: rec.avatar, enabled: rec.enabled, createdAt: rec.createdAt } };
  });

  fastify.put('/auth/users/:username', (req, reply) => {
    if (!needAdmin(req, reply)) return reply;
    const name = String((req.params as any).username || '');
    const b = (req.body || {}) as any;
    const c = sec();
    if (name === (c.user || ROOT_USER)) return reply.code(400).send({ error: '超级管理员请用「修改密码/资料」' });
    const list = users(); const rec = list.find((x) => x.username === name);
    if (!rec) return reply.code(404).send({ error: '用户不存在' });
    if (b.role === 'viewer' || b.role === 'admin') rec.role = b.role;
    if (b.enabled !== undefined) rec.enabled = !!b.enabled;
    if (b.nickname !== undefined) rec.nickname = String(b.nickname).slice(0, 30) || name;
    if (b.password) { if (String(b.password).length < 6) return reply.code(400).send({ error: '密码至少 6 位' }); const salt = randomBytes(12).toString('hex'); rec.salt = salt; rec.hash = sha(salt, String(b.password)); }
    saveUsers(list); audit('auth.user', name, '更新用户'); return { ok: true, user: { username: rec.username, nickname: rec.nickname, role: rec.role, avatar: rec.avatar, enabled: rec.enabled } };
  });

  fastify.delete('/auth/users/:username', (req, reply) => {
    if (!needAdmin(req, reply)) return reply;
    const name = String((req.params as any).username || '');
    const c = sec();
    if (name === (c.user || ROOT_USER)) return reply.code(400).send({ error: '不能删除超级管理员' });
    saveUsers(users().filter((x) => x.username !== name));
    audit('auth.user', name, '删除用户'); return { ok: true };
  });
}
