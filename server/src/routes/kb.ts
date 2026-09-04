// 本地知识库(RAG)路由
import type { FastifyInstance } from 'fastify';
import { status, rebuildAsync, search, kbPath, loadIndex, docs } from '../modules/kb.js';
import { store } from '../lib/store.js';

export async function register(fastify: FastifyInstance) {
  fastify.get('/kb/status', () => status());
  fastify.post('/kb/rebuild', () => { rebuildAsync(); return { ok: true }; });
  fastify.get('/kb/search', (req) => { const q = String((req.query as any).q || ''); return { q, results: q ? search(q, Number((req.query as any).top) || 8) : [] }; });
  fastify.get('/kb/docs', () => docs());
  fastify.get('/kb/settings', () => ({ path: kbPath(), enabled: store.read<any>('ai', {}).kb !== false }));
  fastify.put('/kb/settings', (req) => { const { path, enabled } = req.body as any; const cfg = store.read<any>('settings', {}); if (path) cfg.kbPath = path; store.write('settings', cfg); if (typeof enabled === 'boolean') { const a = store.read<any>('ai', {}); a.kb = enabled; store.write('ai', a); } return { ok: true }; });
  fastify.post('/kb/reload', () => { loadIndex(); return { ok: true }; });
}
