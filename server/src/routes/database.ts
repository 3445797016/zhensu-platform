// 数据库中心:连接管理 + 多引擎适配。
// 支持:关系型 mysql/postgresql/clickhouse/sqlite;非关系 redis/mongodb;向量 qdrant(HTTP)/chroma(HTTP)。
// 连接方式:优先 docker exec 容器内自带 CLI(配合「中间件/工具库」一键部署);本机有对应 CLI 也可直连外部地址。
import { execSync } from 'node:child_process';
import type { FastifyInstance } from 'fastify';
import { store } from '../lib/store.js';
import { audit } from '../lib/audit.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KEY = 'dbconns';
const sh = (cmd: string) => { try { const r = execSync(cmd, { timeout: 30000, shell: '/bin/bash', encoding: 'utf-8' }); return { code: 0, stdout: String(r), stderr: '' }; } catch (e: any) { return { code: e.status ?? 1, stdout: String(e.stdout || ''), stderr: String(e.stderr || e.message) }; } };
const q = (s: string) => "'" + String(s).replace(/'/g, `'\\''`) + "'";

export interface DbConn {
  id: string; name: string; type: string;
  container?: string; host?: string; port?: number; user?: string; password?: string; database?: string; url?: string; extra?: string;
}

export const DB_TYPES: Record<string, { label: string; kind: string; cli: string; hints: string[] }> = {
  mysql: { label: 'MySQL', kind: 'sql', cli: 'mysql', hints: ['mysql', 'mariadb', 'percona'] },
  postgresql: { label: 'PostgreSQL', kind: 'sql', cli: 'psql', hints: ['postgres', 'pgvector'] },
  clickhouse: { label: 'ClickHouse', kind: 'sql', cli: 'clickhouse-client', hints: ['clickhouse'] },
  sqlite: { label: 'SQLite(本地文件)', kind: 'sql', cli: '', hints: [] },
  redis: { label: 'Redis', kind: 'kv', cli: 'redis-cli', hints: ['redis'] },
  mongodb: { label: 'MongoDB', kind: 'doc', cli: 'mongosh', hints: ['mongo'] },
  qdrant: { label: 'Qdrant(向量)', kind: 'vector', cli: '', hints: ['qdrant'] },
  chroma: { label: 'Chroma(向量)', kind: 'vector', cli: '', hints: ['chroma'] },
};

function haveLocal(cmd: string) { return sh(`command -v ${cmd} >/dev/null 2>&1`).code === 0; }

// 找容器(按名字/镜像关键字),返回 docker exec 前缀或 null
function containerPrefix(c: DbConn, hints: string[]): string | null {
  if (c.container) { if (sh(`docker inspect ${q(c.container)} >/dev/null 2>&1`).code === 0) return `docker exec -i ${q(c.container)}`; return null; }
  const list = sh("docker ps --format '{{.Names}}\\t{{.Image}}' 2>/dev/null").stdout.split('\n');
  for (const l of list) { const [n, img] = l.split('\t'); if (n && hints.some((h) => img.toLowerCase().includes(h))) return `docker exec -i ${q(n)}`; }
  return null;
}

// 得到 cli 可执行前缀:容器 > 本机 CLI;都没有则抛错
function prefixE(c: DbConn, cliCmd: string): string {
  const pre = containerPrefix(c, DB_TYPES[c.type]?.hints || []);
  if (pre !== null) return pre;
  if (haveLocal(cliCmd)) return '';
  throw new Error(`找不到可用 CLI(${cliCmd}),请先在「中间件/工具库」部署对应容器,或在连接管理里指定 container`);
}

function parseTab(text: string): { columns: string[]; rows: string[][] } {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
  if (!lines.length) return { columns: [], rows: [] };
  const columns = lines[0].split('\t');
  const rows = lines.slice(1).map((l) => l.split('\t'));
  return { columns, rows };
}

// ============ 引擎执行 ============
function sqlExec(c: DbConn, query: string): { columns: string[]; rows: string[][] } {
  const db = c.database ? q(c.database) : '';
  switch (c.type) {
    case 'mysql': {
      const pw = c.password ? `-p${c.password}` : '';
      const cmd = `${prefixE(c, 'mysql')} mysql ${c.host ? '-h ' + c.host : ''} ${c.port ? '-P ' + c.port : ''} -u ${q(c.user || 'root')} ${pw} ${db} -e ${q(query)} --batch --raw 2>&1`;
      const r = sh(cmd.replace(/\s+/g, ' '));
      if (r.code !== 0) throw new Error(r.stderr || r.stdout);
      return parseTab(r.stdout);
    }
    case 'postgresql': {
      const cmd = `${prefixE(c, 'psql')} psql ${c.host ? '-h ' + c.host : ''} ${c.port ? '-p ' + c.port : ''} -U ${q(c.user || 'postgres')} ${c.database ? '-d ' + q(c.database) : ''} -F '	' -A -X -c ${q(query)} 2>&1`;
      const r = sh(`${c.password ? 'PGPASSWORD=' + q(c.password) + ' ' : ''}${cmd.replace(/\s+/g, ' ')}`);
      if (r.code !== 0) throw new Error(r.stderr || r.stdout);
      return parseTab(r.stdout);
    }
    case 'clickhouse': {
      const cmd = `${prefixE(c, 'clickhouse-client')} clickhouse-client ${c.host ? '-h ' + c.host : ''} ${c.port ? '--port ' + c.port : ''} --user ${q(c.user || 'default')} ${c.password ? '--password ' + q(c.password) : ''} ${db ? '-d ' + db : ''} --format TabSeparatedWithNames --query ${q(query)} 2>&1`;
      const r = sh(cmd.replace(/\s+/g, ' '));
      if (r.code !== 0) throw new Error(r.stderr || r.stdout);
      return parseTab(r.stdout);
    }
    case 'sqlite': {
      const file = c.database || '';
      const py = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'server', 'src') + '';
      void py;
      // 用 python3 内置 sqlite3 安全执行(只允许单条 SELECT/PRAGMA,防注入写坏)
      if (!/^\s*(SELECT|PRAGMA|WITH|EXPLAIN)/i.test(query)) throw new Error('SQLite 控制台仅允许只读查询(写操作请用文件管理或数据库工具)');
      const script = `import sqlite3,sys,json\nc=sqlite3.connect(${JSON.stringify(file)});cur=c.execute(${JSON.stringify(query)})\ncols=[d[0] for d in cur.description or []]\nrows=[[str(x) for x in r] for r in cur.fetchmany(200)]\nprint(json.dumps({"columns":cols,"rows":rows},ensure_ascii=False))`;
      const r = sh(`python3 -c ${q(script)} 2>&1`);
      if (r.code !== 0) throw new Error(r.stdout || r.stderr);
      try { const j = JSON.parse(r.stdout.match(/\{.*\}/s)?.[0] || '{}'); return j; } catch { throw new Error('SQLite 解析失败:' + r.stdout); }
    }
    default: throw new Error('不支持的 SQL 类型');
  }
}

function redisExec(c: DbConn, query: string): { text: string } {
  const qs = String(query);
  if (/[;&|$`><\n]/.test(qs)) throw new Error('命令含非法字符(不支持 ; & | $ ` > <)');
  const cmd = `${prefixE(c, 'redis-cli')} redis-cli ${c.host ? '-h ' + c.host : ''} ${c.port ? '-p ' + c.port : ''} ${c.password ? '-a ' + q(c.password) : ''} ${c.database ? '-n ' + c.database : ''} --raw ${qs}`;
  const r = sh(cmd.replace(/\s+/g, ' '));
  return { text: r.code === 0 ? r.stdout : (r.stderr || r.stdout) };
}

function mongoExec(c: DbConn, js: string): any {
  const url = `mongodb://${c.user ? encodeURIComponent(c.user) + (c.password ? ':' + encodeURIComponent(c.password) : '') + '@' : ''}${c.host || '127.0.0.1'}:${c.port || 27017}/${c.database || 'admin'}`;
  const pre = containerPrefix(c, DB_TYPES.mongodb.hints);
  if (!pre && !haveLocal('mongosh')) throw new Error('找不到 mongosh,请指定含 mongosh 的 mongo 容器');
  const cmd = `${(pre || '')} mongosh ${q(url)} --quiet --eval ${q(`print(JSON.stringify((${js})))`)} 2>&1`;
  const r = sh(cmd.replace(/\s+/g, ' '));
  if (r.code !== 0) throw new Error(r.stdout || r.stderr);
  const m = r.stdout.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!m) return { raw: r.stdout };
  try { return JSON.parse(m[0]); } catch { return { raw: r.stdout }; }
}

async function httpJson(url: string, method = 'GET', body?: any): Promise<any> {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  const j = t ? JSON.parse(t) : {};
  if (!r.ok) throw new Error(typeof j === 'object' && j.error ? JSON.stringify(j.error) : t);
  return j;
}

const vecBase = (c: DbConn) => (c.url || `http://${c.host || '127.0.0.1'}:${c.port || 6333}`).replace(/\/+$/, '');

function qdrant(c: DbConn, op: string, body: any) {
  const b = vecBase(c); const col = String(body.collection || '');
  if (op === 'list') return httpJson(b + '/collections');
  if (op === 'info') return httpJson(b + '/collections/' + col);
  if (op === 'create') return httpJson(b + '/collections/' + col, 'PUT', { vectors: { size: Number(body.size) || 4, distance: body.distance || 'Cosine' } });
  if (op === 'delete') return httpJson(b + '/collections/' + col, 'DELETE');
  if (op === 'upsert') return httpJson(b + '/collections/' + col + '/points', 'PUT', { points: body.points });
  if (op === 'search') return httpJson(b + '/collections/' + col + '/points/search', 'POST', { vector: body.vector, limit: Number(body.limit) || 10, with_payload: body.with_payload !== false });
  throw new Error('未知 qdrant 操作');
}

function chroma(c: DbConn, op: string, body: any) {
  const b = vecBase(c);
  if (op === 'list') return httpJson(b + '/api/v1/collections');
  if (op === 'create') return httpJson(b + '/api/v1/collections', 'POST', { name: body.collection });
  const cid = String(body.collection_id || body.collectionId || '');
  if (!cid) throw new Error('缺少 collection_id(先列表/新建获取)');
  if (op === 'add') return httpJson(b + '/api/v1/collections/' + cid + '/add', 'POST', { ids: body.ids, embeddings: body.embeddings, documents: body.documents, metadatas: body.metadatas });
  if (op === 'query') return httpJson(b + '/api/v1/collections/' + cid + '/query', 'POST', { query_embeddings: body.embeddings, n_results: Number(body.limit) || 5 });
  throw new Error('未知 chroma 操作');
}

export async function register(fastify: FastifyInstance) {
  const conns = () => store.list<DbConn>(KEY);

  // ---- 本机数据库自动发现(同步/扫描,类似主流面板) ----
  const PORT_MAP: Array<{ port: number; type: string }> = [
    { port: 3306, type: 'mysql' }, { port: 5432, type: 'postgresql' }, { port: 6379, type: 'redis' },
    { port: 27017, type: 'mongodb' }, { port: 8123, type: 'clickhouse' }, { port: 6333, type: 'qdrant' }, { port: 8000, type: 'chroma' },
  ];
  const scanLocal = () => {
    const out: any[] = [];
    const seen = new Set<string>();
    const dps = sh("docker ps --format '{{.Names}}\\t{{.Image}}' 2>/dev/null").stdout.split('\n');
    for (const l of dps) {
      const [name, image] = (l || '').split('\t');
      if (!name) continue;
      for (const [tid, t] of Object.entries(DB_TYPES)) {
        if (t.hints.some((h) => image.toLowerCase().includes(h))) {
          const key = `${tid}:c:${name}`;
          if (!seen.has(key)) { seen.add(key); out.push({ type: tid, label: t.label, container: name, port: 0, by: 'docker', image: (image.split('/').pop() || image) }); }
        }
      }
    }
    const listen = sh('ss -ltn 2>/dev/null | tail -n +2').stdout;
    for (const { port, type } of PORT_MAP) {
      if (!new RegExp(`[.:]${port}\\s`).test(listen)) continue;
      const key = `${type}:p:${port}`;
      if (!seen.has(key)) { seen.add(key); out.push({ type, label: DB_TYPES[type].label, container: '', port, by: 'port', image: '' }); }
    }
    return out;
  };
  const scanMeta = (c: DbConn): any => {
    switch (c.type) {
      case 'mysql': return { kind: 'sql', rows: sqlExec(c, "SELECT table_schema AS 库, COUNT(*) AS 表数, ROUND(SUM(data_length+index_length)/1048576,2) AS 大小MB, MAX(table_collation) AS 字符集 FROM information_schema.tables WHERE table_schema NOT IN ('information_schema','performance_schema','mysql','sys') GROUP BY table_schema ORDER BY 库").rows.map((r) => ({ 库: r[0], 表数: r[1], 大小MB: r[2], 字符集: r[3] })) };
      case 'postgresql': return { kind: 'sql', rows: sqlExec(c, "SELECT table_catalog AS 库, COUNT(*) AS 表数 FROM information_schema.tables WHERE table_schema='public' GROUP BY 1 ORDER BY 1").rows.map((r) => ({ 库: r[0], 表数: r[1] })) };
      case 'clickhouse': return { kind: 'sql', rows: sqlExec(c, 'SELECT database AS 库, count() AS 表数 FROM system.tables WHERE is_temporary=0 GROUP BY database ORDER BY 1').rows.map((r) => ({ 库: r[0], 表数: r[1] })) };
      case 'sqlite': { const sz = sh(`stat -c %s ${q(c.database || '')} 2>/dev/null`).stdout.trim(); return { kind: 'sql', rows: [{ 库: c.database || '(文件)', 大小MB: sz ? (+sz / 1048576).toFixed(2) : '?', 表数: sqlExec(c, "SELECT count(*) FROM sqlite_master WHERE type='table'").rows[0]?.[0] || 0 }] }; }
      case 'redis': { const rows = (redisExec(c, 'INFO keyspace').text.match(/db\d+:keys=(\d+)/g) || []).map((s) => { const m = s.match(/^(db\d+):keys=(\d+)/); return { 库: m?.[1], keys: m?.[2] }; }); return { kind: 'kv', rows }; }
      case 'mongodb': { const j = mongoExec(c, 'db.adminCommand({listDatabases:1}).databases.map(x=>{const st=db.getSiblingDB(x.name).stats(1048576);return [x.name, Number(st.dataSize||0), Number(st.objects||0)]})'); return { kind: 'doc', rows: (Array.isArray(j) ? j : []).map((x: any) => ({ 库: x[0], 大小MB: (x[1] || 0) ? x[1].toFixed(1) : '-', 表数: x[2] })) }; }
      default: return null;
    }
  };

  fastify.get('/db/types', () => ({ types: Object.entries(DB_TYPES).map(([id, t]) => ({ id, ...t })) }));

  fastify.get('/db/scan-local', () => ({ found: scanLocal(), types: Object.entries(DB_TYPES).map(([id, t]) => ({ id, ...t })) }));

  fastify.post('/db/scan-import', async (req, reply) => {
    const b = (req.body || {}) as any;
    if (!DB_TYPES[b.type]) return reply.code(400).send({ error: '未知类型' });
    const c: DbConn = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: b.name || `${DB_TYPES[b.type].label}(扫描接入)`, type: b.type,
      container: b.container || '', host: b.container ? '' : '127.0.0.1', port: b.port ? Number(b.port) : undefined, url: b.url || '',
      user: b.user || '', password: b.password || '', database: b.database || '',
    };
    store.upsert(KEY, c);
    let tested = true, err = '';
    try { await test(c); } catch (e: any) { tested = false; err = String(e?.message || e).slice(0, 200); }
    audit('db.scan-import', c.name, `${c.type} ${tested ? '测试通过' : err}`);
    return { ok: true, conn: c, tested, err };
  });

  fastify.get('/db/conns', async () => {
    const withStatus = await Promise.all(conns().map(async (c) => {
      try { await test(c); return { ...c, ok: true }; } catch (e: any) { return { ...c, ok: false, err: String(e?.message || e).slice(0, 200) }; }
    }));
    return withStatus;
  });
  async function test(c: DbConn) {
    switch (c.type) {
      case 'redis': return redisExec(c, 'PING');
      case 'mongodb': return mongoExec(c, 'db.runCommand({ping:1})');
      case 'qdrant': return qdrant(c, 'list', {});
      case 'chroma': return chroma(c, 'list', {});
      case 'sqlite': return { ok: !!c.database };
      default: return sqlExec(c, 'SELECT 1');
    }
  }
  fastify.post('/db/test', async (req, reply) => { const c = (req.body || {}) as any; try { await test(c); return { ok: true }; } catch (e: any) { return { ok: false, error: String(e?.message || e) }; } });

  fastify.post('/db/conns', (req, reply) => {
    const b = (req.body || {}) as any;
    if (!b.name || !DB_TYPES[b.type]) return reply.code(400).send({ error: '缺少 name/type' });
    const c: DbConn = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: b.name, type: b.type, container: b.container || '', host: b.host || '', port: b.port ? Number(b.port) : undefined, user: b.user || '', password: b.password || '', database: b.database || '', url: b.url || '' };
    store.upsert(KEY, c); audit('db.conn', c.name, `${c.type} ${c.host || c.container}`); return { ok: true, conn: c };
  });
  fastify.put('/db/conns/:id', (req) => { const id = String((req.params as any).id); const b = (req.body || {}) as any; store.write(KEY, conns().map((c) => (c.id === id ? { ...c, ...b, id } : c))); return { ok: true }; });
  fastify.delete('/db/conns/:id', (req) => { store.write(KEY, conns().filter((c) => c.id !== String((req.params as any).id))); return { ok: true }; });

  const find = (req: any) => conns().find((c) => c.id === String((req.params as any).id));

  fastify.get('/db/conns/:id/scan', async (req, reply) => {
    const c = find(req); if (!c) return reply.code(404).send({ error: '连接不存在' });
    try {
      const m = scanMeta(c);
      if (m) return { kind: m.kind, rows: m.rows };
      return { kind: 'vector', note: '向量库无“库/表”,请直接使用集合管理(建集合→写向量→检索)' };
    } catch (e: any) { return reply.code(500).send({ error: String(e?.message || e) }); }
  });

  fastify.get('/db/conns/:id/browse', async (req, reply) => {
    const c = find(req); if (!c) return reply.code(404).send({ error: '连接不存在' });
    try {
      if (c.type === 'redis') {
        const info = redisExec(c, 'INFO keyspace').text;
        return { kind: 'kv', dbs: (info.match(/db\d+:/g) || []).map((x) => x.replace(':', '')) || ['db0'], info: redisExec(c, 'INFO server').text.split('\n').filter((l) => /^(redis_version|os|process_id|uptime_in_days|connected_clients|used_memory_human)/.test(l)) };
      }
      if (c.type === 'mongodb') return { kind: 'doc', ...mongoExec(c, '({dbs: db.adminCommand({listDatabases:1}).databases.map(x=>x.name)})') };
      if (c.type === 'qdrant') { const j = await qdrant(c, 'list', {}); return { kind: 'vector', engine: 'qdrant', collections: (j.result?.collections || []).map((x: any) => x.name) }; }
      if (c.type === 'chroma') { const j: any = await chroma(c, 'list', {}); return { kind: 'vector', engine: 'chroma', collections: (j || []).map((x: any) => ({ id: x.id, name: x.name })) }; }
      if (c.type === 'sqlite') return { kind: 'sql', dbs: ['main'] };
      const db = c.type === 'postgresql' ? 'SELECT datname AS name FROM pg_database WHERE datistemplate=false' : c.type === 'clickhouse' ? 'SHOW DATABASES' : 'SHOW DATABASES';
      const dbs = sqlExec(c, db);
      return { kind: 'sql', dbs: dbs.rows.map((r) => r[0]).filter(Boolean) };
    } catch (e: any) { return reply.code(500).send({ error: String(e?.message || e) }); }
  });

  fastify.get('/db/conns/:id/tables', async (req, reply) => {
    const c = find(req); if (!c) return reply.code(404).send({ error: '连接不存在' });
    const db = String((req.query as any).db || c.database || '');
    try {
      if (c.type === 'mongodb') return { tables: mongoExec(c, `db.getSiblingDB(${JSON.stringify(db)}).getCollectionNames()`) };
      if (c.type === 'postgresql') return { tables: sqlExec(c, `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ${db ? "AND table_catalog='" + db.replace(/'/g, "''") + "'" : ''} ORDER BY 1`).rows.map((r) => r[0]) };
      if (c.type === 'clickhouse') return { tables: sqlExec(c, `SELECT name FROM system.tables WHERE database=${q(db || 'default')} AND is_temporary=0 ORDER BY name`).rows.map((r) => r[0]) };
      if (c.type === 'sqlite') return { tables: sqlExec(c, "SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name").rows.map((r) => r[0]) };
      if (c.type === 'mysql') return { tables: sqlExec(c, `SHOW TABLES FROM ${q(db || c.database || '')}`).rows.map((r) => r[0]) };
      return { tables: [] };
    } catch (e: any) { return reply.code(500).send({ error: String(e?.message || e) }); }
  });

  // 执行:SQL / redis / mongo(js) / 向量操作
  fastify.post('/db/conns/:id/exec', async (req, reply) => {
    const c = find(req); if (!c) return reply.code(404).send({ error: '连接不存在' });
    const b = (req.body || {}) as any;
    try {
      audit('db.exec', c.name, `type=${c.type} op=${b.op || 'exec'}`);
      if (c.type === 'redis') return { kind: 'kv', text: redisExec(c, String(b.query || 'PING')).text };
      if (c.type === 'mongodb') return { kind: 'doc', data: mongoExec(c, String(b.query || 'db.runCommand({ping:1})')) };
      if (c.type === 'qdrant') return { kind: 'vector', data: await qdrant(c, String(b.op || 'list'), b) };
      if (c.type === 'chroma') return { kind: 'vector', data: await chroma(c, String(b.op || 'list'), b) };
      const r = sqlExec(c, String(b.query || 'SELECT 1')); return { kind: 'sql', columns: r.columns, rows: r.rows.slice(0, 300) };
    } catch (e: any) { return reply.code(500).send({ error: String(e?.message || e) }); }
  });

  // ---------- 图形化:SQL 表结构 / 数据 / 插入 ----------
  fastify.get('/db/conns/:id/table/info', async (req, reply) => {
    const c = find(req); const q = req.query as any;
    if (!c) return reply.code(404).send({ error: '连接不存在' });
    try { return { columns: tableInfo(c, String(q.db || ''), String(q.table || '')) }; }
    catch (e: any) { return reply.code(500).send({ error: String(e?.message || e) }); }
  });
  fastify.get('/db/conns/:id/table/data', async (req, reply) => {
    const c = find(req); const q = req.query as any;
    if (!c) return reply.code(404).send({ error: '连接不存在' });
    try { return tableData(c, String(q.db || ''), String(q.table || ''), Number(q.limit) || 100); }
    catch (e: any) { return reply.code(500).send({ error: String(e?.message || e) }); }
  });
  fastify.post('/db/conns/:id/table/insert', async (req, reply) => {
    const c = find(req); const b = (req.body || {}) as any;
    if (!c) return reply.code(404).send({ error: '连接不存在' });
    try { tableInsert(c, String(b.db || ''), String(b.table || ''), b.row || {}); audit('db.insert', `${b.db}.${b.table}`, 'graphical'); return { ok: true }; }
    catch (e: any) { return reply.code(500).send({ error: String(e?.message || e) }); }
  });

  // ---------- 图形化:Redis keys ----------
  fastify.get('/db/conns/:id/redis/keys', async (req, reply) => {
    const c = find(req); const q = req.query as any;
    if (!c || c.type !== 'redis') return reply.code(404).send({ error: '仅 Redis 连接可用' });
    try {
      const pat = String(q.pattern || '');
      const c2: DbConn = { ...c, database: q.db || c.database || '0' };
      if (/[;|&$`><\n]/.test(pat)) throw new Error('pattern 含非法字符');
      const scan = redisExec(c2, pat ? `SCAN 0 MATCH ${qs('*' + pat + '*')} COUNT 500` : 'SCAN 0 COUNT 500').text;
      const lines = scan.split('\n').filter(Boolean);
      const keys = lines.slice(1).slice(0, 100);
      const items = keys.map((k) => ({ key: k, ...redisKeyInfo(c2, c2.database || '0', k) }));
      return { cursor: lines[0] || '0', items };
    } catch (e: any) { return reply.code(500).send({ error: String(e?.message || e) }); }
  });
  fastify.post('/db/conns/:id/redis/ops', async (req, reply) => {
    const c = find(req); const b = (req.body || {}) as any;
    if (!c || c.type !== 'redis') return reply.code(404).send({ error: '仅 Redis 连接可用' });
    try {
      const c2: DbConn = { ...c, database: b.db || c.database || '0' };
      const clean = (s: string) => { const v = String(s || ''); if (/[\n\r\0]/.test(v)) throw new Error('值含非法换行符'); return v; };
      if (b.action === 'set') {
        const key = clean(b.key); const val = clean(b.value);
        const ttl = b.ttl ? Number(b.ttl) : 0;
        const r = redisExec(c2, `SET ${qs(key)} ${qs(val)}${ttl ? ' EX ' + ttl : ''}`);
        if (/^ERR/.test(r.text.trim())) throw new Error(r.text);
        audit('redis.set', key, `${val.length}B${ttl ? ' ttl=' + ttl : ''}`);
        return { ok: true };
      }
      if (b.action === 'del') {
        const keys = Array.isArray(b.keys) && b.keys.length ? b.keys : (b.key ? [b.key] : []);
        if (!keys.length) throw new Error('缺少 key');
        const r = redisExec(c2, 'DEL ' + keys.map((k) => qs(clean(k))).join(' '));
        audit('redis.del', keys.join(','));
        return { ok: true, text: r.text };
      }
      throw new Error('未知 redis 操作');
    } catch (e: any) { return reply.code(500).send({ error: String(e?.message || e) }); }
  });

  // ---------- 图形化:Mongo 集合文档 ----------
  fastify.get('/db/conns/:id/mongo/docs', async (req, reply) => {
    const c = find(req); const q = req.query as any;
    if (!c || c.type !== 'mongodb') return reply.code(404).send({ error: '仅 MongoDB 连接可用' });
    try {
      const lim = Math.min(Number(q.limit) || 50, 200);
      const js = `db.getSiblingDB(${JSON.stringify(String(q.db || ''))}).getCollection(${JSON.stringify(String(q.collection || ''))}).find({}).limit(${lim}).toArray().map(x=>{try{x._id=x._id.toString()}catch(e){};return x})`;
      return { docs: mongoExec(c, js) };
    } catch (e: any) { return reply.code(500).send({ error: String(e?.message || e) }); }
  });
  fastify.post('/db/conns/:id/mongo/insert', async (req, reply) => {
    const c = find(req); const b = (req.body || {}) as any;
    if (!c || c.type !== 'mongodb') return reply.code(404).send({ error: '仅 MongoDB 连接可用' });
    try {
      const doc = JSON.stringify(b.doc || {});
      mongoExec(c, `db.getSiblingDB(${JSON.stringify(String(b.db || ''))}).getCollection(${JSON.stringify(String(b.collection || ''))}).insertOne(${doc})`);
      audit('mongo.insert', `${b.db}.${b.collection}`, doc.slice(0, 200));
      return { ok: true };
    } catch (e: any) { return reply.code(500).send({ error: String(e?.message || e) }); }
  });
  fastify.post('/db/conns/:id/mongo/delete', async (req, reply) => {
    const c = find(req); const b = (req.body || {}) as any;
    if (!c || c.type !== 'mongodb') return reply.code(404).send({ error: '仅 MongoDB 连接可用' });
    try {
      const r = mongoExec(c, `db.getSiblingDB(${JSON.stringify(String(b.db || ''))}).getCollection(${JSON.stringify(String(b.collection || ''))}).deleteOne({_id:ObjectId(${JSON.stringify(String(b.id || ''))})})`);
      audit('mongo.delete', `${b.db}.${b.collection}`, String(b.id));
      return { ok: true, data: r };
    } catch (e: any) { return reply.code(500).send({ error: String(e?.message || e) }); }
  });
}

// ===== 图形化操作辅助:SQL 表结构/数据/插入 =====
const ident = (t: string, c: DbConn) => {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(t)) return t;
  const qc = c.type === 'postgresql' ? '"' : '`';
  return qc + t.replace(/`/g, '').replace(/"/g, '') + qc;
};
const qs = (v: string) => "'" + String(v).replace(/'/g, "''") + "'";

function tableInfo(c: DbConn, db: string, table: string): any[] {
  const tc: DbConn = { ...c, database: c.type === 'sqlite' ? (c.database || db) : db };
  const q = c.type === 'mysql' ? `SELECT column_name AS name, data_type AS type, is_nullable AS nullable, column_key AS \`key\`, column_default AS \`default\` FROM information_schema.columns WHERE table_schema=${qs(db)} AND table_name=${qs(table)} ORDER BY ordinal_position`
    : c.type === 'postgresql' ? `SELECT column_name AS name, data_type AS type, is_nullable AS nullable, column_default AS "default" FROM information_schema.columns WHERE table_catalog=${qs(db)} AND table_schema='public' AND table_name=${qs(table)} ORDER BY ordinal_position`
    : c.type === 'clickhouse' ? `DESCRIBE TABLE ${ident(db, c)}.${ident(table, c)}`
    : `PRAGMA table_info(${qs(table)})`;
  const r = sqlExec(tc, q);
  const names = r.columns;
  return r.rows.map((row) => Object.fromEntries(names.map((n, i) => [n, row[i]])));
}

function tableData(c: DbConn, db: string, table: string, limit = 100): any {
  const tc: DbConn = { ...c, database: c.type === 'sqlite' ? (c.database || db) : db };
  const lim = Math.min(Number(limit) || 100, 500);
  const r = sqlExec(tc, `SELECT * FROM ${ident(table, c)} LIMIT ${lim}`);
  return { columns: r.columns, rows: r.rows.slice(0, lim) };
}

function tableInsert(c: DbConn, db: string, table: string, row: Record<string, any>) {
  if (c.type === 'sqlite') {
    const keys = Object.keys(row).filter((k) => k);
    if (!keys.length) throw new Error('没有可插入的列');
    const vals = keys.map((k) => (row[k] === null || row[k] === undefined ? null : String(row[k])));
    const cols = keys.map((k) => '"' + String(k).replace(/"/g, '') + '"').join(',');
    const ph = keys.map(() => '?').join(',');
    const script = `import sqlite3,json\nsqlite3.connect(${JSON.stringify(c.database || db)}).execute(${JSON.stringify('INSERT INTO "' + table.replace(/"/g, '') + '" (' + cols + ') VALUES (' + ph + ')')}, ${JSON.stringify(vals)}).connection.commit()`;
    const r = sh(`python3 -c ${q(script)} 2>&1`);
    if (r.code !== 0) throw new Error(r.stdout || r.stderr);
    return { columns: keys, rows: [] };
  }
  const tc: DbConn = { ...c, database: db };
  const cols = Object.keys(row).map((k) => ident(k, c));
  const vals = Object.values(row).map((v) => (v === null || v === undefined ? 'NULL' : qs(String(v))));
  if (!cols.length) throw new Error('没有可插入的列');
  return sqlExec(tc, `INSERT INTO ${ident(table, c)} (${cols.join(',')}) VALUES (${vals.join(',')})`);
}

// ===== Redis 图形 keys =====
function redisKeyInfo(c: DbConn, db: string, key: string): { type: string; ttl: string; preview: string } {
  const c2: DbConn = { ...c, database: db || c.database || '0' };
  const type = redisExec(c2, `TYPE ${qs(key)}`).text.trim();
  const ttl = redisExec(c2, `TTL ${qs(key)}`).text.trim();
  let preview = '';
  const grab = (cmd: string) => redisExec(c2, cmd).text;
  switch (type) {
    case 'string': preview = grab(`GET ${qs(key)}`); break;
    case 'list': preview = grab(`LRANGE ${qs(key)} 0 49`); break;
    case 'hash': preview = grab(`HGETALL ${qs(key)}`).split('\n').slice(0, 100).map((l, i) => (i % 2 ? '  = ' + l : l)).join('\n'); break;
    case 'set': preview = grab(`SMEMBERS ${qs(key)}`); break;
    case 'zset': preview = grab(`ZRANGE ${qs(key)} 0 49 WITHSCORES`).split('\n').map((l, i) => (i % 2 ? '  => ' + l : l)).join('\n'); break;
    default: preview = grab(`DUMP ${qs(key)}`).slice(0, 200);
  }
  return { type, ttl, preview };
}
