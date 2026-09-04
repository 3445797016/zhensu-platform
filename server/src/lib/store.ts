// 轻量 JSON 持久化存储，替代数据库，避免原生依赖编译。
// 每个命名空间一个文件，写时原子替换。
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(__dirname, '..', 'data');
mkdirSync(DATA_DIR, { recursive: true });

export class Store {
  private cache = new Map<string, any>();
  constructor(private dir = DATA_DIR) {}

  private path(ns: string) {
    return join(this.dir, ns.replace(/[^a-zA-Z0-9-_]/g, '_') + '.json');
  }

  read<T = any>(ns: string, fallback: T): T {
    if (this.cache.has(ns)) return this.cache.get(ns);
    const p = this.path(ns);
    if (!existsSync(p)) return fallback;
    try {
      const v = JSON.parse(readFileSync(p, 'utf-8'));
      this.cache.set(ns, v);
      return v;
    } catch {
      return fallback;
    }
  }

  write(ns: string, value: any) {
    this.cache.set(ns, value);
    const p = this.path(ns);
    const tmp = p + '.tmp';
    writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf-8');
    renameSync(tmp, p);
  }

  // 通用集合操作
  list<T = any>(ns: string): T[] {
    return Array.isArray(this.read(ns, [])) ? this.read(ns, []) : [];
  }
  get<T = any>(ns: string, id: string): T | null {
    return (this.list(ns) as any[]).find((x) => x.id === id) ?? null;
  }
  upsert(ns: string, item: any) {
    const items = this.list(ns);
    const i = items.findIndex((x) => x.id === item.id);
    if (i >= 0) items[i] = item;
    else items.push(item);
    this.write(ns, items);
    return item;
  }
  remove(ns: string, id: string) {
    this.write(ns, this.list(ns).filter((x) => x.id !== id));
  }
}

export const store = new Store();
