// Jupyter-like Notebook: 多单元格交互式编程,持久化 Python 解释器会话
import type { FastifyInstance } from 'fastify';
import { spawn, execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { store } from '../lib/store.js';

const NS = 'notebooks';

interface NotebookCell { id: string; code: string; output: string; error: string; time: string; }
interface Notebook { id: string; name: string; kernel: string; cells: NotebookCell[]; created: string; updated: string; pid: number | null; }

// 所有保存的 notebook 元数据
function listNotes(): Notebook[] {
  const raw = store.read<any[]>(NS, []);
  return raw.map((n: any) => {
    // 检查 kernel 进程是否还活着
    if (n.pid && !existsSync(`/proc/${n.pid}`)) n.pid = null;
    return n;
  });
}
function saveNotes(arr: Notebook[]) { store.write(NS, arr); }

// 使用 Python 子进程作为持久化 kernel: 通过 stdio JSON 通信
function startKernel(): { proc: any; tmp: string } | null {
  try {
    // 创建临时目录用于 kernel 工作
    const tmp = execSync('mktemp -d /tmp/opshub-nb-XXXXXX', { encoding: 'utf8', timeout: 5000 }).trim();
    // 启动 Python REPL 包装器
    const script = `
import sys, json, traceback, io
_ns = {}
while True:
    line = sys.stdin.readline()
    if not line:
        break
    try:
        req = json.loads(line)
        code = req.get('code', '')
        if code.strip() == '__EXIT__':
            break
        # 重定向 stdout/stderr,用户 code 和 eval 都在重定向内完成
        old_out, old_err = sys.stdout, sys.stderr
        sys.stdout, sys.stderr = io.StringIO(), io.StringIO()
        try:
            exec(code, _ns)
            out = ''
            # 最后一个表达式值(类似 IPython)
            try:
                import ast
                tree = ast.parse(code)
                if tree.body and isinstance(tree.body[-1], ast.Expr):
                    val = eval(compile(ast.Expression(tree.body[-1].value), '<input>', 'eval'), _ns)
                    if val is not None:
                        out = repr(val)
            except:
                pass
            captured = sys.stdout.getvalue()
            captured_err = sys.stderr.getvalue()
            sys.stdout, sys.stderr = old_out, old_err
            sys.stdout.write(json.dumps({'ok': True, 'output': captured + out, 'stderr': captured_err}) + '\\n')
            sys.stdout.flush()
        except Exception:
            captured = sys.stdout.getvalue()
            captured_err = sys.stderr.getvalue()
            err = traceback.format_exc()
            sys.stdout, sys.stderr = old_out, old_err
            sys.stdout.write(json.dumps({'ok': False, 'output': captured, 'stderr': err + captured_err}) + '\\n')
            sys.stdout.flush()
    except Exception as e:
        sys.stdout.write(json.dumps({'ok': False, 'output': '', 'stderr': str(e)}) + '\\n')
        sys.stdout.flush()
`;
    writeFileSync(`${tmp}/kernel.py`, script, 'utf-8');
    const proc = spawn('python3', [`${tmp}/kernel.py`], {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
      env: { ...process.env, PYTHONUNBUFFERED: '1', LC_ALL: 'C' },
    });
    // 返回值交给调用方以 notebook id 注册到全局 map
    return { proc, tmp };
  } catch (e) {
    return null;
  }
}

// 全局 kernel 进程管理
const kernels = new Map<string, { proc: any; tmp: string }>();

function execInKernel(kernelId: string, code: string): Promise<{ ok: boolean; output: string; stderr: string }> {
  return new Promise((resolve) => {
    const k = kernels.get(kernelId);
    if (!k) return resolve({ ok: false, output: '', stderr: 'kernel 已关闭' });
    const { proc } = k;
    let outBuf = '', errBuf = '';
    let done = false;

    const onData = (data: Buffer) => { outBuf += data.toString(); };
    const onErr = (data: Buffer) => { errBuf += data.toString(); };
    const onClose = () => { if (!done) { done = true; resolve({ ok: false, output: outBuf, stderr: errBuf || '进程退出' }); } };

    proc.stdout.on('data', onData);
    proc.stderr.on('data', onErr);
    proc.on('close', onClose);

    // 发送代码
    proc.stdin.write(JSON.stringify({ code }) + '\n');

    // 读取一行结果
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        proc.stdout.removeListener('data', onData);
        proc.stderr.removeListener('data', onErr);
        proc.removeListener('close', onClose);
        resolve({ ok: false, output: outBuf, stderr: '执行超时(15s)' });
      }
    }, 15000);

    // 等待换行符
    const lineReader = (data: Buffer) => {
      const str = data.toString();
      if (str.includes('\n')) {
        clearTimeout(timer);
        if (!done) {
          done = true;
          proc.stdout.removeListener('data', onData);
          proc.stderr.removeListener('data', onErr);
          proc.removeListener('close', onClose);
          const lines = str.split('\n');
          const jsonLine = lines[0];
          try {
            const r = JSON.parse(jsonLine);
            resolve(r);
          } catch {
            resolve({ ok: false, output: jsonLine, stderr: errBuf });
          }
        }
      }
    };
    proc.stdout.on('data', lineReader);
    // 清理
    setTimeout(() => { proc.stdout.removeListener('data', lineReader); }, 16000);
  });
}

function stopKernel(kernelId: string) {
  const k = kernels.get(kernelId);
  if (!k) return;
  const { proc, tmp } = k;
  try {
    proc.stdin.write(JSON.stringify({ code: '__EXIT__' }) + '\n');
    setTimeout(() => {
      try { execSync(`kill -9 ${proc.pid} 2>/dev/null; rm -rf ${tmp}`); } catch {}
    }, 1000);
  } catch {
    try { execSync(`kill -9 ${proc.pid} 2>/dev/null; rm -rf ${tmp}`); } catch {}
  }
  kernels.delete(kernelId);
}

export async function register(fastify: FastifyInstance) {
  // 列出所有 notebook
  fastify.get('/notebook', async () => {
    const notes = listNotes();
    return notes.map((n) => ({
      id: n.id, name: n.name, kernel: n.kernel,
      cells: n.cells.length,
      created: n.created, updated: n.updated,
      kernelAlive: n.pid ? existsSync(`/proc/${n.pid}`) : false,
    }));
  });

  // 创建 notebook
  fastify.post('/notebook', async (req) => {
    const body = req.body as any;
    const notes = listNotes();
    const nb: Notebook = {
      id: randomUUID(),
      name: body.name || `Notebook ${notes.length + 1}`,
      kernel: 'python3',
      cells: [{ id: randomUUID(), code: '', output: '', error: '', time: new Date().toISOString() }],
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      pid: null,
    };
    notes.push(nb);
    saveNotes(notes);
    return { ok: true, notebook: nb };
  });

  // 获取 notebook 详情（含全部 cells）
  fastify.get('/notebook/:id', async (req: any) => {
    const { id } = req.params;
    const notes = listNotes();
    const nb = notes.find(n => n.id === id);
    if (!nb) return { error: 'notebook 不存在' };
    return nb;
  });

  // 更新 notebook（名称、cells）
  fastify.put('/notebook/:id', async (req: any) => {
    const { id } = req.params;
    const body = req.body as any;
    const notes = listNotes();
    const nb = notes.find(n => n.id === id);
    if (!nb) return { error: 'notebook 不存在' };
    if (body.name) nb.name = body.name;
    if (body.cells) nb.cells = body.cells;
    nb.updated = new Date().toISOString();
    saveNotes(notes);
    return { ok: true };
  });

  // 删除 notebook
  fastify.delete('/notebook/:id', async (req: any) => {
    const { id } = req.params;
    stopKernel(id);
    const notes = listNotes().filter(n => n.id !== id);
    saveNotes(notes);
    return { ok: true };
  });

  // 启动 kernel
  fastify.post('/notebook/:id/start', async (req: any) => {
    const { id } = req.params;
    const notes = listNotes();
    const nb = notes.find(n => n.id === id);
    if (!nb) return { error: 'notebook 不存在' };
    if (kernels.has(id)) return { ok: true, msg: 'kernel 已在运行' };
    const k = startKernel();
    if (!k) return { ok: false, error: '启动 kernel 失败(python3 可用?)' };
    kernels.set(id, k);
    nb.pid = k.proc.pid;
    saveNotes(notes);
    return { ok: true, pid: k.proc.pid };
  });

  // 停止 kernel
  fastify.post('/notebook/:id/stop', async (req: any) => {
    const { id } = req.params;
    stopKernel(id);
    const notes = listNotes();
    const nb = notes.find(n => n.id === id);
    if (nb) { nb.pid = null; saveNotes(notes); }
    return { ok: true };
  });

  // 在 kernel 中执行代码
  fastify.post('/notebook/:id/exec', async (req: any) => {
    const { id } = req.params;
    const body = req.body as any;
    const code = String(body.code || '');

    // 如果 kernel 没启动,自动启动
    if (!kernels.has(id)) {
      const notes = listNotes();
      const nb = notes.find(n => n.id === id);
      if (!nb) return { error: 'notebook 不存在' };
      const k = startKernel();
      if (!k) return { ok: false, error: '启动 kernel 失败' };
      kernels.set(id, k);
      nb.pid = k.proc.pid;
      saveNotes(notes);
    }

    const result = await execInKernel(id, code);
    return result;
  });

  // kernel 状态
  fastify.get('/notebook/:id/kernel', async (req: any) => {
    const { id } = req.params;
    const k = kernels.get(id);
    const alive = k ? existsSync(`/proc/${k.proc.pid}`) : false;
    return { alive, pid: k?.proc?.pid || null };
  });

  // 清理所有 zombie kernel（启动时清理一次）
  fastify.post('/notebook/cleanup', async () => {
    for (const [id] of kernels) stopKernel(id);
    return { ok: true };
  });
}