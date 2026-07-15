import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
 
class SmoothCaret {
  caret: HTMLDivElement;
  view: EditorView;
 
  constructor(view: EditorView) {
    this.view = view;
    this.caret = document.createElement("div");
    this.caret.className = "cm-smooth-caret";
    view.scrollDOM.appendChild(this.caret);
    this.schedule();
  }
 
  update(u: ViewUpdate) {
    if (u.selectionSet || u.docChanged || u.geometryChanged || u.focusChanged) {
      this.schedule();
    }
  }
 
  schedule() {
    this.view.requestMeasure({
      read: () => {
        const view = this.view;
        const sel = view.state.selection.main;
        const pos = view.coordsAtPos(sel.head, sel.assoc || 1);
        if (!pos || !view.hasFocus || !sel.empty) {
          this.caret.style.opacity = "0";
          return;
        }
        const rect = view.scrollDOM.getBoundingClientRect();
        const x = pos.left - rect.left + view.scrollDOM.scrollLeft;
        const y = pos.top - rect.top + view.scrollDOM.scrollTop;
        this.caret.style.opacity = "1";
        this.caret.style.height = `${pos.bottom - pos.top}px`;
        this.caret.style.transform = `translate(${x}px, ${y}px)`;
        this.caret.style.animation = "none";
        void this.caret.offsetWidth;
        this.caret.style.animation = "";
      },
    });
  }
 
  destroy() {
    this.caret.remove();
  }
}
 
export function smoothCaret(): Extension {
  return [
    ViewPlugin.fromClass(SmoothCaret),
    EditorView.theme({
      ".cm-cursorLayer": { display: "none" },
    }),
  ];
}
