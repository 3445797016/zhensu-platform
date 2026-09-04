// 在线编程路由：语言探测 + 代码执行
import type { FastifyInstance } from 'fastify';
import { detectLangs, runCode } from '../lib/code.js';

export async function register(fastify: FastifyInstance) {
  fastify.get('/code/langs', () => ({ langs: detectLangs() }));

  fastify.post('/code/run', async (req, reply) => {
    const { lang, code, stdin } = req.body as any;
    if (!lang || typeof code !== 'string') return reply.code(400).send({ error: '缺少 lang/code' });
    if (code.length > 50000) return reply.code(400).send({ error: '代码过长(>50KB)' });
    const r = await runCode(lang, code, typeof stdin === 'string' ? stdin : '');
    return r;
  });
}
