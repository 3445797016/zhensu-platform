// 文件管理器:本机用 node fs 直操作,远程主机统一走 SSH shell(base64 传输),支持 ls/read/write/upload/mkdir/rm/mv/chmod/download。
import { readFileSync, writeFileSync, statSync, readdirSync, mkdirSync, rmSync, renameSync, chmodSync, existsSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { store } from '../lib/store.js';
import { Host, run } from '../lib/host.js';
import { audit } from '../lib/audit.js';

const shq = (s: string) => "'" + String(s).replace(/'/g, `'\\''`) + "'";
const hostOf = (id: string): Host | null => {
  const hosts = store.list<Host>('hosts');
  return hosts.find((h) => h.id === id) || (id === 'local' ? { id: 'local', kind: 'local', name: '本机' } as Host : null);
};

// 远程文件路径安全(禁空/含\\0)
const okPath = (p: string) => { if (!p || p.includes('\0')) throw new Error('非法路径'); return p; };

const MAX_TEXT = 256 * 1024;

export async function register(fastify: FastifyInstance) {
  fastify.get('/files/ls', async (req, reply) => {
    const q = req.query as any;
    const host = hostOf(String(q.host || 'local'));
    const path = okPath(String(q.path || '/'));
    if (!host) return reply.code(404).send({ error: '主机不存在' });
    try {
      if (host.kind === 'local') {
        const full = path === '/' ? '/' : path;
        if (!existsSync(full)) return reply.code(404).send({ error: `路径不存在: ${full}` });
        const entries = readdirSync(full).map((name) => {
          const p = join(full, name); let st: any = {};
          try { st = statSync(p, { throwIfNoEntry: false }) || {}; } catch { /* */ }
          return { name, type: st.isDirectory ? 'd' : st.isFile ? 'f' : 'l', size: st.size ?? 0, perm: st.mode ? (st.mode & 0o7777).toString(8) : '', mtime: st.mtime ? st.mtime.toISOString() : '', dir: st.isDirectory?.() };
        }).sort((a: any, b: any) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1)).map((e: any) => ({ name: e.name, type: e.type, size: e.size, perm: e.perm, mtime: e.mtime }));
        return { host: host.name, path: full, entries };
      }
      const cmd = `cd ${shq(path)} 2>/dev/null && find . -mindepth 1 -maxdepth 1 -printf '%P\\t%y\\t%s\\t%m\\t%TY-%Tm-%Td %TH:%TM\\n' 2>/dev/null | sort || echo ERR`;
      const r = await run(host, cmd, 30000);
      if (r.code !== 0) return reply.code(500).send({ error: r.stderr || '远程执行失败' });
      const entries = r.stdout.split('\n').filter(Boolean).map((l) => {
        const p = l.split('\t');
        if (p.length < 5) return null;
        return { name: p[0], type: p[1], size: parseInt(p[2]) || 0, perm: p[3], mtime: p[4] };
      }).filter(Boolean);
      return { host: host.name, path, entries };
    } catch (e: any) { return reply.code(500).send({ error: String(e?.message || e) }); }
  });

  // 读取文本(上限 MAX_TEXT)
  fastify.get('/files/read', async (req, reply) => {
    const q = req.query as any;
    const host = hostOf(String(q.host || 'local'));
    const path = okPath(String(q.path || ''));
    if (!host) return reply.code(404).send({ error: '主机不存在' });
    try {
      if (host.kind === 'local') {
        const st = statSync(path); const buf = readFileSync(path);
        const truncated = buf.length > MAX_TEXT;
        const content = buf.slice(0, MAX_TEXT).toString('utf-8');
        return { path, size: st.size, truncated, content, binary: buf.slice(0, 4096).includes(0) };
      }
      const cmd = `base64 -w0 < ${shq(path)} 2>/dev/null | head -c ${Math.ceil(MAX_TEXT / 3) * 4} ; echo; echo "SZ=$(stat -c %s ${shq(path)} 2>/dev/null)"`;
      const r = await run(host, cmd, 60000);
      const m = r.stdout.match(/SZ=(\d+)/);
      const b64 = r.stdout.replace(/SZ=\d+\s*$/, '');
      const buf = Buffer.from(b64.replace(/\s/g, ''), 'base64');
      const size = m ? parseInt(m[1]) : buf.length;
      return { path, size, truncated: size > buf.length, content: buf.toString('utf-8'), binary: buf.slice(0, 4096).includes(0) };
    } catch (e: any) { return reply.code(500).send({ error: String(e?.message || e) }); }
  });

  async function write(host: Host, path: string, content: string) {
    if (host.kind === 'local') { writeFileSync(path, content); return; }
    const b64 = Buffer.from(content, 'utf-8').toString('base64');
    for (let i = 0; i < b64.length; i += 60000) {
      const chunk = b64.slice(i, i + 60000);
      const r = await run(host, `echo '${chunk}' | base64 -d ${i ? '>>' : '>'} ${shq(path)}`, 60000);
      if (r.code !== 0) throw new Error(r.stderr || '写入失败');
    }
  }
  fastify.post('/files/write', async (req, reply) => {
    const b = req.body as any;
    const host = hostOf(String(b.host || 'local'));
    const path = okPath(String(b.path || ''));
    if (!host) return reply.code(404).send({ error: '主机不存在' });
    if (typeof b.content !== 'string' || b.content.length > 2 * 1024 * 1024) return reply.code(400).send({ error: '内容过大或非法' });
    try { await write(host, path, b.content); audit('file.write', path, `host=${host.name} ${b.content.length}B`); return { ok: true }; }
    catch (e: any) { return reply.code(500).send({ error: String(e?.message || e) }); }
  });

  // 上传:JSON base64(local 直写,remote 分块)
  fastify.post('/files/upload', async (req, reply) => {
    const b = req.body as any;
    const host = hostOf(String(b.host || 'local'));
    const path = okPath(String(b.path || ''));
    const data = String(b.data || '');
    if (!host) return reply.code(404).send({ error: '主机不存在' });
    if (!/^[A-Za-z0-9+/=]+$/.test(data)) return reply.code(400).send({ error: 'data 需为 base64' });
    const buf = Buffer.from(data, 'base64');
    if (buf.length > 50 * 1024 * 1024) return reply.code(400).send({ error: '文件过大(>50MB)' });
    try {
      if (host.kind === 'local') { writeFileSync(path, buf); }
      else {
        for (let i = 0; i < data.length; i += 60000) {
          const chunk = data.slice(i, i + 60000);
          const r = await run(host, `echo '${chunk}' | base64 -d ${i ? '>>' : '>'} ${shq(path)}`, 120000);
          if (r.code !== 0) throw new Error(r.stderr || '上传失败');
        }
      }
      audit('file.upload', path, `host=${host.name} ${buf.length}B`);
      return { ok: true, size: buf.length };
    } catch (e: any) { return reply.code(500).send({ error: String(e?.message || e) }); }
  });

  fastify.post('/files/mkdir', async (req, reply) => {
    const b = req.body as any; const host = hostOf(String(b.host || 'local'));
    const path = okPath(String(b.path || '')); if (!host) return reply.code(404).send({ error: '主机不存在' });
    try {
      if (host.kind === 'local') mkdirSync(path, { recursive: true });
      else { const r = await run(host, `mkdir -p ${shq(path)}`, 30000); if (r.code !== 0) throw new Error(r.stderr); }
      audit('file.mkdir', path); return { ok: true };
    } catch (e: any) { return reply.code(500).send({ error: String(e?.message || e) }); }
  });

  fastify.post('/files/rm', async (req, reply) => {
    const b = req.body as any; const host = hostOf(String(b.host || 'local'));
    const path = okPath(String(b.path || '')); if (!host) return reply.code(404).send({ error: '主机不存在' });
    if (path === '/' || path === '' || path === '/root' || path === '/home') return reply.code(403).send({ error: '禁止删除系统根/家目录' });
    try {
      if (host.kind === 'local') rmSync(path, { recursive: true, force: true });
      else { const r = await run(host, `rm -rf -- ${shq(path)}`, 30000); if (r.code !== 0) throw new Error(r.stderr); }
      audit('file.rm', path); return { ok: true };
    } catch (e: any) { return reply.code(500).send({ error: String(e?.message || e) }); }
  });

  fastify.post('/files/mv', async (req, reply) => {
    const b = req.body as any; const host = hostOf(String(b.host || 'local'));
    const from = okPath(String(b.from || '')); const to = okPath(String(b.to || ''));
    if (!host) return reply.code(404).send({ error: '主机不存在' });
    try {
      if (host.kind === 'local') renameSync(from, to);
      else { const r = await run(host, `mv -T -- ${shq(from)} ${shq(to)}`, 30000); if (r.code !== 0) throw new Error(r.stderr); }
      audit('file.mv', `${from} → ${to}`); return { ok: true };
    } catch (e: any) { return reply.code(500).send({ error: String(e?.message || e) }); }
  });

  fastify.post('/files/chmod', async (req, reply) => {
    const b = req.body as any; const host = hostOf(String(b.host || 'local'));
    const path = okPath(String(b.path || '')); const mode = String(b.mode || '');
    if (!host) return reply.code(404).send({ error: '主机不存在' });
    if (!/^[0-7]{3,4}$/.test(mode)) return reply.code(400).send({ error: 'mode 需为 3-4 位八进制' });
    try {
      if (host.kind === 'local') chmodSync(path, parseInt(mode, 8));
      else { const r = await run(host, `chmod ${mode} ${shq(path)}`, 30000); if (r.code !== 0) throw new Error(r.stderr); }
      audit('file.chmod', path, mode); return { ok: true };
    } catch (e: any) { return reply.code(500).send({ error: String(e?.message || e) }); }
  });

  // 下载:返回 base64(local 直读,remote 分块)
  fastify.get('/files/download', async (req, reply) => {
    const q = req.query as any;
    const host = hostOf(String(q.host || 'local'));
    const path = okPath(String(q.path || ''));
    if (!host) return reply.code(404).send({ error: '主机不存在' });
    try {
      let size = 0; let b64 = '';
      if (host.kind === 'local') { const st = statSync(path); size = st.size; if (size > 100 * 1024 * 1024) return reply.code(400).send({ error: '文件过大(>100MB),请使用其他方式' }); b64 = readFileSync(path).toString('base64'); }
      else {
        const r0 = await run(host, `stat -c %s ${shq(path)}`, 20000); size = parseInt(r0.stdout) || 0;
        if (size > 100 * 1024 * 1024) return reply.code(400).send({ error: '文件过大(>100MB)' });
        const b64chunks: string[] = [];
        for (let off = 0; off < size; off += 4000000) {
          const r = await run(host, `dd if=${shq(path)} bs=1 skip=${off} count=4000000 2>/dev/null | base64 -w0`, 60000);
          b64chunks.push(r.stdout.replace(/\s/g, ''));
        }
        b64 = b64chunks.join('');
      }
      return { name: basename(path), size, data: b64 };
    } catch (e: any) { return reply.code(500).send({ error: String(e?.message || e) }); }
  });
}
