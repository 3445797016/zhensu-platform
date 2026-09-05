// 网站管理(nginx 虚拟主机):站点 CRUD + nginx 配置下发/回读 + 自签 SSL。
// 说明:需目标主机已装 nginx(支持 /etc/nginx 或宝塔 /www/server/nginx);仅管理 zhensu-* 前缀配置,不影响其它站点。
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { store } from '../lib/store.js';
import { Host, run } from '../lib/host.js';
import { audit } from '../lib/audit.js';

const shq = (s: string) => "'" + String(s).replace(/'/g, `'\\''`) + "'";
const KEY = 'sites';

const hostOf = (id: string): Host | null => store.list<Host>('hosts').find((h) => h.id === id) || (id === 'local' ? { id: 'local', kind: 'local', name: '本机' } as Host : null);
const sites = () => store.list<any>(KEY);

function detectNginx(host: Host): Promise<any> {
  return run(host, [
    'echo "BIN=$(command -v nginx || true)"',
    'echo "VER=$(nginx -v 2>&1 | head -1)"',
    'for d in /etc/nginx/conf.d /www/server/nginx/conf/vhost /usr/local/nginx/conf/conf.d; do [ -d "$d" ] && echo "DIR=$d"; done',
    'echo "NGX=$(pgrep -x nginx | head -1)"',
    'echo "ERR=$(nginx -t 2>&1 | tail -2 | tr "\\n" ";")"',
  ].join('\n'), 25000);
}

export function renderNginx(s: any): string {
  const { domains = [], root = '/www/wwwroot/' + s.id, proxy_pass = '', ssl = false, certPath = '', keyPath = '', extra = '', index = 'index.html index.htm' } = s;
  const serverNames = (domains.length ? domains : ['_']).join(' ');
  const lines: string[] = [`# zhensu-site:${s.id} (轸宿智汇生成,勿手改)`, 'server {'];
  if (ssl && certPath && keyPath) lines.push('  listen 443 ssl;', `  ssl_certificate ${certPath};`, `  ssl_certificate_key ${keyPath};`);
  else lines.push('  listen 80;');
  lines.push(`  server_name ${serverNames};`);
  if (proxy_pass) {
    lines.push(`  location / { proxy_pass ${proxy_pass}; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; }`);
  } else {
    lines.push(`  root ${root};`, `  index ${index};`, '  location / { try_files $uri $uri/ =404; }', `  location ~ /\\. { deny all; }`);
  }
  if (extra) lines.push(extra);
  lines.push('}', '');
  return lines.join('\n');
}

async function confDirOf(host: Host): Promise<string | null> {
  const r = await detectNginx(host);
  const m = r.stdout.match(/DIR=(.+)/);
  return m ? m[1].trim() : null;
}

async function writeConf(host: Host, s: any): Promise<{ ok: boolean; error?: string }> {
  const dir = await confDirOf(host);
  if (!dir) return { ok: false, error: '目标主机未检测到 nginx 配置目录(需安装 nginx)' };
  const file = `${dir}/zhensu-${s.id}.conf`;
  const conf = s.enabled === false ? `# disabled ${s.id}\n` : renderNginx(s);
  if (host.kind === 'local') {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(file, conf);
  } else {
    const b64 = Buffer.from(conf).toString('base64');
    const r = await run(host, `echo '${b64}' | base64 -d > ${shq(file)}`, 30000);
    if (r.code !== 0) return { ok: false, error: r.stderr };
  }
  const t = await run(host, 'nginx -t 2>&1', 20000);
  if (t.code !== 0) return { ok: false, error: `nginx -t 失败(配置已写入但未生效): ${t.stdout} ${t.stderr}` };
  await run(host, '(systemctl start nginx 2>/dev/null; systemctl reload nginx 2>/dev/null || nginx -s reload 2>/dev/null || kill -HUP $(pgrep -x nginx | head -1)) ; true', 20000);
  return { ok: true };
}

export async function register(fastify: FastifyInstance) {
  fastify.get('/websites', async () => {
    const host = hostOf('local')!;
    const d = await detectNginx(host);
    return {
      nginx: {
        present: !!d.stdout.match(/BIN=\S+/), version: (d.stdout.match(/VER=(.+)/) || [])[1] || '', running: !!d.stdout.match(/NGX=\d+/),
        confDirs: [...d.stdout.matchAll(/DIR=(.+)/g)].map((m) => m[1]),
        err: (d.stdout.match(/ERR=(.+)/) || [])[1] || '',
      },
      sites: sites(),
    };
  });

  fastify.post('/websites', async (req, reply) => {
    const s = (req.body || {}) as any;
    if (!s.name) return reply.code(400).send({ error: '缺少站点名' });
    const site = {
      id: randomUUID().slice(0, 8), name: s.name, domains: Array.isArray(s.domains) ? s.domains.map((d: string) => d.trim()).filter(Boolean) : String(s.domains || '').split(/[,\s]+/).filter(Boolean),
      type: s.proxy_pass ? 'proxy' : 'static', root: s.root || '', proxy_pass: s.proxy_pass || '', ssl: false, certPath: '', keyPath: '',
      extra: s.extra || '', enabled: true, created: new Date().toISOString(), host: 'local',
    };
    if (!site.root && !site.proxy_pass) site.root = '/www/wwwroot/' + site.id;
    store.upsert(KEY, site);
    const w = await writeConf(hostOf('local')!, site);
    audit('site.create', site.name, `domains=${site.domains.join(',')} ${w.ok ? '已写入nginx' : w.error}`);
    return { ok: true, site, conf: w };
  });

  fastify.put('/websites/:id', async (req, reply) => {
    const id = String((req.params as any).id); const b = (req.body || {}) as any;
    const list = sites(); const old = list.find((s) => s.id === id);
    if (!old) return reply.code(404).send({ error: '站点不存在' });
    const upd = { ...old, ...b, id };
    store.write(KEY, list.map((s) => (s.id === id ? upd : s)));
    const w = await writeConf(hostOf('local')!, upd);
    audit('site.update', upd.name);
    return { ok: true, site: upd, conf: w };
  });

  fastify.delete('/websites/:id', async (req, reply) => {
    const id = String((req.params as any).id);
    const host = hostOf('local')!;
    store.write(KEY, sites().filter((s) => s.id !== id));
    if (await confDirOf(host)) await run(host, `rm -f ${shq((await confDirOf(host))! + '/zhensu-' + id + '.conf')}`, 20000);
    audit('site.delete', id);
    return { ok: true };
  });

  // 自签 SSL(需本机 openssl)
  fastify.post('/websites/:id/ssl', async (req, reply) => {
    const id = String((req.params as any).id);
    const list = sites(); const s = list.find((x) => x.id === id);
    if (!s) return reply.code(404).send({ error: '站点不存在' });
    const host = hostOf('local')!;
    const base = '/etc/nginx/ssl/zhensu-' + id;
    const r = await run(host, `mkdir -p ${base} && openssl req -x509 -newkey rsa:2048 -nodes -days 365 -keyout ${base}/privkey.pem -out ${base}/cert.pem -subj ${shq('/CN=' + (s.domains[0] || s.name))} 2>&1`, 60000);
    if (r.code !== 0) return reply.code(500).send({ error: r.stdout + r.stderr });
    s.ssl = true; s.certPath = base + '/cert.pem'; s.keyPath = base + '/privkey.pem';
    store.write(KEY, list.map((x) => (x.id === id ? s : x)));
    const w = await writeConf(host, s);
    audit('site.ssl', s.name, '自签证书已生成');
    return { ok: true, conf: w };
  });
}
