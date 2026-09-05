// 工具/中间件注册中心。每个工具有：类别、默认端口、systemd 单元名、探测命令、
// 安装规划(apt/docker/二进制)。未安装时也返回可执行的安装指引，安装后自动被探测到。
import { Host, run } from '../lib/host.js';

export interface ToolDef {
  id: string;
  name: string;
  category: 'observability' | 'data' | 'messaging' | 'cache' | 'gateway' | 'container' | 'monitor' | 'storage' | 'devops' | 'security';
  port?: number;
  systemd?: string[];      // 可能的服务名
  probeCmd?: string;       // 自定义探测命令
  install: string;         // 一键安装提示
  ui: 'dashboard' | 'logs' | 'metrics' | 'data' | 'none';  // 预留页面类型
  docs?: string;
}

export const TOOLS: ToolDef[] = [
  // 可观测性
  { id: 'elasticsearch', name: 'Elasticsearch', category: 'observability', port: 9200, systemd: ['elasticsearch'], install: 'sudo apt install elasticsearch 或 docker run -p 9200:9200 docker.elastic.co/elasticsearch/elasticsearch:8.x', ui: 'data' },
  { id: 'kibana', name: 'Kibana', category: 'observability', port: 5601, systemd: ['kibana'], install: 'docker run -p 5601:5601 docker.elastic.co/kibana/kibana:8.x', ui: 'dashboard' },
  { id: 'logstash', name: 'Logstash', category: 'observability', port: 9600, systemd: ['logstash'], install: 'docker run docker.elastic.co/logstash/logstash:8.x', ui: 'none' },
  { id: 'loki', name: 'Loki (Grafana)', category: 'observability', port: 3100, systemd: ['loki'], install: 'docker run -p 3100:3100 grafana/loki:latest', ui: 'logs' },
  { id: 'promtail', name: 'Promtail(采集)', category: 'observability', install: 'docker run grafana/promtail:latest -config.file=/etc/promtail/promtail.yaml', ui: 'none' },
  { id: 'prometheus', name: 'Prometheus', category: 'monitor', port: 9090, systemd: ['prometheus'], install: 'docker run -p 9090:9090 -v $PWD/prometheus.yml:/etc/prometheus/prometheus.yml prom/prometheus', ui: 'metrics' },
  { id: 'grafana', name: 'Grafana', category: 'monitor', port: 3000, systemd: ['grafana-server'], install: 'docker run -p 3000:3000 grafana/grafana', ui: 'dashboard' },
  { id: 'node-exporter', name: 'Node Exporter', category: 'monitor', port: 9100, install: 'docker run -p 9100:9100 prom/node-exporter', ui: 'metrics' },
  { id: 'alertmanager', name: 'Alertmanager', category: 'monitor', port: 9093, install: 'docker run -p 9093:9093 prom/alertmanager', ui: 'dashboard' },
  { id: 'skywalking', name: 'SkyWalking(链路)', category: 'observability', port: 11800, install: 'docker run apache/skywalking-oap-server:latest', ui: 'dashboard' },
  { id: 'jaeger', name: 'Jaeger(链路)', category: 'observability', port: 16686, systemd: ['jaeger'], install: 'docker run -p 16686:16686 jaegertracing/all-in-one', ui: 'dashboard' },
  // 数据
  { id: 'mysql', name: 'MySQL', category: 'data', port: 3306, systemd: ['mysql', 'mysqld'], install: 'sudo apt install mysql-server', ui: 'data' },
  { id: 'postgresql', name: 'PostgreSQL', category: 'data', port: 5432, systemd: ['postgresql'], install: 'sudo apt install postgresql', ui: 'data' },
  { id: 'mongodb', name: 'MongoDB', category: 'data', port: 27017, systemd: ['mongod'], install: 'sudo apt install mongodb-org', ui: 'data' },
  { id: 'qdrant', name: 'Qdrant(向量库)', category: 'data', port: 6333, install: 'docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant', ui: 'dashboard', docs: '向量检索/相似度搜索,为 RAG/ML 准备' },
  { id: 'chroma', name: 'Chroma(向量库)', category: 'data', port: 8000, install: 'docker run -p 8000:8000 chromadb/chroma', ui: 'dashboard', docs: '轻量向量数据库,REST API 易接入' },
  { id: 'redis', name: 'Redis', category: 'cache', port: 6379, systemd: ['redis-server'], install: 'sudo apt install redis-server', ui: 'data' },
  { id: 'clickhouse', name: 'ClickHouse', category: 'data', port: 8123, systemd: ['clickhouse-server'], install: 'sudo apt install clickhouse-server 或 docker run clickhouse/clickhouse-server', ui: 'data' },
  // 消息
  { id: 'kafka', name: 'Kafka', category: 'messaging', port: 9092, systemd: ['kafka'], install: 'docker compose 起 kafka+zookeeper 或 KRaft 单机', ui: 'dashboard' },
  { id: 'zookeeper', name: 'ZooKeeper', category: 'messaging', port: 2181, systemd: ['zookeeper'], install: 'docker run -p 2181:2181 zookeeper', ui: 'none' },
  { id: 'rabbitmq', name: 'RabbitMQ', category: 'messaging', port: 5672, systemd: ['rabbitmq-server'], install: 'docker run -p 5672:5672 -p 15672:15672 rabbitmq:3-management', ui: 'dashboard' },
  { id: 'nats', name: 'NATS', category: 'messaging', port: 4222, systemd: ['nats-server'], install: 'docker run -p 4222:4222 nats', ui: 'none' },
  { id: 'emqx', name: 'EMQX(MQTT)', category: 'messaging', port: 1883, install: 'docker run -p 1883:1883 emqx/emqx', ui: 'dashboard' },
  // 网关/存储/其他
  { id: 'nginx', name: 'Nginx', category: 'gateway', port: 80, systemd: ['nginx'], install: 'sudo apt install nginx', ui: 'dashboard' },
  { id: 'minio', name: 'MinIO(对象存储)', category: 'storage', port: 9000, systemd: ['minio'], install: 'docker run -p 9000:9000 minio/minio server /data', ui: 'dashboard' },
  { id: 'harbor', name: 'Harbor(镜像仓库)', category: 'storage', port: 80, install: '用 harbor 离线安装包安装', ui: 'dashboard' },
  { id: 'portainer', name: 'Portainer', category: 'container', port: 9000, install: 'docker run -p 9000:9000 portainer/portainer', ui: 'dashboard' },
  { id: 'jenkins', name: 'Jenkins(CI)', category: 'devops', port: 8080, systemd: ['jenkins'], install: 'docker run -p 8080:8080 -p 50000:50000 jenkins/jenkins', ui: 'dashboard' },
  { id: 'gitlab', name: 'GitLab', category: 'devops', port: 80, systemd: ['gitlab-runner'], install: 'docker run gitlab/gitlab-ce', ui: 'dashboard' },
  { id: 'sonarqube', name: 'SonarQube', category: 'devops', port: 9000, install: 'docker run sonarqube:lts-community', ui: 'dashboard' },
  // ===== 安全 / 渗透测试(靶场与演练, 镜像来自 Docker Hub) =====
  { id: 'dvwa', name: 'DVWA 靶场', category: 'security', port: 80, install: 'docker run -p 80:80 vulnerables/web-dvwa (默认 admin/password)', ui: 'dashboard', docs: 'Web 漏洞演练:SQL注入/XSS/上传等' },
  { id: 'juice-shop', name: 'Juice Shop 靶场', category: 'security', port: 3000, install: 'docker run -p 3000:3000 bkimminich/juice-shop', ui: 'dashboard', docs: 'OWASP 现代 Web 漏洞靶场' },
  { id: 'webgoat', name: 'WebGoat 教学靶场', category: 'security', port: 8080, install: 'docker run -p 8080:8080 webgoat/webgoat-8.0', ui: 'dashboard', docs: 'OWASP 交互式安全教学靶场' },
  { id: 'zap', name: 'OWASP ZAP 代理', category: 'security', port: 8080, install: 'docker run -p 8080:8080 zaproxy/zap-stable', ui: 'dashboard', docs: 'Web 应用安全代理/主动扫描' },
  { id: 'gophish', name: 'GoPhish 钓鱼演练', category: 'security', port: 3333, install: 'docker run -p 3333:3333 -p 80:80 gophish/gophish (默认 admin@gophish.io/gophish)', ui: 'dashboard', docs: '钓鱼邮件/登录页演练平台' },
  { id: 'beef', name: 'BeEF 浏览器框架', category: 'security', port: 3000, install: 'docker run -p 3000:3000 beefproject/beef (默认 beef:beef)', ui: 'dashboard', docs: '浏览器漏洞利用与 XSS hook 框架(仅限自管靶场)' },
];

// 探测一台主机上某工具状态
export async function probeTool(host: Host, tool: ToolDef): Promise<ToolStatus> {
  const probes: string[] = [];
  if (tool.systemd?.length) probes.push(...tool.systemd.map((u) => `echo "svc:${u}="; systemctl is-active ${u} 2>/dev/null || echo inactive`));
  if (tool.port) probes.push(`echo "port:${tool.port}="; ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE '[:.]${tool.port}$' && echo LISTEN || echo closed`);
  probes.push(`echo "docker:"; docker ps --format '{{.Names}} {{.Image}} {{.Status}}' 2>/dev/null | grep -iE '${tool.name.split(' ')[0].toLowerCase()}|${tool.id}' | head -5 || echo none`);
  const cmd = probes.join('\n');
  const r = await run(host, cmd, 25000);
  const out = r.stdout;
  const parse = (prefix: string) => { const m = out.match(new RegExp(`${prefix}[:=]([^\\n\\r]*)`)); return m ? m[1].trim() : null; };
  const svc = tool.systemd?.map((u) => parse(`svc:${u}`)).find((s) => s && s !== 'inactive') || null;
  const port = parse(`port:${tool.port}`) === 'LISTEN';
  const hasDocker = /docker:/.test(out) && !/docker:\s*(none|$)/.test(out);
  const dp = out.match(/docker:\s*([\s\S]*?)(?=\nsvc:|$)/);
  const status: ToolStatus = {
    id: tool.id,
    name: tool.name,
    detected: !!(svc || port || hasDocker),
    running: svc === 'active' || port || hasDocker,
    service: svc,
    portOpen: port,
    docker: hasDocker ? (dp?.[1]?.trim() || true) : false,
    installHint: tool.install,
    raw: out,
  };
  return status;
}

export interface ToolStatus {
  id: string;
  name: string;
  detected: boolean;
  running: boolean;
  service: string | null;
  portOpen: boolean;
  docker: string | boolean;
  installHint: string;
  raw: string;
}

// ===== 一键 Docker 部署模板（docker run 可拉起） =====
export interface DockerTemplate {
  image: string;
  ports: number[];      // 对外暴露端口(host:container 同值)
  extra?: string;       // 附加参数/环境变量/卷
  mgmtPort?: number;    // 管理端口(如 rabbitmq 15672)，不探测但可提示
}

export const DOCKER_TEMPLATE: Record<string, DockerTemplate> = {
  redis:      { image: 'redis:7', ports: [6379], extra: '-v redis-data:/data' },
  nginx:      { image: 'nginx:alpine', ports: [80] },
  elasticsearch: { image: 'docker.elastic.co/elasticsearch/elasticsearch:8.13.4', ports: [9200], extra: '-e discovery.type=single-node -e xpack.security.enabled=false' },
  kibana:     { image: 'docker.elastic.co/kibana/kibana:8.13.4', ports: [5601], extra: '-e ELASTICSEARCH_HOSTS=http://host.docker.internal:9200' },
  logstash:   { image: 'docker.elastic.co/logstash/logstash:8.13.4', ports: [9600] },
  loki:       { image: 'grafana/loki:3.1.1', ports: [3100], extra: '-e loki.config.file=""' },
  promtail:   { image: 'grafana/promtail:3.1.1', ports: [9080] },
  prometheus: { image: 'prom/prometheus:v2.53.0', ports: [9090] },
  grafana:    { image: 'grafana/grafana:11.1.0', ports: [3000] },
  'node-exporter': { image: 'prom/node-exporter:v1.8.2', ports: [9100] },
  alertmanager: { image: 'prom/alertmanager:v0.27.0', ports: [9093] },
  jaeger:     { image: 'jaegertracing/all-in-one:1.58', ports: [16686], extra: '-p 16685:16685' },
  clickhouse: { image: 'clickhouse/clickhouse-server:24.6', ports: [8123], extra: '-p 9000:9000' },
  zookeeper:  { image: 'zookeeper:3.9', ports: [2181] },
  rabbitmq:   { image: 'rabbitmq:3-management', ports: [5672], extra: '-p 15672:15672', mgmtPort: 15672 },
  nats:       { image: 'nats:2.10', ports: [4222], extra: '-p 8222:8222' },
  emqx:       { image: 'emqx/emqx:5.7', ports: [1883], extra: '-p 18083:18083', mgmtPort: 18083 },
  minio:      { image: 'minio/minio:latest', ports: [9000], extra: '-e MINIO_ROOT_USER=admin -e MINIO_ROOT_PASSWORD=admin123 minio server /data' },
  portainer:  { image: 'portainer/portainer-ce:latest', ports: [9000], extra: '-v /var/run/docker.sock:/var/run/docker.sock -v portainer_data:/data' },
  sonarqube:  { image: 'sonarqube:lts-community', ports: [9000] },
  skywalking: { image: 'apache/skywalking-oap-server:10.0.0', ports: [11800] },
  mysql:      { image: 'mysql:8', ports: [3306], extra: '-e MYSQL_ROOT_PASSWORD=root123' },
  postgresql: { image: 'postgres:16', ports: [5432], extra: '-e POSTGRES_PASSWORD=postgres' },
  mongodb:    { image: 'mongo:7', ports: [27017] },
  qdrant:     { image: 'qdrant/qdrant:latest', ports: [6333], extra: '-p 6334:6334' },
  chroma:     { image: 'chromadb/chroma:latest', ports: [8000] },
  sqlite:     { image: 'nouchka/sqlite3:latest', ports: [] },
  jenkins:    { image: 'jenkins/jenkins:lts', ports: [8080], extra: '-p 50000:50000' },
  // ===== 安全 / 渗透(一键拉起靶场与工具) =====
  dvwa:       { image: 'vulnerables/web-dvwa', ports: [80] },
  'juice-shop': { image: 'bkimminich/juice-shop', ports: [3000] },
  webgoat:    { image: 'webgoat/webgoat-8.0', ports: [8080] },
  zap:        { image: 'zaproxy/zap-stable', ports: [8080] },
  gophish:    { image: 'gophish/gophish', ports: [3333], extra: '-p 80:80' },
  beef:       { image: 'beefproject/beef', ports: [3000] },
};

export function isDockerDeployable(id: string) { return !!DOCKER_TEMPLATE[id]; }

export function dockerRunCommand(tool: ToolDef, hostId: string, opts: { image?: string; mirror?: string } = {}): string {
  const t = DOCKER_TEMPLATE[tool.id];
  const name = `opshub-${tool.id}-${hostId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'local'}`;
  const ports = (t.ports || []).map((p) => `-p ${p}:${p}`).join(' ');
  const baseImage = opts.image || t.image;
  const image = opts.mirror ? opts.mirror.replace(/\/$/, '') + '/' + baseImage : baseImage;
  return `docker rm -f ${name} 2>/dev/null; docker run -d --restart=unless-stopped --name ${name} ${ports} ${t.extra || ''} ${image}`.trim();
}

export function getContainerName(toolId: string, hostId: string): string {
  return `opshub-${toolId}-${hostId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'local'}`;
}

