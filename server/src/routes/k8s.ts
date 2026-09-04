// Kubernetes 路由：集群概览、资源列表/详情、在线编辑应用、日志、滚动/伸缩、删除
import type { FastifyInstance } from 'fastify';
import * as K from '../lib/k8s.js';

const KIND_OPTIONS = ['pods', 'deployments', 'statefulsets', 'daemonsets', 'jobs', 'cronjobs', 'services', 'configmaps', 'secrets', 'persistentvolumeclaims', 'ingresses', 'namespaces', 'nodes'];

export async function register(fastify: FastifyInstance) {
  fastify.get('/k8s/ready', () => ({ ready: K.kubectlReady(), kubeconfig: K.kubeconfigAvailable() }));

  fastify.get('/k8s/overview', async () => {
    const ctxs = K.listContexts();
    const cur = K.currentContext();
    const ver = K.serverVersion();
    let nodesR = { ok: false, items: [] as any[], error: '' };
    let podsCount = 0, deploymentsCount = 0;
    if (ver.available) {
      nodesR = K.nodes();
      const pods = K.pods('default');
      podsCount = pods.ok ? pods.items.length : 0;
      const dps = K.deployments('default');
      deploymentsCount = dps.ok ? dps.items.length : 0;
    }
    const ns = K.namespaces();
    return { contexts: ctxs, current: cur, version: ver, nodes: nodesR, namespaces: ns.length, defaultPods: podsCount, defaultDeployments: deploymentsCount };
  });

  fastify.get('/k8s/contexts', () => ({ contexts: K.listContexts(), current: K.currentContext() }));

  fastify.get('/k8s/namespaces', () => K.namespaces());

  fastify.get('/k8s/kinds', () => KIND_OPTIONS);

  fastify.get('/k8s/resources/:kind', async (req) => {
    const { kind } = req.params as any;
    const ns = (req.query as any).ns || 'default';
    return K.getByKind(kind, ns);
  });

  fastify.get('/k8s/resources/:kind/:name', async (req) => {
    const { kind, name } = req.params as any;
    const ns = (req.query as any).ns || 'default';
    const s = K.getSingle(kind, name, ns);
    return s;
  });

  fastify.get('/k8s/resources/:kind/:name/yaml', async (req) => {
    const { kind, name } = req.params as any;
    const ns = (req.query as any).ns || 'default';
    return K.resourceYaml(kind, name, ns);
  });

  fastify.post('/k8s/resources/:kind/:name/yaml', async (req) => {
    const { kind, name } = req.params as any;
    const ns = (req.query as any).ns || 'default';
    const { content } = req.body as any;
    const cur = K.getSingle(kind, name, ns);
    if (!cur.ok) return { ok: false, error: cur.error };
    // 用 apply 方式应用新 yaml
    const r = K.applyYaml(content);
    return { ok: r.code === 0, output: r.out };
  });

  fastify.post('/k8s/resources/:kind/:name/delete', async (req) => {
    const { kind, name } = req.params as any;
    const ns = (req.query as any).ns || 'default';
    const r = K.deleteResource(kind, name, ns);
    return { ok: r.code === 0, output: r.out };
  });

  fastify.post('/k8s/resources/:kind/:name/scale', async (req) => {
    const { kind, name } = req.params as any;
    const ns = (req.query as any).ns || 'default';
    const replicas = Number((req.body as any).replicas);
    const r = K.scale(kind, name, ns, replicas);
    return { ok: r.code === 0, output: r.out };
  });

  fastify.post('/k8s/resources/:kind/:name/restart', async (req) => {
    const { kind, name } = req.params as any;
    const ns = (req.query as any).ns || 'default';
    const r = K.rollout(kind, name, ns, 'restart');
    return { ok: r.code === 0, output: r.out };
  });

  fastify.get('/k8s/pods/:name/logs', async (req) => {
    const { name } = req.params as any;
    const ns = (req.query as any).ns || 'default';
    const container = (req.query as any).container;
    const tail = Number((req.query as any).tail || 500);
    const r = K.logs('pod', name, ns, container, tail);
    return { ok: r.code === 0, content: r.out };
  });

  fastify.get('/k8s/resources/:kind/:name/describe', async (req) => {
    const { kind, name } = req.params as any;
    const ns = (req.query as any).ns || 'default';
    return K.describe(kind, name, ns);
  });

  // 应用任意 YAML（新建/更新）
  fastify.post('/k8s/apply', async (req) => {
    const { content } = req.body as any;
    const r = K.applyYaml(content);
    return { ok: r.code === 0, output: r.out };
  });

  // ---- 增强看板 ----
  fastify.get('/k8s/events', async (req) => {
    const ns = (req.query as any).ns;
    return K.events(ns);
  });
  fastify.get('/k8s/top/nodes', async () => K.topNodes());
  fastify.get('/k8s/top/pods', async (req) => K.topPods((req.query as any).ns || ''));
  fastify.get('/k8s/summary', async () => K.clusterSummary());
}
