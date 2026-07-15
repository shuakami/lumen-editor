import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
 
const KEYWORDS =
  "class|struct|interface|enum|record|namespace|def|fn|func|function|void|int|long|short|float|double|char|bool|string|var|let|const|type|trait|impl|mod";
 
function esc(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
 
/** Ctrl/Cmd+click: jump to a definition-like occurrence of the clicked symbol. */
export function ctrlClickJump(): Extension {
  return EditorView.domEventHandlers({
    mousedown(e, view) {
      if (!(e.ctrlKey || e.metaKey) || e.button !== 0) return false;
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
      if (pos == null) return false;
      const range = view.state.wordAt(pos);
      if (!range) return false;
      const word = view.state.sliceDoc(range.from, range.to);
      const text = view.state.doc.toString();
      let target = -1;
      const defRe = new RegExp(`(?:^|[^\\w.])(?:${KEYWORDS})\\s+\\*?(${esc(word)})\\b`, "m");
      const m = defRe.exec(text);
      if (m) target = m.index + m[0].lastIndexOf(word);
      if (target < 0) {
        const first = text.search(new RegExp(`\\b${esc(word)}\\b`));
        if (first >= 0) target = first;
      }
      if (target < 0 || target === range.from) return false;
      view.dispatch({
        selection: { anchor: target, head: target + word.length },
        effects: EditorView.scrollIntoView(target, { y: "center" }),
      });
      e.preventDefault();
      return true;
    },
  });
}
