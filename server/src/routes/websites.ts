// 网站管理(nginx 虚拟主机):站点 CRUD + 高级功能(负载均衡/防盗链/静态缓存/gzip/限流/强制HTTPS/SSL) + 配置下发。
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

// 站点高级功能默认值
export function featsDefault(): any {
  return {
    lb: { enabled: false, method: 'round_robin', backends: [] },
    hotlink: { enabled: false, allow: '', types: 'jpg|jpeg|png|gif|webp|bmp', action: '403', target: '' },
    cache: { enabled: false, expires: '7d', types: 'js|css|jpg|jpeg|png|gif|svg|woff2|ttf|ico' },
    gzip: false, bodySize: '', httpsRedirect: false,
    rateLimit: { enabled: false, rate: '5r/s', burst: 10 },
  };
}

export function renderNginx(s: any): string {
  const { id = 'x', domains = [], root = '/www/wwwroot/' + s.id, proxy_pass = '', ssl = false, certPath = '', keyPath = '', index = 'index.html index.htm', extra = '' } = s;
  const f = s.feats || {};
  const lb = f.lb || {}; const hot = f.hotlink || {}; const cache = f.cache || {}; const rl = f.rateLimit || {};
  const serverNames = (domains.length ? domains : ['_']).join(' ');
  const out: string[] = [`# zhensu-site:${id} (轸宿智汇生成,勿手改)`, ''];
  const upName = `zhensu_${id}_up`;
  const useLb = !!lb.enabled && Array.isArray(lb.backends) && lb.backends.filter((x: any) => String(x || '').trim()).length > 0;
  const hasSsl = ssl && certPath && keyPath;

  // 顶层块(conf.d 位于 http{} 内,可放 upstream / limit_req_zone)
  if (useLb) {
    out.push(`upstream ${upName} {`);
    if (lb.method === 'least_conn') out.push('  least_conn;');
    if (lb.method === 'ip_hash') out.push('  ip_hash;');
    for (const b of lb.backends) { const t = String(b || '').trim(); if (t) out.push(`  server ${t.replace(/^https?:\/\//i, '')};`); }
    out.push('}', '');
  }
  if (rl.enabled) out.push(`limit_req_zone $binary_remote_addr zone=zhensu_${id}_rl:10m rate=${rl.rate || '5r/s'};`, '');

  const mkServer = (listens: string[], body: string[], name = serverNames): string[] =>
    ['server {', `  listen ${listens.join('; listen ')};`, `  server_name ${name};`, ...body, '}', ''];

  const body: string[] = [];
  if (hasSsl) body.push(`  ssl_certificate ${certPath};`, `  ssl_certificate_key ${keyPath};`);
  if (f.bodySize) body.push(`  client_max_body_size ${f.bodySize};`);
  if (f.gzip) body.push('  gzip on;', '  gzip_comp_level 5;', '  gzip_min_length 1k;', '  gzip_vary on;', '  gzip_types text/plain text/css application/json application/javascript application/xml application/xml+rss text/javascript image/svg+xml;');
  if (root) body.push(`  root ${root};`);
  if (index) body.push(`  index ${index};`);

  const rlLine = rl.enabled ? `    limit_req zone=zhensu_${id}_rl burst=${rl.burst || 10} nodelay;` : '';
  if (useLb || proxy_pass) {
    const target = useLb ? `http://${upName}` : proxy_pass;
    body.push(`  location / { proxy_pass ${target}; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; proxy_connect_timeout 5s; proxy_read_timeout 60s;${rlLine ? '\n' + rlLine : ''} }`);
  } else {
    body.push(`  location / { try_files $uri $uri/ =404;${rlLine ? '\n' + rlLine : ''} }`, `  location ~ /\\. { deny all; }`);
  }

  // 防盗链 + 静态缓存:合并为同一正则 assets location,避免多个正则互抢
  const hotTypes = String(hot.types || '').split('|').map((t: string) => t.trim()).filter(Boolean);
  const cacheTypes = String(cache.types || '').split('|').map((t: string) => t.trim()).filter(Boolean);
  const assetTypes = [...new Set([...hotTypes, ...cacheTypes])];
  if ((hot.enabled && hotTypes.length) || (cache.enabled && cacheTypes.length)) {
    const ab: string[] = [`  location ~* \\.(${assetTypes.join('|')})$ {`];
    if (hot.enabled && hotTypes.length) {
      const allows = hot.allow ? String(hot.allow).split(/[,\s]+/).filter(Boolean) : [];
      ab.push(`    valid_referers none blocked server_names${allows.length ? ' ' + allows.join(' ') : ''};`);
      const act = hot.action === '404' ? 'return 404;' : hot.action === 'redirect' && hot.target ? `return 302 ${hot.target};` : 'return 403;';
      ab.push(`    if ($invalid_referer) { ${act} }`);
    }
    if (cache.enabled) { ab.push(`    expires ${cache.expires || '7d'};`, `    add_header Cache-Control "public";`); }
    ab.push('  }');
    body.push(...ab);
  }

  if (extra) body.push(extra);

  if (hasSsl && f.httpsRedirect) {
    out.push(...mkServer(['80'], ['  return 301 https://$host$request_uri;']));
    out.push(...mkServer(['443 ssl'], body));
  } else {
    out.push(...mkServer(hasSsl ? ['80', '443 ssl'] : ['80'], body));
  }
  return out.join('\n');
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
  const withConf = (list: any[]) => list.map((s) => ({ ...s, conf: s.enabled === false ? '# disabled\n' : renderNginx(s) }));

  fastify.get('/websites', async () => {
    const host = hostOf('local')!;
    const d = await detectNginx(host);
    return {
      nginx: {
        present: !!d.stdout.match(/BIN=\S+/), version: (d.stdout.match(/VER=(.+)/) || [])[1] || '', running: !!d.stdout.match(/NGX=\d+/),
        confDirs: [...d.stdout.matchAll(/DIR=(.+)/g)].map((m) => m[1]),
        err: (d.stdout.match(/ERR=(.+)/) || [])[1] || '',
      },
      sites: withConf(sites()),
    };
  });

  fastify.post('/websites', async (req, reply) => {
    const s = (req.body || {}) as any;
    if (!s.name) return reply.code(400).send({ error: '缺少站点名' });
    const site = {
      id: randomUUID().slice(0, 8), name: s.name, domains: Array.isArray(s.domains) ? s.domains.map((d: string) => d.trim()).filter(Boolean) : String(s.domains || '').split(/[,\s]+/).filter(Boolean),
      type: s.proxy_pass ? 'proxy' : 'static', root: s.root || '', proxy_pass: s.proxy_pass || '', ssl: false, certPath: '', keyPath: '',
      extra: s.extra || '', feats: { ...featsDefault(), ...(s.feats || {}) }, enabled: true, created: new Date().toISOString(), host: 'local',
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
    const upd = { ...old, ...b, id, feats: { ...featsDefault(), ...(old.feats || {}), ...(b.feats || {}) } };
    if (!Array.isArray(upd.domains)) upd.domains = String(upd.domains || '').split(/[,\s]+/).filter(Boolean);
    store.write(KEY, list.map((s) => (s.id === id ? upd : s)));
    const w = await writeConf(hostOf('local')!, upd);
    audit('site.update', upd.name, w.ok ? '已写入nginx' : (w.error || ''));
    return { ok: true, site: upd, conf: w };
  });

  fastify.delete('/websites/:id', async (req, reply) => {
    const id = String((req.params as any).id);
    const host = hostOf('local')!;
    store.write(KEY, sites().filter((s) => s.id !== id));
    const dir = await confDirOf(host);
    if (dir) await run(host, `rm -f ${shq(dir + '/zhensu-' + id + '.conf')}`, 20000);
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
