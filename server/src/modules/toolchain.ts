// 本地构建工具链(编译器/构建器)注册中心:JDK/Python/Maven/Gradle/Go/Node/Flask/Django 等
// 供「构建工具配置」页检测/配置,并在 Jenkins 构建引擎执行构建步骤时注入到 PATH/环境变量。
import { join } from 'node:path';

export interface ToolchainDef {
  id: string;
  name: string;
  kind: 'language' | 'build' | 'framework' | 'runtime';
  envVar?: string;        // 注入的环境变量名(如 JAVA_HOME)
  binDir?: string;        // 可执行文件子目录(默认 bin)
  probe: string;          // 检测命令(找到则输出版本,否则非 0 退出)
  install: string;        // 安装指引
  docs?: string;
}

export const TOOLCHAIN: ToolchainDef[] = [
  { id: 'java', name: 'Java(JDK)', kind: 'language', envVar: 'JAVA_HOME', binDir: 'bin', probe: 'command -v java >/dev/null 2>&1 && java -version 2>&1 | head -1', install: 'sudo apt install openjdk-17-jdk 或 docker run eclipse-temurin:17', docs: 'Java 编译/运行环境' },
  { id: 'python', name: 'Python', kind: 'language', envVar: 'PYTHON_HOME', binDir: 'bin', probe: 'command -v python3 >/dev/null 2>&1 && python3 --version', install: 'sudo apt install python3 python3-pip', docs: 'Python 解释器 + pip' },
  { id: 'maven', name: 'Maven', kind: 'build', envVar: 'MAVEN_HOME', binDir: 'bin', probe: 'command -v mvn >/dev/null 2>&1 && mvn -version | head -1', install: 'sudo apt install maven 或 docker run maven:3.9', docs: 'Java 项目构建/依赖管理' },
  { id: 'gradle', name: 'Gradle', kind: 'build', envVar: 'GRADLE_HOME', binDir: 'bin', probe: 'command -v gradle >/dev/null 2>&1 && gradle -v 2>/dev/null | grep -i "^Gradle" | head -1', install: 'sudo apt install gradle 或 docker run gradle:8', docs: 'JVM 项目构建工具' },
  { id: 'go', name: 'Go(Golang)', kind: 'language', envVar: 'GOROOT', binDir: 'bin', probe: 'command -v go >/dev/null 2>&1 && go version', install: 'sudo apt install golang-go 或 docker run golang:1.22', docs: 'Go 编译器与工具链' },
  { id: 'node', name: 'Node.js', kind: 'runtime', envVar: 'NODE_HOME', binDir: 'bin', probe: 'command -v node >/dev/null 2>&1 && node -v && command -v npm >/dev/null 2>&1 && echo "npm $(npm -v)"', install: 'sudo apt install nodejs npm 或 docker run node:20', docs: 'JavaScript 运行时 + npm' },
  { id: 'gcc', name: 'GCC(C/C++)', kind: 'language', probe: 'command -v gcc >/dev/null 2>&1 && gcc --version | head -1', install: 'sudo apt install build-essential', docs: 'C/C++ 编译器' },
  { id: 'rust', name: 'Rust(Cargo)', kind: 'language', envVar: 'CARGO_HOME', binDir: 'bin', probe: 'command -v cargo >/dev/null 2>&1 && cargo --version', install: 'curl --proto =https https://sh.rustup.rs | sh', docs: 'Rust 编译与包管理' },
  { id: 'php', name: 'PHP', kind: 'language', probe: 'command -v php >/dev/null 2>&1 && php --version | head -1', install: 'sudo apt install php-cli', docs: 'PHP 解释器' },
  { id: 'flask', name: 'Flask(Python)', kind: 'framework', probe: 'python3 -c "import flask; print(flask.__version__)" 2>/dev/null', install: 'pip3 install flask', docs: 'Python Web 框架' },
  { id: 'django', name: 'Django(Python)', kind: 'framework', probe: 'python3 -c "import django; print(django.get_version())" 2>/dev/null', install: 'pip3 install django', docs: 'Python Web 框架' },
  { id: 'pip', name: 'pip(Python 包管理)', kind: 'build', probe: 'command -v pip3 >/dev/null 2>&1 && pip3 --version', install: 'sudo apt install python3-pip', docs: 'Python 包管理' },
];

// 根据「构建工具配置」里保存的手动路径,生成注入到构建步骤的 PATH 前缀与环境变量
export function toolEnv(cfg: Record<string, { path?: string }>): { pathPrefix: string; env: Record<string, string> } {
  const dirs: string[] = [];
  const env: Record<string, string> = {};
  for (const t of TOOLCHAIN) {
    const p = String(cfg[t.id]?.path || '').trim();
    if (!p) continue;
    env[t.envVar || (t.id.toUpperCase() + '_HOME')] = p;
    dirs.push(p);
    dirs.push(join(p, t.binDir || 'bin'));
  }
  return { pathPrefix: dirs.join(':'), env };
}

export const toolchainById = (id: string) => TOOLCHAIN.find((t) => t.id === id);
