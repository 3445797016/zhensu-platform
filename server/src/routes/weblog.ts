// 网站访问日志统计:tail 读取 nginx/apache access 日志(最近 N 行),聚合 Top IP/状态码/URL/UA 等。
import type { FastifyInstance } from 'fastify';
import { store } from '../lib/store.js';
import { Host, run } from '../lib/host.js';

const hostOf = (id: string): Host | null => store.list<Host>('hosts').find((h) => h.id === id) || (id === 'local' ? { id: 'local', kind: 'local', name: '本机' } as Host : null);
const shq = (s: string) => "'" + String(s).replace(/'/g, `'\\''`) + "'";
// combined 格式(nginx/apache):ip - - [ts] "METHOD path proto" status size "ref" "ua"
const RE = /^(\S+) \S+ \S+ \[([^\]]+)\] "([A-Z]+) (\S+)[^"]*" (\d{3}) (\d+|-) "([^"]*)" "([^"]*)"/;

export async function register(fastify: FastifyInstance) {
  fastify.get('/weblog/stat', async (req, reply) => {
    const q = req.query as any;
    const host = hostOf(String(q.host || 'local'));
    const path = String(q.path || '').trim();
    const lines = Math.min(Number(q.lines) || 50000, 200000);
    if (!host) return reply.code(404).send({ error: '主机不存在' });
    if (!path) return reply.code(400).send({ error: '请填写日志文件路径(如 /var/log/nginx/access.log)' });
    try {
      const r = await run(host, `tail -n ${lines} ${shq(path)} 2>&1`, 50000);
      const raw = r.code === 0 ? r.stdout : (r.stderr || '');
      const top = (mp: Map<string, number>, n: number) => [...mp.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
      const ip = new Map<string, number>(), pathMap = new Map<string, number>(), ua = new Map<string, number>(), st = new Map<string, number>();
      let ok = 0, err4 = 0, err5 = 0, total = 0;
      for (const l of raw.split('\n')) {
        const m = l.match(RE); if (!m) continue;
        total++;
        ip.set(m[1], (ip.get(m[1]) || 0) + 1);
        pathMap.set(m[4], (pathMap.get(m[4]) || 0) + 1);
        ua.set(m[8] || '-', (ua.get(m[8] || '-') || 0) + 1);
        st.set(m[5], (st.get(m[5]) || 0) + 1);
        if (+m[5] < 400) ok++; else if (+m[5] < 500) err4++; else err5++;
      }
      return { file: path, total, ok, err4, err5, topIps: top(ip, 15), topPaths: top(pathMap, 15), topUa: top(ua, 10), status: top(st, 10) };
    } catch (e: any) { return reply.code(500).send({ error: String(e?.message || e) }); }
  });
}
