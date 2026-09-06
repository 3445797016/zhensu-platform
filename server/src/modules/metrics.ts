// 指标历史:按天 JSONL 落盘(内存友好),供趋势回看;自动清理超期文件
import { appendFileSync, readFileSync, mkdirSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from '../lib/store.js';

const M_DIR = join(DATA_DIR, 'metrics');

export function ensureMetricsDir() {
  if (!existsSync(M_DIR)) mkdirSync(M_DIR, { recursive: true });
}

export interface Sample { hostId: string; hostName?: string; cpuPercent?: number; memPct?: number; diskMaxPct?: number; diskUse?: number; load1?: number; time?: string; error?: string; }

// 追加一个主机采样(跳过错误/无时间)
export function histAppend(m: Sample) {
  if (!m || m.error || !m.hostId || !m.time) return;
  const day = m.time.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
  const line = JSON.stringify({ t: Date.parse(m.time), h: m.hostId, c: Math.round(m.cpuPercent ?? -1), me: Math.round(m.memPct ?? -1), d: Math.round(m.diskMaxPct ?? m.diskUse ?? -1), l: m.load1 ?? -1 }) + '\n';
  try { appendFileSync(join(M_DIR, day + '.jsonl'), line, 'utf8'); } catch { /* ignore */ }
}

// 查询: 返回 {t, cpu, mem, disk, load} 数组
export function histQuery(hostId: string, fromMs: number, toMs: number, maxPoints = 720) {
  ensureMetricsDir();
  const files = readdirSync(M_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort();
  const pts: any[] = [];
  for (const f of files) {
    const d = f.slice(0, 10);
    if (Date.parse(d + 'T00:00:00Z') > toMs || Date.parse(d + 'T23:59:59Z') < fromMs) continue;
    try {
      for (const ln of readFileSync(join(M_DIR, f), 'utf8').split('\n')) {
        if (!ln) continue;
        try {
          const o = JSON.parse(ln);
          if (o.h !== hostId) continue;
          if (o.t < fromMs || o.t > toMs) continue;
          pts.push({ t: o.t, cpu: o.c, mem: o.me, disk: o.d, load: o.l });
        } catch { /* skip bad line */ }
      }
    } catch { /* ignore */ }
  }
  pts.sort((a, b) => a.t - b.t);
  // 抽稀到最多 maxPoints
  if (pts.length > maxPoints) {
    const step = Math.ceil(pts.length / maxPoints);
    return pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
  }
  return pts;
}

// 清理 N 天前的历史文件
export function pruneHistory(keepDays = 14) {
  ensureMetricsDir();
  const cutoff = Date.now() - keepDays * 86400e3;
  for (const f of readdirSync(M_DIR)) {
    if (!/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)) continue;
    if (Date.parse(f.slice(0, 10) + 'T00:00:00Z') < cutoff) {
      try { rmSync(join(M_DIR, f)); } catch { /* ignore */ }
    }
  }
}
