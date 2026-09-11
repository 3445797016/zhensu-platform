// 凭据 at-rest 加密:AES-256-GCM,主密钥存 data/.masterkey(0600, 不入库)。
// 密文前缀 enc:v1:iv:tag:ct;读路径统一走 dec()(兼容明文旧数据)。
// 危险操作(加密迁移/解密回退)提供函数但仅在服务启动/管理端调用。
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { store, DATA_DIR } from './store.js';

const KEY_FILE = join(DATA_DIR, '.masterkey');
const PREFIX = 'enc:v1:';

export function masterKey(): Buffer {
  if (existsSync(KEY_FILE)) {
    try { return Buffer.from(readFileSync(KEY_FILE, 'utf8').trim(), 'base64'); } catch { /* 重建 */ }
  }
  const k = randomBytes(32);
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(KEY_FILE, k.toString('base64'), { mode: 0o600 });
  try { chmodSync(KEY_FILE, 0o600); } catch { /* ignore */ }
  return k;
}

export function enc(s: string | undefined | null): string | undefined {
  if (s === undefined || s === null || s === '') return s ?? undefined;
  if (s.startsWith(PREFIX)) return s; // 已是密文
  const key = masterKey(); const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(String(s), 'utf8'), c.final()]);
  return PREFIX + iv.toString('base64') + ':' + c.getAuthTag().toString('base64') + ':' + ct.toString('base64');
}

export function dec(s: string | undefined | null): string {
  if (!s) return '';
  if (!s.startsWith(PREFIX)) return s; // 明文旧数据
  try {
    const key = masterKey();
    const [ivB, tagB, ctB] = s.slice(PREFIX.length).split(':');
    const d = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB, 'base64'));
    d.setAuthTag(Buffer.from(tagB, 'base64'));
    return Buffer.concat([d.update(Buffer.from(ctB, 'base64')), d.final()]).toString('utf8');
  } catch { return ''; } // 密钥丢失/损坏 → 返回空,避免服务崩溃
}

const MAP: Array<{ ns: string; isObj: boolean; fields: string[]; nested?: boolean }> = [
  { ns: 'hosts', isObj: false, fields: ['password', 'privateKey'] },
  { ns: 'dbconns', isObj: false, fields: ['password'] },
];
function encObj(o: any, fields: string[], nested = false) {
  if (!o || typeof o !== 'object') return;
  if (nested) {
    for (const v of Object.values(o)) encObj(v, fields, false);
    return;
  }
  for (const f of fields) if (o[f]) o[f] = enc(o[f]);
}

// 把现有明文凭据原地加密(幂等:已加密跳过)。启动时调用一次。
export function encryptAll() {
  for (const m of MAP) {
    const items = m.isObj ? [store.read(m.ns, {})] : store.list<any>(m.ns);
    let changed = false;
    for (const it of items) {
      const before = JSON.stringify(it);
      encObj(it, m.fields);
      if (JSON.stringify(it) !== before) changed = true;
    }
    if (changed) m.isObj ? store.write(m.ns, items[0]) : store.write(m.ns, items);
  }
  // ai:providers[*].apiKey
  try {
    const ai = store.read<any>('ai', {});
    let changed = false;
    for (const ov of Object.values(ai.providers || {})) { const o = ov as any; if (o?.apiKey) { const n = enc(o.apiKey); if (n !== o.apiKey) { o.apiKey = n; changed = true; } } }
    if (changed) store.write('ai', ai);
  } catch { /* ignore */ }
  // apikey: key
  try {
    const k = store.read<any>('apikey', {});
    if (k?.key) { const n = enc(k.key); if (n !== k.key) { k.key = n; store.write('apikey', k); } }
  } catch { /* ignore */ }
  // 通知渠道 email 密码
  try {
    const n = store.read<any>('notify', {}); let ch = false;
    for (const c of n.channels || []) if (c?.password) { const x = enc(c.password); if (x !== c.password) { c.password = x; ch = true; } }
    if (ch) store.write('notify', n);
  } catch { /* ignore */ }
}

// 解密回退(管理端手动调用):把密文恢复为明文
export function decryptAll() {
  for (const m of MAP) {
    const items = m.isObj ? [store.read(m.ns, {})] : store.list<any>(m.ns);
    let changed = false;
    for (const it of items) { for (const f of m.fields) if (it?.[f] && String(it[f]).startsWith(PREFIX)) { it[f] = dec(it[f]); changed = true; } }
    if (changed) m.isObj ? store.write(m.ns, items[0]) : store.write(m.ns, items);
  }
  try { const ai = store.read<any>('ai', {}); let ch = false; for (const ov of Object.values(ai.providers || {})) { const o = ov as any; if (o?.apiKey && String(o.apiKey).startsWith(PREFIX)) { o.apiKey = dec(o.apiKey); ch = true; } } if (ch) store.write('ai', ai); } catch { /* ignore */ }
  try { const k = store.read<any>('apikey', {}); if (k?.key && String(k.key).startsWith(PREFIX)) { k.key = dec(k.key); store.write('apikey', k); } } catch { /* ignore */ }
  try { const n = store.read<any>('notify', {}); let ch = false; for (const c of n.channels || []) if (c?.password && String(c.password).startsWith(PREFIX)) { c.password = dec(c.password); ch = true; } if (ch) store.write('notify', n); } catch { /* ignore */ }
}
