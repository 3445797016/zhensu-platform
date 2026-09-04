// Linux 系统运维路由：系统信息 / 软件包(apt) / 磁盘 / 用户 / 网络。
// hid 支持 'local'(本机) 或已添加的 SSH 主机 id。
import type { FastifyInstance } from 'fastify';
import { store } from '../lib/store.js';
import { Host, run } from '../lib/host.js';

function getHost(hid: string): Host {
  if (!hid || hid === 'local') return { id: 'local', kind: 'local', name: '本机(Linux)' };
  return store.list<Host>('hosts').find((x) => x.id === hid) || { id: hid, kind: 'local', name: hid };
}
const SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9.+-]*$/;

export async function register(fastify: FastifyInstance) {
  // ---- 系统信息
  fastify.get('/linux/:hid/info', async (req, reply) => {
    const h = getHost((req.params as any).hid);
    const lines = [
      'echo HOSTNAME=$(hostname)',
      'echo KERNEL=$(uname -r)',
      'echo ARCH=$(uname -m)',
      `echo OS=$(cat /etc/os-release | grep '^PRETTY_NAME' | cut -d= -f2 | tr -d '"')`,
      'echo MODEL=$(grep -m1 "model name" /proc/cpuinfo | cut -d: -f2)',
      'echo CORES=$(nproc)',
      'echo LOAD=$(cut -d" " -f1-3 /proc/loadavg)',
      'echo UPTIME=$(cut -d. -f1 /proc/uptime)',
      'echo MEM=$(free -m | awk \'/Mem:/{print $2" "$3}\')',
    ];
    const r = await run(h, lines.join('\n'), 20000);
    const get = (k: string) => { const m = r.stdout.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim() : ''; };
    const mem = get('MEM').split(' ');
    return {
      ok: r.code === 0, error: r.stderr,
      hostname: get('HOSTNAME'), kernel: get('KERNEL'), arch: get('ARCH'), os: get('OS'),
      cpuModel: get('MODEL'), cores: parseInt(get('CORES')) || 0,
      load: get('LOAD'), uptimeSec: parseInt(get('UPTIME')) || 0,
      memTotalMb: parseInt(mem[0]) || 0, memUsedMb: parseInt(mem[1]) || 0,
      time: new Date().toISOString(),
    };
  });

  // ---- 软件包：已安装列表 (q 过滤)
  fastify.get('/linux/:hid/packages', async (req, reply) => {
    const h = getHost((req.params as any).hid);
    const q = String((req.query as any).q || '');
    const cmd = 'dpkg-query -W -f=\'${binary:Package}\\t${Version}\\t${binary:Summary}\\n\' 2>/dev/null';
    const r = await run(h, cmd, 30000);
    const all = r.stdout.split('\n').filter(Boolean).map((l) => { const [name, ver, ...sum] = l.split('\t'); return { name, version: ver || '', summary: sum.join(' ') || '' }; });
    const rows = q ? all.filter((x) => x.name.includes(q) || (x.summary || '').includes(q)) : all;
    return { ok: r.code === 0, total: all.length, count: rows.length, items: rows.slice(0, 2000) };
  });

  // ---- apt 在线搜索
  fastify.get('/linux/:hid/search', async (req, reply) => {
    const h = getHost((req.params as any).hid);
    const q = String((req.query as any).q || '').trim().replace(/'/g, '');
    if (!q) return { ok: false, error: '请输入搜索关键字', items: [] };
    const r = await run(h, `apt-cache search '${q}' 2>/dev/null | head -80`, 30000);
    const items = r.stdout.split('\n').filter(Boolean).map((l) => { const i = l.indexOf(' - '); return i > 0 ? { name: l.slice(0, i).trim(), summary: l.slice(i + 3).trim() } : { name: l, summary: '' }; });
    return { ok: r.code === 0, items };
  });

  // ---- 安装 / 卸载
  fastify.post('/linux/:hid/package', async (req, reply) => {
    const h = getHost((req.params as any).hid);
    const { name, action } = req.body as any;
    if (!SAFE_NAME.test(name || '')) return reply.code(400).send({ ok: false, error: '非法的软件包名' });
    if (!['install', 'remove'].includes(action)) return reply.code(400).send({ ok: false, error: '非法操作' });
    const flag = action === 'install' ? 'install' : 'remove';
    const r = await run(h, `export DEBIAN_FRONTEND=noninteractive; apt-get ${flag} -y ${name} 2>&1 | tail -40`, 300000);
    const ok = /^(?:Reading|Setting up|Removing)/.test(r.stdout) || r.code === 0;
    return { ok: true, output: r.stdout || r.stderr, code: r.code };
  });

  // ---- 更新软件源
  fastify.post('/linux/:hid/update', async (req, reply) => {
    const h = getHost((req.params as any).hid);
    const r = await run(h, `export DEBIAN_FRONTEND=noninteractive; apt-get update 2>&1 | tail -30`, 300000);
    return { ok: r.code === 0, output: r.stdout || r.stderr };
  });

  // ---- 升级所有可升级软件包
  fastify.post('/linux/:hid/upgrade', async (req, reply) => {
    const h = getHost((req.params as any).hid);
    const r = await run(h, `export DEBIAN_FRONTEND=noninteractive; apt-get upgrade -y 2>&1 | tail -60`, 600000);
    return { ok: r.code === 0, output: r.stdout || r.stderr };
  });

  // ---- 磁盘
  fastify.get('/linux/:hid/disk', async (req) => {
    const h = getHost((req.params as any).hid);
    const r = await run(h, 'df -P -h 2>/dev/null', 20000);
    const pseudo = /^(udev|tmpfs|devtmpfs|overlay|proc|sysfs|cgroup|mqueue|shm|securityfs|debugfs|pstore|bpf|autofs|hugetlbfs|configfs|fusectl|tracefs|squashfs)/;
    const items = r.stdout.split('\n').slice(1).filter((l) => l.trim()).map((l) => {
      const t = l.trim().split(/\s+/);
      return { fs: t[0], size: t[1], used: t[2], avail: t[3], pct: parseInt(t[4]) || 0, mount: t.slice(5).join(' ') || '/' };
    }).filter((d) => !pseudo.test(d.fs) && !/^\/(dev|run|sys|proc)(\/|$)/.test(d.mount));
    return { ok: r.code === 0, items, error: r.stderr };
  });

  // ---- 用户
  fastify.get('/linux/:hid/users', async (req) => {
    const h = getHost((req.params as any).hid);
    const r = await run(h, 'awk -F: \'$3>=1000 || $1=="root" {print $1"|"$3"|"$4"|"$6"|"$7}\' /etc/passwd', 15000);
    const items = r.stdout.split('\n').filter(Boolean).map((l) => { const p = l.split('|'); return { name: p[0], uid: p[1], gid: p[2], home: p[3], shell: p[4] }; });
    return { ok: r.code === 0, items };
  });

  // ---- 网络
  fastify.get('/linux/:hid/network', async (req) => {
    const h = getHost((req.params as any).hid);
    const r = await run(h, 'ip -o addr show | awk \'$2!="lo" {print $2"|"$3"|"$4}\'', 15000);
    const addrs = r.stdout.split('\n').filter(Boolean).map((l) => { const p = l.split('|'); return { iface: p[0], family: p[1], address: p[2] }; });
    const gw = await run(h, 'ip route show default | head -1', 15000);
    return { ok: r.code === 0, addrs, gateway: gw.stdout.trim(), error: r.stderr };
  });
}
