// 操作审计:全站写操作留痕(环形 2000 条,JSON 落盘)。
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DATA_DIR } from './store.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export interface Audit { id: string; time: string; action: string; target: string; detail: string; user: string; }

const FILE = join(DATA_DIR, 'audit.json');
let buf: Audit[] = [];
try { if (existsSync(FILE)) buf = JSON.parse(readFileSync(FILE, 'utf-8')); } catch { buf = []; }

function flush() { try { writeFileSync(FILE, JSON.stringify(buf.slice(-2000)), 'utf-8'); } catch { /* ignore */ } }

export function audit(action: string, target = '', detail = '', user = 'web') {
  buf.push({ id: randomUUID(), time: new Date().toISOString(), action, target, detail: String(detail || '').slice(0, 2000), user });
  flush();
}
export function listAudit(limit = 300, kw = '', action = '') {
  let list = buf.slice().reverse();
  if (action) list = list.filter((a) => a.action === action);
  if (kw) { const k = kw.toLowerCase(); list = list.filter((a) => (a.target + a.detail + a.action).toLowerCase().includes(k)); }
  return list.slice(0, limit);
}
export const auditStat = () => ({ total: buf.length, last: buf.length ? buf[buf.length - 1].time : null });
