/** GitHub 仓库接入：树加载、按需读文件、提交（自动处理冲突）。 */

export interface GhRepoRef {
  owner: string;
  repo: string;
  branch: string;
  token?: string;
}

export interface GhEntry {
  path: string;
  sha: string;
  size: number;
}

export interface GhTree {
  ref: GhRepoRef;
  entries: GhEntry[];
  headSha: string;
}

/** 同步引擎的 sync action：一次远端变更中单个文件的增量动作。 */
export interface GhFileDelta {
  path: string;
  sha: string;
  size: number;
  status: "added" | "modified" | "removed" | "renamed";
  previousPath?: string;
}

const API = "https://api.github.com";

function headers(token?: string): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function gh<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...headers(token), ...(init?.headers ?? {}) } });
  if (!res.ok) {
    let msg = `GitHub API ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) msg = `${msg}: ${body.message}`;
    } catch { /* ignore */ }
    const err = new Error(msg) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

/** 支持 owner/repo、https://github.com/owner/repo(.git)、git@github.com:owner/repo。 */
export function parseRepoInput(input: string): { owner: string; repo: string } | null {
  const s = input.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  let m = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com[/:]([^/]+)\/([^/]+)/i);
  if (!m) m = s.match(/^git@github\.com:([^/]+)\/([^/]+)$/i);
  if (!m) m = s.match(/^([\w.-]+)\/([\w.-]+)$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

/** 一次 recursive tree 请求拿到全部文件列表（原生速度，不逐目录请求）。 */
export async function openRepo(owner: string, repo: string, token?: string, branch?: string): Promise<GhTree> {
  const info = await gh<{ default_branch: string }>(`/repos/${owner}/${repo}`, token);
  const br = branch?.trim() || info.default_branch;
  const ref: GhRepoRef = { owner, repo, branch: br, token };
  const headSha = await getHeadSha(ref);
  const tree = await gh<{ tree: Array<{ path: string; type: string; sha: string; size?: number }>; truncated: boolean }>(
    `/repos/${owner}/${repo}/git/trees/${headSha}?recursive=1`,
    token
  );
  const entries = tree.tree
    .filter((e) => e.type === "blob")
    .map((e) => ({ path: e.path, sha: e.sha, size: e.size ?? 0 }));
  return { ref, entries, headSha };
}

/** 分支当前 head commit sha（相当于 LSE 的 lastSyncId）。 */
export async function getHeadSha(ref: GhRepoRef): Promise<string> {
  const r = await gh<{ object: { sha: string } }>(
    `/repos/${ref.owner}/${ref.repo}/git/ref/heads/${encodeURIComponent(ref.branch)}`,
    ref.token
  );
  return r.object.sha;
}

/** 两个 commit 之间的文件级增量（相当于 LSE 的 delta packet）。 */
export async function compareCommits(ref: GhRepoRef, base: string, head: string): Promise<GhFileDelta[]> {
  const r = await gh<{
    files?: Array<{ filename: string; sha: string; status: string; previous_filename?: string; changes?: number }>;
  }>(`/repos/${ref.owner}/${ref.repo}/compare/${base}...${head}`, ref.token);
  return (r.files ?? []).map((f) => ({
    path: f.filename,
    sha: f.sha,
    size: 0,
    status: f.status === "removed" ? "removed" : f.status === "added" || f.status === "copied" ? "added" : f.status === "renamed" ? "renamed" : "modified",
    previousPath: f.previous_filename,
  }));
}

export interface GhBranch {
  name: string;
  sha: string;
}

/** 分支列表（用于底部状态栏切换分支）。 */
export async function listBranches(ref: GhRepoRef): Promise<GhBranch[]> {
  const out: GhBranch[] = [];
  for (let page = 1; page <= 3; page++) {
    const r = await gh<Array<{ name: string; commit: { sha: string } }>>(
      `/repos/${ref.owner}/${ref.repo}/branches?per_page=100&page=${page}`,
      ref.token
    );
    out.push(...r.map((b) => ({ name: b.name, sha: b.commit.sha })));
    if (r.length < 100) break;
  }
  return out;
}

const dec = new TextDecoder();

function b64ToUtf8(b64: string): string {
  const bin = atob(b64.replace(/\n/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return dec.decode(bytes);
}

function utf8ToB64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** 通过 blob API 按需读取文件内容（打开时才加载）。 */
export async function fetchBlob(ref: GhRepoRef, sha: string): Promise<string> {
  const blob = await gh<{ content: string; encoding: string }>(
    `/repos/${ref.owner}/${ref.repo}/git/blobs/${sha}`,
    ref.token
  );
  return blob.encoding === "base64" ? b64ToUtf8(blob.content) : blob.content;
}

/** 二进制文件（图片等）按需读取为 base64（可直接缓存）。 */
export async function fetchBlobB64(ref: GhRepoRef, sha: string): Promise<string> {
  const blob = await gh<{ content: string; encoding: string }>(
    `/repos/${ref.owner}/${ref.repo}/git/blobs/${sha}`,
    ref.token
  );
  return blob.content.replace(/\n/g, "");
}

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export interface CommitResult {
  ok: boolean;
  newSha?: string;
  merged?: boolean;
  /** 三方合并后实际提交到远端的内容（与本地发送内容不同时存在） */
  committedContent?: string;
  message: string;
}

async function latestFileState(ref: GhRepoRef, path: string): Promise<{ sha: string; content: string } | null> {
  try {
    const f = await gh<{ sha: string; content: string; encoding: string }>(
      `/repos/${ref.owner}/${ref.repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=${encodeURIComponent(ref.branch)}`,
      ref.token
    );
    return { sha: f.sha, content: f.encoding === "base64" ? b64ToUtf8(f.content) : f.content };
  } catch (e) {
    if ((e as { status?: number }).status === 404) return null;
    throw e;
  }
}

/** 逐行三方合并：base→ours 与 base→theirs 不冲突的改动都保留，冲突处取 ours。 */
function merge3(base: string, ours: string, theirs: string): { text: string; clean: boolean } {
  if (theirs === base || theirs === ours) return { text: ours, clean: true };
  if (ours === base) return { text: theirs, clean: true };
  const b = base.split("\n"), o = ours.split("\n"), t = theirs.split("\n");
  const out: string[] = [];
  let clean = true;
  const max = Math.max(b.length, o.length, t.length);
  for (let i = 0; i < max; i++) {
    const bl = b[i], ol = o[i], tl = t[i];
    if (ol === tl) { if (ol !== undefined) out.push(ol); }
    else if (tl === bl) { if (ol !== undefined) out.push(ol); }
    else if (ol === bl) { if (tl !== undefined) out.push(tl); }
    else { if (ol !== undefined) out.push(ol); clean = false; }
  }
  return { text: out.join("\n"), clean };
}

export interface GhCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  avatar?: string;
  parents: string[];
}

/** 提交历史（分支或单个文件），用于提交树与文件修改历史。 */
export async function listCommits(
  ref: GhRepoRef,
  opts: { path?: string; page?: number; perPage?: number } = {}
): Promise<GhCommit[]> {
  const params = new URLSearchParams({
    sha: ref.branch,
    per_page: String(opts.perPage ?? 30),
    page: String(opts.page ?? 1),
  });
  if (opts.path) params.set("path", opts.path);
  const r = await gh<Array<{
    sha: string;
    commit: { message: string; author?: { name?: string; date?: string } };
    author?: { login?: string; avatar_url?: string } | null;
    parents: Array<{ sha: string }>;
  }>>(`/repos/${ref.owner}/${ref.repo}/commits?${params}`, ref.token);
  return r.map((c) => ({
    sha: c.sha,
    message: c.commit.message,
    author: c.author?.login || c.commit.author?.name || "unknown",
    date: c.commit.author?.date ?? "",
    avatar: c.author?.avatar_url,
    parents: c.parents.map((p) => p.sha),
  }));
}

/** 读取某个提交处的文件内容（文件历史查看）。 */
export async function fetchFileAtCommit(ref: GhRepoRef, path: string, commitSha: string): Promise<string> {
  const f = await gh<{ content: string; encoding: string }>(
    `/repos/${ref.owner}/${ref.repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=${commitSha}`,
    ref.token
  );
  return f.encoding === "base64" ? b64ToUtf8(f.content) : f.content;
}

export interface GhCodeHit {
  path: string;
  fragment: string;
}

/** GitHub code search（覆盖尚未加载到本地的文件）。 */
export async function searchCode(ref: GhRepoRef, q: string): Promise<GhCodeHit[]> {
  const res = await gh<{ items: Array<{ path: string; text_matches?: Array<{ fragment: string }> }> }>(
    `/search/code?q=${encodeURIComponent(`${q} repo:${ref.owner}/${ref.repo}`)}&per_page=20`,
    ref.token,
    { headers: { Accept: "application/vnd.github.text-match+json" } }
  );
  return res.items.map((i) => ({ path: i.path, fragment: i.text_matches?.[0]?.fragment ?? "" }));
}

/**
 * 提交单个文件。若远端已被他人更新（sha 变化），自动拉取最新内容做三方合并后重试。
 */
export async function commitFile(
  ref: GhRepoRef,
  path: string,
  content: string,
  baseSha: string | undefined,
  baseContent: string,
  message: string
): Promise<CommitResult> {
  const put = async (body: string, sha?: string) =>
    gh<{ content: { sha: string } }>(
      `/repos/${ref.owner}/${ref.repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}`,
      ref.token,
      {
        method: "PUT",
        body: JSON.stringify({ message, content: utf8ToB64(body), branch: ref.branch, ...(sha ? { sha } : {}) }),
      }
    );

  try {
    const r = await put(content, baseSha);
    return { ok: true, newSha: r.content.sha, message: "已提交" };
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status !== 409 && status !== 422) throw e;
  }

  const latest = await latestFileState(ref, path);
  if (!latest) {
    const r = await put(content);
    return { ok: true, newSha: r.content.sha, message: "已提交（远端文件曾被删除，已重新创建）" };
  }
  const { text, clean } = merge3(baseContent, content, latest.content);
  const r = await put(text, latest.sha);
  return {
    ok: true,
    newSha: r.content.sha,
    merged: true,
    committedContent: text !== content ? text : undefined,
    message: clean ? "远端有更新，已自动合并后提交" : "远端有更新，存在冲突行（以本地为准）已提交",
  };
}
