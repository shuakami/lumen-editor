import type { Extension } from "@codemirror/state";
import { EditorState } from "@codemirror/state";
import {
  keymap,
  lineNumbers,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  rectangularSelection,
  crosshairCursor,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  foldService,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { lintKeymap } from "@codemirror/lint";
import { breakpointGutter } from "./breakpoints";
import { findPanel } from "./findpanel";
import { ctrlClickJump } from "./jump";
 
const CHEVRON =
  '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M7.976 10.072l4.357-4.357.62.618L8.284 11h-.618L3 6.333l.619-.618 4.357 4.357z"/></svg>';
 
function foldMarker(open: boolean): HTMLElement {
  const el = document.createElement("span");
  el.className = `cm-fold-marker${open ? " open" : ""}`;
  el.innerHTML = CHEVRON;
  return el;
}
 
function indentWidth(text: string): number {
  let w = 0;
  for (const ch of text) {
    if (ch === " ") w += 1;
    else if (ch === "\t") w += 4;
    else break;
  }
  return w;
}
 
/** VS Code-style indentation folding: a line folds all deeper-indented lines below it. */
const indentFold = foldService.of((state, from) => {
  const line = state.doc.lineAt(from);
  if (!line.text.trim()) return null;
  const indent = indentWidth(line.text);
  let end = line.number;
  for (let i = line.number + 1; i <= state.doc.lines; i++) {
    const next = state.doc.line(i);
    if (!next.text.trim()) continue;
    if (indentWidth(next.text) > indent) end = i;
    else break;
  }
  if (end === line.number) return null;
  return { from: line.to, to: state.doc.line(end).to };
});
 
/** CodeMirror extensions are immutable and safe to share across editor views. */
const EDITOR_SETUP: Extension[] = [
    breakpointGutter(),
    ctrlClickJump(),
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    indentFold,
    foldGutter({ markerDOM: foldMarker }),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    findPanel(),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      ...lintKeymap,
    ]),
];

/** basicSetup equivalent, with a VS Code-style chevron fold gutter. */
export function editorSetup(): Extension[] {
  return EDITOR_SETUP;
}
