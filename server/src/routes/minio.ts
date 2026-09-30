// MinIO 对象存储管理: 启动/停止/状态/桶管理/文件浏览
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { store } from '../lib/store.js';

const CFG = 'minio.json';
const MINIO_BIN = '/usr/local/bin/minio';
const DATA_DIR = '/data/minio';    // MinIO 数据目录

interface MinioConfig {
  port: number;
  consolePort: number;
  rootUser: string;
  rootPassword: string;
  dataDir: string;
  pid: number | null;
}

function defaultConfig(): MinioConfig {
  return {
    port: 9000,
    consolePort: 9001,
    rootUser: 'minioadmin',
    rootPassword: 'minioadmin',
    dataDir: DATA_DIR,
    pid: null,
  };
}

function getConfig(): MinioConfig {
  const cfg = store.read<MinioConfig>(CFG, defaultConfig());
  // 尝试重新获取 PID
  if (!cfg.pid || !existsSync(`/proc/${cfg.pid}`)) {
    cfg.pid = findRunningPid();
    store.write(CFG, cfg);
  }
  return cfg;
}

function findRunningPid(): number | null {
  try {
    const out = execSync('pgrep -x minio', { encoding: 'utf8', timeout: 5000 }).trim();
    return out ? parseInt(out.split('\n')[0]) : null;
  } catch { return null; }
}

function isRunning(): boolean {
  const pid = findRunningPid();
  return pid !== null;
}

export async function register(fastify: FastifyInstance) {
  // 获取 MinIO 状态
  fastify.get('/minio/status', async (req) => {
    const cfg = getConfig();
    const running = isRunning();
    const host = req.hostname || '127.0.0.1';
    return {
      running,
      pid: cfg.pid,
      port: cfg.port,
      consolePort: cfg.consolePort,
      dataDir: cfg.dataDir,
      endpoint: running ? `http://${host}:${cfg.port}` : null,
      consoleUrl: running ? `http://${host}:${cfg.consolePort}` : null,
    };
  });

  // 启动 MinIO
  fastify.post('/minio/start', async (reply) => {
    if (isRunning()) return { ok: false, error: 'MinIO 已在运行中' };
    const cfg = getConfig();
    if (!existsSync(MINIO_BIN)) return { ok: false, error: `MinIO 二进制不存在: ${MINIO_BIN}` };

    // 创建数据目录
    if (!existsSync(cfg.dataDir)) mkdirSync(cfg.dataDir, { recursive: true });

    try {
      const proc = spawn(MINIO_BIN, [
        'server', cfg.dataDir,
        '--address', `:${cfg.port}`,
        '--console-address', `:${cfg.consolePort}`,
      ], {
        env: {
          ...process.env,
          MINIO_ROOT_USER: cfg.rootUser,
          MINIO_ROOT_PASSWORD: cfg.rootPassword,
        },
        stdio: 'ignore',
        detached: true,
      });
      proc.unref();
      cfg.pid = proc.pid || null;
      store.write(CFG, cfg);
      return { ok: true, pid: proc.pid };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  });

  // 停止 MinIO
  fastify.post('/minio/stop', async () => {
    const cfg = getConfig();
    if (!cfg.pid) return { ok: false, error: 'MinIO 未运行' };
    try {
      execSync(`kill ${cfg.pid}`, { timeout: 5000 });
      cfg.pid = null;
      store.write(CFG, cfg);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  });

  // 获取配置
  fastify.get('/minio/config', async () => {
    const cfg = getConfig();
    // 不返回密码明文
    const { rootPassword, ...safe } = cfg;
    return safe;
  });

  // 更新配置
  fastify.post('/minio/config', async (req) => {
    const { port, consolePort, rootUser, rootPassword, dataDir } = req.body as any;
    const cfg = getConfig();
    if (port) cfg.port = port;
    if (consolePort) cfg.consolePort = consolePort;
    if (rootUser) cfg.rootUser = rootUser;
    if (rootPassword) cfg.rootPassword = rootPassword;
    if (dataDir) cfg.dataDir = dataDir;
    store.write(CFG, cfg);
    return { ok: true };
  });
}