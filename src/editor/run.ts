const COMPILERS: Record<string, string> = {
  c: "gcc-13.2.0-c",
  cpp: "gcc-13.2.0",
  csharp: "mono-6.12.0.199",
  python: "cpython-3.14.0",
  javascript: "nodejs-20.17.0",
  typescript: "typescript-5.6.2",
  rust: "rust-1.82.0",
  go: "go-1.23.2",
  java: "openjdk-jdk-22+36",
  ruby: "ruby-3.4.9",
  lua: "lua-5.4.7",
  php: "php-8.3.12",
  shellscript: "bash",
};
 
export function runCommandLabel(langId: string, path: string): string {
  const stem = path.replace(/^.*\//, "").replace(/\.[^.]+$/, "");
  switch (langId) {
    case "c":
      return `gcc ${path} -o ${stem} && ./${stem}`;
    case "cpp":
      return `g++ ${path} -o ${stem} && ./${stem}`;
    case "csharp":
      return `csc ${path} && mono ${stem}.exe`;
    case "python":
      return `python3 ${path}`;
    case "javascript":
      return `node ${path}`;
    case "typescript":
      return `tsx ${path}`;
    case "rust":
      return `rustc ${path} -o ${stem} && ./${stem}`;
    case "go":
      return `go run ${path}`;
    case "java":
      return `java ${path}`;
    case "ruby":
      return `ruby ${path}`;
    case "lua":
      return `lua ${path}`;
    case "php":
      return `php ${path}`;
    case "shellscript":
      return `bash ${path}`;
    default:
      return path;
  }
}
 
export function isRunnable(langId: string): boolean {
  return langId in COMPILERS;
}
 
export interface RunResult {
  ok: boolean;
  compileOutput: string;
  output: string;
  code: number | null;
}
 
export async function runCode(langId: string, source: string): Promise<RunResult> {
  const compiler = COMPILERS[langId];
  if (!compiler) return { ok: false, compileOutput: "", output: `不支持运行 ${langId}`, code: null };
  const res = await fetch("https://wandbox.org/api/compile.json", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ compiler, code: source }),
  });
  if (!res.ok) {
    return { ok: false, compileOutput: "", output: `运行服务错误 (HTTP ${res.status})`, code: null };
  }
  const data = await res.json();
  const compile = `${data.compiler_output ?? ""}${data.compiler_error ?? ""}`;
  const output = `${data.program_output ?? ""}${data.program_error ?? ""}`;
  const code = data.status != null && data.status !== "" ? Number(data.status) : null;
  return { ok: code === 0, compileOutput: compile, output, code };
}
