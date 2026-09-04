// 主机(VM/物理机)连接与命令执行抽象。
// - host.kind === 'local' : 本机直接执行
// - 否则 : 通过 ssh2 连接（可带 sudo/密码/私钥）
import { exec as cpExec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from 'ssh2';

const execAsync = promisify(cpExec);

export interface Host {
  id: string;
  name: string;
  kind: 'local' | 'ssh';
  host?: string; // ssh ip/域名
  port?: number;
  user?: string;
  authType?: 'password' | 'key';
  password?: string;
  privateKey?: string;
  sudo?: boolean;
  sudoPassword?: string;
  os?: string;
  tags?: string[];
  notes?: string;
  lastSeen?: string;
}

export function describeHost(h: Host) {
  return h.kind === 'local' ? 'local://' + (h.name || '本机') : `${h.user}@${h.host}:${h.port ?? 22}`;
}

export async function run(h: Host, cmd: string, timeoutMs = 120000): Promise<{ code: number; stdout: string; stderr: string }> {
  if (h.kind === 'local') {
    try {
      const { stdout, stderr } = await execAsync(cmd, { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, shell: '/bin/bash' });
      return { code: 0, stdout: String(stdout), stderr: String(stderr) };
    } catch (e: any) {
      return { code: e.code ?? 1, stdout: String(e.stdout ?? ''), stderr: String(e.stderr ?? e.message) };
    }
  }

  return new Promise((resolve) => {
    const conn = new Client();
    const cfg: any = { host: h.host, port: h.port || 22, username: h.user, readyTimeout: 15000 };
    if (h.authType === 'key' && h.privateKey) cfg.privateKey = h.privateKey;
    else cfg.password = h.password;
    const timer = setTimeout(() => { conn.end(); resolve({ code: -1, stdout: '', stderr: 'SSH 连接超时' }); }, 30000);
    conn.on('ready', () => {
      conn.exec(cmd, { pty: true }, (err, stream) => {
        if (err) { clearTimeout(timer); conn.end(); resolve({ code: -1, stdout: '', stderr: String(err) }); return; }
        let out = '', errOut = '';
        let sudoNeeds = false;
        stream.on('data', (d: Buffer) => {
          const s = d.toString();
          out += s;
          if (h.sudo && h.sudoPassword && /[Pp]assword:/.test(s) && !sudoNeeds) {
            sudoNeeds = true;
            stream.write(h.sudoPassword + '\n');
          }
        });
        stream.stderr.on('data', (d: Buffer) => { errOut += d.toString(); });
        stream.on('close', (c: number) => {
          clearTimeout(timer); conn.end();
          resolve({ code: c, stdout: out, stderr: errOut });
        });
      });
    });
    conn.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, stdout: '', stderr: String(e) }); });
    conn.connect(cfg);
  });
}

export async function ping(h: Host): Promise<Host> {
  const r = await run(h, 'uname -a && echo "---" && . /etc/os-release 2>/dev/null && echo "$PRETTY_NAME" && echo "---" && free -m | head -2 && echo "---" && uptime && echo "---" && nproc', 20000);
  const line = (i: number) => (r.stdout.split('---') || [''])[i]?.trim() ?? '';
  return { ...h, os: line(1) || h.os, lastSeen: new Date().toISOString() };
}

export function openShell(h: Host, onData: (s: string) => void, onClose: () => void): { write(s: string): void; close(): void } {
  if (h.kind === 'local') {
    const p = spawn('/bin/bash', [], { env: { ...process.env, TERM: 'xterm-256color' } });
    p.stdout.on('data', (d) => onData(d.toString()));
    p.stderr.on('data', (d) => onData(d.toString()));
    p.on('close', onClose);
    return { write: (s) => p.stdin.write(s), close: () => p.kill() };
  }
  const conn = new Client();
  const cfg: any = { host: h.host, port: h.port || 22, username: h.user };
  if (h.authType === 'key' && h.privateKey) cfg.privateKey = h.privateKey;
  else cfg.password = h.password;
  let shellStream: any = null;
  conn.on('ready', () => conn.shell({ term: 'xterm-256color' }, (err, stream) => {
    if (err) { onClose(); return; }
    shellStream = stream;
    stream.on('data', (d) => onData(d.toString()));
    stream.stderr.on('data', (d) => onData(d.toString()));
    stream.on('close', onClose);
  }));
  conn.on('error', onClose);
  conn.connect(cfg);
  return {
    write: (s) => shellStream?.write(s),
    close: () => { try { shellStream?.end(); } catch {} conn.end(); }
  };
}
