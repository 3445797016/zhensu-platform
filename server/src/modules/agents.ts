// 本地 Agent 状态发现：pi 与 opencode 的进程/版本/配置/会话（带缓存，避免阻塞）。
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function sh(cmd: string): { ok: boolean; out: string } {
  try { return { ok: true, out: String(execSync(cmd, { timeout: 8000, maxBuffer: 4e6, encoding: 'utf-8' })) }; }
  catch (e: any) { return { ok: false, out: String(e?.stderr ?? e?.message ?? '') }; }
}

function isRunning(name: string): number {
  const r = sh(`pgrep -fc "${name}" 2>/dev/null`).out.trim();
  return parseInt(r) || 0;
}

function piAuth(): any {
  const p = process.env.HOME + '/.pi/agent/auth.json';
  if (existsSync(p)) { try { return JSON.parse(readFileSync(p, 'utf-8')); } catch {} }
  return null;
}

function piSessions(dir?: string) {
  const base = dir || process.env.HOME + '/.pi/agent/sessions';
  const out: any[] = [];
  if (!existsSync(base)) return out;
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const full = join(d, e);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (e.endsWith('.jsonl')) out.push({ name: e, size: st.size, mtime: st.mtime });
    }
  };
  try { walk(base); } catch {}
  return out.sort((a, b) => b.mtime - a.mtime).slice(0, 40);
}

let cache: any = null;
let lastRun = 0;
let running = false;

function compute() {
  const t0 = Date.now();
  const piAuth_ = piAuth();
  const providers = piAuth_ ? Object.entries(piAuth_).map(([k, v]: any) => ({ id: k, type: v?.type, configured: !!v?.key })) : [];
  const sessions = piSessions();
  const piInstalled = sh('which pi').ok;
  const ocInstalled = sh('which opencode').ok;
  const result = {
    agents: [
      {
        id: 'pi', name: 'Pi Coding Agent', installed: piInstalled,
        version: piInstalled ? sh('pi --version').out.trim() : null,
        running: isRunning('pi'), sessionCount: sessions.length,
        lastSession: sessions[0]?.mtime?.toISOString() ?? null,
        providers, modelStore: process.env.HOME + '/.pi/agent/models-store.json',
        sessions,
      },
      {
        id: 'opencode', name: 'OpenCode', installed: ocInstalled,
        version: ocInstalled ? sh('opencode --version').out.trim() : null,
        running: isRunning('opencode'),
        agents: '', // opencode agent list 启动慢(约13s)，如需可在后台异步刷新
      },
    ],
    host: { node: process.version, platform: process.platform, arch: process.arch, hostname: (() => { try { return execSync('hostname').toString().trim(); } catch { return ''; } })() },
    generatedAt: new Date().toISOString(),
    computeMs: Date.now() - t0,
  };
  cache = result;
  lastRun = Date.now();
  running = false;
  return result;
}

export async function agentOverview() {
  // 新鲜期内直接返回缓存
  if (cache && Date.now() - lastRun < 20000) return cache;
  // 有缓存在后台刷新
  if (!running) {
    running = true;
    // 后台刷新（不 await），返回旧缓存；若从未算过则同步等待首次
    const p = Promise.resolve().then(() => compute()).catch(() => { running = false; });
    if (!cache) { await p; }
    return cache;
  }
  return cache;
}
