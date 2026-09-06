// 构建工具配置:检测本机编译器/构建器(JDK/Python/Maven/Gradle/Go/Node/Flask 等),支持手动指定路径
import { execSync } from 'node:child_process';
import type { FastifyInstance } from 'fastify';
import { store } from '../lib/store.js';
import { TOOLCHAIN, toolchainById } from '../modules/toolchain.js';
import { audit } from '../lib/audit.js';

const KEY = 'build-tools';

const probe = (cmd: string): { ok: boolean; version: string; raw: string } => {
  try {
    const out = String(execSync(cmd, { shell: '/bin/bash', encoding: 'utf-8', timeout: 20000 })).trim();
    return { ok: true, version: out.split('\n')[0] || '', raw: out.slice(0, 500) };
  } catch (e: any) {
    return { ok: false, version: '', raw: String(e.message || '').slice(0, 200) };
  }
};

export async function register(fastify: FastifyInstance) {
  // 列表 + 检测状态(自动探测 + 手动配置合并)
  fastify.get('/build-tools', () => {
    const cfg = store.read<any>(KEY, {});
    return TOOLCHAIN.map((t) => {
      const c = cfg[t.id] || {};
      // 若手动指定了路径,则探测该路径下的可执行文件
      const eff = c.path ? probe(`ls "${c.path}" >/dev/null 2>&1 && echo "已配置路径:${c.path}"`) : probe(t.probe);
      return { ...t, detected: eff.ok || !!c.path, version: eff.version || '', path: c.path || '', configured: !!c.path };
    });
  });

  // 重新探测全部
  fastify.post('/build-tools/probe', () => {
    const cfg = store.read<any>(KEY, {});
    return TOOLCHAIN.map((t) => {
      const c = cfg[t.id] || {};
      const eff = c.path ? probe(`ls "${c.path}" >/dev/null 2>&1 && echo "已配置路径:${c.path}"`) : probe(t.probe);
      return { id: t.id, name: t.name, detected: eff.ok || !!c.path, version: eff.version || '' };
    });
  });

  // 探测单个工具(立即执行,可传自定义路径)
  fastify.post('/build-tools/:id/probe', (req, reply) => {
    const t = toolchainById((req.params as any).id);
    if (!t) return reply.code(404).send({ error: '工具不存在' });
    const path = String((req.body as any)?.path || '').trim();
    const cmd = path ? `ls "${path}" >/dev/null 2>&1 && echo "已配置路径:${path}"` : t.probe;
    return { id: t.id, name: t.name, ...probe(cmd) };
  });

  // 保存手动路径配置(路径可为 JDK_HOME 之类根目录,构建时注入 PATH)
  fastify.put('/build-tools/:id', (req, reply) => {
    const t = toolchainById((req.params as any).id);
    if (!t) return reply.code(404).send({ error: '工具不存在' });
    const path = String((req.body as any)?.path || '').trim();
    const cfg = store.read<any>(KEY, {});
    cfg[t.id] = { ...(cfg[t.id] || {}), path, updatedAt: new Date().toISOString() };
    store.write(KEY, cfg);
    audit('buildtool.config', t.name, path || '(清空)');
    return { ok: true };
  });

  // 返回当前手动配置汇总
  fastify.get('/build-tools/config', () => store.read(KEY, {}));
}
