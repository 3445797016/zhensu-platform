// Ansible 自动化核心:环境检测 / inventory 生成 / 执行引擎(playbook + ad-hoc) / 定时调度
import { spawn, execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync, readdirSync, chmodSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { store, DATA_DIR } from '../lib/store.js';
import { audit } from '../lib/audit.js';
import type { Host } from '../lib/host.js';

export const ANSIBLE_DIR = join(DATA_DIR, 'ansible');
export const PB_DIR = join(ANSIBLE_DIR, 'playbooks');
export const RUN_DIR = join(ANSIBLE_DIR, 'runs');
export const KEY_DIR = join(ANSIBLE_DIR, 'keys');
export const RUNS_NS = 'ansible_runs';
export const CFG_NS = 'ansible';

const children = new Map<string, any>(); // runId -> child process
let schedTimer: NodeJS.Timeout | null = null;

function ensureDirs() { for (const d of [PB_DIR, RUN_DIR, KEY_DIR]) mkdirSync(d, { recursive: true }); }
ensureDirs();

const cfg = () => store.read<any>(CFG_NS, {});
const saveCfg = (c: any) => store.write(CFG_NS, c);

/* ---------------- 环境检测 ---------------- */
export function envStatus() {
  const probe = (cmd: string) => { try { return { ok: true, version: String(execSync(cmd, { shell: '/bin/bash', encoding: 'utf-8', timeout: 15000 })).trim().split('\n')[0] || '' }; } catch { return { ok: false, version: '' }; } };
  return {
    installed: (() => { try { execSync('command -v ansible-playbook', { shell: '/bin/bash' }); return true; } catch { return false; } })(),
    ansiblePlaybook: probe('ansible-playbook --version 2>/dev/null'),
    ansible: probe('ansible --version 2>/dev/null'),
    sshpass: probe('command -v sshpass >/dev/null && sshpass -V 2>&1 | head -1'),
    python: probe('python3 --version'),
  };
}

/* ---------------- inventory 生成(复用纳管主机库凭据;明文,存于 gitignore 的 data 目录) ---------------- */
function invName(h: Host) { return h.id || (h.host || 'host').replace(/[^A-Za-z0-9_.-]/g, '_'); }

export function buildInventory(): string {
  const hosts = store.list<Host>('hosts');
  const c = cfg();
  const out: string[] = [];
  out.push('[local]', 'localhost ansible_connection=local', '');
  const sshHosts = hosts.filter((h) => h.kind === 'ssh' && h.host);
  if (sshHosts.length) {
    out.push('[managed]');
    for (const h of sshHosts) {
      const name = invName(h);
      let l = `${name} ansible_host=${h.host} ansible_port=${h.port || 22} ansible_user=${h.user || 'root'}`;
      if (h.authType === 'key' && h.privateKey) {
        const kf = join(KEY_DIR, name + '.pem');
        if (!existsSync(kf)) writeFileSync(kf, h.privateKey, { mode: 0o600 });
        chmodSync(kf, 0o600);
        l += ` ansible_ssh_private_key_file=${kf}`;
      } else {
        l += ` ansible_ssh_pass=${String(h.password || '')}`;
      }
      out.push(l);
    }
    out.push('');
    for (const tag of [...new Set(sshHosts.flatMap((h) => h.tags || []))].filter(Boolean)) {
      out.push(`[tag_${tag}]`);
      for (const h of sshHosts) if ((h.tags || []).includes(tag)) out.push(invName(h));
      out.push('');
    }
  }
  if (c.extraInventory) { out.push('# ---- 自定义 inventory ----'); out.push(String(c.extraInventory)); }
  return out.join('\n');
}

/* ---------------- 执行引擎 ---------------- */
export interface RunOpts {
  title?: string; kind: 'playbook' | 'adhoc';
  playbook?: string; module?: string; adhocArgs?: string;
  extraVars?: string; target?: string; notify?: boolean; scheduleId?: string;
}

function isRunning(x: any) { return x.status === 'pending' || x.status === 'running'; }

export function runAnsible(opts: RunOpts): { runId: string; taskId: string } {
  const runId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 6);
  const dir = join(RUN_DIR, runId);
  mkdirSync(dir, { recursive: true });
  const invFile = join(dir, 'inventory.ini');
  const logFile = join(dir, 'run.log');
  writeFileSync(invFile, buildInventory(), 'utf8');
  const target = opts.target || 'all';
  const title = opts.title || (opts.kind === 'playbook' ? `Playbook: ${opts.playbook}` : `Ad-hoc: ${opts.module || 'ping'} @ ${target}`);

  const run: any = { id: runId, taskId: runId, title, kind: opts.kind, target, playbook: opts.playbook, module: opts.module,
    adhocArgs: opts.adhocArgs, extraVars: opts.extraVars, notify: !!opts.notify,
    status: 'pending', created: new Date().toISOString(), logFile, scheduleId: opts.scheduleId };
  store.upsert(RUNS_NS, run);
  // 同步写入任务中心,便于在「任务中心」统一查看
  const task: any = { id: runId, type: 'ansible', title, host: 'local', status: 'pending', created: run.created, log: [] };
  store.upsert('tasks', task);

  appendFileSync(logFile, `$ ansible ${opts.kind === 'playbook' ? `playbook -i inventory.ini ${opts.playbook}` : `${target} -i inventory.ini -m ${opts.module || 'ping'}${opts.adhocArgs ? ' -a "' + opts.adhocArgs + '"' : ''}`}${opts.extraVars ? ' -e "' + opts.extraVars + '"' : ''}\n\n`);

  setImmediate(async () => {
    const args: string[] = [];
    if (opts.kind === 'playbook') { args.push('-i', invFile); if (opts.extraVars) args.push('-e', opts.extraVars); args.push(join(PB_DIR, opts.playbook || '')); }
    else { args.push(target, '-i', invFile, '-m', opts.module || 'ping'); if (opts.adhocArgs) args.push('-a', opts.adhocArgs); if (opts.extraVars) args.push('-e', opts.extraVars); }
    if (store.list<Host>('hosts').some((h) => h.kind === 'ssh' && h.host)) args.push('--ssh-extra-args', '-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null');

    const bin = opts.kind === 'playbook' ? 'ansible-playbook' : 'ansible';
    run.status = 'running'; run.started = new Date().toISOString();
    task.status = 'running'; task.started = run.started;
    store.upsert(RUNS_NS, run); store.upsert('tasks', task);

    const child = spawn(bin, args, { env: { ...process.env, ANSIBLE_HOST_KEY_CHECKING: 'False', ANSIBLE_NOCOLOR: '1', PYTHONUNBUFFERED: '1' } });
    children.set(runId, child);
    const log = (s: string) => {
      const line = `[${new Date().toTimeString().slice(0, 8)}] ${s}`;
      task.log.push(line); if (task.log.length > 500) task.log.shift();
      appendFileSync(logFile, s + '\n');
    };
    child.stdout.on('data', (d) => { for (const l of d.toString('utf8').split('\n')) if (l.trim()) log(l); });
    child.stderr.on('data', (d) => { for (const l of d.toString('utf8').split('\n')) if (l.trim()) log('⚠ ' + l); });
    let done = false;
    const finish = (status: 'ok' | 'fail' | 'cancelled', extra?: string) => {
      if (done) return; done = true;
      const now = new Date().toISOString();
      run.status = status; run.finished = now; if (extra) run.result = extra;
      task.status = status; task.finished = now; if (extra) task.result = extra.slice(0, 2000);
      if (status === 'ok') { const recap = task.log.filter((l: string) => /PLAY RECAP|failed=|unreachable=/.test(l)).slice(-40).join('\n'); run.summary = recap; }
      store.upsert(RUNS_NS, run); store.upsert('tasks', task); children.delete(runId);
      // 调度任务推进下一轮
      const sched = (cfg().schedules || []).find((s: any) => s.id === opts.scheduleId);
      if (sched) { sched.lastRun = now; sched.lastStatus = status; sched.nextRunAt = new Date(Date.now() + (sched.intervalMin || 60) * 60000).toISOString(); saveCfg(cfg()); }
      // 失败通知(铃铛)
      if (status === 'fail' && (opts.notify || sched?.notify)) store.upsert('alerts', { id: randomUUID(), kind: 'ansible', hostId: 'ansible', hostName: 'Ansible', value: '失败', message: `Ansible「${title}」执行失败`, time: now, ack: false });
      audit('ansible', title, `${status}${extra ? ' · ' + extra.slice(0, 120) : ''}`, 'web');
    };
    const kill = () => { try { process.kill(-child.pid!, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* */ } } };
    child.on('error', (e: any) => { log('启动失败: ' + (e?.message || e)); finish('fail', String(e?.message || e)); });
    child.on('close', (code) => { if (run.status === 'cancelled' || task.status === 'cancelled') { finish('cancelled'); return; } if (code === 0) finish('ok'); else finish('fail', `退出码 ${code}`); });
    // 30 分钟超时保护
    setTimeout(() => { if (!done && isRunning(run)) { kill(); finish('fail', '超时(30分钟)被杀'); } }, 30 * 60000).unref?.();
  });

  audit('ansible', title, `启动 (target=${target})`, 'web');
  return { runId, taskId: runId };
}

export function cancelRun(runId: string) {
  const ch = children.get(runId);
  if (ch) { try { process.kill(-ch.pid!, 'SIGKILL'); } catch { try { ch.kill('SIGKILL'); } catch { /* */ } } }
  for (const ns of [RUNS_NS, 'tasks']) {
    const rec = store.list<any>(ns).find((r) => r.id === runId);
    if (rec && isRunning(rec)) { rec.status = 'cancelled'; rec.finished = new Date().toISOString(); store.upsert(ns, rec); }
  }
  return { ok: true };
}

/* ---------------- 定时调度(P1) ---------------- */
export function listSchedules() { return cfg().schedules || []; }
export function saveSchedules(schedules: any[]) { const c = cfg(); c.schedules = schedules; saveCfg(c); return c.schedules; }

export function startScheduler() {
  if (schedTimer) return;
  schedTimer = setInterval(() => {
    const c = cfg();
    const scheds = c.schedules || [];
    let changed = false;
    for (const s of scheds) {
      if (!s.enabled || !s.nextRunAt) continue;
      if (Date.parse(s.nextRunAt) > Date.now()) continue;
      try {
        runAnsible({ kind: s.kind, playbook: s.playbook, module: s.module, adhocArgs: s.adhocArgs, extraVars: s.extraVars, target: s.target || 'all', notify: !!s.notify, scheduleId: s.id, title: `[定时] ${s.name}` });
        s.nextRunAt = new Date(Date.now() + (s.intervalMin || 60) * 60000).toISOString();
        changed = true;
      } catch (e: any) {
        store.upsert('alerts', { id: randomUUID(), kind: 'ansible', hostId: 'ansible', hostName: 'Ansible', value: '调度错误', message: `定时任务「${s.name}」启动失败: ${String(e)}`, time: new Date().toISOString(), ack: false });
      }
    }
    if (changed) saveCfg(c);
  }, 20000);
  schedTimer.unref?.();
}
export function stopScheduler() { if (schedTimer) { clearInterval(schedTimer); schedTimer = null; } }
