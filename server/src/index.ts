// 轸宿智汇平台 服务器入口
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import staticPlugin from '@fastify/static';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { register as hosts } from './routes/hosts.js';
import { register as docker } from './routes/docker.js';
import { register as tools } from './routes/tools.js';
import { register as agents } from './routes/agents.js';
import { register as k8s } from './routes/k8s.js';
import { register as ai } from './routes/ai.js';
import { register as devops } from './routes/devops.js';
import { register as devopsCi } from './routes/devops-ci.js';
import { register as jenkins } from './routes/jenkins.js';
import { register as buildTools } from './routes/build-tools.js';
import { register as monitoring } from './routes/monitoring.js';
import { register as ops } from './routes/ops.js';
import { register as linux } from './routes/linux.js';
import { register as code } from './routes/code.js';
import { register as kb } from './routes/kb.js';
import { register as problems } from './routes/problems.js';
import { register as sec } from './routes/sec.js';
import { register as files } from './routes/files.js';
import { register as auth } from './routes/auth.js';
import { register as admin } from './routes/admin.js';
import { register as websites } from './routes/websites.js';
import { register as firewall } from './routes/firewall.js';
import { register as backup } from './routes/backup.js';
import { register as weblog } from './routes/weblog.js';
import { register as database } from './routes/database.js';
import { register as targets } from './routes/targets.js';
import { register as seclab } from './routes/seclab.js';
import { register as tasksApi } from './modules/tasks.js';
import { store } from './lib/store.js';

// 确保本机默认可作为被纳管的 Linux 主机
store.upsert('hosts', { id: 'local', name: '本机(Linux)', kind: 'local', tags: ['core'], createdAt: new Date().toISOString() });

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = Fastify({ logger: { level: process.env.LOG || 'info' }, bodyLimit: 100 * 1024 * 1024 });

const corsOrigin = process.env.WEB_ORIGIN
  ? process.env.WEB_ORIGIN.split(',').map((v) => v.trim()).filter(Boolean)
  : true;
await app.register(cors, { origin: corsOrigin });
await app.register(websocket);

app.get('/api/health', async () => ({
  status: 'ok', uptime: process.uptime(), time: new Date().toISOString(),
}));

// 登录守卫(可选):开启安全后,除 /api/auth/*、/api/open/*、/api/health 外都需会话 cookie
app.addHook('onRequest', (req, reply, done) => {
  const secCfg = store.read<any>('security', {});
  const u = req.url || '';
  if (!secCfg.enabled || !u.startsWith('/api')) return done();
  if (u.startsWith('/api/auth/') || u.startsWith('/api/open/') || u === '/api/health' || req.method === 'OPTIONS') return done();
  const m = String(req.headers.cookie || '').match(/zs_sess=([^;]+)/);
  const tok = m ? decodeURIComponent(m[1]) : '';
  // Session entries store their ISO expiration.  Checking only key presence
  // would keep a persisted session valid indefinitely after its 3-day TTL.
  const expiresAt = tok ? secCfg.sessions?.[tok] : undefined;
  if (expiresAt && Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) > Date.now()) return done();
  reply.code(401).send({ error: '未登录' });
});

for (const m of [hosts, docker, tools, agents, k8s, ai, devops, devopsCi, jenkins, buildTools, monitoring, ops, linux, code, kb, problems, sec, files, auth, admin, websites, firewall, backup, weblog, database, targets, seclab, tasksApi]) await app.register(m, { prefix: '/api' });

// 托管前端构建产物（存在则提供）
const webDist = join(__dirname, '..', '..', 'web', 'dist');
if (existsSync(webDist)) {
  await app.register(staticPlugin, { root: webDist, prefix: '/' });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api')) return reply.code(404).send({ error: 'api not found' });
    return reply.sendFile('index.html');
  });
}

const port = Number(process.env.PORT || 7799);
const host = process.env.HOST || '0.0.0.0';
await app.listen({ port, host });
console.log(`\n🟢 轸宿智汇平台 已启动: http://localhost:${port}`);
console.log(`   局域网访问: http://<本机IP>:${port}\n`);
