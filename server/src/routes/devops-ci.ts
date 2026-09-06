// DevOps CI/CD 工具链:
// 本地 Git 仓库 + Jenkins/SonarQube/Nexus/Gitea 一键编排 + SonarScanner 代码扫描 + Nexus 制品仓库 + 全流程 CI/CD 流水线
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import type { FastifyInstance } from 'fastify';
import { store, DATA_DIR } from '../lib/store.js';
import { run, Host } from '../lib/host.js';
import { DOCKER_TEMPLATE, dockerRunCommand, getContainerName } from '../modules/tools.js';
import { audit } from '../lib/audit.js';

const REPOS_DIR = join(DATA_DIR, 'repos');
mkdirSync(REPOS_DIR, { recursive: true });
const LOCAL: Host = { id: 'local', name: '本机', kind: 'local' };

const sh = (cmd: string, timeout = 120000) => {
  try {
    const r = execSync(cmd, { timeout, shell: '/bin/bash', encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
    return { code: 0, stdout: String(r), stderr: '' };
  } catch (e: any) {
    return { code: e.status ?? 1, stdout: String(e.stdout || ''), stderr: String(e.stderr || e.message) };
  }
};
const q = (s: string) => "'" + String(s).replace(/'/g, `'\\''`) + "'";
const safeName = (s: string) => String(s || '').trim().replace(/[^\w.-]/g, '_').slice(0, 60) || ('repo-' + Date.now().toString(36));
export const repoPath = (name: string) => join(REPOS_DIR, String(name).replace(/\.git$/, '') + '.git');
const metaOf = () => store.list<any>('devops-repos');

// 允许出现在仓库内文件路径里的字符(防止路径穿越/注入)
const okRelPath = (p: string) => {
  const s = String(p || '');
  if (!s || s.length > 512 || /[\u0000-\u001f\u007f]/.test(s)) return false;
  if (s.split('/').some((x) => x === '..' || x === '')) return false;
  return /^[A-Za-z0-9_.\-\u4e00-\u9fff][A-Za-z0-9_.\-\u4e00-\u9fff /()]*$/.test(s);
};

// CI 服务目录(部署/状态/管理)
const CI_SERVICES = [
  { id: 'gitea', name: 'Gitea', cn: '本地代码仓库', port: 3000, url: 'http://localhost:3000', desc: '轻量 Git 托管(HTTP/SSH)' },
  { id: 'jenkins', name: 'Jenkins', cn: 'CI 引擎', port: 8080, url: 'http://localhost:8080', desc: '持续集成 / 持续交付' },
  { id: 'sonarqube', name: 'SonarQube', cn: '代码质量', port: 9000, url: 'http://localhost:9000', desc: '静态扫描 + 质量门禁' },
  { id: 'nexus', name: 'Nexus', cn: '制品仓库', port: 8081, url: 'http://localhost:8081', desc: 'Maven/npm/Docker/raw 制品' },
];

const nexusAuth = (cfg: any) => ({ Authorization: 'Basic ' + Buffer.from(`${cfg.username || 'admin'}:${cfg.password || ''}`).toString('base64') });

// 从 bare 仓库克隆到临时工作区并写入文件、提交、推回
function commitToRepo(name: string, files: { path: string; content: string }[], message: string, branch = 'main', author = 'ops-hub') {
  const bare = repoPath(name);
  const tmp = join(tmpdir(), 'zs-commit-' + randomUUID());
  try {
    const c = sh(`git clone -q ${q(bare)} ${q(tmp)}`);
    if (c.code !== 0) throw new Error('克隆仓库失败: ' + (c.stderr || c.stdout));
    for (const f of files) {
      const p = join(tmp, f.path);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, String(f.content ?? ''), 'utf-8');
    }
    sh(`git -C ${q(tmp)} add -A`);
    const cm = sh(`git -C ${q(tmp)} -c user.name=${q(author)} -c user.email=${q(author + '@local')} commit -q -m ${q(message || 'update')}`);
    if (cm.code !== 0 && !/nothing to commit/i.test(cm.stdout + cm.stderr)) throw new Error('提交失败: ' + (cm.stderr || cm.stdout));
    const push = sh(`git -C ${q(tmp)} push -q origin HEAD:${q(branch)}`);
    if (push.code !== 0) throw new Error('推送失败: ' + (push.stderr || push.stdout));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// 将本机某个目录(带或不带 .git)导入为本地仓库
function importRepo(name: string, source: string, message = 'import') {
  const bare = repoPath(name);
  const tmp = join(tmpdir(), 'zs-import-' + randomUUID());
  try {
    const r = sh(`git init --bare --initial-branch=main ${q(bare)}`);
    if (r.code !== 0) throw new Error('初始化失败: ' + (r.stderr || r.stdout));
    sh(`git clone -q ${q(bare)} ${q(tmp)}`);
    if (existsSync(join(source, '.git'))) {
      // 源是 git 工作区:直接带历史 clone 再推全部分支
      const srcTmp = join(tmpdir(), 'zs-src-' + randomUUID());
      try {
        const c = sh(`git clone -q ${q(source)} ${q(srcTmp)}`);
        if (c.code !== 0) throw new Error('源仓库 clone 失败: ' + c.stderr);
        sh(`git -C ${q(srcTmp)} remote add target ${q(bare)} 2>/dev/null`);
        sh(`git -C ${q(srcTmp)} push -q target --all`);
        sh(`git -C ${q(srcTmp)} push -q target --tags 2>/dev/null`);
      } finally {
        rmSync(srcTmp, { recursive: true, force: true });
      }
    } else {
      const c = sh(`cp -a ${q(source + '/.')} ${q(tmp + '/')}`);
      if (c.code !== 0) throw new Error('拷贝失败: ' + c.stderr);
      sh(`git -C ${q(tmp)} add -A`);
      sh(`git -C ${q(tmp)} -c user.name=ops-hub -c user.email=ops-hub@local commit -q -m ${q(message)}`);
      sh(`git -C ${q(tmp)} push -q origin HEAD:main`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export async function register(fastify: FastifyInstance) {
  // ================= 本地仓库 =================
  fastify.get('/devops/repos', () => metaOf().map((m) => {
    const bare = repoPath(m.name);
    const ok = existsSync(join(bare, 'HEAD'));
    let branch = '', branches: string[] = [], last: any = null, commits = 0;
    if (ok) {
      const g = `git --git-dir=${q(bare)}`;
      branches = sh(`${g} branch --format='%(refname:short)'`).stdout.trim().split('\n').filter(Boolean);
      branch = branches[0] || 'main';
      const lr = sh(`${g} log -1 --format='%h%x09%s%x09%an%x09%ad' --date=format:'%Y-%m-%d %H:%M' ${q(branch)}`);
      const parts = lr.stdout.trim().split('\t');
      if (parts[0]) last = { hash: parts[0], subject: parts[1] || '', author: parts[2] || '', date: parts[3] || '' };
      commits = Number(sh(`${g} rev-list --count ${q(branch)}`).stdout.trim()) || 0;
    }
    return { ...m, exists: ok, branch, branches, last, commits, clonePath: bare };
  }));

  fastify.post('/devops/repos', (req, reply) => {
    const b = (req.body || {}) as any;
    const name = safeName(b.name);
    if (!name || name.startsWith('.')) return reply.code(400).send({ error: '仓库名非法' });
    if (metaOf().some((m) => m.name === name)) return reply.code(400).send({ error: '仓库已存在' });
    const bare = repoPath(name);
    const r = sh(`git init --bare --initial-branch=main ${q(bare)}`);
    if (r.code !== 0) return reply.code(500).send({ error: r.stderr || r.stdout });
    const tmp = join(tmpdir(), 'zs-init-' + randomUUID());
    try {
      sh(`git clone -q ${q(bare)} ${q(tmp)}`);
      writeFileSync(join(tmp, 'README.md'), `# ${name}\n\n${b.description || '本地代码仓库'}\n`);
      sh(`git -C ${q(tmp)} add -A`);
      sh(`git -C ${q(tmp)} -c user.name=ops-hub -c user.email=ops-hub@local commit -q -m 'init: 创建仓库'`);
      sh(`git -C ${q(tmp)} push -q origin HEAD:main`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
    const meta = { id: randomUUID(), name, description: b.description || '', createdAt: new Date().toISOString() };
    store.upsert('devops-repos', meta);
    audit('devops.repo.create', name);
    return { ok: true, repo: meta };
  });

  fastify.delete('/devops/repos/:name', (req) => {
    const name = (req.params as any).name;
    rmSync(repoPath(name), { recursive: true, force: true });
    store.write('devops-repos', metaOf().filter((m) => m.name !== name));
    audit('devops.repo.delete', name);
    return { ok: true };
  });

  fastify.post('/devops/repos/:name/import', (req, reply) => {
    const name = safeName((req.params as any).name);
    const source = String((req.body as any)?.source || '');
    if (!source || !existsSync(source)) return reply.code(400).send({ error: '源目录不存在' });
    if (metaOf().some((m) => m.name === name)) return reply.code(400).send({ error: '仓库已存在' });
    try {
      importRepo(name, source, (req.body as any)?.message || 'import');
    } catch (e: any) { return reply.code(500).send({ error: String(e.message || e) }); }
    store.upsert('devops-repos', { id: randomUUID(), name, description: `从 ${source} 导入`, createdAt: new Date().toISOString() });
    audit('devops.repo.import', name, source);
    return { ok: true };
  });

  fastify.get('/devops/repos/:name/info', (req, reply) => {
    const name = (req.params as any).name;
    const bare = repoPath(name);
    if (!existsSync(join(bare, 'HEAD'))) return reply.code(404).send({ error: '仓库不存在' });
    const g = `git --git-dir=${q(bare)}`;
    const branches = sh(`${g} branch --format='%(refname:short)'`).stdout.trim().split('\n').filter(Boolean);
    const commits = sh(`${g} log --oneline --all -60`).stdout.trim();
    return { name, branches, commits: commits ? commits.split('\n').map((l) => ({ hash: l.slice(0, 7), message: l.slice(8) })) : [] };
  });

  fastify.get('/devops/repos/:name/tree', (req, reply) => {
    const name = (req.params as any).name;
    const ref = String((req.query as any).ref || 'HEAD');
    const bare = repoPath(name);
    if (!existsSync(join(bare, 'HEAD'))) return reply.code(404).send({ error: '仓库不存在' });
    const r = sh(`git --git-dir=${q(bare)} ls-tree -r --name-only ${q(ref)}`);
    return { files: r.stdout.trim().split('\n').filter(Boolean) };
  });

  fastify.get('/devops/repos/:name/file', (req, reply) => {
    const name = (req.params as any).name;
    const path = String((req.query as any).path || '');
    const ref = String((req.query as any).ref || 'HEAD');
    const bare = repoPath(name);
    if (!existsSync(join(bare, 'HEAD'))) return reply.code(404).send({ error: '仓库不存在' });
    if (!okRelPath(path)) return reply.code(400).send({ error: '路径非法' });
    const r = sh(`git --git-dir=${q(bare)} show ${q(ref)}:${q(path)}`);
    if (r.code !== 0) return reply.code(404).send({ error: '文件不存在或为空' });
    return { path, content: r.stdout };
  });

  fastify.post('/devops/repos/:name/commit', (req, reply) => {
    const name = (req.params as any).name;
    const b = (req.body || {}) as any;
    const files = Array.isArray(b.files) ? b.files : [];
    if (!files.length) return reply.code(400).send({ error: '没有文件变更' });
    for (const f of files) if (!okRelPath(String(f.path))) return reply.code(400).send({ error: '文件路径非法: ' + f.path });
    try { commitToRepo(name, files, b.message || 'update', b.branch || 'main', b.author || 'ops-hub'); }
    catch (e: any) { return reply.code(500).send({ error: String(e.message || e) }); }
    audit('devops.repo.commit', name, `${files.length} 个文件`);
    return { ok: true };
  });

  // ================= CI 服务(Jenkins/SonarQube/Nexus/Gitea) =================
  fastify.get('/devops/services', async () => {
    const out: any[] = [];
    for (const s of CI_SERVICES) {
      const cn = getContainerName(s.id, 'local');
      const insp = sh(`docker inspect -f '{{.State.Status}}|{{.State.Running}}|{{.Image}}' ${cn} 2>/dev/null`);
      let state = 'absent', running = false, image = '';
      if (insp.code === 0) {
        const parts = insp.stdout.trim().split('|');
        state = parts[0] || 'unknown'; running = parts[1] === 'true'; image = parts[2] || '';
      }
      const portOpen = sh(`ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE '[:.]${s.port}$' && echo yes || echo no`).stdout.trim() === 'yes';
      out.push({ ...s, container: cn, state, running, portOpen, image, deployable: !!DOCKER_TEMPLATE[s.id], template: DOCKER_TEMPLATE[s.id] || null });
    }
    return out;
  });

  fastify.post('/devops/services/:id/deploy', async (req, reply) => {
    const id = (req.params as any).id;
    const svc = CI_SERVICES.find((s) => s.id === id);
    if (!svc) return reply.code(404).send({ error: '未知服务' });
    const t = DOCKER_TEMPLATE[id];
    if (!t) return { ok: false, error: '该服务暂无一键部署模板' };
    const settings = store.read<any>('settings', {});
    const cmd = dockerRunCommand({ id } as any, 'local', { image: (req.body as any)?.image, mirror: settings.dockerRegistryMirror });
    const r = await run(LOCAL, cmd, 600000);
    if (r.code !== 0) return { ok: false, error: (r.stderr || r.stdout).slice(-600) };
    audit('devops.ci.deploy', id);
    return { ok: true, container: getContainerName(id, 'local'), url: svc.url };
  });

  const SAFE_ACT = new Set(['start', 'stop', 'restart', 'remove']);
  fastify.post('/devops/services/:id/action', async (req, reply) => {
    const id = (req.params as any).id;
    const svc = CI_SERVICES.find((s) => s.id === id);
    if (!svc) return reply.code(404).send({ error: '未知服务' });
    const act = String((req.body as any)?.action || '');
    if (!SAFE_ACT.has(act)) return reply.code(400).send({ error: 'action 非法' });
    const cn = getContainerName(id, 'local');
    const cmd = act === 'remove' ? `docker rm -f ${cn} 2>&1` : `docker ${act} ${cn} 2>&1`;
    const r = await run(LOCAL, cmd, 60000);
    audit('devops.ci.' + act, id);
    return { ok: r.code === 0, output: r.stdout, error: r.stderr };
  });

  fastify.get('/devops/services/:id/logs', async (req, reply) => {
    const id = (req.params as any).id;
    if (!CI_SERVICES.some((s) => s.id === id)) return reply.code(404).send({ error: '未知服务' });
    const tail = Math.min(Math.max(Number((req.query as any).tail || 200) || 200, 1), 2000);
    const cn = getContainerName(id, 'local');
    const r = await run(LOCAL, `docker logs --tail ${tail} ${cn} 2>&1`, 30000);
    return { content: r.stdout };
  });

  // ================= SonarQube / SonarScanner 代码扫描 =================
  fastify.get('/devops/sonar/config', () => store.read('devops-sonar', { hostUrl: 'http://localhost:9000', token: '', projectKeyPrefix: 'zs' }));
  fastify.put('/devops/sonar/config', (req) => { store.write('devops-sonar', req.body as any); return { ok: true }; });

  fastify.post('/devops/scan', async (req, reply) => {
    const b = (req.body || {}) as any;
    const name = safeName(b.repo);
    const bare = repoPath(name);
    if (!existsSync(join(bare, 'HEAD'))) return reply.code(404).send({ error: '仓库不存在' });
    const cfg = store.read<any>('devops-sonar', {});
    if (!cfg.token) return reply.code(400).send({ error: '请先在「代码扫描」页配置 SonarQube Token' });
    const hostUrl = (cfg.hostUrl || 'http://localhost:9000').replace(/\/$/, '');
    const branch = b.branch || 'main';
    const tmp = join(tmpdir(), 'zs-scan-' + randomUUID());
    let output = '';
    try {
      const c = sh(`git clone -q ${q(bare)} ${q(tmp)}`);
      if (c.code !== 0) return reply.code(500).send({ error: '克隆仓库失败' });
      if (branch !== 'main') sh(`git -C ${q(tmp)} checkout -q ${q(branch)} 2>/dev/null`);
      const key = `${cfg.projectKeyPrefix || 'zs'}:${name}`;
      const cmd = `docker run --rm --network host -v ${q(tmp)}:/usr/src -e SONAR_HOST_URL=${q(hostUrl)} ${(req.body as any)?.image || 'sonarsource/sonar-scanner-cli:5.0.1'} -Dsonar.host.url=${q(hostUrl)} -Dsonar.token=${q(cfg.token)} -Dsonar.projectKey=${q(key)} -Dsonar.projectName=${q(name)} -Dsonar.sources=. -Dsonar.projectBaseDir=/usr/src`;
      const r = await run(LOCAL, cmd, 900000);
      output = (r.stdout + r.stderr).slice(-8000);
      audit('devops.scan', name, r.code === 0 ? 'success' : 'failed');
      return { ok: r.code === 0, projectKey: key, output };
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  fastify.get('/devops/sonar/issues', async (req, reply) => {
    const cfg = store.read<any>('devops-sonar', {});
    const projectKey = String((req.query as any).projectKey || '');
    if (!cfg.hostUrl || !projectKey) return { total: 0, issues: [] };
    try {
      const url = `${cfg.hostUrl.replace(/\/$/, '')}/api/issues/search?componentKeys=${encodeURIComponent(projectKey)}&resolved=false&ps=100`;
      const r = await fetch(url, { headers: cfg.token ? { Authorization: 'Basic ' + Buffer.from(cfg.token + ':').toString('base64') } : {} });
      const j: any = await r.json();
      return { total: j.total, issues: (j.issues || []).map((i: any) => ({ key: i.key, rule: i.rule, severity: i.severity, type: i.type, component: i.component, line: i.line, message: i.message })) };
    } catch (e: any) { return { error: String(e.message || e) }; }
  });

  fastify.get('/devops/sonar/qualitygate', async (req, reply) => {
    const cfg = store.read<any>('devops-sonar', {});
    const projectKey = String((req.query as any).projectKey || '');
    if (!cfg.hostUrl || !projectKey) return { projectStatus: { status: 'UNKNOWN' } };
    try {
      const url = `${cfg.hostUrl.replace(/\/$/, '')}/api/qualitygates/project_status?projectKey=${encodeURIComponent(projectKey)}`;
      const r = await fetch(url, { headers: cfg.token ? { Authorization: 'Basic ' + Buffer.from(cfg.token + ':').toString('base64') } : {} });
      return await r.json();
    } catch (e: any) { return { error: String(e.message || e) }; }
  });

  // ================= Nexus 制品仓库 =================
  fastify.get('/devops/nexus/config', () => store.read('devops-nexus', { url: 'http://localhost:8081', username: 'admin', password: 'admin123' }));
  fastify.put('/devops/nexus/config', (req) => { store.write('devops-nexus', req.body as any); return { ok: true }; });

  fastify.get('/devops/nexus/repos', async (req, reply) => {
    const cfg = store.read<any>('devops-nexus', {});
    if (!cfg.url) return { repos: [] };
    try {
      const r = await fetch(`${cfg.url.replace(/\/$/, '')}/service/rest/v1/repositories`, { headers: nexusAuth(cfg) });
      const j: any = await r.json();
      if (!r.ok) return { error: j?.message || ('HTTP ' + r.status) };
      return { repos: (j || []).map((x: any) => ({ name: x.name, format: x.format, type: x.type, url: x.url })) };
    } catch (e: any) { return { error: String(e.message || e) }; }
  });

  fastify.get('/devops/nexus/components', async (req, reply) => {
    const cfg = store.read<any>('devops-nexus', {});
    const repo = String((req.query as any).repository || '');
    if (!cfg.url || !repo) return { components: [] };
    try {
      const r = await fetch(`${cfg.url.replace(/\/$/, '')}/service/rest/v1/components?repository=${encodeURIComponent(repo)}`, { headers: nexusAuth(cfg) });
      const j: any = await r.json();
      if (!r.ok) return { error: j?.message || ('HTTP ' + r.status) };
      return { components: (j.items || []).slice(0, 100).map((x: any) => ({ id: x.id, name: x.name, version: x.version, group: x.group, format: x.format, assets: (x.assets || []).map((a: any) => a.path) })) };
    } catch (e: any) { return { error: String(e.message || e) }; }
  });

  fastify.post('/devops/nexus/upload', async (req, reply) => {
    const cfg = store.read<any>('devops-nexus', {});
    const b = (req.body || {}) as any;
    const filePath = String(b.filePath || '');
    const repository = String(b.repository || 'raw-hosted');
    const directory = ('/' + String(b.directory || '').replace(/^\/+|\/+$/g, '')).replace(/\/$/, '') || '/';
    if (!filePath || !existsSync(filePath)) return reply.code(400).send({ error: '文件不存在' });
    if (!/^[\w.\-/ ]+$/.test(filePath)) return reply.code(400).send({ error: '路径非法' });
    const filename = String(b.filename || basename(filePath)).replace(/["'\\]/g, '');
    const cmd = `curl -sS -u ${q(cfg.username + ':' + cfg.password)} -X POST ${q(`${cfg.url.replace(/\/$/, '')}/service/rest/v1/components?repository=${encodeURIComponent(repository)}`)} -F raw.directory=${q(directory)} -F raw.asset1=@${q(filePath)} -F raw.asset1.filename=${q(filename)}`;
    const r = sh(cmd, 180000);
    audit('devops.nexus.upload', filename, repository);
    return { ok: r.code === 0, output: r.stdout.slice(-2000), error: r.stderr };
  });

  // ================= 全流程 CI/CD 流水线 =================
  fastify.get('/devops/ci/runs', () => store.list<any>('devops-ci-runs').sort((a: any, b: any) => (b.startedAt || '').localeCompare(a.startedAt || '')).slice(0, 50));

  fastify.post('/devops/ci/run', async (req, reply) => {
    const b = (req.body || {}) as any;
    const name = safeName(b.repo);
    const bare = repoPath(name);
    if (!existsSync(join(bare, 'HEAD'))) return reply.code(404).send({ error: '仓库不存在' });
    const branch = b.branch || 'main';
    const tmp = join(tmpdir(), 'zs-ci-' + randomUUID());
    const stages: any[] = [];
    const startedAt = new Date().toISOString();
    let status = 'running';
    let failed = false;

    const mark = (s: any, code: number, stdout: string, stderr: string) => {
      s.status = code === 0 ? 'success' : 'failed';
      s.code = code;
      s.output = (stdout + stderr).slice(-6000);
      s.finishedAt = new Date().toISOString();
      if (code !== 0) { failed = true; status = 'failed'; }
      return code === 0;
    };

    try {
      // 1. 拉取代码
      const s1 = { key: 'checkout', name: '拉取代码(git clone)', status: 'running' };
      stages.push(s1);
      const c1 = sh(`git clone -q ${q(bare)} ${q(tmp)} && git -C ${q(tmp)} checkout -q ${q(branch)}`);
      if (!mark(s1, c1.code, c1.stdout, c1.stderr)) throw new Error('checkout failed');

      const stage = (key: string, name: string, cmd: string, timeout = 600000) => {
        if (!cmd) return true;
        const s = { key, name, status: 'running' };
        stages.push(s);
        const r = sh(`cd ${q(tmp)} && ${cmd}`, timeout);
        return mark(s, r.code, r.stdout, r.stderr);
      };

      // 2. 构建
      if (!stage('build', '构建', b.build)) throw new Error('build failed');
      // 3. 测试
      if (!stage('test', '测试', b.test)) throw new Error('test failed');

      // 4. 代码扫描(可选)
      if (b.scan) {
        const cfg = store.read<any>('devops-sonar', {});
        if (!cfg.token) { const s = { key: 'scan', name: '代码扫描(SonarScanner)', status: 'skipped' as string, output: '未配置 SonarQube Token,已跳过' }; stages.push(s); }
        else {
          const s: any = { key: 'scan', name: '代码扫描(SonarScanner)', status: 'running' };
          stages.push(s);
          const hostUrl = (cfg.hostUrl || 'http://localhost:9000').replace(/\/$/, '');
          const key = `${cfg.projectKeyPrefix || 'zs'}:${name}`;
          const cmd = `docker run --rm --network host -v ${q(tmp)}:/usr/src -e SONAR_HOST_URL=${q(hostUrl)} sonarsource/sonar-scanner-cli:5.0.1 -Dsonar.host.url=${q(hostUrl)} -Dsonar.token=${q(cfg.token)} -Dsonar.projectKey=${q(key)} -Dsonar.projectName=${q(name)} -Dsonar.sources=. -Dsonar.projectBaseDir=/usr/src`;
          const r = await run(LOCAL, cmd, 900000);
          mark(s, r.code, r.stdout, r.stderr);
        }
      }

      // 5. 打包
      if (!stage('package', '打包', b.package)) throw new Error('package failed');

      // 6. 上传制品(可选)
      if (b.uploadNexus && b.artifactPath) {
        const s: any = { key: 'upload', name: '上传制品(Nexus)', status: 'running' };
        stages.push(s);
        const cfg = store.read<any>('devops-nexus', {});
        const filePath = join(tmp, String(b.artifactPath));
        if (!existsSync(filePath)) { s.status = 'skipped'; s.output = `制品不存在: ${b.artifactPath}`; }
        else {
          const repository = String(b.nexusRepo || 'raw-hosted');
          const filename = basename(filePath);
          const cmd = `curl -sS -u ${q(cfg.username + ':' + cfg.password)} -X POST ${q(`${(cfg.url || 'http://localhost:8081').replace(/\/$/, '')}/service/rest/v1/components?repository=${encodeURIComponent(repository)}`)} -F raw.directory=/ -F raw.asset1=@${q(filePath)} -F raw.asset1.filename=${q(filename)}`;
          const r = sh(cmd, 180000);
          mark(s, r.code, r.stdout, r.stderr);
        }
      }

      // 7. 部署
      if (!stage('deploy', '部署', b.deploy)) throw new Error('deploy failed');
      if (!failed) status = 'success';
    } catch (e: any) {
      status = 'failed';
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }

    const runRec = { id: randomUUID(), repo: name, branch, status, stages, startedAt, finishedAt: new Date().toISOString() };
    store.upsert('devops-ci-runs', runRec);
    audit('devops.ci.run', name, status);
    return runRec;
  });
}
