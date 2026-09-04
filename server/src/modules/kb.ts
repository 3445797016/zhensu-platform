// 本地 RAG 知识库：扫描目录(PDF/txt/md) -> 抽文本 -> 切块 -> 倒排索引 -> 检索。
// 检索用 英文词 + 中文二元组 打分（无需联网 embedding，离线可用）。
import { readdirSync, existsSync, mkdirSync, writeFileSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { join, basename, extname, relative, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { store } from '../lib/store.js';

const DATA = dirname(new URL(import.meta.url).pathname) + '/../data';
export const KB_META = join(DATA, 'kb-meta.json');
export const KB_CHUNKS = join(DATA, 'kb-chunks.json');

export function kbPath(): string { return store.read<any>('settings', {}).kbPath || '/home/kali/Desktop/knowledge'; }

interface Chunk { id: string; file: string; idx: number; text: string; }
let chunks: Chunk[] = [];
let inverted: Map<string, Map<number, number>> = new Map(); // token -> chunkIdx->tf
let job: { running: boolean; total: number; done: number; cur: string; error?: string; startedAt?: string; finishedAt?: string } = { running: false, total: 0, done: 0, cur: '' };

export function status() {
  return {
    path: kbPath(), job, fileCount: chunks.length ? new Set(chunks.map((c) => c.file)).size : 0,
    chunkCount: chunks.length, tokenCount: inverted.size,
    loaded: chunks.length > 0,
  };
}

// 中文二元组 + 英文单词分词
export function tokenize(s: string): string[] {
  const low = s.toLowerCase();
  const toks = new Set<string>();
  for (const m of low.matchAll(/[a-z0-9_]+/g)) toks.add(m[0]);
  const cjk = low.replace(/[^\u4e00-\u9fff]/g, ' ');
  for (let i = 0; i < cjk.length - 1; i++) { const a = cjk[i], b = cjk[i + 1]; if (a !== ' ' && b !== ' ') toks.add(a + b); }
  return [...toks];
}

function chunkText(text: string, file: string, size = 900, overlap = 120): Chunk[] {
  const out: Chunk[] = [];
  const clean = text.replace(/[ \t\r]+/g, ' ').replace(/\n{3,}/g, '\n\n');
  let i = 0, c = 0;
  while (i < clean.length) {
    const piece = clean.slice(i, i + size);
    if (piece.trim()) out.push({ id: `${file}#${c}`, file, idx: c, text: piece.trim() });
    i += size - overlap; c++;
  }
  return out;
}

function buildIndex() {
  inverted.clear();
  chunks.forEach((ch, idx) => {
    for (const t of tokenize(ch.text)) {
      let m = inverted.get(t); if (!m) { m = new Map(); inverted.set(t, m); }
      m.set(idx, (m.get(idx) || 0) + 1);
    }
  });
}

export function loadIndex() {
  if (!existsSync(KB_CHUNKS)) { chunks = []; inverted.clear(); return; }
  try { chunks = JSON.parse(readFileSync(KB_CHUNKS, 'utf-8')); buildIndex(); } catch { chunks = []; }
}

// 需要索引的文件
function scanFiles(): string[] {
  const root = kbPath();
  if (!existsSync(root)) return [];
  const exts = new Set(['.pdf', '.txt', '.md', '.mdx']);
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e); const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (exts.has(extname(p).toLowerCase())) out.push(p);
    }
  };
  walk(root);
  return out;
}

function extractText(file: string): string {
  const ext = extname(file).toLowerCase();
  if (ext === '.pdf') {
    mkdirSync(join(DATA, 'kbtext'), { recursive: true });
    const cache = join(DATA, 'kbtext', basename(file).replace(/[^\w\u4e00-\u9fff.-]+/g, '_') + '.txt');
    if (!existsSync(cache) || statSync(cache).size === 0) {
      const r = spawnSync('pdftotext', [file, cache], { timeout: 300000 });
      if (r.error || r.status !== 0 || !existsSync(cache)) return '';
    }
    try { return readFileSync(cache, 'utf-8'); } catch { return ''; }
  }
  try { return readFileSync(file, 'utf-8'); } catch { return ''; }
}

// 后台重建索引
export function rebuildAsync() {
  if (job.running) return;
  job = { running: true, total: 0, done: 0, cur: '', startedAt: new Date().toISOString() };
  void (async () => {
    const files = scanFiles();
    job.total = files.length;
    const all: Chunk[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i]; job.cur = basename(f); job.done = i + 1;
      const rel = relative(kbPath(), f);
      try { const text = extractText(f); if (text) all.push(...chunkText(text, rel)); } catch { /* skip */ }
    }
    chunks = all;
    try {
      mkdirSync(DATA, { recursive: true });
      writeFileSync(KB_CHUNKS, JSON.stringify(chunks), 'utf-8');
      writeFileSync(KB_META, JSON.stringify({ builtAt: new Date().toISOString(), files, chunks: chunks.length }), 'utf-8');
    } catch {}
    buildIndex();
    job.running = false; job.cur = ''; job.finishedAt = new Date().toISOString(); job.error = undefined;
  })();
}

export function search(q: string, top = 8): Array<{ id: string; file: string; text: string; score: number }> {
  const toks = tokenize(q);
  if (!toks.length) return [];
  const N = Math.max(1, chunks.length);
  const df = (t: string) => inverted.get(t)?.size || 0;
  const scores: { idx: number; s: number }[] = [];
  for (const t of toks) {
    const inv = inverted.get(t); if (!inv) continue;
    const idf = Math.log((N + 1) / (df(t) + 0.5));
    for (const [idx, tf] of inv) { scores[idx] = scores[idx] || { idx, s: 0 }; scores[idx].s += (1 + Math.log(tf)) * idf; }
  }
  return scores
    .filter((x) => x)
    .sort((a, b) => b.s - a.s)
    .slice(0, top)
    .map((x) => ({ id: chunks[x.idx].id, file: chunks[x.idx].file, text: chunks[x.idx].text, score: +x.s.toFixed(3) }));
}

// 文档分布
export function docs() {
  const map = new Map<string, number>();
  for (const c of chunks) map.set(c.file, (map.get(c.file) || 0) + 1);
  return [...map.entries()].map(([file, chunkCount]) => ({ file, chunkCount }));
}

// 启动时若已有索引则加载
try { loadIndex(); } catch {}
