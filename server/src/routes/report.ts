// 巡检报告:汇总监控/告警/Ansible/任务/审计 → Markdown 报告,
// 支持立即生成、推送到通知渠道、每日定时自动推送。
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { store } from '../lib/store.js';
import { audit, listAudit } from '../lib/audit.js';
import { notify } from '../modules/notify.js';
import { Host } from '../lib/host.js';

const NS = 'reports';
const CFG = 'report';
let schedTimer: NodeJS.Timeout | null = null;

type Metrics = { hostId?: string; hostName?: string; cpuPercent?: number; memPct?: number; diskMaxPct?: number; diskUse?: number; os?: string; uptimeSec?: number; healthy?: boolean; time?: string; load1?: number };

function pct(v: number | undefined, alt = 0) { return v === undefined ? alt : Number(v); }
function statusOf(v: number, thr: number) { return v >= thr ? '🔴' : v >= thr * 0.75 ? '🟡' : '🟢'; }
function fmtUp(sec: number) { if (!sec) return '-'; const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60); return d ? `${d}天${h}时` : h ? `${h}时${m}分` : `${m}分`; }
function nowTime() { return new Date().toISOString(); }

export function buildReport(): { id: string; title: string; generated: string; summary: string[]; markdown: string; digest: string } {
  const hosts = store.list<Host>('hosts');
  const metrics: Metrics[] = store.read<any>('metrics-latest', []);
  const alerts = store.list<any>('alerts');
  const th = store.read<any>('monitor', {}).thresholds || {};
  const tCpu = Number(th.cpu) || 90, tMem = Number(th.mem) || 90, tDisk = Number(th.disk) || 80;
  const unack = alerts.filter((a) => !a.ack).sort((a, b) => String(b.time).localeCompare(String(a.time)));
  const runs = store.list<any>('ansible_runs');
  const tasks = store.list<any>('tasks');
  const audits = listAudit(200);

  const L: string[] = [];
  const summary: string[] = [];
  const title = `巡检报告 ${new Date().toLocaleString('zh-CN', { hour12: false })}`;

  // —— 平台概览 ——
  const healthyHosts = metrics.filter((m) => m.healthy !== false);
  const overDisk = metrics.filter((m) => pct(m.diskMaxPct ?? m.diskUse) >= tDisk).length;
  const overMem = metrics.filter((m) => pct(m.memPct) >= tMem).length;
  const failRuns = runs.filter((r) => r.status === 'fail' && r.created > new Date(Date.now() - 24 * 3600e3).toISOString()).length;
  const recentTasks = tasks.slice(0, 12);
  const failTasks = recentTasks.filter((t) => t.status === 'fail').length;
  const audit24h = audits.filter((a) => a.time > new Date(Date.now() - 24 * 3600e3).toISOString()).length;

  L.push(`# ${title}`, '', `> 平台:轸宿智汇平台 · 生成时间 ${nowTime()}`, '');
  L.push('## 📊 总览', '');
  L.push(`| 项 | 值 |`);
  L.push(`| --- | --- |`);
  L.push(`| 纳管主机 | ${hosts.length} 台(监控中 ${metrics.length}) |`);
  L.push(`| 主机健康 | ${healthyHosts.length}/${metrics.length} 正常 |`);
  L.push(`| 未恢复告警 | ${unack.length} 条 |`);
  L.push(`| 磁盘超阈值 | ${overDisk} 台 |`);
  L.push(`| 内存超阈值 | ${overMem} 台 |`);
  L.push(`| Ansible 近24h失败 | ${failRuns} 次 |`);
  L.push(`| 近24h 操作审计 | ${audit24h} 条 |`);
  L.push('');
  summary.push(`主机 ${metrics.length ? (metrics.length - Math.max(overDisk, overMem)) + '/' + metrics.length + ' 正常' : '未采集'}, 未恢复告警 ${unack.length} 条, 磁盘超限 ${overDisk}, 内存超限 ${overMem}, Ansible 近24h失败 ${failRuns}`);

  // —— 主机健康 ——
  L.push('## 🖥 主机健康', '');
  if (metrics.length) {
    L.push('| 主机 | OS | 运行 | CPU | 内存 | 磁盘 | 状态 |');
    L.push('| --- | --- | --- | --- | --- | --- | --- |');
    for (const m of metrics) {
      const cpu = pct(m.cpuPercent), mem = pct(m.memPct), disk = pct(m.diskMaxPct ?? m.diskUse);
      const worst = Math.max(cpu >= tCpu ? 1 : 0, mem >= tMem ? 1 : 0, disk >= tDisk ? 1 : 0);
      L.push(`| ${m.hostName || m.hostId} | ${m.os || '-'} | ${fmtUp(m.uptimeSec || 0)} | ${statusOf(cpu, tCpu)} ${cpu}% | ${statusOf(mem, tMem)} ${mem}% | ${statusOf(disk, tDisk)} ${disk}% | ${worst ? '⚠ 需关注' : '正常'} |`);
    }
  } else {
    L.push('_尚未开始采集。请到「监控/告警」选择被监控主机。_', '');
  }

  // —— 告警 ——
  L.push('## 🚨 未恢复告警', '');
  if (unack.length) {
    L.push(`共 ${unack.length} 条(最多列 10):`, '');
    for (const a of unack.slice(0, 10)) L.push(`- **[${a.kind}]** ${a.hostName} ${a.message} @ ${a.time || ''}`);
  } else {
    L.push('✅ 无未恢复告警。', '');
  }

  // —— Ansible ——
  L.push('', '## ⚙️ Ansible 执行(近 8 次)', '');
  const recentRuns = [...runs].sort((a, b) => String(b.created).localeCompare(String(a.created))).slice(0, 8);
  if (recentRuns.length) {
    for (const r of recentRuns) L.push(`- ${r.status === 'ok' ? '✅' : r.status === 'fail' ? '❌' : '⏳'} **[${r.status}]** ${r.title} · ${r.created || ''}`);
  } else L.push('_暂无执行记录。_');

  // —— 任务 ——
  L.push('', '## 🗂 最近任务', '');
  if (recentTasks.length) {
    for (const t of recentTasks) L.push(`- ${t.status === 'ok' ? '✅' : t.status === 'fail' ? '❌' : t.status === 'running' ? '⏳' : '⏸'} **[${t.status}]** ${t.title} @ ${t.created || ''}`);
  } else L.push('_暂无任务。_');

  // —— 审计 ——
  L.push('', '## 📋 最近审计(10)', '');
  for (const a of audits.slice(0, 10)) L.push(`- \`${a.action}\` ${a.target}${a.detail ? ' — ' + a.detail.slice(0, 80) : ''} (${a.time || ''})`);

  // 建议
  L.push('', '## 💡 建议', '');
  const tips: string[] = [];
  if (overDisk) tips.push(`有 ${overDisk} 台主机磁盘接近/超过阈值,建议清理或扩容。`);
  if (overMem) tips.push(`有 ${overMem} 台主机内存超阈值,建议排查进程。`);
  if (failRuns) tips.push(`Ansible 近 24h 有 ${failRuns} 次失败,建议查看执行记录。`);
  if (unack.length) tips.push(`有 ${unack.length} 条告警未确认,请到监控中心处理。`);
  if (!metrics.length) tips.push('尚未配置监控主机,建议开启「监控/告警」以纳入巡检。');
  L.push(...(tips.length ? tips.map((t) => `- ${t}`) : ['- 整体正常,保持观察。']));

  const markdown = L.join('\n');
  // 推送用摘要(精简,不超渠道限制)
  const digest = `${title}\n` + summary.join('\n') + (tips.length ? '\n建议: ' + tips[0] : '');
  return { id: '', title, generated: nowTime(), summary, markdown, digest };
}

function saveReport(r: any) {
  const list = store.list<any>(NS);
  list.push(r);
  store.write(NS, list.slice(-100));
  return r;
}
function cfg() { return store.read<any>(CFG, {}); }
function saveCfg(c: any) { store.write(CFG, c); }

function runScheduled(s: any) {
  const rep = buildReport();
  const r = { ...rep, id: randomUUID().slice(0, 12), kind: 'scheduled', schedId: s.id, pushed: true };
  saveReport(r);
  notify('📋 ' + rep.title, rep.digest);
  s.lastRun = nowTime(); s.lastDate = new Date().toDateString();
  return r;
}

export function startReportScheduler() {
  if (schedTimer) return;
  schedTimer = setInterval(() => {
    try {
      const c = cfg();
      const scheds = c.schedules || [];
      let changed = false;
      const today = new Date().toDateString();
      for (const s of scheds) {
        if (!s.enabled || !s.time) continue;
        if (s.lastDate === today) continue;
        const now = new Date(); const hh = String(now.getHours()).padStart(2, '0'), mm = String(now.getMinutes()).padStart(2, '0');
        const cur = hh + ':' + mm;
        if (cur >= s.time) { runScheduled(s); changed = true; }
      }
      if (changed) saveCfg(cfg());
    } catch { /* ignore */ }
  }, 30000);
  schedTimer.unref?.();
}

export async function register(fastify: FastifyInstance) {
  fastify.get('/report/list', () => store.list<any>(NS).slice().reverse().slice(0, 50));

  fastify.get('/report/:id', (req) => store.list<any>(NS).find((x) => x.id === String((req.params as any).id)) || null);

  fastify.delete('/report/:id', (req, reply) => {
    const id = String((req.params as any).id);
    store.write(NS, store.list<any>(NS).filter((x) => x.id !== id));
    audit('report', '删除', id, 'web');
    return { ok: true };
  });

  // 立即生成(可选推送)
  fastify.post('/report/generate', (req) => {
    const { push } = req.body as any;
    const rep = buildReport();
    const r = { ...rep, id: randomUUID().slice(0, 12), kind: 'manual', pushed: !!push };
    saveReport(r);
    if (push) notify('📋 ' + rep.title, rep.digest);
    audit('report', '生成', push ? '生成并推送到通知渠道' : '生成', 'web');
    return { ok: true, report: r };
  });

  // 定时配置
  fastify.get('/report/schedules', () => cfg().schedules || []);
  fastify.put('/report/schedules', (req) => {
    const { schedules } = req.body as any;
    if (!Array.isArray(schedules)) return { error: 'schedules 需为数组' };
    const c = cfg(); c.schedules = schedules; saveCfg(c);
    audit('report', 'schedules', `更新 ${schedules.length} 条定时报告`, 'web');
    return { ok: true, schedules: c.schedules };
  });
  fastify.post('/report/schedules/run', (req) => {
    const { id } = req.body as any;
    const s = (cfg().schedules || []).find((x: any) => x.id === id);
    if (!s) return { error: '未找到' };
    const r = runScheduled(s); saveCfg(cfg());
    return { ok: true, report: r };
  });

  startReportScheduler();
}
