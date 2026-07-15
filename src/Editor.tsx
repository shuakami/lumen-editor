import { useEffect, useRef } from "react";
import { EditorView } from "codemirror";
import { editorSetup } from "./editor/setup";
import { EditorState, Compartment } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { languageFor } from "./editor/languages";
import { editorTheme } from "./editor/theme";
 
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
 
/** 同步引擎热更新打开中的文件时刷新文档缓存。 */
export function setCachedDoc(fileId: string, doc: string): void {
  docCache.set(fileId, doc);
}
 
export function Editor({ fileId, filename, initialDoc, dark, onDocChange, onCursor }: EditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const callbacks = useRef({ onDocChange, onCursor });
  callbacks.current = { onDocChange, onCursor };
  const darkRef = useRef(dark);
 
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const doc = docCache.get(fileId) ?? initialDoc;
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
              const text = update.state.doc.toString();
              docCache.set(fileId, text);
              callbacks.current.onDocChange(fileId, text);
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
    view.focus();
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    callbacks.current.onCursor({
      line: line.number,
      col: 1,
      length: view.state.doc.length,
      selections: 1,
    });
    return () => {
      view.destroy();
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
}
