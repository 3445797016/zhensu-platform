// Docker 管理路由：容器/镜像/卷/网络 的列表、详情、操作、日志
import type { FastifyInstance } from 'fastify';
import { store } from '../lib/store.js';
import { Host } from '../lib/host.js';
import * as D from '../lib/docker.js';

function hostOf(req: any): Host | undefined {
  const id = (req.query as any)?.hostId || (req.params as any)?.hostId;
  return id ? store.list<Host>('hosts').find((h) => h.id === id) : undefined;
}
const wrap = (fn: (...a: any[]) => any) => async (req: any, reply: any) => {
  try { return await fn(req); }
  catch (e: any) { return reply.code(500).send({ error: e.message }); }
};

export async function register(fastify: FastifyInstance) {
  fastify.get('/docker/status', wrap(async () => {
    try { const s = await D.dockerInfo(undefined); return { ok: true, ...s }; }
    catch (e: any) { return { ok: false, error: e.message }; }
  }));
  fastify.get('/docker/containers', wrap(async (req) => D.listContainers(hostOf(req))));
  fastify.get('/docker/containers/:id', wrap(async (req) => D.containerDetail(hostOf(req), (req.params as any).id)));
  fastify.get('/docker/containers/:id/logs', wrap(async (req) => D.containerLogs(hostOf(req), (req.params as any).id, (req.query as any).tail)));
  fastify.post('/docker/containers/:id/:action', wrap(async (req) => D.containerAction(hostOf(req), (req.params as any).id, (req.params as any).action)));
  fastify.get('/docker/images', wrap(async (req) => D.listImages(hostOf(req))));
  fastify.get('/docker/images/:id', wrap(async (req) => D.imageInspect(hostOf(req), (req.params as any).id)));
  fastify.get('/docker/volumes', wrap(async (req) => D.listVolumes(hostOf(req))));
  fastify.get('/docker/networks', wrap(async (req) => D.listNetworks(hostOf(req))));
}
