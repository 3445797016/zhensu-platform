// Ansible 自动化路由(DevOps → Ansible):状态/安装/inventory/Playbook 库/执行/ad-hoc/定时
import type { FastifyInstance } from 'fastify';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { store } from '../lib/store.js';
import { audit } from '../lib/audit.js';
import { envStatus, buildInventory, runAnsible, cancelRun, listSchedules, saveSchedules, startScheduler, PB_DIR, RUNS_NS, CFG_NS } from '../modules/ansible.js';

const SAMPLES: Record<string, string> = {
  'ping.yml': `---
# 连通性测试:对所有主机执行 ping + setup
- name: 连通性测试
  hosts: all
  gather_facts: false
  tasks:
    - name: ping
      ansible.builtin.ping:
`,
  'site.yml': `---
# 通用站点初始化:更新缓存 + 安装常用包 + 启动服务
- name: 站点初始化
  hosts: managed
  become: true
  tasks:
    - name: 更新 apt 缓存
      ansible.builtin.apt:
        update_cache: true
        cache_valid_time: 3600
      when: ansible_os_family == "Debian"

    - name: 安装常用包
      ansible.builtin.package:
        name:
          - curl
          - vim
          - htop
        state: present

    - name: 确保 sshd 运行
      ansible.builtin.service:
        name: sshd
        state: started
        enabled: true
`,
  'nginx.yml': `---
# 安装并启动 nginx(apt 系主机)
- name: 部署 nginx
  hosts: managed
  become: true
  gather_facts: true
  tasks:
    - name: 安装 nginx
      ansible.builtin.apt:
        name: nginx
        state: present
      when: ansible_os_family == "Debian"

    - name: 启动并开机自启
      ansible.builtin.service:
        name: nginx
        state: started
        enabled: true
`,
  'disk-check.yml': `---
# 磁盘/内存巡检(只读,安全可重复执行)
- name: 资源巡检
  hosts: all
  gather_facts: true
  tasks:
    - name: 磁盘使用率
      ansible.builtin.shell: df -h --output=source,pcent,target | grep -vE '^Filesystem|tmpfs'
      register: df
    - name: 打印磁盘
      ansible.builtin.debug:
        var: df.stdout_lines
`,
};

function playbookNames() { return readdirSync(PB_DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml')).sort(); }

export async function register(fastify: FastifyInstance) {
  // 状态:是否安装 ansible / sshpass
  fastify.get('/ansible/status', () => envStatus());

  // 一键安装(ansible + sshpass, 走 apt; 装完自动更新状态)
  fastify.post('/ansible/install', (_req, reply) => {
    const st = envStatus();
    if (st.installed && st.sshpass.ok) return { ok: true, msg: 'Ansible 已安装' };
    audit('ansible', 'install', '一键安装 ansible/sshpass', 'web');
    const child = spawn('bash', ['-lc', 'env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY apt-get install -y ansible sshpass 2>&1 | tail -8'], { env: process.env });
    child.stdout.on('data', () => {}); child.stderr.on('data', () => {});
    reply.send({ ok: true, msg: '安装已在后台执行, 约 1-3 分钟后刷新查看状态' });
    return reply;
  });

  // inventory:生成预览(复用纳管主机)
  fastify.get('/ansible/inventory', () => {
    const c = store.read<any>(CFG_NS, {});
    const hosts = store.list<any>('hosts').map((h) => ({ id: h.id, name: h.name, kind: h.kind, host: h.host, user: h.user, tags: h.tags }));
    return { inventory: buildInventory(), extraInventory: c.extraInventory || '', hosts };
  });

  fastify.post('/ansible/inventory', (req) => {
    const { extraInventory } = req.body as any;
    const c = store.read<any>(CFG_NS, {});
    c.extraInventory = String(extraInventory || '');
    store.write(CFG_NS, c);
    audit('ansible', 'inventory', '更新自定义 inventory', 'web');
    return { ok: true, inventory: buildInventory() };
  });

  // Playbook 库
  fastify.get('/ansible/playbooks', () => {
    const names = playbookNames();
    return {
      files: names.map((f) => { const p = join(PB_DIR, f); const c = readFileSync(p, 'utf8'); return { name: f, size: c.length, tasks: (c.match(/^\s+- name:/gm) || []).length, updated: 0 }; }),
      samples: Object.keys(SAMPLES),
    };
  });

  fastify.get('/ansible/playbooks/:name', (req, reply) => {
    const name = String((req.params as any).name); if (!/^[\w.-]+\.ya?ml$/.test(name)) return reply.code(400).send({ error: '非法文件名' });
    const p = join(PB_DIR, name);
    if (existsSync(p)) return { name, content: readFileSync(p, 'utf8') };
    if (SAMPLES[name]) { mkdirSync(PB_DIR, { recursive: true }); writeFileSync(p, SAMPLES[name], 'utf8'); return { name, content: SAMPLES[name] }; }
    return reply.code(404).send({ error: '不存在' });
  });

  fastify.post('/ansible/playbooks', (req, reply) => {
    const { name, content } = req.body as any;
    const n = String(name || ''); if (!/^[\w.-]+\.ya?ml$/.test(n)) return reply.code(400).send({ error: '非法文件名(需 .yml/.yaml)' });
    mkdirSync(PB_DIR, { recursive: true });
    writeFileSync(join(PB_DIR, n), String(content || ''), 'utf8');
    audit('ansible', 'playbook', `保存 ${n}`, 'web');
    return { ok: true };
  });

  fastify.delete('/ansible/playbooks/:name', (req, reply) => {
    const name = String((req.params as any).name); if (!/^[\w.-]+\.ya?ml$/.test(name)) return reply.code(400).send({ error: '非法文件名' });
    const p = join(PB_DIR, name);
    if (existsSync(p)) { rmSync(p); audit('ansible', 'playbook', `删除 ${name}`, 'web'); }
    return { ok: true };
  });

  // 运行记录
  fastify.get('/ansible/runs', () => store.list<any>(RUNS_NS).sort((a, b) => String(b.created).localeCompare(String(a.created))).slice(0, 100));

  fastify.get('/ansible/runs/:id', (req) => {
    const id = String((req.params as any).id);
    const r = store.list<any>(RUNS_NS).find((x) => x.id === id) || null;
    if (r && r.logFile && existsSync(r.logFile)) { const raw = readFileSync(r.logFile, 'utf8'); r.log = raw.split('\n').slice(-300); }
    return r;
  });

  fastify.get('/ansible/runs/:id/log', (req, reply) => {
    const id = String((req.params as any).id);
    const r = store.list<any>(RUNS_NS).find((x) => x.id === id);
    if (!r || !r.logFile || !existsSync(r.logFile)) return reply.code(404).send({ error: '无日志' });
    reply.type('text/plain; charset=utf-8');
    return readFileSync(r.logFile, 'utf8').split('\n').slice(-500).join('\n');
  });

  fastify.post('/ansible/runs/:id/cancel', (req) => cancelRun(String((req.params as any).id)));

  // 执行 playbook / ad-hoc
  fastify.post('/ansible/run', (req, reply) => {
    const b = req.body as any;
    const kind = b.kind === 'adhoc' ? 'adhoc' : 'playbook';
    if (kind === 'playbook' && !b.playbook) return reply.code(400).send({ error: '请选择 Playbook' });
    if (kind === 'adhoc' && !b.module) return reply.code(400).send({ error: '请选择模块' });
    const r = runAnsible({
      kind, playbook: b.playbook, module: b.module, adhocArgs: b.adhocArgs,
      extraVars: b.extraVars, target: b.target, notify: !!b.notify,
      title: b.title || undefined,
    });
    return r;
  });

  // 定时调度
  fastify.get('/ansible/schedules', () => listSchedules());
  fastify.post('/ansible/schedules', (req) => {
    const { schedules } = req.body as any;
    if (!Array.isArray(schedules)) return { error: 'schedules 需为数组' };
    saveSchedules(schedules.map((s: any) => ({ ...s, nextRunAt: s.nextRunAt || new Date(Date.now() + (Number(s.intervalMin) || 60) * 60000).toISOString() })));
    audit('ansible', 'schedules', '更新定时任务', 'web');
    return { ok: true, schedules: listSchedules() };
  });
  fastify.post('/ansible/schedules/run', (req) => {
    const { id } = req.body as any;
    const s = listSchedules().find((x: any) => x.id === id);
    if (!s) return { error: '未找到定时任务' };
    return runAnsible({ kind: s.kind, playbook: s.playbook, module: s.module, adhocArgs: s.adhocArgs, extraVars: s.extraVars, target: s.target || 'all', notify: !!s.notify, scheduleId: s.id, title: `[手动] ${s.name}` });
  });

  startScheduler();
}
