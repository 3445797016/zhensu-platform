// 工具/中间件注册中心路由：列表 + 在指定主机上探测 + 安装指引
import type { FastifyInstance } from 'fastify';
import { store } from '../lib/store.js';
import { TOOLS, probeTool, DOCKER_TEMPLATE, isDockerDeployable, dockerRunCommand, getContainerName } from '../modules/tools.js';
import { run } from '../lib/host.js';

const DEP = 'deployments';
// Container names are interpolated into shell commands below.  Keep the
// route parameter constrained to Docker's portable name subset so a crafted
// URL cannot inject an extra command (for example `; rm -rf ...`).
const safeContainerName = (value: unknown) => {
  const name = String(value || '');
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,120}$/.test(name)) throw new Error('容器名非法');
  return name;
};
const SAFE_ACTIONS = new Set(['start', 'stop', 'restart', 'pause', 'unpause']);

async function instanceState(rec: any): Promise<any> {
  const host: any = rec.hostId === 'local' ? { id: 'local', kind: 'local', name: '本机' } : store.list<any>('hosts').find((h) => h.id === rec.hostId);
  if (!host) return { ...rec, containerState: 'unknown' };
  const r = await run(host, `docker inspect -f '{{.State.Status}}|{{.State.Running}}|{{.Image}}' ${rec.containerName} 2>&1 || echo 'NO_CONTAINER'`, 15000);
  const line = r.stdout.trim();
  if (line === 'NO_CONTAINER') return { ...rec, containerState: 'absent', running: false };
  const [state, running, image] = line.split('|');
  return { ...rec, containerState: state, running: running === 'true', image };
}

export async function register(fastify: FastifyInstance) {
  fastify.get('/tools', async () => {
    const cats = {} as any;
    for (const t of TOOLS) {
      (cats[t.category] ||= []).push({ id: t.id, name: t.name, port: t.port, ui: t.ui });
    }
    return { tools: TOOLS.map(({ systemd, probeCmd, ...t }) => ({ ...t, deployable: isDockerDeployable(t.id), template: DOCKER_TEMPLATE[t.id] || null })), categories: cats };
  });

  fastify.get('/tools/:id', (req) => {
    const t = TOOLS.find((x) => x.id === (req.params as any).id);
    return t ?? { code: 404, error: '工具不存在' };
  });

  // 探测某主机上全部工具状态
  fastify.get('/tools/probe/all', async (req, reply) => {
    const hostId = (req.query as any).hostId;
    let host: any = null;
    if (hostId) host = store.list<any>('hosts').find((h) => h.id === hostId);
    if (!host) host = { id: 'local', kind: 'local', name: '本机' } as any;
    const results: any[] = [];
    // 并发探测
    const jobs = TOOLS.map((t) => probeTool(host, t));
    const settled = await Promise.allSettled(jobs);
    settled.forEach((s, i) => {
      if (s.status === 'fulfilled') results.push(s.value);
      else results.push({ id: TOOLS[i].id, name: TOOLS[i].name, detected: false, running: false, error: String(s.reason) });
    });
    const cats = Object.keys(TOOLS.reduce((a: any, t) => ((a[t.category] = 1), a), {}));
    const summary = {
      total: results.length,
      detected: results.filter((r) => r.detected).length,
      running: results.filter((r) => r.running).length,
      byCategory: Object.fromEntries(cats.map((c) => [c, results.filter((r) => TOOLS.find((t) => t.id === r.id)?.category === c).length])),
    };
    return { host, results, summary };
  });

  // 探测单个工具
  fastify.get('/tools/probe/:id', async (req, reply) => {
    const tool = TOOLS.find((x) => x.id === (req.params as any).id);
    if (!tool) return reply.code(404).send({ error: 'not found' });
    const hostId = (req.query as any).hostId;
    let host: any = null;
    if (hostId) host = store.list<any>('hosts').find((h) => h.id === hostId);
    if (!host) host = { id: 'local', kind: 'local', name: '本机' };
    const res = await probeTool(host, tool);
    return { ...res, tool };
  });

  // ===== 一键部署 / 管理 =====
  // 部署
  fastify.post('/tools/:id/deploy', async (req, reply) => {
    const tool = TOOLS.find((x) => x.id === (req.params as any).id);
    if (!tool) return reply.code(404).send({ error: '工具不存在' });
    if (!isDockerDeployable(tool.id)) return { ok: false, error: '该工具无 Docker 一键模板，请按安装指引手动部署' };
    const { hostId } = req.body as any;
    const host: any = !hostId || hostId === 'local' ? { id: 'local', kind: 'local', name: '本机' } : store.list<any>('hosts').find((h) => h.id === hostId);
    if (!host) return { ok: false, error: '目标主机不存在' };
    const settings = store.read<any>('settings', {});
    const cmd = dockerRunCommand(tool, host.id, { image: (req.body as any)?.image, mirror: settings.dockerRegistryMirror });
    const r = await run(host, cmd, 300000); // 首次需拉镜像，5 分钟超时
    if (r.code !== 0) return { ok: false, error: (r.stderr || r.stdout).slice(-500) };
    const rec = {
      id: tool.id + '-' + host.id + '-' + Date.now(), toolId: tool.id, toolName: tool.name,
      hostId: host.id, hostName: host.name, containerName: getContainerName(tool.id, host.id),
      image: (req.body as any)?.image || DOCKER_TEMPLATE[tool.id].image, time: new Date().toISOString(), status: 'deployed',
    };
    store.upsert(DEP, rec);
    return { ok: true, ...rec };
  });

  // 设置（含 Docker 镜像源）
  fastify.get('/settings', () => store.read('settings', {}));
  fastify.put('/settings', (req) => { store.write('settings', req.body as any); return { ok: true }; });

  // 卸载（删除容器）
  fastify.post('/tools/:id/undeploy', async (req, reply) => {
    const { hostId } = req.body as any;
    const tool = TOOLS.find((x) => x.id === (req.params as any).id);
    const host: any = !hostId || hostId === 'local' ? { id: 'local', kind: 'local', name: '本机' } : store.list<any>('hosts').find((h) => h.id === hostId);
    if (!host || !tool) return { ok: false, error: '参数错误' };
    const name = getContainerName(tool.id, host.id);
    const r = await run(host, `docker rm -f ${name} 2>&1 || echo NO_CONTAINER`, 20000);
    const recs = store.list(DEP).filter((x: any) => x.toolId === tool.id && x.hostId === host.id);
    for (const rec of recs) store.remove(DEP, rec.id);
    return { ok: r.code === 0, output: r.stdout };
  });

  // 容器动作
  fastify.post('/tools/instance/:containerName/:action', async (req, reply) => {
    const { containerName, action } = req.params as any;
    const { hostId } = req.body as any;
    const host: any = !hostId || hostId === 'local' ? { id: 'local', kind: 'local', name: '本机' } : store.list<any>('hosts').find((h) => h.id === hostId);
    if (!host) return { ok: false, error: '主机不存在' };
    if (!SAFE_ACTIONS.has(String(action))) return reply.code(400).send({ error: 'action 非法' });
    let name: string;
    try { name = safeContainerName(containerName); } catch (e: any) { return reply.code(400).send({ error: e.message }); }
    const r = await run(host, `docker ${action} ${name} 2>&1`, 30000);
    return { ok: r.code === 0, output: r.stdout, error: r.stderr };
  });

  // 容器日志
  fastify.get('/tools/instance/:containerName/logs', async (req, reply) => {
    const { containerName } = req.params as any;
    const { hostId, tail } = req.query as any;
    const host: any = !hostId || hostId === 'local' ? { id: 'local', kind: 'local', name: '本机' } : store.list<any>('hosts').find((h) => h.id === hostId);
    if (!host) return reply.code(400).send({ error: '主机不存在' });
    let name: string;
    try { name = safeContainerName(containerName); } catch (e: any) { return reply.code(400).send({ error: e.message }); }
    const tailNum = Number(tail || 300);
    if (!Number.isInteger(tailNum) || tailNum < 1 || tailNum > 10000) return reply.code(400).send({ error: 'tail 需为 1-10000 的整数' });
    const r = await run(host, `docker logs --tail ${tailNum} ${name} 2>&1`, 30000);
    return { ok: r.code === 0, content: r.stdout, error: r.stderr };
  });

  // 已部署实例
  fastify.get('/tools/instances', async (req) => {
    const recs = store.list(DEP).sort((a: any, b: any) => (b.time || '').localeCompare(a.time || ''));
    const states = await Promise.all(recs.map((r) => instanceState(r)));
    return states;
  });

  // 移除一条历史记录
  fastify.delete('/tools/instances/:id', (req) => { store.remove(DEP, (req.params as any).id); return { ok: true }; });
}
