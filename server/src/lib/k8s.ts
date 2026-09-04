// Kubernetes 管理：统一经 kubectl 执行（覆盖更全，天然支持任意 CRD/rollout/log）。
// kubectl 读取标准 kubeconfig（KUBECONFIG 环境变量可覆盖）。
import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function kctl(args: string[], input?: string, timeoutMs = 120000): { code: number; out: string } {
  const env = process.env.KUBECONFIG ? { ...process.env, KUBECONFIG: process.env.KUBECONFIG } : process.env;
  const r = spawnSync('kubectl', args, { env, input, maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs, encoding: 'utf-8' });
  const out = String(r.stdout ?? '') + String(r.stderr ?? '');
  return { code: r.status ?? (r.error ? 1 : 0), out };
}

export function kubectlReady(): boolean {
  try { spawnSync('kubectl', ['version', '--client'], { encoding: 'utf-8' }); return true; } catch { return false; }
}

export function listContexts() {
  const r = kctl(['config', 'get-contexts', '-o', 'name']);
  return r.code === 0 ? r.out.split('\n').filter(Boolean) : [];
}
export function currentContext() {
  const r = kctl(['config', 'current-context']);
  return r.code === 0 ? r.out.trim() : '';
}

export function serverVersion() {
  const r = kctl(['version', '-o', 'yaml']);
  const out = r.out;
  const parse = (sec: string) => {
    const i = out.indexOf(sec);
    if (i < 0) return { gitVersion: null, platform: null, raw: out };
    const block = out.slice(i);
    const gv = block.match(/gitVersion:\s*([^\n]+)/);
    const plat = block.match(/platform:\s*([^\n]+)/);
    return { gitVersion: gv?.[1]?.trim() ?? null, platform: plat?.[1]?.trim() ?? null, raw: out };
  };
  return { available: r.code === 0, ...parse('serverVersion:') };
}
export function namespaces() {
  const r = kctl(['get', 'ns', '-o', 'json']);
  if (r.code !== 0) return [];
  try { return JSON.parse(r.out).items; } catch { return []; }
}
export function nodes() {
  const r = kctl(['get', 'nodes', '-o', 'json']);
  if (r.code !== 0) return { ok: false, items: [], error: r.out };
  try { return { ok: true, items: JSON.parse(r.out).items }; } catch { return { ok: false, items: [], error: 'JSON 解析失败' }; }
}
export function pods(ns = 'default') { return getList(['pods', '-n', ns]); }
export function services(ns = 'default') { return getList(['svc', '-n', ns]); }
export function deployments(ns = 'default') { return getList(['deployments', '-n', ns]); }
export function statefulsets(ns = 'default') { return getList(['statefulsets', '-n', ns]); }
export function daemonsets(ns = 'default') { return getList(['daemonsets', '-n', ns]); }
export function jobs(ns = 'default') { return getList(['jobs', '-n', ns]); }
export function configmaps(ns = 'default') { return getList(['configmaps', '-n', ns]); }
export function secrets(ns = 'default') { return getList(['secrets', '-n', ns]); }
export function pvcs(ns = 'default') { return getList(['persistentvolumeclaims', '-n', ns]); }
export function ingresses(ns = 'default') { return getList(['ingresses', '-n', ns]); }
export function cronjobs(ns = 'default') { return getList(['cronjobs', '-n', ns]); }

function getList(prefix: string[]) {
  const r = kctl(['get', ...prefix, '-o', 'json']);
  if (r.code !== 0) return { ok: false, items: [], error: r.out };
  try { return { ok: true, items: JSON.parse(r.out).items }; } catch { return { ok: false, items: [], error: 'JSON 解析失败' }; }
}

const KIND_PLURAL: Record<string, string> = {
  pod: 'pods', pods: 'pods', deployment: 'deployments', deployments: 'deployments',
  statefulset: 'statefulsets', statefulsets: 'statefulsets', daemonset: 'daemonsets', daemonsets: 'daemonsets',
  service: 'services', svc: 'services', configmap: 'configmaps', configmaps: 'configmaps',
  secret: 'secrets', secrets: 'secrets', pvc: 'persistentvolumeclaims', persistentvolumeclaims: 'persistentvolumeclaims',
  ingress: 'ingresses', ingresses: 'ingresses', job: 'jobs', jobs: 'jobs', cronjob: 'cronjobs', cronjobs: 'cronjobs',
  namespace: 'namespaces', ns: 'namespaces', node: 'nodes', nodes: 'nodes',
};
// 复数名自身也识别（kind 选择器直接传复数）
for (const p of Object.values(KIND_PLURAL)) KIND_PLURAL[p] = p;
const CLUSTER_SCOPED = new Set(['nodes', 'namespaces', 'persistentvolumes', 'storageclasses', 'clusterroles', 'clusterrolebindings', 'customresourcedefinitions']);

export function getByKind(kind: string, ns = 'default') {
  const plural = KIND_PLURAL[kind.toLowerCase()] || kind.toLowerCase() + 's';
  const args = CLUSTER_SCOPED.has(plural) ? ['get', plural] : ['get', plural, '-n', ns];
  return getListRaw(args);
}

function getListRaw(args: string[]) {
  const r = kctl([...args, '-o', 'json']);
  if (r.code !== 0) return { ok: false, items: [], error: r.out };
  try { return { ok: true, items: JSON.parse(r.out).items }; } catch { return { ok: false, items: [], error: 'JSON 解析失败' }; }
}

export function getSingle(resource: string, name: string, ns = 'default') {
  const plural = KIND_PLURAL[resource.toLowerCase()] || resource.toLowerCase() + 's';
  const nsArg = CLUSTER_SCOPED.has(plural) ? [] : ['-n', ns];
  const r = kctl(['get', plural, name, ...nsArg, '-o', 'json']);
  if (r.code !== 0) return { ok: false, item: null, error: r.out };
  try { return { ok: true, item: JSON.parse(r.out), error: '' }; } catch { return { ok: false, item: null, error: 'JSON 解析失败' }; }
}

export function resourceYaml(resource: string, name: string, ns = 'default') {
  const plural = KIND_PLURAL[resource.toLowerCase()] || resource.toLowerCase() + 's';
  const nsArg = CLUSTER_SCOPED.has(plural) ? [] : ['-n', ns];
  const r = kctl(['get', plural, name, ...nsArg, '-o', 'yaml']);
  return { ok: r.code === 0, content: r.out };
}

export function applyYaml(yamlText: string) {
  const f = join(tmpdir(), `ops-hub-${Date.now()}.yaml`);
  writeFileSync(f, yamlText);
  try { return kctl(['apply', '-f', f]); } finally { unlinkSync(f); }
}

export function deleteResource(resource: string, name: string, ns = 'default') {
  const plural = KIND_PLURAL[resource.toLowerCase()] || resource.toLowerCase() + 's';
  const nsArg = CLUSTER_SCOPED.has(plural) ? [] : ['-n', ns];
  return kctl(['delete', plural, name, ...nsArg, '--wait=false']);
}

export function rollout(workload: string, name: string, ns: string, action: 'restart' | 'status') {
  const kind = KIND_PLURAL[workload.toLowerCase()] || 'deployments';
  if (action === 'restart') return kctl(['rollout', 'restart', `${kind}/${name}`, '-n', ns]);
  return kctl(['rollout', 'status', `${kind}/${name}`, '-n', ns]);
}

export function scale(resource: string, name: string, ns: string, replicas: number) {
  const plural = KIND_PLURAL[resource.toLowerCase()] || resource.toLowerCase() + 's';
  return kctl(['scale', plural, name, '-n', ns, `--replicas=${replicas}`]);
}

export function logs(resource: string, name: string, ns: string, container?: string, tail = 500) {
  const plural = KIND_PLURAL[resource.toLowerCase()] || 'pods';
  const args = ['logs', name, '-n', ns, '--tail', String(tail)];
  if (container) args.push('-c', container);
  return kctl(args, undefined, 60000);
}

export function describe(resource: string, name: string, ns = 'default') {
  const plural = KIND_PLURAL[resource.toLowerCase()] || resource.toLowerCase() + 's';
  const nsArg = CLUSTER_SCOPED.has(plural) ? [] : ['-n', ns];
  const r = kctl(['describe', plural, name, ...nsArg]);
  return { ok: r.code === 0, content: r.out };
}

export function kubeconfigAvailable(): { found: boolean; path?: string } {
  const p = process.env.KUBECONFIG || join(process.env.HOME || '', '.kube', 'config');
  return { found: existsSync(p), path: p };
}

// ---- 增强：事件 / 用量 / 集群聚合 ----
export function events(namespace = '') {
  const args = namespace ? ['get', 'events', '-n', namespace, '--sort-by=.lastTimestamp', '-o', 'json'] : ['get', 'events', '-A', '--sort-by=.lastTimestamp', '-o', 'json'];
  const r = kctl(args);
  if (r.code !== 0) return { ok: false, items: [], error: r.out };
  try { return { ok: true, items: JSON.parse(r.out).items }; } catch { return { ok: false, items: [], error: '解析失败' }; }
}

export function topNodes() {
  const r = kctl(['top', 'nodes'], undefined, 30000);
  if (r.code !== 0) return { ok: false, items: [], error: r.out }; // 可能无 metrics-server
  const items = r.out.split('\n').filter(Boolean).slice(1).map((l) => l.trim().split(/\s+/)).map((p) => ({ name: p[0], cpu: p[1], cpuPct: p[2], mem: p[3], memPct: p[4] }));
  return { ok: true, items };
}

export function topPods(namespace = '') {
  const args = namespace ? ['top', 'pods', '-n', namespace] : ['top', 'pods', '-A'];
  const r = kctl(args, undefined, 30000);
  if (r.code !== 0) return { ok: false, items: [], error: r.out };
  const items = r.out.split('\n').filter(Boolean).slice(1).map((l) => l.trim().split(/\s+/)).map((p) => ({ namespace: p[0], name: p[1], cpu: p[2], mem: p[3] }));
  return { ok: true, items };
}

export function clusterSummary() {
  const namespaces = namespacesFn();
  const result: any[] = [];
  for (const nsObj of namespaces) {
    const ns = nsObj?.metadata?.name;
    if (!ns) continue;
    const dep = getByKind('deployments', ns);
    const pod = getByKind('pods', ns);
    const svc = getByKind('services', ns);
    const cfg = getByKind('configmaps', ns);
    result.push({
      ns,
      deployments: dep.ok ? dep.items.length : 0,
      pods: pod.ok ? pod.items.length : 0,
      runningPods: pod.ok ? pod.items.filter((p: any) => p.status?.phase === 'Running').length : 0,
      services: svc.ok ? svc.items.length : 0,
      configmaps: cfg.ok ? cfg.items.length : 0,
    });
  }
  const total = { ns: '合计', deployments: 0, pods: 0, runningPods: 0, services: 0, configmaps: 0 };
  result.forEach((r) => { total.deployments += r.deployments; total.pods += r.pods; total.runningPods += r.runningPods; total.services += r.services; total.configmaps += r.configmaps; });
  return result;
}

// 避免与上面 namespaces() 重名
function namespacesFn() {
  const r = kctl(['get', 'ns', '-o', 'json']);
  if (r.code !== 0) return [];
  try { return JSON.parse(r.out).items; } catch { return []; }
}
