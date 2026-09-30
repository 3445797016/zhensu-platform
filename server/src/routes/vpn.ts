// VPN 模块：管理 Clash 代理、OpenVPN 等，提供节点延迟探测与启停控制
import type { FastifyInstance } from 'fastify';
import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import { audit } from '../lib/audit.js';
import { store } from '../lib/store.js';

const execAsync = promisify(exec);

const CFG = 'vpn';

const CLASH_API = 'http://127.0.0.1:9090';
const CLASH_CONFIG = '/root/.config/clash/config.yaml';

// ===== Clash 相关工具函数 =====

async function clashApi(method: 'GET' | 'PUT', path: string, body?: any): Promise<any> {
  const url = `${CLASH_API}${path}`;
  try {
    const resp = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return { error: `HTTP ${resp.status}` };
    const text = await resp.text();
    return text ? JSON.parse(text) : { ok: true };
  } catch (e: any) {
    return { error: e?.message || 'Clash API 不可达' };
  }
}

/** 检查 Clash 进程是否在运行 */
function clashRunning(): boolean {
  try {
    const out = execSync('ps aux | grep -v grep | grep -E "[c]lash|[m]ihomo"', { timeout: 5000, encoding: 'utf-8' });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

/** 获取 Clash PID */
function clashPid(): number | null {
  try {
    const out = execSync('pgrep -f "[c]lash|[m]ihomo"', { timeout: 3000, encoding: 'utf-8' }).trim();
    const pid = parseInt(out.split('\n')[0]);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

/** 获取所有代理节点（不含延迟，延迟通过 POST /proxies/delays 单独测） */
async function getProxies(): Promise<{ name: string; type: string; server: string; port: number; delay: number | null }[]> {
  const raw = await clashApi('GET', '/proxies');
  const items = raw?.proxies ?? raw;
  if (!items || typeof items !== 'object') return [];
  const result: any[] = [];
  for (const [name, info] of Object.entries(items)) {
    const p = info as any;
    const nodeTypes = new Set(['Shadowsocks','VMess','Vmess','VLess','Trojan','Hysteria','Hysteria2','TUIC','Socks5','Http','Direct','Reject']);
    if (nodeTypes.has(p.type)) {
      result.push({
        name,
        type: p.type,
        server: p.server || '-',
        port: p.port || 0,
        delay: null, // 延迟通过专门的测速接口获取
      });
    }
  }
  return result;
}

/** 获取代理组（用于切换） */
async function getProxyGroups(): Promise<{ name: string; type: string; now: string; all: string[] }[]> {
  const raw = await clashApi('GET', '/proxies');
  const items = raw?.proxies ?? raw;
  if (!items || typeof items !== 'object') return [];
  const groups: any[] = [];
  for (const [name, info] of Object.entries(items)) {
    const p = info as any;
    if (p.type === 'Selector' || p.type === 'URLTest' || p.type === 'Fallback' || p.type === 'LoadBalance') {
      groups.push({ name, type: p.type, now: p.now || '', all: p.all || [] });
    }
  }
  return groups;
}

/** 切换代理组的选择 */
async function switchProxy(group: string, proxy: string): Promise<boolean> {
  const r = await clashApi('PUT', `/proxies/${encodeURIComponent(group)}`, { name: proxy });
  return !r.error;
}

/** 重启 Clash */
async function restartClash(): Promise<{ ok: boolean; error?: string }> {
  try {
    const pid = clashPid();
    if (pid) {
      execSync(`kill ${pid}`, { timeout: 5000 });
      // 等待进程退出
      await new Promise((r) => setTimeout(r, 2000));
    }
    // 启动 Clash
    const workDir = '/root/clash';
    execSync(`cd ${workDir} && nohup ./clash -f ./config.yaml > /dev/null 2>&1 &`, { timeout: 10000 });
    // 等待启动
    await new Promise((r) => setTimeout(r, 2000));
    return { ok: clusterRunning() };
  } catch (e: any) {
    return { ok: false, error: e?.message || '重启失败' };
  }
}

function clusterRunning() {
  try {
    return execSync('pgrep -f "[c]lash"', { timeout: 3000, encoding: 'utf-8' }).trim().length > 0;
  } catch { return false; }
}

/** 读取 Clash 配置（过滤敏感字段） */
function getClashConfig(): any {
  try {
    const raw = execSync(`cat ${CLASH_CONFIG}`, { timeout: 5000, encoding: 'utf-8' });
    return { content: raw, path: CLASH_CONFIG };
  } catch (e: any) {
    return { error: e?.message || '无法读取配置' };
  }
}

/** 保存 Clash 配置 */
function saveClashConfig(content: string): { ok: boolean; error?: string } {
  try {
    execSync(`cat > ${CLASH_CONFIG} << 'OPSEOF'\n${content}\nOPSEOF`, { timeout: 10000, shell: '/bin/bash' });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || '保存失败' };
  }
}

/** Ping 一个节点/IP */
async function pingNode(host: string, count = 3): Promise<{ avg: number | null; loss: number | null; output: string }> {
  try {
    const r = await execAsync(`ping -c ${count} -W 2 ${host} 2>&1`);
    const out = r.stdout + r.stderr;
    const avgMatch = out.match(/rtt min\/avg\/max\/mdev = [\d.]+\/([\d.]+)\//);
    const lossMatch = out.match(/(\d+)% packet loss/);
    return {
      avg: avgMatch ? parseFloat(avgMatch[1]) : null,
      loss: lossMatch ? parseInt(lossMatch[1]) : null,
      output: out,
    };
  } catch (e: any) {
    return { avg: null, loss: 100, output: e?.message || 'Ping 失败' };
  }
}

// ===== OpenVPN 管理 =====

function listOpenVpnConfigs(): string[] {
  try {
    const out = execSync('ls /etc/openvpn/client/*.conf /etc/openvpn/server/*.conf 2>/dev/null', { timeout: 3000, encoding: 'utf-8' });
    return out.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function openVpnRunning(): boolean {
  try {
    const out = execSync('pgrep -x openvpn', { timeout: 3000, encoding: 'utf-8' });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

// ===== 检查系统代理设置 =====

function getSystemProxy(): { http?: string; https?: string; socks?: string; enabled: boolean } {
  try {
    const http = execSync('echo $http_proxy', { timeout: 2000, encoding: 'utf-8' }).trim();
    const https = execSync('echo $https_proxy', { timeout: 2000, encoding: 'utf-8' }).trim();
    const socks = execSync('echo $ALL_PROXY', { timeout: 2000, encoding: 'utf-8' }).trim();
    return {
      http: http || undefined,
      https: https || undefined,
      socks: socks || undefined,
      enabled: !!(http || https || socks),
    };
  } catch {
    return { enabled: false };
  }
}

// ===== 路由注册 =====

export async function register(fastify: FastifyInstance) {
  // VPN 总览状态
  fastify.get('/vpn/status', async () => {
    const clashRun = clashRunning();
    const clashP = clashPid();
    const clashApiResp = clashRun ? await clashApi('GET', '/version') : null;
    const ovpnRun = openVpnRunning();
    const ovpnConfigs = listOpenVpnConfigs();
    const sysProxy = getSystemProxy();
    const config = store.read<any>(CFG, {});
    const sec = config?.secret ? '已配置' : '未配置';

    return {
      clash: {
        running: clashRun,
        pid: clashP,
        version: clashApiResp?.version || clashApiResp?.premium ? `premium ${clashApiResp.version || ''}` : null,
        api: clashApiResp ? '可达' : '不可达',
        port: 7890,
        socksPort: 7891,
        apiPort: 9090,
      },
      openvpn: {
        running: ovpnRun,
        configs: ovpnConfigs,
      },
      systemProxy: sysProxy,
      secret: sec,
    };
  });

  // 获取所有代理节点(含延迟)
  fastify.get('/vpn/proxies', async () => {
    const proxies = await getProxies();
    const groups = await getProxyGroups();
    return { proxies, groups };
  });

  // 切换代理组选择
  fastify.post('/vpn/proxies/switch', async (req, reply) => {
    const { group, proxy } = req.body as any;
    if (!group || !proxy) return reply.status(400).send({ error: '缺少 group 或 proxy' });
    const ok = await switchProxy(group, proxy);
    audit('vpn', 'switch', `${group}→${proxy}`, 'web');
    return { ok };
  });

  // 延迟测试（单个节点）
  fastify.post('/vpn/proxies/delay', async (req) => {
    const { name } = req.body as any;
    if (!name) return { error: '缺少节点名' };
    const r = await clashApi('GET', `/proxies/${encodeURIComponent(name)}/delay?timeout=5000&url=http://www.gstatic.com/generate_204`);
    return { name, delay: r.delay ?? null, error: r.error };
  });

  // Ping 测试（从本机到目标主机）
  fastify.post('/vpn/ping', async (req) => {
    const { host, count } = req.body as any;
    if (!host) return { error: '缺少 host' };
    const result = await pingNode(host, count || 3);
    audit('vpn', 'ping', host, 'web');
    return result;
  });

  // 读取 Clash 配置
  fastify.get('/vpn/config', async () => {
    return getClashConfig();
  });

  // 保存 Clash 配置
  fastify.post('/vpn/config', async (req) => {
    const { content } = req.body as any;
    if (!content) return { error: '缺少配置内容' };
    const r = saveClashConfig(content);
    if (r.ok) audit('vpn', 'config.save', CLASH_CONFIG, 'web');
    return r;
  });

  // 重启 Clash
  fastify.post('/vpn/restart', async () => {
    const r = await restartClash();
    audit('vpn', 'restart', 'clash', 'web');
    return r;
  });

  // 停止 Clash
  fastify.post('/vpn/stop', async () => {
    const pid = clashPid();
    if (pid) {
      try {
        execSync(`kill ${pid}`, { timeout: 5000 });
        audit('vpn', 'stop', 'clash', 'web');
        return { ok: true };
      } catch (e: any) {
        return { ok: false, error: e?.message };
      }
    }
    return { ok: false, error: 'Clash 未运行' };
  });

  // OpenVPN 连接列表
  fastify.get('/vpn/openvpn/configs', async () => {
    const configs = listOpenVpnConfigs();
    const running = openVpnRunning();
    // 读取每个配置的第一行描述
    const details = configs.map((path) => {
      try {
        const name = path.split('/').pop() || path;
        const head = execSync(`head -20 ${path} 2>/dev/null | grep "^#\\|^remote "`, { timeout: 3000, encoding: 'utf-8' }).trim();
        return { path, name, head };
      } catch {
        return { path, name: path.split('/').pop() || path, head: '' };
      }
    });
    return { configs: details, running };
  });

  // 启动 OpenVPN
  fastify.post('/vpn/openvpn/start', async (req) => {
    const { config } = req.body as any;
    if (!config) return { error: '缺少配置文件路径' };
    try {
      execSync(`nohup openvpn --config ${config} > /dev/null 2>&1 &`, { timeout: 5000 });
      audit('vpn', 'openvpn.start', config, 'web');
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message };
    }
  });

  // 停止 OpenVPN
  fastify.post('/vpn/openvpn/stop', async () => {
    try {
      execSync('pkill -x openvpn', { timeout: 5000 });
      audit('vpn', 'openvpn.stop', '', 'web');
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message };
    }
  });

  // 节点批量延迟测试
  fastify.post('/vpn/proxies/delays', async (req) => {
    const { names } = req.body as any;
    if (!Array.isArray(names) || names.length === 0) return { error: '缺少节点列表' };
    const results = await Promise.all(names.map(async (name: string) => {
      const r = await clashApi('GET', `/proxies/${encodeURIComponent(name)}/delay?timeout=5000&url=http://www.gstatic.com/generate_204`);
      return { name, delay: r.delay ?? null, error: r.error };
    }));
    return { results };
  });
}