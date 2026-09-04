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
import { register as monitoring } from './routes/monitoring.js';
import { register as ops } from './routes/ops.js';
import { register as linux } from './routes/linux.js';
import { register as code } from './routes/code.js';
import { register as kb } from './routes/kb.js';
import { register as problems } from './routes/problems.js';
import { store } from './lib/store.js';

// 确保本机默认可作为被纳管的 Linux 主机
store.upsert('hosts', { id: 'local', name: '本机(Linux)', kind: 'local', tags: ['core'], createdAt: new Date().toISOString() });

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = Fastify({ logger: { level: process.env.LOG || 'info' } });

await app.register(cors, { origin: true });
await app.register(websocket);

app.get('/api/health', async () => ({
  status: 'ok', uptime: process.uptime(), time: new Date().toISOString(),
}));

for (const m of [hosts, docker, tools, agents, k8s, ai, devops, monitoring, ops, linux, code, kb, problems]) await app.register(m, { prefix: '/api' });

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
