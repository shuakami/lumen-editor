/** uapis.cn /execution/run 语言标识（https://uapis.cn/docs/api-reference/post-execution-run） */
const LANGS: Record<string, string> = {
  c: "c",
  cpp: "cpp",
  go: "go",
  javascript: "javascript",
  python: "python",
  typescript: "typescript",
};

export function runCommandLabel(langId: string, path: string): string {
  const stem = path.replace(/^.*\//, "").replace(/\.[^.]+$/, "");
  switch (langId) {
    case "c":
      return `gcc ${path} -o ${stem} && ./${stem}`;
    case "cpp":
      return `g++ ${path} -o ${stem} && ./${stem}`;
    case "python":
      return `python3 ${path}`;
    case "javascript":
      return `node ${path}`;
    case "typescript":
      return `tsx ${path}`;
    case "go":
      return `go run ${path}`;
    case "csharp":
      return `csc ${path} && mono ${stem}.exe`;
    case "rust":
      return `rustc ${path} -o ${stem} && ./${stem}`;
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
  return langId in LANGS;
}

export interface RunResult {
  ok: boolean;
  compileOutput: string;
  output: string;
  code: number | null;
}

interface UapiRunResponse {
  status?: string;
  language?: string;
  stdout?: string;
  stderr?: string;
  exit_code?: number | null;
  signal?: number | null;
  compile_ms?: number;
  run_ms?: number;
  total_ms?: number;
  timed_out?: boolean;
  stdout_truncated?: boolean;
  stderr_truncated?: boolean;
  error?: string | null;
}

interface UapiErrorBody {
  code?: string;
  message?: string;
}

const ENDPOINT = "https://uapis.cn/api/v1/execution/run";
const REQUEST_TIMEOUT_MS = 45000;

/** 用户在设置里填写的 uapis.cn API key（uapi- 开头），存 localStorage。 */
export const UAPI_KEY_STORAGE = "lumen.uapi.key";

export function getUapiKey(): string {
  return localStorage.getItem(UAPI_KEY_STORAGE) ?? "";
}

export async function runCode(langId: string, source: string): Promise<RunResult> {
  const language = LANGS[langId];
  if (!language) return { ok: false, compileOutput: "", output: `不支持运行 ${langId}`, code: null };

  const key = getUapiKey();
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: key ? { "Content-Type": "application/json", Authorization: `Bearer ${key}` } : { "Content-Type": "application/json" },
      body: JSON.stringify({
        language,
        code: source,
        timeout_ms: 20000,
        network: { mode: "offline" },
        packs: [],
      }),
      signal: controller.signal,
    });
  } catch (e) {
    window.clearTimeout(timer);
    const aborted = e instanceof DOMException && e.name === "AbortError";
    return {
      ok: false,
      compileOutput: "",
      output: aborted
        ? `请求超时（${REQUEST_TIMEOUT_MS / 1000}s），已取消。`
        : `无法连接运行服务（浏览器直连需要 key：菜单 Run → 运行服务密钥…）。`,
      code: null,
    };
  }
  window.clearTimeout(timer);

  if (res.status === 403) {
    let message = "浏览器直连运行服务被拒绝（CORS_FORBIDDEN）。";
    try {
      const err = (await res.json()) as UapiErrorBody;
      if (err.message) message = `${err.message}（菜单 Run → 运行服务密钥… 可填入 key）`;
    } catch { /* 保留默认信息 */ }
    return { ok: false, compileOutput: "", output: message, code: null };
  }
  if (res.status === 413) {
    return { ok: false, compileOutput: "", output: "源代码超出 65536 字节限制。", code: null };
  }
  if (res.status === 503) {
    return { ok: false, compileOutput: "", output: "运行服务暂时不可用或排队已满，请稍后重试。", code: null };
  }
  if (res.status === 504) {
    return { ok: false, compileOutput: "", output: "等待执行结果超时（服务高负载），请重试。", code: null };
  }
  if (!res.ok) {
    let message = `运行服务错误 (HTTP ${res.status})`;
    try {
      const err = (await res.json()) as UapiErrorBody;
      if (err.code) message += ` [${err.code}]`;
      if (err.message) message += `：${err.message}`;
    } catch { /* 错误体不可解析时保留默认信息 */ }
    return { ok: false, compileOutput: "", output: message, code: null };
  }

  let data: UapiRunResponse;
  try {
    data = (await res.json()) as UapiRunResponse;
  } catch {
    return { ok: false, compileOutput: "", output: "运行服务返回了无法解析的响应。", code: null };
  }

  // HTTP 200 只代表任务被接收并跑完；代码成败由 status 决定
  const status = data.status ?? "";
  const compile = data.stderr ?? "";
  const out: string[] = [];
  if (data.stdout) out.push(data.stdout);
  if (status === "compile_error") out.push(compile);
  else if (compile) out.push(compile);
  if (data.stdout_truncated) out.push("（标准输出超出限制，已截断）");
  if (data.stderr_truncated) out.push("（标准错误超出限制，已截断）");
  if (data.timed_out) out.push(`执行超过 ${20000 / 1000}s 被强制终止。`);
  if (data.error && status !== "success") out.push(`环境错误：${data.error}`);

  const ok = status === "success" && (data.exit_code ?? 0) === 0;
  const code = data.exit_code ?? null;
  return { ok, compileOutput: status === "compile_error" ? compile : "", output: out.join(""), code };
}
