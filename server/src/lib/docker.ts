// Docker 封装。本机连接 unix socket；远端主机经宿主机的 tcp 或 agent 桥接（预留）。
import Docker from 'dockerode';
import { Host } from './host.js';

function dockerFor(host: Host | null | undefined): Docker {
  if (host && host.kind === 'local') {
    return new Docker({ socketPath: '/var/run/docker.sock' });
  }
  if (!host || host.kind === 'local') {
    return new Docker({ socketPath: '/var/run/docker.sock' });
  }
  // 远端：暂通过主机上已暴露的 TCP 端口；未配置则抛错由上层提示
  throw new Error(`主机 ${host.name} 未配置 Docker 远程访问（可开启 2375 或接入 agent 桥）`);
}

export async function dockerInfo(host?: Host) {
  const d = dockerFor(host);
  const [info, version] = await Promise.all([d.info(), d.version()]);
  return { info, version };
}

export async function listContainers(host?: Host, all = true) {
  const d = dockerFor(host);
  const cs = await d.listContainers({ all });
  return cs.map((c) => ({
    id: c.Id,
    shortId: c.Id.slice(0, 12),
    names: c.Names,
    image: c.Image,
    imageId: c.ImageID,
    command: c.Command,
    created: c.Created,
    state: c.State,
    status: c.Status,
    ports: c.Ports,
    labels: c.Labels,
    networks: c.NetworkSettings?.Networks,
    sizeRw: c.SizeRw,
  }));
}

export async function containerDetail(host: Host | undefined, id: string) {
  const d = dockerFor(host);
  const c = d.getContainer(id);
  const [inspect, stats] = await Promise.all([
    c.inspect(),
    c.stats({ stream: false }).catch(() => null),
  ]);
  return { inspect, stats };
}

export async function containerLogs(host: Host | undefined, id: string, tail = 500) {
  const d = dockerFor(host);
  const c = d.getContainer(id);
  const buf = await c.logs({ stdout: true, stderr: true, tail });
  return stripAnsi(buf.toString('utf8').replace(/\x01[^\x01]*\x02/g, ''));
}

function stripAnsi(s: string) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u001b\[[0-9;]*m/g, '');
}

export async function containerAction(host: Host | undefined, id: string, action: 'start' | 'stop' | 'restart' | 'pause' | 'unpause' | 'kill' | 'remove') {
  const d = dockerFor(host);
  const c = d.getContainer(id);
  if (action === 'remove') await c.remove({ force: true });
  else await c[action]();
  return { ok: true, action };
}

export async function listImages(host?: Host) {
  const d = dockerFor(host);
  const imgs = await d.listImages({ all: true });
  return imgs.map((i) => ({
    id: i.Id,
    shortId: i.Id.slice(7, 19),
    repoTags: i.RepoTags,
    repoDigests: i.RepoDigests,
    created: i.Created,
    size: i.Size,
    virtualSize: i.VirtualSize,
    containers: i.Containers,
    labels: i.Labels,
  }));
}

export async function imageInspect(host: Host | undefined, id: string) {
  const d = dockerFor(host);
  return d.getImage(id).inspect();
}

export async function listVolumes(host?: Host) {
  const d = dockerFor(host);
  return d.listVolumes().then((v) => v.Volumes ?? []);
}

export async function listNetworks(host?: Host) {
  const d = dockerFor(host);
  return d.listNetworks();
}

export async function listComposeProjects() {
  // 预留：扫描 docker-compose 项目
  return [];
}
