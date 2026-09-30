// ═══════════════════════════════════════════════════════════════════════════
// PentAGI 集成 · 路由层（可迁移）
// ---------------------------------------------------------------------------
// 挂载于 /api/pentagi/*，作为 ops-hub 与 PentAGI 引擎之间的适配层：
//   · 配置管理（地址 / Token / Provider，敏感字段加密）
//   · 任务(flow)列表 / 创建 / 详情 / 停止 / 追加指令 / 删除
//   · 详情聚合：flow + tasks + subtasks + msglogs + termlogs + agentlogs
//   · 靶机来源：ops-hub 纳管主机(store:hosts) + Docker 靶机(可选，动态引入)
//
// 迁移方式：连同 config.ts / client.ts 整体拷贝，并在 index.ts 注册：
//   import { register as pentagi } from './pentagi/index.js';
//   ... await app.register(pentagi, { prefix: '/api' });
// ═══════════════════════════════════════════════════════════════════════════
import type { FastifyInstance } from 'fastify';
import { getConfig, saveConfig, publicState, type PentagiConfig } from './config.js';
import { Pentagi, login, resetSession } from './client.js';
import { audit } from '../lib/audit.js';
import { store } from '../lib/store.js';

/** 生成默认渗透任务提示词（当只提供目标、未提供完整 input 时使用） */
export function buildDefaultPrompt(target: string, requirement?: string): string {
  const req = (requirement || '').trim();
  return [
    'Authorized security assessment. I own or am explicitly permitted to test this target.',
    '',
    `Target: ${target}`,
    `Scope: ONLY ${target}. Do NOT scan or touch any other host.`,
    '',
    'Objectives:',
    '1. Perform reconnaissance and service/version enumeration on the target.',
    '2. Identify and verify exploitable vulnerabilities on the discovered services.',
    '3. Attempt initial access and, if obtained, attempt privilege escalation.',
    '4. Produce a final report: confirmed findings, CVE IDs, reproduction steps,',
    '   evidence and remediation advice.',
    req ? '' : '',
    req ? `Extra requirements: ${req}` : '',
    'Show all commands and outputs. Ask before any destructive action.',
  ].filter((l) => l !== null).join('\n');
}

/** 汇总靶机来源：纳管主机 + Docker 靶机（Docker 部分为可选依赖） */
async function collectTargets() {
  const hosts = (store.list<any>('hosts') || []).map((h) => ({
    id: `host:${h.id}`,
    name: h.name || h.id,
    kind: h.kind === 'ssh' ? '远程主机' : '本机',
    address: h.kind === 'ssh' ? (h.host || '') : '127.0.0.1',
    source: 'host',
  }));

  const docker: any[] = [];
  try {
    const mod: any = await import('../routes/targets.js').catch(() => null);
    if (mod?.scanTargets) {
      for (const c of mod.scanTargets() as any[]) {
        docker.push({
          id: `docker:${c.name}`,
          name: c.name,
          kind: c.lab === '靶场' ? '靶场容器' : '容器',
          address: '', // 容器地址需结合映射端口，交给用户填写
          image: c.image,
          state: c.state,
          source: 'docker',
        });
      }
    }
  } catch { /* 无 targets 模块时忽略 */ }

  return { hosts, docker, total: hosts.length + docker.length };
}

export async function register(fastify: FastifyInstance) {
  // ── 配置 ────────────────────────────────────────────────────────────────
  fastify.get('/pentagi/state', async () => ({ state: publicState() }));

  fastify.post('/pentagi/config', async (req) => {
    const body = (req.body || {}) as Partial<PentagiConfig>;
    const saved = saveConfig(body);
    resetSession(); // 认证信息可能变化，清掉缓存会话
    audit('pentagi:config', saved.baseUrl, '更新 PentAGI 集成配置');
    return { ok: true, state: publicState() };
  });

  fastify.post('/pentagi/test', async (req, reply) => {
    try {
      // 允许“先用请求里的配置试连”，便于保存前验证
      const body = (req.body || {}) as Partial<PentagiConfig>;
      if (body.baseUrl || body.token || body.email) saveConfig(body);
      const r = await Pentagi.test();
      return { ok: true, total: r.total, state: publicState() };
    } catch (e: any) {
      return reply.code(400).send({ error: String(e?.message || e) });
    }
  });

  // 账号登录测试（仅账号模式下有意义）
  fastify.post('/pentagi/login', async (_req, reply) => {
    try { await login(true); return { ok: true }; }
    catch (e: any) { return reply.code(400).send({ error: String(e?.message || e) }); }
  });

  // ── 靶机来源（用于“从靶机库发起”）─────────────────────────────────────
  fastify.get('/pentagi/targets', async () => collectTargets());

  // ── 任务(flow)管理 ──────────────────────────────────────────────────────
  fastify.get('/pentagi/flows', async (_req, reply) => {
    try { return { flows: await Pentagi.listFlows(), state: publicState() }; }
    catch (e: any) { return reply.code(400).send({ error: String(e?.message || e) }); }
  });

  fastify.post('/pentagi/flows', async (req, reply) => {
    try {
      const b = (req.body || {}) as { input?: string; target?: string; requirement?: string; provider?: string };
      const cfg = getConfig();
      const provider = (b.provider || cfg.provider || 'deepseek').trim();
      const input = (b.input && b.input.trim())
        || (b.target ? buildDefaultPrompt(b.target.trim(), b.requirement) : '');
      if (!input) return reply.code(400).send({ error: '缺少任务内容（input 或 target）' });
      const flow = await Pentagi.createFlow(input, provider);
      audit('pentagi:flow:create', `flow#${flow?.id ?? '?'}`, `${provider} | ${b.target || input.slice(0, 80)}`);
      return { ok: true, flow };
    } catch (e: any) {
      return reply.code(400).send({ error: String(e?.message || e) });
    }
  });

  // 详情聚合（一次拿全，减少前端请求次数）
  fastify.get('/pentagi/flows/:id', async (req, reply) => {
    try {
      const id = (req.params as any).id;
      const [flow, tasks, subtasks, msglogs, termlogs, agentlogs] = await Promise.all([
        Pentagi.getFlow(id),
        Pentagi.tasks(id).catch(() => []),
        Pentagi.subtasks(id).catch(() => []),
        Pentagi.msglogs(id).catch(() => []),
        Pentagi.termlogs(id).catch(() => []),
        Pentagi.agentlogs(id).catch(() => []),
      ]);
      return { flow, tasks, subtasks, msglogs, termlogs, agentlogs };
    } catch (e: any) {
      return reply.code(400).send({ error: String(e?.message || e) });
    }
  });

  fastify.post('/pentagi/flows/:id/stop', async (req, reply) => {
    try {
      const id = (req.params as any).id;
      await Pentagi.patchFlow(id, 'stop');
      audit('pentagi:flow:stop', `flow#${id}`);
      return { ok: true };
    } catch (e: any) { return reply.code(400).send({ error: String(e?.message || e) }); }
  });

  fastify.post('/pentagi/flows/:id/input', async (req, reply) => {
    try {
      const id = (req.params as any).id;
      const input = String((req.body as any)?.input || '').trim();
      if (!input) return reply.code(400).send({ error: '缺少 input' });
      await Pentagi.patchFlow(id, 'input', { input });
      audit('pentagi:flow:input', `flow#${id}`, input.slice(0, 120));
      return { ok: true };
    } catch (e: any) { return reply.code(400).send({ error: String(e?.message || e) }); }
  });

  fastify.delete('/pentagi/flows/:id', async (req, reply) => {
    try {
      const id = (req.params as any).id;
      await Pentagi.deleteFlow(id);
      audit('pentagi:flow:delete', `flow#${id}`);
      return { ok: true };
    } catch (e: any) { return reply.code(400).send({ error: String(e?.message || e) }); }
  });
}
