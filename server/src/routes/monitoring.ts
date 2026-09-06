// 监控路由：主机指标采集、调度任务、事件/告警流、健康检查。
// 依赖在 ~/.pi/agent 之外的自研轻量采集，不依赖 prometheus/grafana（已装则可对接其 API，接口预留）。
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { store } from '../lib/store.js';
import { Host, run } from '../lib/host.js';

const EV = 'events';
const AL = 'alerts';
const SVC = 'services'; // 被监控的外部服务
const CFG = 'monitor';

function emit(type: string, data: any) {
  const ev = { id: randomUUID(), type, time: new Date().toISOString(), data };
  const list = store.list(EV);
  list.push(ev);
  store.write(EV, list.slice(-500));
  return ev;
}

async function checkHost(h: Host): Promise<any> {
  const cmd = `echo "LOAD=$(cat /proc/loadavg)"
`
    + `echo "CPU=$(top -bn1 2>/dev/null | grep -i 'Cpu(s)' | head -1)"
`
    + `echo "MEM=$(free -m | awk '/Mem:/{printf \"%s %s \", $2, $3} /Swap:/{printf \"%s %s\", $2, $3}')"
`
    + `echo "DISK=$(df -h 2>/dev/null | awk 'NR>1 && $6 !~ /^\\/(run|sys|dev|proc)/ {gsub(\"%\",\"\",$5); print $6\"|\"$2\"|\"$3\"|\"$5}')"
`
    + `echo "THREADS=$(ps -eL --no-headers 2>/dev/null | wc -l)"
`
    + `echo "PROC=$(ps -e --no-headers 2>/dev/null | wc -l)"
`
    + `echo "UPTIME=$(cut -d. -f1 /proc/uptime)"
`
    + `echo "KERNEL=$(uname -r)"
`
    + `echo "OS=$(grep PRETTY_NAME /etc/os-release | cut -d= -f2 | tr -d '"')"
`
    + `echo "EST=$(ss -tn 2>/dev/null | grep -c ESTAB)"
`
    + `echo "LST=$(ss -ltn 2>/dev/null | grep -c LISTEN)"`;
  const r = await run(h, cmd, 25000);
  const getLine = (k: string) => { const m = r.stdout.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim() : ''; };
  const getBlock = (k: string) => { const m = r.stdout.match(new RegExp('^' + k + '=([\\s\\S]*?)(?=\\n[A-Z0-9_]+=|$)', 'm')); return m ? m[1].trim() : ''; };
  const loadParts = getLine('LOAD').split(/\s+/);
  const load1 = parseFloat(loadParts[0]) || 0, load5 = parseFloat(loadParts[1]) || 0, load15 = parseFloat(loadParts[2]) || 0;
  const cpuLine = getLine('CPU');
  const idle = parseFloat((cpuLine.match(/(\d+(?:\.\d+)?)\s*id/) || [])[1] || '0');
  const cpuPercent = idle > 0 && idle <= 100 ? Math.round(100 - idle) : 0;
  const mem = getLine('MEM').split(/\s+/);
  const memTotalMb = parseInt(mem[0]) || 0, memUsedMb = parseInt(mem[1]) || 0;
  const swapTotalMb = parseInt(mem[2]) || 0, swapUsedMb = parseInt(mem[3]) || 0;
  const memPct = memTotalMb ? Math.round((memUsedMb / memTotalMb) * 100) : 0;
  const swapPct = swapTotalMb ? Math.round((swapUsedMb / swapTotalMb) * 100) : 0;
  const disk = getBlock('DISK').split('\n').filter(Boolean).map((l) => {
    const p = l.split('|');
    return { mount: p[0] || '/', size: p[1] || '-', used: p[2] || '-', pct: parseInt(p[3]) || 0 };
  });
  const diskMaxPct = Math.max(0, ...disk.map((d) => d.pct));
  return {
    cpuPercent,
    load1, load5, load15,
    memTotalMb, memUsedMb, memPct, swapPct,
    disk, diskMaxPct,
    threads: parseInt(getLine('THREADS')) || 0,
    processes: parseInt(getLine('PROC')) || 0,
    uptimeSec: parseInt(getLine('UPTIME')) || 0,
    kernel: getLine('KERNEL'), os: getLine('OS') || h.os,
    connectionsEstablished: parseInt(getLine('EST')) || 0,
    listeningPorts: parseInt(getLine('LST')) || 0,
    time: new Date().toISOString(),
    healthy: r.code === 0,
  };
}

export async function register(fastify: FastifyInstance) {
  // ---- 配置
  fastify.get('/monitor/config', () => store.read(CFG, { monitoredHostIds: [], intervalSec: 15, thresholds: { cpu: 90, mem: 90, disk: 80 } }));
  fastify.put('/monitor/config', (req) => { store.write(CFG, req.body as any); return { ok: true }; });

  fastify.get('/monitor/events', (req) => {
    const type = (req.query as any).type;
    let list = store.list(EV).sort((a: any, b: any) => b.time.localeCompare(a.time));
    if (type && type !== 'all') list = list.filter((e: any) => e.type === type);
    return list.slice(0, 200);
  });
  fastify.delete('/monitor/events', () => { store.write(EV, []); return { ok: true }; });

  fastify.get('/monitor/alerts', () => store.list(AL).sort((a: any, b: any) => (b.time || '').localeCompare(a.time || '')));
  fastify.post('/monitor/alerts/ack', (req) => { const { id } = req.body as any; store.upsert(AL, { ...(store.list(AL).find((a) => a.id === id) || {}), ack: true, ackTime: new Date().toISOString() }); return { ok: true }; });

  // 外部服务健康(预留: 对接已装的 prometheus/blackbox)
  fastify.get('/monitor/services', () => store.list(SVC));
  fastify.post('/monitor/services', (req) => store.upsert(SVC, { id: randomUUID(), ...((req.body as any).data ?? req.body as any), createdAt: new Date().toISOString() }));
  fastify.delete('/monitor/services/:id', (req) => { store.remove(SVC, (req.params as any).id); return { ok: true }; });

  // ---- 采集
  fastify.get('/monitor/collect', async (req, reply) => {
    const cfg = store.read<{ monitoredHostIds: string[]; intervalSec: number; thresholds: { cpu?: number; mem?: number; disk?: number } }>(CFG, { monitoredHostIds: [], intervalSec: 15, thresholds: {} });
    const hosts = store.list<Host>('hosts').filter((h) => cfg.monitoredHostIds?.includes(h.id));
    const sampleId = (req.query as any).sampleId || 'latest';
    const results = [] as any[];
    for (const h of hosts) {
      try {
        const m = await checkHost(h);
        m.hostId = h.id; m.hostName = h.name; m.sampleId = sampleId;
        m.time = new Date().toISOString();
        results.push(m);
        const th = cfg.thresholds || {};
        if ((Number(m.diskMaxPct ?? m.diskUse) || 0) > (th.disk || 80)) recordAlert('disk', h, `${m.diskMaxPct ?? m.diskUse}%`, `磁盘使用率 ${m.diskMaxPct ?? m.diskUse}% 超过阈值 ${th.disk || 80}%`);
        if ((m.memPct || 0) > (th.mem || 90)) recordAlert('memory', h, `${m.memPct}%`, `内存使用率 ${m.memPct}% 超过阈值 ${th.mem || 90}%`);
        if ((m.cpuPercent || 0) > (th.cpu || 90)) recordAlert('cpu', h, `${m.cpuPercent}%`, `CPU 使用率 ${m.cpuPercent}% 超过阈值 ${th.cpu || 90}%`);
      } catch (e: any) { results.push({ hostId: h.id, hostName: h.name, error: String(e), time: new Date().toISOString() }); }
    }
    store.write('metrics-' + sampleId, results);
    return results;
  });

  fastify.get('/monitor/metrics/:sampleId', (req) => store.read('metrics-' + (req.params as any).sampleId, []));

  function recordAlert(kind: string, h: Host, val: string, msg: string) {
    const alerts = store.list(AL);
    const dup = alerts.find((a: any) => a.hostId === h.id && a.kind === kind && !a.ack && (Date.now() - Date.parse(a.time || 0)) < 10 * 60 * 1000);
    if (!dup) {
      store.upsert(AL, { id: randomUUID(), kind, hostId: h.id, hostName: h.name, value: val, message: msg, time: new Date().toISOString(), ack: false });
      emit(kind, { host: h.name, val, msg });
    }
  }

  // ---- 定时采集（进程存活期）
  startScheduler();
}

let started = false;
function startScheduler() {
  if (started) return;
  started = true;
  setInterval(() => {
    try {
      const cfg = store.read<any>('monitor', { monitoredHostIds: [], intervalSec: 15 });
      if (!cfg.monitoredHostIds?.length) return;
      const hosts = store.list<Host>('hosts').filter((h) => cfg.monitoredHostIds?.includes(h.id));
      (async () => {
        for (const h of hosts) {
          try {
            const m = await checkHost(h);
            const th = cfg.thresholds || {};
            if ((Number(m.diskMaxPct ?? m.diskUse) || 0) > (th.disk || 80)) { const list = store.list(AL); if (!list.find((a: any) => a.hostId === h.id && a.kind === 'disk' && !a.ack)) store.upsert(AL, { id: randomUUID(), kind: 'disk', hostId: h.id, hostName: h.name, value: `${m.diskMaxPct ?? m.diskUse}%`, message: `磁盘 ${m.diskMaxPct ?? m.diskUse}% 超 ${th.disk || 80}%`, time: new Date().toISOString(), ack: false }); }
            if ((m.memPct || 0) > (th.mem || 90)) { const list = store.list(AL); if (!list.find((a: any) => a.hostId === h.id && a.kind === 'memory' && !a.ack)) store.upsert(AL, { id: randomUUID(), kind: 'memory', hostId: h.id, hostName: h.name, value: `${m.memPct}%`, message: `内存 ${m.memPct}% 超 ${th.mem || 90}%`, time: new Date().toISOString(), ack: false }); }
          } catch {}
        }
      })();
    } catch {}
  }, 15000);
}
