// SSH 端口转发/隧道管理
import { execSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { store } from '../lib/store.js';

const CFG = 'tunnels.json';

interface Tunnel {
  id: string;
  name: string;
  type: 'local' | 'remote' | 'dynamic';
  localHost?: string;
  localPort: number;
  remoteHost?: string;
  remotePort: number;
  sshHost: string;
  sshPort: number;
  sshUser: string;
  sshKey?: string;
  pid: number | null;
  autoStart?: boolean;
}

function getTunnels(): Tunnel[] {
  return store.read<Tunnel[]>(CFG, []);
}

function saveTunnels(t: Tunnel[]) { store.write(CFG, t); }

// 查找正在运行的 SSH 隧道进程
function findSshTunnels(): { pid: number; local: string; remote: string; cmd: string }[] {
  try {
    const out = execSync('ps aux | grep -E "[s]sh.*-L|[s]sh.*-R|[s]sh.*-D"', { encoding: 'utf8', timeout: 5000 });
    const result: any[] = [];
    for (const line of out.split('\n').filter(Boolean)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 11) continue;
      const pid = parseInt(parts[1]);
      const cmd = parts.slice(10).join(' ');
      const localMatch = cmd.match(/-L\s+(\S+?):(\d+):(\S+):(\d+)/);
      const remoteMatch = cmd.match(/-R\s+(\S+?):(\d+):(\S+):(\d+)/);
      const dynamicMatch = cmd.match(/-D\s+(\S+?):(\d+)/);
      if (localMatch) result.push({ pid, local: `${localMatch[1]}:${localMatch[2]}`, remote: `${localMatch[3]}:${localMatch[4]}`, cmd, type: 'local' });
      if (remoteMatch) result.push({ pid, local: `${remoteMatch[1]}:${remoteMatch[2]}`, remote: `${remoteMatch[3]}:${remoteMatch[4]}`, cmd, type: 'remote' });
      if (dynamicMatch) result.push({ pid, local: `${dynamicMatch[1]}:${dynamicMatch[2]}`, remote: 'SOCKS5', cmd, type: 'dynamic' });
    }
    return result;
  } catch { return []; }
}

// 构建 SSH 命令
function buildSshCmd(t: Tunnel): string {
  let cmd = `ssh -N -o ServerAliveInterval=30 -o ServerAliveCountMax=3`;
  if (t.sshPort && t.sshPort !== 22) cmd += ` -p ${t.sshPort}`;
  if (t.sshKey) cmd += ` -i ${t.sshKey}`;
  if (t.type === 'local') cmd += ` -L ${t.localHost || '0.0.0.0'}:${t.localPort}:${t.remoteHost || 'localhost'}:${t.remotePort}`;
  if (t.type === 'remote') cmd += ` -R ${t.remoteHost || '0.0.0.0'}:${t.remotePort}:${t.localHost || 'localhost'}:${t.localPort}`;
  if (t.type === 'dynamic') cmd += ` -D ${t.localHost || '0.0.0.0'}:${t.localPort}`;
  cmd += ` ${t.sshUser}@${t.sshHost}`;
  return cmd;
}

export async function register(fastify: FastifyInstance) {
  // 获取所有隧道配置 + 运行状态
  fastify.get('/tunnels', async () => {
    const tunnels = getTunnels();
    const running = findSshTunnels();
    // 匹配运行中的隧道
    return tunnels.map((t) => ({
      ...t,
      running: running.some(r => r.local.includes(String(t.localPort))),
      pid: running.find(r => r.local.includes(String(t.localPort)))?.pid || null,
    }));
  });

  // 创建隧道
  fastify.post('/tunnels', async (req) => {
    const body = req.body as any;
    if (!body.name || !body.sshHost || !body.sshUser || !body.localPort) {
      return { error: '缺少必要参数(name/sshHost/sshUser/localPort)' };
    }
    const tunnels = getTunnels();
    const t: Tunnel = {
      id: `tun_${Date.now()}`,
      name: body.name,
      type: body.type || 'local',
      localHost: body.localHost || '0.0.0.0',
      localPort: body.localPort,
      remoteHost: body.remoteHost || 'localhost',
      remotePort: body.remotePort || 0,
      sshHost: body.sshHost,
      sshPort: body.sshPort || 22,
      sshUser: body.sshUser,
      sshKey: body.sshKey || '',
      pid: null,
      autoStart: body.autoStart || false,
    };
    tunnels.push(t);
    saveTunnels(tunnels);
    return { ok: true, tunnel: t };
  });

  // 更新隧道
  fastify.put('/tunnels/:id', async (req: any) => {
    const { id } = req.params;
    const body = req.body as any;
    const tunnels = getTunnels();
    const idx = tunnels.findIndex(t => t.id === id);
    if (idx < 0) return { error: '隧道不存在' };
    Object.assign(tunnels[idx], body);
    saveTunnels(tunnels);
    return { ok: true };
  });

  // 删除隧道
  fastify.delete('/tunnels/:id', async (req: any) => {
    const { id } = req.params;
    const tunnels = getTunnels().filter(t => t.id !== id);
    saveTunnels(tunnels);
    return { ok: true };
  });

  // 启动隧道
  fastify.post('/tunnels/:id/start', async (req: any) => {
    const { id } = req.params;
    const tunnels = getTunnels();
    const t = tunnels.find(x => x.id === id);
    if (!t) return { error: '隧道不存在' };
    if (findSshTunnels().some(r => r.local.includes(String(t.localPort)))) {
      return { error: `端口 ${t.localPort} 已被占用` };
    }
    const cmd = buildSshCmd(t);
    try {
      const proc = spawn('sh', ['-c', cmd], {
        stdio: 'ignore',
        detached: true,
      });
      proc.unref();
      t.pid = proc.pid || null;
      saveTunnels(tunnels);
      return { ok: true, pid: proc.pid, cmd };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  });

  // 停止隧道
  fastify.post('/tunnels/:id/stop', async (req: any) => {
    const { id } = req.params;
    const tunnels = getTunnels();
    const t = tunnels.find(x => x.id === id);
    if (!t) return { error: '隧道不存在' };
    // 找到并杀掉进程
    const running = findSshTunnels();
    const match = running.find(r => r.local.includes(String(t.localPort)));
    if (match) {
      try { execSync(`kill ${match.pid}`, { timeout: 3000 }); } catch { /* */ }
    }
    t.pid = null;
    saveTunnels(tunnels);
    return { ok: true };
  });

  // SSH 密钥列表
  fastify.get('/tunnels/ssh-keys', async () => {
    const sshDir = join(homedir(), '.ssh');
    if (!existsSync(sshDir)) return { keys: [] };
    const keys = readdirSync(sshDir).filter(f => !f.endsWith('.pub') && !f.endsWith('.old') && existsSync(join(sshDir, f + '.pub')));
    return { keys };
  });

  // 系统运行中的 SSH 隧道列表
  fastify.get('/tunnels/running', async () => {
    return { tunnels: findSshTunnels() };
  });

  // 查看命令预览
  fastify.post('/tunnels/preview', async (req) => {
    const body = req.body as any;
    const t: Tunnel = {
      id: 'preview',
      name: body.name || '',
      type: body.type || 'local',
      localHost: body.localHost || '0.0.0.0',
      localPort: body.localPort,
      remoteHost: body.remoteHost || 'localhost',
      remotePort: body.remotePort || 0,
      sshHost: body.sshHost,
      sshPort: body.sshPort || 22,
      sshUser: body.sshUser,
      sshKey: body.sshKey || '',
      pid: null,
    };
    return { cmd: buildSshCmd(t) };
  });
}
