// 在线代码执行引擎：编译型(C/C++/Rust/Java)与解释型(Python/JS/TS/R)。
// 每个任务在独立临时目录运行，带超时、整进程组回收、stdin、输出截断。
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// 运行临时目录必须“可执行”。部分加固环境 /tmp 为 noexec(tmpfs),
// 因此优先从候选目录里挑一个能真正 exec 的(默认 /var/tmp),避免“运行失败”。
function probeExec(c: string): boolean {
  let d = '';
  try {
    d = mkdtempSync(join(c, 'opshub-probe-'));
    const f = join(d, 'p.sh');
    writeFileSync(f, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const r = spawnSync(f, [], { timeout: 5000 });
    return !r.error && r.status === 0;
  } catch { return false; }
  finally { if (d) { try { rmSync(d, { recursive: true, force: true }); } catch {} } }
}

const PROJECT_TMP = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.runtmp');
try { mkdirSync(PROJECT_TMP, { recursive: true }); } catch {}
function pickTmpRoot(): string {
  const candidates = [
    process.env.OPSHUB_TMP, // 显式指定最高优先
    '/var/tmp',             // 通常为磁盘分区且可执行
    '/dev/shm',
    PROJECT_TMP,            // 项目内后备(跟随项目迁移)
    tmpdir(),               // 最后才退回系统 tmpdir(/tmp)
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    if (existsSync(c) && probeExec(c)) return c;
  }
  return tmpdir();
}
const TMP_ROOT = pickTmpRoot();

export interface LangConf {
  id: string; name: string; file: string; monaco: string;
  compile?: string[];     // 占位 {src} {bin}
  run: string[];          // 占位 {src} {bin}
  compileTimeout?: number;
}

export const LANGS: LangConf[] = [
  { id: 'c', name: 'C', file: 'main.c', monaco: 'c', compile: ['gcc', '{src}', '-O2', '-o', '{bin}', '-Wall'], run: ['{bin}'] },
  { id: 'cpp', name: 'C++', file: 'main.cpp', monaco: 'cpp', compile: ['g++', '{src}', '-O2', '-o', '{bin}', '-Wall', '-std=c++17'], run: ['{bin}'] },
  { id: 'rust', name: 'Rust', file: 'main.rs', monaco: 'rust', compile: ['rustc', '{src}', '-O', '-o', '{bin}'], run: ['{bin}'], compileTimeout: 60000 },
  { id: 'java', name: 'Java', file: 'Main.java', monaco: 'java', compile: ['javac', '{src}'], run: ['java', '-Xmx512m', '-cp', '.', 'Main'], compileTimeout: 30000 },
  { id: 'python', name: 'Python', file: 'main.py', monaco: 'python', run: ['python3', '{src}'] },
  { id: 'javascript', name: 'JavaScript', file: 'main.js', monaco: 'javascript', run: ['node', '{src}'] },
  { id: 'typescript', name: 'TypeScript', file: 'main.ts', monaco: 'typescript', run: ['node', '{src}'] },
  { id: 'r', name: 'R', file: 'main.R', monaco: 'r', run: ['Rscript', '{src}'] },
];

const MAX_OUT = 64 * 1024;

function versionCmd(lang: LangConf): { cmd: string; args?: string[]; err?: boolean } | null {
  switch (lang.id) {
    case 'c': case 'cpp': return { cmd: 'gcc', args: ['--version'] };
    case 'python': return { cmd: 'python3', args: ['--version'] };
    case 'java': return { cmd: 'java', args: ['-version'], err: true };
    case 'javascript': case 'typescript': return { cmd: 'node', args: ['--version'] };
    case 'rust': return { cmd: 'rustc', args: ['--version'] };
    case 'r': return { cmd: 'Rscript', args: ['--version'], err: true };
    default: return null;
  }
}

export function detectLangs(): Array<{ id: string; name: string; monaco: string; available: boolean; version: string }> {
  return LANGS.map((l) => {
    const v = versionCmd(l);
    if (!v) return { id: l.id, name: l.name, monaco: l.monaco, available: false, version: '' };
    const r = spawnSync(v.cmd, v.args || [], { encoding: 'utf-8', timeout: 8000 });
    if (r.error) return { id: l.id, name: l.name, monaco: l.monaco, available: false, version: '' };
    const out = r.stdout || r.stderr || '';
    const first = out.split('\n')[0]?.trim() || '';
    return { id: l.id, name: l.name, monaco: l.monaco, available: true, version: first };
  });
}

function fill(argv: string[], src: string, bin: string): string[] {
  return argv.map((a) => a.replace(/\{src\}/g, src).replace(/\{bin\}/g, bin));
}

function runProc(argv: string[], cwd: string, stdin: string, timeoutMs: number): Promise<{ ok: boolean; stdout: string; stderr: string; exit: number | null; timedOut: boolean; timeMs: number }> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(argv[0], argv.slice(1), { cwd, detached: true, env: { ...process.env, LC_ALL: 'C' } });
    let out = '', err = '';
    let done = false;
    const finish = (timedOut: boolean, exit: number | null) => {
      if (done) return; done = true;
      clearTimeout(timer);
      resolve({ ok: exit === 0, stdout: out.slice(-MAX_OUT), stderr: err.slice(-MAX_OUT), exit, timedOut, timeMs: Date.now() - t0 });
    };
    const timer = setTimeout(() => { try { process.kill(-child.pid!, 'SIGKILL'); } catch {} finish(true, null); }, timeoutMs);
    child.stdout.on('data', (d: Buffer) => { out += d.toString(); if (out.length > MAX_OUT * 2) { child.stdout.pause(); } });
    child.stderr.on('data', (d: Buffer) => { err += d.toString(); if (err.length > MAX_OUT * 2) { child.stderr.pause(); } });
    child.on('error', () => finish(false, -1));
    child.on('close', (code) => { try { process.kill(-child.pid!, 'SIGKILL'); } catch {} finish(false, code); });
    try { child.stdin.write(stdin || ''); } catch {}
    try { child.stdin.end(); } catch {}
  });
}

export interface RunResult { ok: boolean; stdout: string; stderr: string; exit: number | null; timedOut: boolean; timeMs: number; compile?: boolean; compileErr?: string; }

export async function runCode(langId: string, code: string, stdin = ''): Promise<RunResult> {
  const lang = LANGS.find((l) => l.id === langId);
  if (!lang) throw new Error('未知语言');
  const dir = mkdtempSync(join(TMP_ROOT, 'opshub-code-'));
  const bin = join(dir, 'prog');
  try {
    writeFileSync(join(dir, lang.file), code, 'utf-8');
    const src = join(dir, lang.file);
    if (lang.compile) {
      const cRes = await runProc(fill(lang.compile, src, bin), dir, '', lang.compileTimeout || 30000);
      if (!cRes.ok) return { ...cRes, compile: true, compileErr: '编译失败' };
    }
    return await runProc(fill(lang.run, src, bin), dir, stdin, 15000);
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}
