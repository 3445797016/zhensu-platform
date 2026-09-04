// 算法题库路由：读取 ops-hub/problems/ 下的可扩展静态资源（index.json + <id>.md）。
// 所有路径基于本模块位置推导（运行时相对解析），项目整体迁移后依然可用，不依赖任何绝对路径。
import type { FastifyInstance } from 'fastify';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, basename, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROBLEMS_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'problems');
const SPLIT = '<!-- @题解 -->'; // 题解分隔标记：之前是题目描述，之后是题解（前端默认隐藏）

function readIndex(): any[] {
  const p = join(PROBLEMS_ROOT, 'index.json');
  if (!existsSync(p)) return [];
  try { return JSON.parse(readFileSync(p, 'utf-8')).problems || []; } catch { return []; }
}

// 递归扫描 problems 目录找到 <id>.md（放哪层子目录都行，便于扩展）
function findMd(id: string): string | null {
  const walk = (dir: string): string | null => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      const st = statSync(p);
      if (st.isDirectory()) { const r = walk(p); if (r) return r; }
      else if (extname(e).toLowerCase() === '.md' && basename(e, '.md') === id) return p;
    }
    return null;
  };
  return walk(PROBLEMS_ROOT);
}

function splitContent(md: string): { statement: string; solution: string } {
  const idx = md.indexOf(SPLIT);
  if (idx < 0) return { statement: md, solution: '' };
  return { statement: md.slice(0, idx).trim(), solution: md.slice(idx + SPLIT.length).trim() };
}

export async function register(fastify: FastifyInstance) {
  // 题库列表（含按分类统计）
  fastify.get('/problems', async () => {
    const list = readIndex();
    const byCat: Record<string, number> = {};
    const byDiff: Record<string, number> = {};
    list.forEach((p) => {
      byCat[p.category] = (byCat[p.category] || 0) + 1;
      byDiff[p.difficulty] = (byDiff[p.difficulty] || 0) + 1;
    });
    return { name: '轸宿智汇平台 · 算法题库', total: list.length, byCategory: byCat, byDifficulty: byDiff, problems: list };
  });

  // 单题详情：题目描述与题解分开返回（题解是否展示由前端决定）
  fastify.get('/problems/:id', async (req, reply) => {
    const id = String((req.params as any).id || '');
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return reply.code(400).send({ error: '非法题目 id' });
    const meta = readIndex().find((p) => p.id === id);
    const file = findMd(id);
    if (!meta && !file) return reply.code(404).send({ error: `题目不存在: ${id}` });
    if (!file) return reply.code(404).send({ error: `题目内容缺失(缺 ${id}.md),请在 problems/ 下补充` });
    const { statement, solution } = splitContent(readFileSync(file, 'utf-8'));
    if (!meta) {
      return {
        meta: { id, title: id, category: '未分类', difficulty: '', langs: ['cpp', 'python'] },
        path: relative(PROBLEMS_ROOT, file),
        statement, solution,
        warn: '该题目未登记在 index.json,请在 problems/index.json 的 problems 数组追加记录',
      };
    }
    return { meta, path: relative(PROBLEMS_ROOT, file), statement, solution };
  });
}
