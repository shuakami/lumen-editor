import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ---------------- 共用工具栏：文件 icon + 统计 + 查找 + 下拉菜单 ---------------- */

type ToolbarAction = { label: string; onClick?: () => void; checked?: boolean };

function ViewToolbar(props: {
  filename: string;
  meta: string;
  find?: { value: string; onChange: (v: string) => void; placeholder: string; onEnter?: () => void };
  actions?: ToolbarAction[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [menuOpen]);
  const find = props.find;
  return (
    <div className="grid-toolbar" ref={wrapRef}>
      <span className="grid-filename">{props.filename}</span>
      <span className="grid-meta">{props.meta}</span>
      {find ? (
        <input
          className="grid-find"
          type="search"
          placeholder={find.placeholder}
          value={find.value}
          onChange={(e) => find.onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") find.onEnter?.(); }}
        />
      ) : null}
      {props.actions && props.actions.length > 0 && (
        <div className="grid-actions">
          <button className="grid-menu-btn" type="button" title="更多" onClick={() => setMenuOpen((v) => !v)}>⋯</button>
          {menuOpen && (
            <div className="ctx-menu grid-menu">
              {props.actions.map((a) => (
                <button key={a.label} className="ctx-item" onClick={() => { setMenuOpen(false); a.onClick?.(); }}>
                  <span className="ctx-check">{a.checked ? "✓" : ""}</span>
                  <span className="ctx-label">{a.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- CSV / TSV 表格渲染 + 查找 ---------------- */

type Cell = string;
interface ParsedCsv { header: Cell[]; rows: Cell[][]; }

function parseDelimited(source: string, filename: string): ParsedCsv {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  let delim = ext === "tsv" ? "\t" : ",";
  if (ext !== "tsv") {
    const counts: Array<[string, number]> = [
      [",", (firstLine.match(/,/g) ?? []).length],
      ["\t", (firstLine.match(/\t/g) ?? []).length],
      [";", (firstLine.match(/;/g) ?? []).length],
    ];
    counts.sort((a, b) => b[1] - a[1]);
    if (counts[0][1] > 0) delim = counts[0][0];
  }
  const cells: Cell[][] = [];
  let row: Cell[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delim) {
      row.push(cell); cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      cells.push(row); row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) { row.push(cell); cells.push(row); }
  const nonEmpty = cells.filter((r) => r.some((c) => c.trim() !== ""));
  const [header, ...rows] = nonEmpty;
  return { header: header ?? [], rows };
}

function CellText({ text, query }: { text: string; query: string }) {
  const needle = query.trim().toLowerCase();
  if (!needle) return <>{text}</>;
  const out: React.ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (true) {
    const idx = rest.toLowerCase().indexOf(needle);
    if (idx < 0) { if (rest) out.push(<span key={key++}>{rest}</span>); break; }
    if (idx > 0) out.push(<span key={key++}>{rest.slice(0, idx)}</span>);
    out.push(<mark key={key++} className="grid-find-hit">{rest.slice(idx, idx + needle.length)}</mark>);
    rest = rest.slice(idx + needle.length);
  }
  return <>{out}</>;
}

export function CsvTable({ source, filename }: { source: string; filename: string }) {
  const { header, rows } = useMemo(() => parseDelimited(source, filename), [source, filename]);
  const [query, setQuery] = useState("");
  const [filterOnly, setFilterOnly] = useState(false);
  const needle = query.trim().toLowerCase();
  const shownRows = useMemo(
    () => (filterOnly && needle ? rows.filter((r) => r.some((c) => c.toLowerCase().includes(needle))) : rows),
    [rows, filterOnly, needle]
  );
  const hitCount = useMemo(() => {
    if (!needle) return 0;
    let n = 0;
    for (const r of shownRows) for (const c of r) {
      let idx = c.toLowerCase().indexOf(needle);
      while (idx >= 0) { n++; idx = c.toLowerCase().indexOf(needle, idx + needle.length); }
    }
    return n;
  }, [shownRows, needle]);

  return (
    <div className="grid-view">
      <ViewToolbar
        filename={filename}
        meta={`${header.length} 列，${rows.length} 行${needle ? `，${hitCount} 处匹配` : ""}`}
        find={{ value: query, onChange: setQuery, placeholder: "查找单元格…" }}
        actions={[{ label: "仅显示匹配行", checked: filterOnly, onClick: () => setFilterOnly((v) => !v) }]}
      />
      <div className="grid-scroll">
        <table className="grid-table">
          <thead>
            <tr>
              <th className="grid-rownum">#</th>
              {header.map((h, i) => <th key={i}>{h || `列 ${i + 1}`}</th>)}
            </tr>
          </thead>
          <tbody>
            {shownRows.map((r, ri) => (
              <tr key={ri}>
                <td className="grid-rownum">{ri + 1}</td>
                {header.map((_, ci) => (
                  <td key={ci}><CellText text={r[ci] ?? ""} query={query} /></td>
                ))}
              </tr>
            ))}
            {shownRows.length === 0 && (
              <tr><td className="grid-empty" colSpan={header.length + 1}>没有匹配的行</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Word (docx) 渲染 ---------------- */

type DocxRenderer = (data: ArrayBuffer) => Promise<{ value: HTMLDivElement }>;

let docxRendererPromise: Promise<DocxRenderer> | null = null;

function loadDocxRenderer(): Promise<DocxRenderer> {
  if (!docxRendererPromise) {
    docxRendererPromise = import("mammoth")
      .then((mammoth) => (data: ArrayBuffer) => mammoth.convertToHtml({ arrayBuffer: data }).then((r) => {
        const host = document.createElement("div");
        host.className = "docx-body";
        host.innerHTML = r.value;
        return { value: host };
      }))
      .catch((error: unknown) => {
        docxRendererPromise = null;
        throw error;
      });
  }
  return docxRendererPromise;
}

export function DocxView({ data, filename }: { data: ArrayBuffer; filename: string }) {
  const [html, setHtml] = useState<string>("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [findCount, setFindCount] = useState(0);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(""); setHtml("");
    loadDocxRenderer()
      .then((render) => render(data))
      .then(({ value }) => {
        if (cancelled) return;
        setHtml(value.innerHTML);
      })
      .catch((e: unknown) => { if (!cancelled) setError(String((e as Error)?.message ?? e)); });
    return () => { cancelled = true; };
  }, [data]);

  // 查找：对渲染后的 DOM 做文本高亮；清空查询时重挂原始 HTML
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const needle = query.trim().toLowerCase();
    if (!needle) {
      if (host.querySelector("mark.grid-find-hit")) host.innerHTML = html;
      setFindCount(0);
      return;
    }
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    let hits = 0;
    const targets: Array<{ node: Text; matches: Array<[number, number]> }> = [];
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const text = node.nodeValue ?? "";
      const lower = text.toLowerCase();
      const matches: Array<[number, number]> = [];
      let idx = lower.indexOf(needle);
      while (idx >= 0) { matches.push([idx, idx + needle.length]); idx = lower.indexOf(needle, idx + needle.length); }
      if (matches.length > 0) { targets.push({ node, matches }); hits += matches.length; }
    }
    for (const { node, matches } of targets) {
      const parent = node.parentNode;
      if (!parent) continue;
      const frag = document.createDocumentFragment();
      let pos = 0;
      const text = node.nodeValue ?? "";
      for (const [s, e] of matches) {
        if (pos < s) frag.appendChild(document.createTextNode(text.slice(pos, s)));
        const mark = document.createElement("mark");
        mark.className = "grid-find-hit";
        mark.textContent = text.slice(s, e);
        frag.appendChild(mark);
        pos = e;
      }
      if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
      parent.replaceChild(frag, node);
    }
    setFindCount(hits);
  }, [query, html]);

  return (
    <div className="grid-view">
      <ViewToolbar
        filename={filename}
        meta={error ? `渲染失败：${error}` : findCount > 0 ? `${findCount} 处匹配` : "Word 文档"}
        find={{ value: query, onChange: setQuery, placeholder: "查找内容…" }}
      />
      <div className="grid-scroll docx-scroll">
        {error ? <div className="grid-empty">{error}</div> : <div ref={hostRef} className="docx-body" dangerouslySetInnerHTML={{ __html: html }} />}
      </div>
    </div>
  );
}

/* ---------------- PDF 渲染（pdfjs） ---------------- */

interface PdfLib {
  renderPage(data: ArrayBuffer, scale: number, canvas: HTMLCanvasElement, pageNum: number): Promise<void>;
  pageCount(data: ArrayBuffer): Promise<number>;
  pageText(data: ArrayBuffer, page: number): Promise<string>;
  searchHits(data: ArrayBuffer, page: number, needle: string, scale: number): Promise<Array<{ x: number; y: number; w: number; h: number }>>;
}

let pdfLibPromise: Promise<PdfLib> | null = null;
let activeRenderTask: { cancel(): void } | null = null;
let renderQueue: Promise<unknown> = Promise.resolve();
const pdfPageOf = (canvas: HTMLCanvasElement): number => Number(canvas.dataset.page ?? "1");

function loadPdfLib(): Promise<PdfLib> {
  if (!pdfLibPromise) {
    pdfLibPromise = import("pdfjs-dist")
      .then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const getDoc = (data: ArrayBuffer) => pdfjs.getDocument({ data: data.slice(0) }).promise;
        return {
          async renderPage(data, scale, canvas, pageNum) {
            const run = async () => {
              const doc = await getDoc(data);
              const page = await doc.getPage(pageNum);
              const viewport = page.getViewport({ scale });
              const ctx = canvas.getContext("2d");
              if (!ctx) throw new Error("no 2d context");
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              const task = page.render({ canvas, canvasContext: ctx, viewport } as Parameters<typeof page.render>[0]);
              activeRenderTask = task;
              try { await task.promise; }
              finally { if (activeRenderTask === task) activeRenderTask = null; }
            };
            renderQueue = renderQueue.then(run, run);
            await renderQueue;
          },
          async pageCount(data) { const doc = await getDoc(data); return doc.numPages; },
          async pageText(data, page_) {
            const doc = await getDoc(data);
            const page = await doc.getPage(page_);
            const content = await page.getTextContent();
            return content.items.map((it) => ("str" in it ? (it as { str: string }).str : "")).join(" ");
          },
          async searchHits(data, page_, needle, scale) {
            const doc = await getDoc(data);
            const page = await doc.getPage(page_);
            const viewport = page.getViewport({ scale });
            const content = await page.getTextContent();
            const out: Array<{ x: number; y: number; w: number; h: number }> = [];
            const lower = needle.toLowerCase();
            const items = content.items.flatMap((it) => {
              if (!("str" in it) || typeof it.str !== "string" || !Array.isArray(it.transform) || it.transform.length !== 6) return [];
              return [{ str: it.str, transform: it.transform as number[], width: (it as { width?: number }).width ?? 0 }];
            });
            const lines = new Map<number, Array<{ str: string; transform: number[]; width: number }>>();
            for (const it of items) {
              const y = Math.round(it.transform[5]);
              const key = [...lines.keys()].find((k) => Math.abs(k - y) <= 2) || y;
              if (!lines.has(key)) lines.set(key, []);
              lines.get(key)!.push(it);
            }
            for (const [, parts] of lines) {
              parts.sort((a, b) => a.transform[4] - b.transform[4]);
              const text = parts.map((p2) => p2.str).join("");
              const widthSum = parts.reduce((acc, p2) => acc + p2.width, 0);
              let idx = text.toLowerCase().indexOf(lower);
              while (idx >= 0) {
                let charCount = 0;
                let startPart = -1;
                let startOff = 0;
                for (let i = 0; i < parts.length; i++) {
                  const len = parts[i].str.length;
                  if (charCount + len > idx) { startPart = i; startOff = idx - charCount; break; }
                  charCount += len;
                }
                const startXform = parts[startPart]?.transform;
                if (!startXform) break;
                const fontSize = Math.hypot(startXform[2], startXform[3]) || Math.abs(startXform[3]) || 12;
                const charW = parts[startPart].str.length > 0 ? parts[startPart].width / parts[startPart].str.length : fontSize * 0.5;
                const x = startXform[4] + startOff * charW;
                const y0 = startXform[5] - fontSize;
                const w = Math.min(needle.length * charW, widthSum);
                const [vx, vy] = viewport.convertToViewportPoint(x, y0 + fontSize);
                out.push({ x: vx - w * scale, y: vy, w: w * scale, h: fontSize * scale * 1.25 });
                idx = text.toLowerCase().indexOf(lower, idx + lower.length);
              }
            }
            return out;
          },
        } satisfies PdfLib;
      });
  }
  return pdfLibPromise;
}

export function PdfView({ data, filename }: { data: ArrayBuffer; filename: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState("");
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [pageHitCount, setPageHitCount] = useState<number | null>(null);
  const [rendering, setRendering] = useState(true);
  const [hasFrame, setHasFrame] = useState(false);
  const [hits, setHits] = useState<Array<{ x: number; y: number; w: number; h: number }>>([]);

  useEffect(() => {
    let cancelled = false;
    void loadPdfLib().then(async (lib) => { if (!cancelled) setPages(await lib.pageCount(data)); })
      .catch((e: unknown) => { if (!cancelled) setError(String((e as Error)?.message ?? e)); });
    return () => { cancelled = true; };
  }, [data]);

  const renderToken = useRef(0);
  useEffect(() => {
    const token = ++renderToken.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    activeRenderTask?.cancel();
    canvas.dataset.page = String(page);
    setRendering(!hasFrame);
    void loadPdfLib()
      .then((lib) => (token === renderToken.current ? lib.renderPage(data, 1.5, canvas, page) : null))
      .then(() => { if (token === renderToken.current) { setHasFrame(true); setRendering(false); } })
      .catch((e: unknown) => { if (token === renderToken.current && String((e as Error)?.message ?? "").indexOf("cancel") < 0) setError(String((e as Error)?.message ?? e)); });
  }, [data, page]);

  const prevPage = useRef(page);
  useEffect(() => {
    if (prevPage.current === page) return;
    prevPage.current = page;
    setHits([]);
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
  }, [page]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let holdTimer = 0;
    let wheelAcc = 0;
    let wheelResetTimer = 0;
    let lastTurn = 0;
    const canScroll = () => el.scrollHeight - el.clientHeight > 8;
    const goNext = () => { if (page < pages && !rendering) setPage((p) => Math.min(pages, p + 1)); };
    const goPrev = () => { if (page > 1 && !rendering) setPage((p) => Math.max(1, p - 1)); };
    const onScroll = () => {
      if (!canScroll()) return;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
      const atTop = el.scrollTop <= 4;
      window.clearTimeout(holdTimer);
      if (Date.now() - lastTurn < 600) return;
      if (atBottom && page < pages) holdTimer = window.setTimeout(() => { lastTurn = Date.now(); goNext(); }, 320);
      else if (atTop && page > 1) holdTimer = window.setTimeout(() => { lastTurn = Date.now(); goPrev(); }, 320);
    };
    const onWheel = (e: WheelEvent) => {
      if (canScroll()) return;
      if (Date.now() - lastTurn < 600) { wheelAcc = 0; return; }
      wheelAcc += e.deltaY;
      window.clearTimeout(wheelResetTimer);
      wheelResetTimer = window.setTimeout(() => { wheelAcc = 0; }, 350);
      if (wheelAcc > el.clientHeight * 0.6) { wheelAcc = 0; lastTurn = Date.now(); goNext(); }
      else if (wheelAcc < -el.clientHeight * 0.6) { wheelAcc = 0; lastTurn = Date.now(); goPrev(); }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onWheel);
      window.clearTimeout(holdTimer);
      window.clearTimeout(wheelResetTimer);
    };
  }, [page, pages, rendering]);

  const runFind = useCallback(() => {
    const needle = query.trim();
    if (!needle) { setPageHitCount(null); setHits([]); return; }
    void loadPdfLib().then((lib) => lib.searchHits(data, page, needle, 1.5))
      .then((rects) => { setHits(rects); setPageHitCount(rects.length); })
      .catch(() => { setPageHitCount(0); setHits([]); });
  }, [query, data, page]);

  return (
    <div className="grid-view">
      <ViewToolbar
        filename={filename}
        meta={error ? error : pages > 0 ? `${page}/${pages} 页${pageHitCount !== null ? `，本页 ${pageHitCount} 处匹配` : ""}${rendering ? "，渲染中…" : ""}` : "加载中…"}
        find={{ value: query, onChange: setQuery, placeholder: "查找本页文本…", onEnter: runFind }}
        actions={[
          { label: "上一页", onClick: () => setPage((p) => Math.max(1, p - 1)) },
          { label: "下一页", onClick: () => setPage((p) => Math.min(pages, p + 1)) },
        ]}
      />
      <div className="grid-scroll pdf-scroll" ref={scrollRef}>
        {error ? (
          <div className="grid-empty">{error}</div>
        ) : (
          <div className="pdf-stage">
            <canvas
              ref={canvasRef}
              className="pdf-canvas"
              style={hasFrame ? (rendering ? { visibility: "hidden" as const } : undefined) : { width: 0, height: 0 }}
            />
            {!rendering && hits.map((r, i) => (
              <div key={i} className="pdf-hit" style={{ left: r.x, top: r.y, width: r.w, height: r.h }} />
            ))}
            {!hasFrame && <div className="grid-loading"><span className="grid-spinner" /></div>}
          </div>
        )}
      </div>
    </div>
  );
}
