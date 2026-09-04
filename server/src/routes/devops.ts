// DevOps 模块：流水线定义/运行、发布记录、脚本库、环境管理
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { store } from '../lib/store.js';
import { Host, run } from '../lib/host.js';

function pipe(env: string, step: any, vars: Record<string, string>) {
  let s = step.script || '';
  for (const k of Object.keys(vars)) s = s.split(`\${${k}}`).join(vars[k]);
  return s;
}

export async function register(fastify: FastifyInstance) {
  const P = 'pipelines';
  const REL = 'releases';
  const SCR = 'scripts';
  const ENV = 'envs';

  // ---- 环境管理
  fastify.get('/devops/envs', () => store.list(ENV));
  fastify.post('/devops/envs', (req) => store.upsert(ENV, { id: randomUUID(), ...((req.body as any).data ?? req.body as any), createdAt: new Date().toISOString() }));

  // ---- 脚本库
  fastify.get('/devops/scripts', () => store.list(SCR));
  fastify.post('/devops/scripts', (req) => store.upsert(SCR, { id: randomUUID(), ...((req.body as any).data ?? req.body as any), updatedAt: new Date().toISOString() }));

  // ---- 流水线
  fastify.get('/devops/pipelines', () => store.list(P));
  fastify.post('/devops/pipelines', (req) => {
    const body = (req.body as any).data ?? req.body as any;
    return store.upsert(P, { id: body.id || randomUUID(), name: body.name || '未命名', ...body });
  });
  fastify.delete('/devops/pipelines/:id', (req) => { store.remove(P, (req.params as any).id); return { ok: true }; });

  // ---- 发布记录
  fastify.get('/devops/releases', () => store.list(REL).sort((a: any, b: any) => (b.time || '').localeCompare(a.time || '')).slice(0, 100));

  // ---- 运行流水线（在一台目标主机上按步骤顺序执行脚本）
  fastify.post('/devops/pipelines/:id/run', async (req) => {
    const pid = (req.params as any).id;
    const { hostId } = req.body as any;
    const pl = store.get(P, pid);
    if (!pl) return { ok: false, error: '流水线不存在' };
    const host = hostId ? store.list<Host>('hosts').find((h) => h.id === hostId) : null;
    if (!host) return { ok: false, error: '目标主机不存在' };
    const vars = { ...(pl.vars || {}), ...((req.body as any).vars || {}) };
    const steps = pl.steps || [];
    const results: any[] = [];
    let failed = false;
    const releaseId = randomUUID();
    for (let i = 0; i < steps.length; i++) {
      const st = steps[i];
      const script = pipe('', st, vars);
      results.push({ step: i + 1, name: st.name || `步骤${i + 1}`, command: script, status: 'running' });
      const r = await run(host, script, (st.timeout || 600) * 1000);
      const last = results[results.length - 1];
      last.status = r.code === 0 ? 'success' : 'failed';
      last.code = r.code;
      last.output = (r.stdout + r.stderr).slice(-4000);
      if (r.code !== 0) { failed = true; if (st.onError !== 'continue') break; }
    }
    store.upsert(REL, {
      id: releaseId, pipelineId: pid, pipelineName: pl.name, hostId, hostName: host.name,
      status: failed ? 'failed' : 'success', time: new Date().toISOString(), steps: results, trigger: 'manual',
    });
    return { ok: true, releaseId, status: failed ? 'failed' : 'success', steps: results };
  });
}
