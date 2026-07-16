import { memo, useEffect, useRef } from "react";
import { EditorView } from "@codemirror/view";
import { editorSetup } from "./editor/setup";
import { EditorState, Compartment, type Text } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { languageFor } from "./editor/languages";
import { editorTheme } from "./editor/theme";
import { openSearchPanel, gotoLine } from "@codemirror/search";
 
export interface CursorInfo {
  line: number;
  col: number;
  length: number;
  selections: number;
}
 
interface EditorProps {
  fileId: string;
  filename: string;
  initialDoc: string;
  dark: boolean;
  onDocChange: (fileId: string, doc: string) => void;
  onCursor: (info: CursorInfo) => void;
}
 
const docCache = new Map<string, string>();
 
export function getCachedDoc(fileId: string, fallback: string): string {
  return docCache.get(fileId) ?? fallback;
}
 
const viewRegistry = new Map<string, EditorView>();

/** 同步引擎热更新打开中的文件：刷新文档缓存，并把新内容应用到已挂载的编辑器视图。 */
export function setCachedDoc(fileId: string, doc: string): void {
  if (docCache.get(fileId) === doc) return;
  docCache.set(fileId, doc);
  const view = viewRegistry.get(fileId);
  if (!view || view.state.doc.toString() === doc) return;
  const pos = Math.min(view.state.selection.main.head, doc.length);
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: doc },
    selection: { anchor: pos },
  });
}

/** 跳转到指定文件的某一行（编辑器未挂载时自动重试）。 */
export function revealLine(fileId: string, line: number, col = 0, attempts = 20): void {
  const view = viewRegistry.get(fileId);
  if (!view) {
    if (attempts > 0) window.setTimeout(() => revealLine(fileId, line, col, attempts - 1), 60);
    return;
  }
  const doc = view.state.doc;
  const ln = doc.line(Math.min(Math.max(1, line), doc.lines));
  const pos = Math.min(ln.from + Math.max(0, col), ln.to);
  view.dispatch({
    selection: { anchor: pos },
    effects: EditorView.scrollIntoView(pos, { y: "center" }),
  });
  view.focus();
}
 
/** 打开指定文件编辑器的查找面板。 */
export function openFindPanel(fileId: string): boolean {
  const view = viewRegistry.get(fileId);
  if (!view) return false;
  view.focus();
  openSearchPanel(view);
  return true;
}

/** 打开指定文件编辑器的跳转到行面板。 */
export function openGotoLine(fileId: string): boolean {
  const view = viewRegistry.get(fileId);
  if (!view) return false;
  view.focus();
  gotoLine(view);
  return true;
}

export const Editor = memo(function Editor({ fileId, filename, initialDoc, dark, onDocChange, onCursor }: EditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const callbacks = useRef({ onDocChange, onCursor });
  callbacks.current.onDocChange = onDocChange;
  callbacks.current.onCursor = onCursor;
  const darkRef = useRef(dark);
 
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const doc = docCache.get(fileId) ?? initialDoc;
    let pendingDoc: Text | null = null;
    let docFrame = 0;
    const flushDoc = () => {
      docFrame = 0;
      if (!pendingDoc) return;
      const text = pendingDoc.toString();
      pendingDoc = null;
      docCache.set(fileId, text);
      callbacks.current.onDocChange(fileId, text);
    };
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc,
        extensions: [
          editorSetup(),
          keymap.of([indentWithTab]),
          indentUnit.of("    "),
          languageFor(filename).extensions(),
          themeCompartment.current.of(editorTheme(darkRef.current)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              pendingDoc = update.state.doc;
              if (!docFrame) docFrame = window.requestAnimationFrame(flushDoc);
            }
            if (update.selectionSet || update.docChanged) {
              const sel = update.state.selection;
              const head = sel.main.head;
              const line = update.state.doc.lineAt(head);
              callbacks.current.onCursor({
                line: line.number,
                col: head - line.from + 1,
                length: update.state.doc.length,
                selections: sel.ranges.length,
              });
            }
          }),
        ],
      }),
    });
    viewRef.current = view;
    viewRegistry.set(fileId, view);
    view.focus();
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    callbacks.current.onCursor({
      line: line.number,
      col: 1,
      length: view.state.doc.length,
      selections: 1,
    });
    return () => {
      if (docFrame) window.cancelAnimationFrame(docFrame);
      flushDoc();
      view.destroy();
      if (viewRegistry.get(fileId) === view) viewRegistry.delete(fileId);
      viewRef.current = null;
    };
  }, [fileId, filename, initialDoc]);
 
  useEffect(() => {
    darkRef.current = dark;
    viewRef.current?.dispatch({
      effects: themeCompartment.current.reconfigure(editorTheme(dark)),
    });
  }, [dark]);
 
  return <div ref={hostRef} className="editor-pane" />;
});
