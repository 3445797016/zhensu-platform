// 网络安全工具 API：把本机已安装的安全工具(nmap/rustscan/masscan/whatweb/nikto/gobuster/ffuf/nuclei/…)
// 封装成可调用接口，供前端右侧「网络安全工具箱」使用。
// 安全边界：
//  - 扫描/探测类在本机执行(目标地址由调用方给出);
//  - 审计/基线类在所选纳管主机上执行(沿用 hosts 的 exec/ssh);
//  - danger 工具必须带 ack='yes' 且仅建议对本机/自管主机使用。
import { spawnSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import type { FastifyInstance } from 'fastify';
import { store } from '../lib/store.js';
import { Host, run } from '../lib/host.js';

/* ================= 工具目录 ================= */
export interface SecParam { key: string; label: string; def?: string; hint?: string; ph?: string; }
export interface SecTool {
  id: string; name: string; group: '扫描' | 'Web' | '审计' | '基线' | '口令/利用(参考)';
  runOn: 'local' | 'host' | 'none';
  bin?: string;                 // 依赖的本机可执行文件
  danger?: boolean; dangerNote?: string;
  needsTarget?: boolean;
  params: SecParam[];
  timeout?: number;
  help?: string;
  build: (t: string, p: Record<string, string>) => string; // 组装命令
}

const WL = '/usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt';
const shq = (s: string) => "'" + String(s || '').replace(/'/g, `'\\''`) + "'";

export const SEC_TOOLS: SecTool[] = [
  // ---------- 扫描 / 资产探测(本机执行, 目标=IP/域名/CIDR) ----------
  { id: 'nmap-quick', name: 'Nmap · 快速端口', group: '扫描', runOn: 'local', bin: 'nmap', needsTarget: true, timeout: 180,
    params: [{ key: 'ports', label: '端口数', def: '200', hint: '扫描最常用前 N 个端口' }],
    help: 'TCP 半开扫描 Top 端口,几秒出结果,先摸清目标开了什么。',
    build: (t, p) => `nmap -Pn -T4 --top-ports ${p.ports || '200'} ${shq(t)}` },
  { id: 'nmap-sv', name: 'Nmap · 服务版本', group: '扫描', runOn: 'local', bin: 'nmap', needsTarget: true, timeout: 300,
    params: [{ key: 'ports', label: '端口数', def: '1000' }],
    help: '对 Top 端口做服务指纹/版本识别(-sV),输出更详细。',
    build: (t, p) => `nmap -Pn -sS -sV -T4 --top-ports ${p.ports || '1000'} ${shq(t)}` },
  { id: 'rustscan', name: 'RustScan · 高速全端口', group: '扫描', runOn: 'local', bin: 'rustscan', needsTarget: true, timeout: 240,
    params: [{ key: 'range', label: '端口范围', def: '1-10000', hint: '如 1-10000(用 -r 区间参数)' }],
    help: 'Rust 编写,亚秒级发现开放端口。输出采用 greppable 格式,只列开放端口。',
    build: (t, p) => `rustscan --no-banner --greppable -a ${shq(t)} -r ${p.range || '1-10000'} --ulimit 8000 -b 3000 -t 2000` },
  { id: 'masscan', name: 'Masscan · 全网段端口(谨慎)', group: '扫描', runOn: 'local', bin: 'masscan', needsTarget: true, danger: true, timeout: 300,
    dangerNote: '全端口高速扫描会产生大量流量,务必仅用于自己的网段/授权目标。',
    params: [{ key: 'ports', label: '端口', def: '1-65535' }, { key: 'rate', label: '速率 pps', def: '500' }],
    help: '极速大规模端口扫描(TCP SYN)。默认目标为空,请填网段如 192.168.1.0/24。',
    build: (t, p) => `masscan ${shq(t)} -p${p.ports || '1-65535'} --rate=${p.rate || '500'}` },
  { id: 'ping-sweep', name: 'Ping 存活探测', group: '扫描', runOn: 'local', bin: 'nmap', needsTarget: true, timeout: 120,
    params: [{ key: 'target', label: '网段', def: '', hint: '例:192.168.147.0/24(本机网段会自动给出建议)' }],
    help: 'nmap -sn 主机存活扫描,快速列出内网在线设备。',
    build: (t) => `nmap -sn -T4 ${shq(t)}` },
  { id: 'arp-scan', name: 'ARP 局域网扫描', group: '扫描', runOn: 'local', bin: 'arp-scan', timeout: 60,
    params: [{ key: 'iface', label: '网卡', def: '', hint: '留空自动; 如 eth0/ens33' }],
    help: 'ARP 协议发现本网段主机(含 MAC/厂商),二层探测更隐蔽。',
    build: (_t, p) => `arp-scan --localnet ${p.iface ? `-I ${p.iface}` : ''}` },

  // ---------- Web 应用检测(本机执行, 目标=URL) ----------
  { id: 'whatweb', name: 'WhatWeb · 指纹识别', group: 'Web', runOn: 'local', bin: 'whatweb', needsTarget: true, timeout: 120,
    params: [], help: '识别目标 Web 技术栈:框架/中间件/版本。目标示例:http://127.0.0.1:3000',
    build: (t) => `whatweb -a 3 ${shq(t)}` },
  { id: 'nikto', name: 'Nikto · 漏洞扫描', group: 'Web', runOn: 'local', bin: 'nikto', needsTarget: true, timeout: 240,
    params: [{ key: 'max', label: '扫描上限(秒)', def: '120' }],
    help: 'Web 服务器漏洞/危险文件/配置问题扫描。目标示例:http://127.0.0.1:80',
    build: (t, p) => `nikto -host ${shq(t)} -maxtime ${p.max || '120'}s -nointeractive` },
  { id: 'gobuster-dir', name: 'Gobuster · 目录爆破', group: 'Web', runOn: 'local', bin: 'gobuster', needsTarget: true, timeout: 240,
    params: [{ key: 'wordlist', label: '字典', def: WL }, { key: 'ext', label: '扩展(可选)', hint: '如 php,html 用逗号分隔' }],
    help: '发现隐藏目录/文件。目标示例:http://127.0.0.1:8080',
    build: (t, p) => `gobuster dir -u ${shq(t)} -w ${shq(p.wordlist || WL)} -t 30 -q -n -k ${p.ext ? `-x ${p.ext}` : ''}` },
  { id: 'ffuf', name: 'FFUF · 模糊测试', group: 'Web', runOn: 'local', bin: 'ffuf', needsTarget: true, timeout: 240,
    params: [{ key: 'wordlist', label: '字典', def: WL }, { key: 'mc', label: '过滤状态码', def: '200,204,301,302,307,401,403' }],
    help: '快速模糊测试。目标需含 FUZZ 占位,示例:http://127.0.0.1:3000/api/FUZZ',
    build: (t, p) => `ffuf -u ${shq(t)} -w ${shq(p.wordlist || WL)} -mc ${p.mc || '200,204,301,302,307,401,403'} -t 40` },
  { id: 'nuclei', name: 'Nuclei · 模板漏洞检测', group: 'Web', runOn: 'local', bin: 'nuclei', needsTarget: true, timeout: 240,
    params: [{ key: 'tags', label: 'tags(可选)', hint: '如 sqli,exposure;留空=默认全部' }],
    help: 'YAML 模板批量漏洞检测。若提示缺少模板,先执行 nuclei -update-templates。',
    build: (t, p) => `nuclei -u ${shq(t)} -silent -nc -timeout 15 -retries 1 ${p.tags ? `-tags ${shq(p.tags)}` : ''}` },
  { id: 'sqlmap', name: 'SQLMap · SQL注入(谨慎)', group: 'Web', runOn: 'local', bin: 'sqlmap', needsTarget: true, danger: true, timeout: 240,
    dangerNote: '注入测试仅限自管/授权应用。',
    params: [{ key: 'level', label: 'level', def: '1' }],
    help: '自动检测并利用 SQL 注入。目标需带参数,示例:http://127.0.0.1:3000/item?id=1',
    build: (t, p) => `sqlmap -u ${shq(t)} --batch --smart --flush-session --level=${p.level || '1'}` },

  // ---------- 主机审计(在所选主机上执行) ----------
  { id: 'conn-audit', name: '连接审计 · 监听/连接', group: '审计', runOn: 'host', timeout: 60,
    params: [], help: '查看目标主机监听端口、活动 TCP 连接(尽量按进程归因)与连接统计。',
    build: () => [
      "echo '================ 监听端口(LISTEN) ================'",
      "ss -ltnp 2>/dev/null | tail -n +2 | head -60",
      "echo",
      "echo '================ 活动连接(ESTABLISHED) ================'",
      "ss -tnp state established 2>/dev/null | head -80",
      "echo",
      "echo '================ 连接统计 ================'",
      "ss -s 2>/dev/null | head -8",
    ].join('\n') },
  { id: 'login-audit', name: '登录审计 · 失败/成功', group: '审计', runOn: 'host', timeout: 60,
    params: [], help: '统计失败登录 Top 用户/来源、最近失败与成功登录、当前在线会话(读取 btmp/last)。',
    build: () => [
      "echo '================ 失败登录 Top(按用户名) ================'",
      "(lastb 2>/dev/null || last -f /var/log/btmp 2>/dev/null) | awk 'NF && $1 !~ /^(btmp|lastb|wtmp|reboot)/{c[$1]++} END{for(u in c) print c[u], u}' | sort -rn | head -15",
      "echo",
      "echo '================ 失败登录 Top(按来源IP) ================'",
      "(lastb 2>/dev/null || last -f /var/log/btmp 2>/dev/null) | awk 'NF && $1 !~ /^(btmp|lastb|wtmp|reboot)/{c[$3]++} END{for(u in c) print c[u], u}' | sort -rn | head -15",
      "echo",
      "echo '================ 最近 12 条失败登录 ================'",
      "(lastb 2>/dev/null || last -f /var/log/btmp 2>/dev/null) | head -12",
      "echo",
      "echo '================ 最近成功登录 ================'",
      "last -n 12 2>/dev/null",
      "echo",
      "echo '================ 当前在线 ================'",
      "who 2>/dev/null || true",
    ].join('\n') },
  { id: 'sudo-audit', name: '权限审计 · sudo/su/新用户', group: '审计', runOn: 'host', timeout: 60,
    params: [], help: '查看最近 sudo/su 调用、新增用户、认证失败(读 /var/log/auth.log)。',
    build: () => [
      "echo '================ 最近 sudo 调用 ================'",
      "grep -hE 'sudo' /var/log/auth.log /var/log/auth.log.1 2>/dev/null | tail -20 || journalctl -t sudo -n 20 --no-pager 2>/dev/null || echo '(无日志权限或无 auth.log)'",
      "echo",
      "echo '================ 新增用户 / su 切换 ================'",
      "grep -hE 'useradd|new user|su:|session opened for user root' /var/log/auth.log /var/log/auth.log.1 2>/dev/null | tail -15 || echo '(无日志)'",
      "echo",
      "echo '================ 最近认证失败(来源) ================'",
      "grep -hE 'Failed password|authentication failure' /var/log/auth.log /var/log/auth.log.1 2>/dev/null | tail -10 || echo '(无日志)'",
    ].join('\n') },

  // ---------- 安全基线(在所选主机上执行, 只读) ----------
  { id: 'baseline', name: '安全基线检查', group: '基线', runOn: 'host', timeout: 90,
    params: [], help: '只读检查:SSH 配置/防火墙/密码策略/SUID/无口令账号/危险目录写权限/待更新包。',
    build: () => [
      "echo '================ 系统与内核 ================'",
      "uname -a",
      "cat /etc/os-release 2>/dev/null | head -2",
      "echo",
      "echo '================ SSH 关键配置 ================'",
      "sshd -T 2>/dev/null | grep -iE '^(permitrootlogin|passwordauthentication|pubkeyauthentication|port) ' || grep -iE 'PermitRootLogin|PasswordAuthentication|Port ' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/* 2>/dev/null | grep -v '^#' || echo '(无法读取,需要权限)'",
      "echo",
      "echo '================ 防火墙 ================'",
      "echo \"iptables 规则数: $(iptables -S 2>/dev/null | wc -l)\"; ufw status 2>/dev/null | head -5 || echo '(ufw 未安装)'",
      "echo",
      "echo '================ 密码策略(login.defs) ================'",
      "grep -E 'PASS_MAX_DAYS|PASS_MIN_DAYS|PASS_WARN_AGE' /etc/login.defs 2>/dev/null | grep -v '^#' || echo '(不可读)'",
      "echo",
      "echo '================ 无口令/可空口令账号(/etc/shadow) ================'",
      "awk -F: '($2==\"\" || $2 ~ /^[!*]{1,2}$/) && $3>=1000 {print \"可疑账号:\", $1}' /etc/shadow 2>/dev/null || echo '(需要 root)'",
      "echo \"UID=0 账号: $(awk -F: '$3==0{print $1}' /etc/passwd 2>/dev/null | tr '\\n' ' ')\"",
      "echo",
      "echo '================ SUID 高危文件(前 20) ================'",
      "find / -xdev -type f -perm -4000 2>/dev/null | grep -vE '/(usr/bin/(su|sudo|passwd|mount|umount|chsh|chfn|newgrp)|usr/sbin/(unix_chkpwd|mount.nfs))' | head -20 || echo '(find 无权限)'",
      "echo",
      "echo '================ 全局可写目录(前 15) ================'",
      "find / -xdev -type d -perm -0002 2>/dev/null ! -path '/tmp*' ! -path '/proc*' ! -path '/sys*' ! -path '/run*' ! -path '/dev/shm*' | head -15 || true",
      "echo",
      "echo '================ 待安全更新(ubuntu/debian 需 apt 权限) ================'",
      "(apt list --upgradable 2>/dev/null | grep -ci security | head -1; apt list --upgradable 2>/dev/null | head -8) || echo '(跳过)'",
      "echo",
      "echo '================ 关键服务监听 ================'",
      "ss -ltn 2>/dev/null | awk 'NR>1{print $4}' | head -20",
    ].join('\n') },

  // ---------- 口令/利用: 只给参考命令, 不做一键执行 ----------
  { id: 'hydra', name: 'Hydra · 在线口令(参考)', group: '口令/利用(参考)', runOn: 'none', bin: 'hydra',
    params: [], help: '仅展示参考命令,请自备并遵守授权。示例:hydra -l admin -P pass.txt ssh://目标IP',
    build: () => `hydra -l admin -P /usr/share/wordlists/rockyou.txt ssh://TARGET -t 4 -f` },
  { id: 'john', name: 'John · 离线破解(参考)', group: '口令/利用(参考)', runOn: 'none', bin: 'john',
    params: [], help: '破解本地哈希:john --wordlist=字典 hash.txt',
    build: () => `john --wordlist=/usr/share/wordlists/rockyou.txt hash.txt` },
  { id: 'hashcat', name: 'HashCat · GPU破解(参考)', group: '口令/利用(参考)', runOn: 'none', bin: 'hashcat',
    params: [], help: 'hashcat -m <模式> -a 0 hash.txt 字典',
    build: () => `hashcat -m 0 -a 0 hash.txt /usr/share/wordlists/rockyou.txt` },
  { id: 'msfconsole', name: 'Metasploit(参考)', group: '口令/利用(参考)', runOn: 'none', bin: 'msfconsole',
    params: [], help: '漏洞利用框架(交互式):msfconsole 后 use exploit/multi/handler',
    build: () => `msfconsole -q -x 'search cve; exit'` },
];

/* ================= 工具可用性(本机) ================= */
const BIN_CACHE: Record<string, boolean | null> = {};
const hasBin = (b: string) => {
  if (BIN_CACHE[b] !== undefined) return !!BIN_CACHE[b];
  try { const r = spawnSync('bash', ['-lc', `command -v ${b}`], { timeout: 6000 }); BIN_CACHE[b] = r.status === 0 && !!r.stdout.toString().trim(); }
  catch { BIN_CACHE[b] = false; }
  return !!BIN_CACHE[b];
};

const localIpv4 = () => {
  const out: string[] = [];
  try { for (const [name, addrs] of Object.entries(networkInterfaces())) for (const a of addrs || []) if (a.family === 'IPv4' && !a.internal && a.address !== '127.0.0.1') out.push(`${a.address} (${name})`); } catch {}
  return out;
};

const clean = (s: string) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\r/g, '').replace(/[ \t]+$/gm, '');
const cap = (s: string, n = 400000) => (s.length > n ? s.slice(0, n) + '\n...[输出过长已截断]' : s);

// 所有参数最终会进入受控 shell 命令。这里做统一的防注入校验，避免
// 仅依赖各工具 build 函数的单点防护。参数只允许可打印字符，拒绝 shell
// 元字符、控制字符和过长输入；数字参数另外做范围限制。
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._,:/+=@%\[\]{}-]{0,255}$/;
const NUM_LIMITS: Record<string, [number, number]> = {
  rate: [1, 1000000], level: [1, 5], max: [1, 3600],
};
function safeTarget(value: string, web = false) {
  const v = String(value || '').trim();
  if (!v || v.length > 2048 || /[\u0000-\u001f\u007f\s]/.test(v)) return false;
  if (v.startsWith('-')) return false;
  if (web) {
    try {
      const u = new URL(v.includes('://') ? v : `http://${v}`);
      return ['http:', 'https:'].includes(u.protocol) && !!u.hostname;
    } catch { return false; }
  }
  return SAFE_TOKEN.test(v);
}
function validateParams(tool: SecTool, input: any) {
  const out: Record<string, string> = {};
  for (const p of tool.params) {
    const raw = input?.[p.key];
    if (raw === undefined || raw === null || String(raw) === '') continue;
    const value = String(raw).trim();
    if (value.length > 256 || !SAFE_TOKEN.test(value)) throw new Error(`参数 ${p.label || p.key} 含有非法字符`);
    const lim = NUM_LIMITS[p.key];
    if (lim && (!/^\d+$/.test(value) || Number(value) < lim[0] || Number(value) > lim[1])) throw new Error(`参数 ${p.label || p.key} 超出允许范围`);
    if (p.key === 'ports') {
      const valid = /^\d+$/.test(value) ? Number(value) >= 1 && Number(value) <= 65535 : /^\d{1,5}-\d{1,5}$/.test(value);
      if (!valid) throw new Error('端口应为 1-65535 的数量或 start-end 范围');
      if (value.includes('-')) { const [a, b] = value.split('-').map(Number); if (a < 1 || b > 65535 || a > b) throw new Error('端口范围超出 1-65535'); }
    }
    if (p.key === 'range' && !/^\d{1,5}-\d{1,5}$/.test(value)) throw new Error('端口范围格式应为 start-end');
    if (p.key === 'mc' && !/^\d{3}(,\d{3})*$/.test(value)) throw new Error('状态码列表格式非法');
    out[p.key] = value;
  }
  return out;
}

export async function register(fastify: FastifyInstance) {
  fastify.get('/sec/tools', () => {
    const hosts = store.list<Host>('hosts').map((h) => ({ id: h.id, name: h.name, kind: h.kind, addr: h.kind === 'ssh' ? h.host : '127.0.0.1' }));
    return {
      note: '工具在本平台执行:扫描/Web 类由本机发起(目标自填),审计/基线类在所选主机上运行。danger 工具需勾选授权声明。',
      ips: localIpv4(),
      tools: SEC_TOOLS.map((t) => {
        const defParams: Record<string, string> = {};
        t.params.forEach((p) => { defParams[p.key] = p.def || ''; });
        return {
          id: t.id, name: t.name, group: t.group, runOn: t.runOn, danger: !!t.danger, dangerNote: t.dangerNote,
          needsTarget: !!t.needsTarget, params: t.params, help: t.help, available: t.bin ? hasBin(t.bin) : true, bin: t.bin,
          sample: t.runOn === 'none' ? t.build('', defParams) : undefined,
        };
      }),
      hosts,
    };
  });

  // 为首页提供轻量统计数据，前端可定时刷新并绘制趋势/健康度卡片。
  fastify.get('/sec/metrics', () => {
    const runs = store.list<any>('sec-runs');
    const tools = SEC_TOOLS.filter((t) => t.runOn !== 'none');
    const byGroup: Record<string, { total: number; available: number }> = {};
    for (const t of tools) {
      const g = (byGroup[t.group] ||= { total: 0, available: 0 });
      g.total += 1; if (!t.bin || hasBin(t.bin)) g.available += 1;
    }
    const recent = runs.slice(-100).reverse();
    return {
      generatedAt: new Date().toISOString(), total: tools.length,
      available: tools.filter((t) => !t.bin || hasBin(t.bin)).length,
      dangerous: tools.filter((t) => t.danger).length, byGroup,
      recent: recent.slice(0, 20).map(({ stdout, stderr, ...r }) => r),
      successRate: recent.length ? Math.round(recent.filter((r) => r.ok).length / recent.length * 100) : null,
    };
  });

  fastify.post('/sec/run', async (req, reply) => {
    const b = (req.body || {}) as any;
    const tool = SEC_TOOLS.find((t) => t.id === String(b.tool || ''));
    if (!tool) return reply.code(400).send({ error: '未知工具' });
    if (tool.runOn === 'none') return reply.code(400).send({ error: '该工具仅提供参考命令,不执行' });
    if (tool.bin && !hasBin(tool.bin)) return reply.code(400).send({ error: `本机缺少工具: ${tool.bin}(${tool.name}),请先 apt install ${tool.bin}` });
    if (tool.danger && b.ack !== 'yes') return reply.code(403).send({ error: '危险工具需授权声明(ack=yes)才可执行' });

    // 目标校验:危险工具的扫描目标建议为本机/自管主机
    const target = String(b.target || '').trim();
    if (tool.needsTarget && !target) return reply.code(400).send({ error: '请填写目标(IP/域名/CIDR 或 URL)' });
    if (tool.needsTarget && !safeTarget(target, tool.group === 'Web')) return reply.code(400).send({ error: '目标格式非法,仅支持 IP/域名/CIDR 或 http(s) URL' });

    const hostId = String(b.hostId || 'local');
    const hosts = store.list<Host>('hosts');
    const host = hosts.find((h) => h.id === hostId) || (hostId === 'local' ? { id: 'local', kind: 'local', name: '本机' } as Host : null);
    if (!host) return reply.code(404).send({ error: `主机不存在: ${hostId}` });

    let params: Record<string, string>;
    try { params = validateParams(tool, b.params || {}); } catch (e: any) { return reply.code(400).send({ error: e.message || '参数非法' }); }

    const cmd = tool.runOn === 'local' ? tool.build(shq(target), params) : tool.build('', params);
    const t0 = Date.now();
    try {
      const r = await run(host, cmd, tool.timeout ? Math.min(tool.timeout, 300) * 1000 : 90000);
      const result = {
        ok: r.code === 0, code: r.code, timeMs: Date.now() - t0, tool: tool.id,
        host: hostId === 'local' ? '本机' : host.name, command: cmd,
        stdout: cap(clean(r.stdout)), stderr: cap(clean(r.stderr), 80000),
      };
      const history = store.list<any>('sec-runs');
      history.push({ ok: result.ok, code: result.code, timeMs: result.timeMs, tool: result.tool, host: result.host, time: new Date().toISOString() });
      store.write('sec-runs', history.slice(-100));
      return result;
    } catch (e: any) {
      const result = { ok: false, code: -1, timeMs: Date.now() - t0, tool: tool.id, error: String(e?.message || e) };
      const history = store.list<any>('sec-runs'); history.push({ ok: false, code: -1, timeMs: result.timeMs, tool: result.tool, time: new Date().toISOString() }); store.write('sec-runs', history.slice(-100));
      return result;
    }
  });
}
