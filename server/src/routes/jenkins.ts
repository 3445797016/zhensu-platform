// Jenkins 复刻引擎:在平台内实现 Jenkins 核心能力
// 构建任务(Job) + 构建历史(Build) + 工作区(Workspace) + 控制台日志 + 触发器(手动/轮询SCM/cron)
// + 参数化构建 + 中止构建 + 代码变更记录 + 构建后动作(Sonar 扫描/Nexus 制品)
import { randomUUID } from 'node:crypto';
import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { store, DATA_DIR } from '../lib/store.js';
import { repoPath } from './devops-ci.js';
import { audit } from '../lib/audit.js';
import { toolEnv } from '../modules/toolchain.js';

const JOBS = 'jenkins-jobs';
const BUILDS = 'jenkins-builds';
const WORKSPACE_DIR = join(DATA_DIR, 'workspaces');
mkdirSync(WORKSPACE_DIR, { recursive: true });

const q = (s: string) => "'" + String(s).replace(/'/g, `'\\''`) + "'";
const nowIso = () => new Date().toISOString();

// 运行中的构建:jobId -> { child, build, aborted }
const running = new Map<string, { child: any; build: any; aborted: boolean }>();

// 简单的 5 段 cron 匹配(分 时 日 月 周)
function fieldMatch(v: number, expr: string): boolean {
  for (const part of String(expr).split(',')) {
    const p = part.trim();
    if (p === '*') return true;
    if (p.includes('/')) {
      const [base, stepStr] = p.split('/');
      const step = Number(stepStr) || 1;
      if (base === '*') { if (v % step === 0) return true; }
      else if (base.includes('-')) { const [a, b] = base.split('-').map(Number); if (v >= a && v <= b && (v - a) % step === 0) return true; }
    } else if (p.includes('-')) {
      const [a, b] = p.split('-').map(Number);
      if (v >= a && v <= b) return true;
    } else if (/^\d+$/.test(p)) {
      if (Number(p) === v) return true;
    }
  }
  return false;
}
function cronMatch(expr: string, now: Date): boolean {
  const parts = String(expr || '').trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const checks = [
    [now.getMinutes(), parts[0]],
    [now.getHours(), parts[1]],
    [now.getDate(), parts[2]],
    [now.getMonth() + 1, parts[3]],
    [now.getDay(), parts[4]],
  ] as [number, string][];
  return checks.every(([v, e]) => fieldMatch(v, e));
}

// 参数替换:${NAME} -> 值;支持内建变量
function substitute(cmd: string, vars: Record<string, string>): string {
  let s = String(cmd || '');
  for (const k of Object.keys(vars)) s = s.split(`\${${k}}`).join(vars[k]);
  return s;
}

// 判断本地仓库是否有新提交(相对 job.lastHead)
function scmChanges(job: any): { newHead: string; changes: any[] } | null {
  if (!job.repo || job.repo === 'none') return { newHead: '', changes: [] };
  const bare = repoPath(job.repo);
  if (!existsSync(join(bare, 'HEAD'))) return null;
  const branch = job.branch || 'main';
  const g = `git --git-dir=${q(bare)}`;
  let newHead = '';
  try { newHead = String(execSync(`${g} rev-parse ${q(branch)}`, { encoding: 'utf-8' })).trim(); } catch { return null; }
  if (!newHead) return null;
  let changes: any[] = [];
  if (job.lastHead && job.lastHead !== newHead) {
    let log = '';
    try { log = String(execSync(`${g} log --format='%h%x09%an%x09%s' ${q(job.lastHead + '..' + newHead)}`, { encoding: 'utf-8' })); } catch { log = ''; }
    changes = String(log).trim().split('\n').filter(Boolean).map((l) => { const [h, a, ...m] = l.split('\t'); return { hash: h, author: a, message: m.join(' ') }; });
  }
  return { newHead, changes };
}

// 构造 SCM 拉取脚本(首次 clone,之后 fetch+reset)。脚本在 workspace 目录内执行,使用相对路径。
function scmScript(job: any): string {
  if (!job.repo || job.repo === 'none') return 'echo "[SCM] 无源码仓库,跳过拉取"';
  const source = job.remote || repoPath(job.repo);
  const branch = job.branch || 'main';
  return `
if [ -d ".git" ]; then
  echo "[SCM] 拉取更新 ${job.repo}@${branch}"
  git fetch -q --all --prune 2>/dev/null || true
else
  echo "[SCM] 首次克隆 ${source} -> 工作区"
  git clone -q "${source}" . 2>/dev/null || { git init -q . && git remote add origin "${source}" && git fetch -q origin 2>/dev/null || true; }
fi
git checkout -q -f "${branch}" 2>/dev/null || git checkout -q -b "${branch}" "origin/${branch}" 2>/dev/null || true
git reset -q --hard "origin/${branch}" 2>/dev/null || true
echo "[SCM] 当前提交: $(git rev-parse --short HEAD 2>/dev/null || echo 无)"
`;
}

// 执行一个步骤(stream 输出到 build.log),返回 {code, output}
function runStep(jobId: string, build: any, ws: string, name: string, cmd: string, timeoutMs: number): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const startedAt = nowIso();
    let output = '';
    const append = (s: string) => {
      output += s;
      build.log = (build.log || '') + s;
      if (build.log.length > 1024 * 1024) build.log = build.log.slice(-1024 * 1024);
    };
    append(`\n\u001b[1;36m[${name}]\u001b[0m $ ${cmd}\n`);
    let child: any;
    try {
      // 注入「构建工具配置」里手动指定的工具路径到 PATH/环境变量
      const tl = toolEnv(store.read<any>('build-tools', {}));
      const env: Record<string, string | undefined> = {
        ...process.env,
        ...Object.fromEntries(Object.entries(build.params || {}).map(([k, v]) => [k, String(v)])),
        BUILD_NUMBER: String(build.number), JOB_NAME: build.jobName, WORKSPACE: ws, BUILD_ID: build.id,
        ...tl.env,
      };
      if (tl.pathPrefix) env.PATH = tl.pathPrefix + ':' + (process.env.PATH || '');
      child = spawn('/bin/bash', ['-lc', cmd], { cwd: ws, env });
    } catch (e: any) {
      append(`\u001b[1;31m启动失败: ${e.message}\u001b[0m\n`);
      resolve({ code: 1, output });
      return;
    }
    const rec = running.get(jobId);
    if (rec) rec.child = child;
    child.stdout.on('data', (d: Buffer) => append(d.toString()));
    child.stderr.on('data', (d: Buffer) => append(d.toString()));
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* ignore */ } }, timeoutMs || 3600000);
    child.on('close', (code: number) => {
      clearTimeout(timer);
      const exitCode = code ?? 1;
      append(`\n\u001b[1;${exitCode === 0 ? '32' : '31'}m[${name}] 退出码 ${exitCode} · 用时 ${Date.now() - Date.parse(startedAt)}ms\u001b[0m\n`);
      resolve({ code: exitCode, output });
    });
    child.on('error', (e: any) => { clearTimeout(timer); append(`\u001b[1;31m进程错误: ${e.message}\u001b[0m\n`); resolve({ code: 1, output }); });
  });
}

// 并发构建队列:任务正在构建时,新触发的构建进入队列,FIFO 依次执行
const queue: Array<{ id: string; jobId: string; trigger: string; params: any; queuedAt: string }> = [];

function processQueue() {
  const idx = queue.findIndex((q) => !running.has(q.jobId));
  if (idx < 0) return;
  const item = queue.splice(idx, 1)[0];
  const job = store.get<any>(JOBS, item.jobId);
  if (job && job.enabled !== false) void startBuild(item.jobId, item.trigger, item.params);
  else processQueue();
}

// 构建完成后触发下游任务
function triggerDownstream(job: any, build: any) {
  const down = Array.isArray(job.postBuild?.downstream) ? job.postBuild.downstream : [];
  if (!down.length) return;
  const cond = job.postBuild?.downstreamCondition || 'success';
  const fire = cond === 'always' || (cond === 'success' && build.status === 'success') || (cond === 'failure' && build.status === 'failed');
  if (!fire) return;
  const jobs = store.list<any>(JOBS);
  for (const ref of down) {
    const target = jobs.find((j) => j.id === ref || j.name === ref);
    if (target && target.id !== job.id && target.enabled !== false) {
      const params: Record<string, any> = {};
      for (const p of target.params || []) params[p.name] = p.defaultValue ?? '';
      void executeBuild(target.id, 'downstream', params);
    }
  }
}

// 触发构建:运行中则排队
async function executeBuild(jobId: string, trigger: string, params: Record<string, any>): Promise<any> {
  if (running.has(jobId)) {
    const item = { id: randomUUID(), jobId, trigger, params, queuedAt: nowIso() };
    queue.push(item);
    return { ok: true, queued: true, position: queue.filter((x) => x.jobId === jobId).length };
  }
  return startBuild(jobId, trigger, params);
}

// 后台执行完整构建(不阻塞请求)
async function startBuild(jobId: string, trigger: string, params: Record<string, any>): Promise<any> {
  const job = store.get<any>(JOBS, jobId);
  if (!job) return { ok: false, error: '任务不存在' };

  const builds = store.list<any>(BUILDS);
  const number = builds.filter((b) => b.jobId === jobId).reduce((m, b) => Math.max(m, b.number), 0) + 1;
  const build: any = { id: randomUUID(), jobId, jobName: job.name, number, status: 'running', trigger, params, startedAt: nowIso(), finishedAt: null, durationMs: null, stages: [], plan: [], log: '', changes: [], aborted: false };
  // 预计算完整阶段计划(供 Blue Ocean 流水线展示未开始阶段)
  build.plan = ['SCM 拉取代码', ...(job.steps || []).map((s: any) => s.name || 'Shell')];
  if (job.postBuild?.sonarScan) build.plan.push('Sonar 代码扫描');
  if (job.postBuild?.nexusUpload && job.postBuild?.artifactPath) build.plan.push('上传制品(Nexus)');
  store.upsert(BUILDS, build);

  const rec = { child: null, build, aborted: false };
  running.set(jobId, rec);

  const ws = join(WORKSPACE_DIR, jobId);
  mkdirSync(ws, { recursive: true });

  const vars: Record<string, string> = { BUILD_NUMBER: String(number), JOB_NAME: job.name, WORKSPACE: ws };
  for (const p of job.params || []) vars[p.name] = String(params[p.name] ?? p.defaultValue ?? '');

  // 预取变更(供构建记录展示)
  const changeInfo = scmChanges(job);
  if (changeInfo?.changes?.length) build.changes = changeInfo.changes;

  // 在后台跑,避免阻塞;完成后落库
  (async () => {
    let failed = false;
    const beginStage = (name: string) => {
      const s: any = { name, status: 'running', startedAt: nowIso(), startLog: build.log.length };
      build.stages.push(s);
      return s;
    };
    const endStage = (s: any, code: number) => {
      s.status = rec.aborted ? 'aborted' : (code === 0 ? 'success' : 'failed');
      s.code = code;
      s.finishedAt = nowIso();
      s.endLog = build.log.length;
      s.durationMs = Date.parse(s.finishedAt) - Date.parse(s.startedAt);
      if (code !== 0 && !rec.aborted) failed = true;
      return code === 0;
    };
    const runStage = async (name: string, cmd: string, timeout: number) => {
      const s = beginStage(name);
      const r = await runStep(jobId, build, ws, name, cmd, timeout);
      endStage(s, r.code);
      return r.code === 0;
    };
    try {
      // SCM
      const ok = await runStage('SCM 拉取代码', scmScript(job), 600000);
      if (ok) {
        // 记录本次构建 HEAD
        try {
          build.commit = String(execSync(`git -C ${q(ws)} rev-parse --short HEAD 2>/dev/null || echo ''`, { encoding: 'utf-8' })).trim();
        } catch { build.commit = ''; }
        // 构建步骤
        for (const st of job.steps || []) {
          if (rec.aborted) break;
          const cmd = substitute(st.command || '', vars);
          const okStep = await runStage(st.name || 'Shell', cmd, (st.timeout || 1800) * 1000);
          if (!okStep && st.failFast !== false) break;
        }
        // 构建后:Sonar 扫描
        if (!failed && !rec.aborted && job.postBuild?.sonarScan) {
          const cfg = store.read<any>('devops-sonar', {});
          if (cfg.token) {
            const hostUrl = (cfg.hostUrl || 'http://localhost:9000').replace(/\/$/, '');
            const key = `${cfg.projectKeyPrefix || 'zs'}:${job.name}`;
            const cmd = `docker run --rm --network host -v ${q(ws)}:/usr/src -e SONAR_HOST_URL=${q(hostUrl)} sonarsource/sonar-scanner-cli:5.0.1 -Dsonar.host.url=${q(hostUrl)} -Dsonar.token=${q(cfg.token)} -Dsonar.projectKey=${q(key)} -Dsonar.projectName=${q(job.name)} -Dsonar.sources=. -Dsonar.projectBaseDir=/usr/src`;
            await runStage('Sonar 代码扫描', cmd, 900000);
          } else { build.stages.push({ name: 'Sonar 代码扫描', status: 'skipped' }); }
        }
        // 构建后:归档/上传 Nexus
        if (!failed && !rec.aborted && job.postBuild?.nexusUpload && job.postBuild?.artifactPath) {
          const cfg = store.read<any>('devops-nexus', {});
          const file = join(ws, job.postBuild.artifactPath);
          if (existsSync(file)) {
            const repo = job.postBuild.nexusRepo || 'raw-hosted';
            const cmd = `curl -sS -u ${q((cfg.username || 'admin') + ':' + (cfg.password || ''))} -X POST ${q(`${(cfg.url || 'http://localhost:8081').replace(/\/$/, '')}/service/rest/v1/components?repository=${encodeURIComponent(repo)}`)} -F raw.directory=/ -F raw.asset1=@${q(file)} -F raw.asset1.filename=${q(job.name + '-build' + number)}`;
            await runStage('上传制品(Nexus)', cmd, 180000);
          } else { build.stages.push({ name: '上传制品(Nexus)', status: 'skipped', note: `制品不存在:${job.postBuild.artifactPath}` }); }
        }
      }
    } catch (e: any) {
      failed = true;
      build.log += `\n\u001b[1;31m[异常] ${e.message}\u001b[0m\n`;
    } finally {
      running.delete(jobId);
      build.status = rec.aborted ? 'aborted' : (failed ? 'failed' : 'success');
      build.aborted = rec.aborted;
      build.finishedAt = nowIso();
      build.durationMs = Date.parse(build.finishedAt) - Date.parse(build.startedAt);
      // 更新 job 的 lastHead / lastBuild
      if (changeInfo?.newHead) job.lastHead = changeInfo.newHead;
      job.lastBuild = { number, status: build.status, time: build.finishedAt, durationMs: build.durationMs };
      store.upsert(JOBS, job);
      store.upsert(BUILDS, build);
      // 环形保留最近 300 条构建记录
      const all = store.list<any>(BUILDS).sort((a: any, b: any) => (b.startedAt || '').localeCompare(a.startedAt || ''));
      if (all.length > 300) store.write(BUILDS, all.slice(0, 300));
      audit('jenkins.build', job.name, `${build.status} #${number}`);
      // 下游触发 + 消费队列
      triggerDownstream(job, build);
      processQueue();
    }
  })();

  return { ok: true, buildId: build.id, number };
}

// 天气标识:按构建成功率划分(Jenkins weather 风格)
function weatherFor(ratio: number | null, total: number): string {
  if (total === 0) return 'none';
  if (ratio === null) return 'none';
  if (ratio >= 0.8) return 'sun';
  if (ratio >= 0.6) return 'partly';
  if (ratio >= 0.4) return 'cloudy';
  if (ratio >= 0.2) return 'rain';
  return 'storm';
}

export async function register(fastify: FastifyInstance) {
  // ---- 任务 CRUD ----
  fastify.get('/jenkins/jobs', () => {
    const jobs = store.list<any>(JOBS);
    const allBuilds = store.list<any>(BUILDS);
    return jobs.map((j) => {
      const jb = allBuilds.filter((b) => b.jobId === j.id);
      const success = jb.filter((b) => b.status === 'success').length;
      const failed = jb.filter((b) => b.status === 'failed' || b.status === 'aborted').length;
      const total = jb.length;
      return {
        ...j,
        running: running.has(j.id),
        builds: total,
        stats: { total, success, failed, ratio: total ? success / total : null },
        weather: weatherFor(total ? success / total : null, total),
        enabled: j.enabled !== false,
      };
    });
  });

  fastify.post('/jenkins/jobs', (req, reply) => {
    const b = (req.body || {}) as any;
    if (!b.name) return reply.code(400).send({ error: '缺少任务名称' });
    if (store.list<any>(JOBS).some((j) => j.name === b.name)) return reply.code(400).send({ error: '任务名已存在' });
    const job = {
      id: randomUUID(), name: b.name, description: b.description || '', repo: b.repo || 'none', branch: b.branch || 'main', remote: b.remote || '',
      steps: Array.isArray(b.steps) ? b.steps : [], triggers: { manual: true, pollScm: !!b.triggers?.pollScm, pollMinutes: Number(b.triggers?.pollMinutes) || 5, cron: b.triggers?.cron || '' },
      params: Array.isArray(b.params) ? b.params : [], postBuild: b.postBuild || {}, enabled: b.enabled !== false,
      webhookToken: randomUUID().replace(/-/g, '').slice(0, 16), lastHead: '', createdAt: nowIso(), updatedAt: nowIso(),
    };
    store.upsert(JOBS, job);
    audit('jenkins.job.create', job.name);
    return { ok: true, job };
  });

  fastify.put('/jenkins/jobs/:id', (req, reply) => {
    const id = (req.params as any).id;
    const old = store.get<any>(JOBS, id);
    if (!old) return reply.code(404).send({ error: '任务不存在' });
    const b = (req.body || {}) as any;
    const job = {
      ...old, ...b, id,
      steps: Array.isArray(b.steps) ? b.steps : old.steps,
      params: Array.isArray(b.params) ? b.params : old.params,
      postBuild: b.postBuild ?? old.postBuild,
      updatedAt: nowIso(),
    };
    store.upsert(JOBS, job);
    audit('jenkins.job.update', job.name);
    return { ok: true, job };
  });

  fastify.delete('/jenkins/jobs/:id', (req) => {
    const id = (req.params as any).id;
    const job = store.get<any>(JOBS, id);
    if (running.has(id)) return { ok: false, error: '构建运行中,请先中止' };
    store.remove(JOBS, id);
    store.write(BUILDS, store.list<any>(BUILDS).filter((b) => b.jobId !== id));
    rmSync(join(WORKSPACE_DIR, id), { recursive: true, force: true });
    audit('jenkins.job.delete', job?.name || id);
    return { ok: true };
  });

  // ---- 构建触发 ----
  fastify.post('/jenkins/jobs/:id/build', async (req, reply) => {
    const id = (req.params as any).id;
    const b = (req.body || {}) as any;
    const job = store.get<any>(JOBS, id);
    if (!job) return reply.code(404).send({ error: '任务不存在' });
    if (job.enabled === false) return reply.code(400).send({ error: '任务已禁用' });
    const params: Record<string, any> = {};
    for (const p of job.params || []) params[p.name] = b.params?.[p.name] ?? p.defaultValue ?? '';
    const r = await executeBuild(id, b.trigger || 'manual', params);
    if (!r.ok) return reply.code(409).send(r);
    audit('jenkins.build.trigger', job.name, (b.trigger || 'manual') + (r.queued ? ' (已排队)' : ` #${r.number}`));
    return r;
  });

  // ---- 并发队列 ----
  fastify.get('/jenkins/queue', () => {
    const jobs = store.list<any>(JOBS);
    return queue.map((q, i) => ({ id: q.id, position: i + 1, jobId: q.jobId, jobName: jobs.find((j) => j.id === q.jobId)?.name || q.jobId, trigger: q.trigger, queuedAt: q.queuedAt }));
  });

  // 重新生成 Webhook Token
  fastify.post('/jenkins/jobs/:id/webhook/reset', (req, reply) => {
    const id = (req.params as any).id;
    const job = store.get<any>(JOBS, id);
    if (!job) return reply.code(404).send({ error: '任务不存在' });
    job.webhookToken = randomUUID().replace(/-/g, '').slice(0, 16);
    store.upsert(JOBS, job);
    return { ok: true, token: job.webhookToken };
  });

  // Webhook 自动触发(免登录,位于 /api/open/* 白名单;带 token 校验)
  fastify.post('/open/jenkins/webhook/:jobId', (req, reply) => {
    const jobId = (req.params as any).jobId;
    const token = String((req.query as any).token || '');
    const job = store.get<any>(JOBS, jobId);
    if (!job) return reply.code(404).send({ error: '任务不存在' });
    if (!job.webhookToken || token !== job.webhookToken) return reply.code(401).send({ error: 'webhook token 无效' });
    const b = (req.body || {}) as any;
    const params: Record<string, any> = {};
    for (const p of job.params || []) params[p.name] = b.params?.[p.name] ?? b.payload?.[p.name] ?? p.defaultValue ?? '';
    void executeBuild(jobId, 'webhook', params);
    return { ok: true, queued: running.has(jobId) };
  });

  fastify.post('/jenkins/builds/:id/abort', (req) => {
    const id = (req.params as any).id;
    const build = store.get<any>(BUILDS, id);
    if (!build) return { ok: false, error: '构建不存在' };
    const rec = running.get(build.jobId);
    if (rec) { rec.aborted = true; try { rec.child?.kill('SIGKILL'); } catch { /* ignore */ } }
    audit('jenkins.build.abort', build.jobName, '#' + build.number);
    return { ok: true };
  });

  // 清理工作区
  fastify.post('/jenkins/jobs/:id/wipe', (req) => {
    const id = (req.params as any).id;
    if (running.has(id)) return { ok: false, error: '构建运行中' };
    rmSync(join(WORKSPACE_DIR, id), { recursive: true, force: true });
    audit('jenkins.workspace.wipe', id);
    return { ok: true };
  });

  // ---- 构建历史 / 详情 / 日志 ----
  fastify.get('/jenkins/jobs/:id/builds', (req) => {
    const id = (req.params as any).id;
    return store.list<any>(BUILDS).filter((b) => b.jobId === id).sort((a: any, b: any) => b.number - a.number).map((b) => ({
      id: b.id, number: b.number, status: b.status, trigger: b.trigger, startedAt: b.startedAt, finishedAt: b.finishedAt, durationMs: b.durationMs, commit: b.commit, changes: b.changes, stages: b.stages, running: running.has(id) && running.get(id)?.build?.id === b.id,
    }));
  });

  fastify.get('/jenkins/builds/:id', (req) => {
    const id = (req.params as any).id;
    const b = store.get<any>(BUILDS, id);
    if (!b) return { error: '构建不存在' };
    const rec = running.get(b.jobId);
    const live = rec && rec.build?.id === id ? rec.build : null;
    const { log, ...rest } = b;
    return {
      ...rest,
      status: live ? live.status : b.status,
      stages: (live ? live.stages : b.stages) || [],
      commit: live ? live.commit : b.commit,
      changes: (live ? live.changes : b.changes) || [],
      durationMs: live ? (Date.now() - Date.parse(live.startedAt)) : b.durationMs,
      running: !!live,
    };
  });

  // 构建实时状态(Blue Ocean 流水线轮询用):运行中读内存,结束读存储
  fastify.get('/jenkins/builds/:id/status', (req) => {
    const id = (req.params as any).id;
    const b = store.get<any>(BUILDS, id);
    if (!b) return { error: '构建不存在' };
    const rec = running.get(b.jobId);
    const live = rec && rec.build?.id === id ? rec.build : null;
    const runningNow = !!live;
    const started: any[] = (live ? live.stages : b.stages) || [];
    const plan: string[] = (live ? live.plan : b.plan) || started.map((s) => s.name);
    // 按计划顺序合并:已开始的用真实状态,未开始的标记 pending(运行中)或 notbuilt(已结束)
    const stages = plan.map((name, i) => started[i] || { name, status: runningNow ? 'pending' : 'notbuilt' });
    return {
      id, number: b.number, status: live ? live.status : b.status,
      stages, running: runningNow,
      durationMs: live ? (Date.now() - Date.parse(live.startedAt)) : b.durationMs,
      startedAt: b.startedAt, finishedAt: live ? null : b.finishedAt,
      commit: live ? live.commit : b.commit, changes: (live ? live.changes : b.changes) || [],
    };
  });

  // 控制台日志(按 offset 增量读取;运行中读内存,结束后读存储)
  fastify.get('/jenkins/builds/:id/log', (req) => {
    const id = (req.params as any).id;
    const offset = Number((req.query as any).offset || 0);
    const b = store.get<any>(BUILDS, id);
    if (!b) return { error: '构建不存在' };
    const rec = running.get(b.jobId);
    const live = rec && rec.build?.id === id ? rec.build.log : b.log;
    const text = String(live || '');
    const slice = text.slice(offset);
    return { log: slice, offset: text.length, finished: b.status !== 'running' && !(rec && rec.build?.id === id), status: b.status };
  });

  // ---- 触发器后台循环(轮询 SCM + cron) ----
  let lastPollMin = -1;
  const tick = async () => {
    const now = new Date();
    // 每分钟最多执行一次轮询/cron 判断
    if (now.getMinutes() === lastPollMin) return;
    lastPollMin = now.getMinutes();
    for (const job of store.list<any>(JOBS)) {
      if (job.enabled === false || running.has(job.id)) continue;
      const t = job.triggers || {};
      let trigger = '';
      if (t.pollScm) {
        const pollEvery = Math.max(1, Number(t.pollMinutes) || 5);
        const lastPoll = job.lastPollAt ? Date.parse(job.lastPollAt) : 0;
        if (now.getTime() - lastPoll >= pollEvery * 60000) {
          job.lastPollAt = nowIso();
          store.upsert(JOBS, job);
          const c = scmChanges(job);
          if (c && c.newHead && c.newHead !== job.lastHead) trigger = 'poll';
        }
      }
      if (!trigger && t.cron && cronMatch(t.cron, now)) trigger = 'cron';
      if (trigger) {
        const params: Record<string, any> = {};
        for (const p of job.params || []) params[p.name] = p.defaultValue ?? '';
        await executeBuild(job.id, trigger, params);
      }
    }
  };
  const timer = setInterval(() => { void tick(); }, 15000);
  fastify.addHook('onClose', () => clearInterval(timer));
}
