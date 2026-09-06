// 把 monaco-editor 的 min/vs 拷贝到 public/monaco/vs,供运行时本地加载(离线可用)。
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, 'node_modules/monaco-editor/min/vs');
const dst = join(root, 'public/monaco/vs');
if (!existsSync(src)) { console.warn('[copy-monaco] node_modules 缺少 monaco-editor,跳过'); process.exit(0); }
mkdirSync(dirname(dst), { recursive: true });
cpSync(src, dst, { recursive: true, force: true });
console.log('[copy-monaco] → public/monaco/vs');
