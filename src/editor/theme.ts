import { EditorView } from "@codemirror/view";
import {
  HighlightStyle,
  syntaxHighlighting,
  type Language,
  type TagStyle,
} from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";
 
function chrome(colors: {
  bg: string;
  fg: string;
  caret: string;
  selection: string;
  activeLine: string;
  gutter: string;
  gutterActive: string;
  matchBracketBg: string;
  matchBracketLine: string;
  selMatch: string;
  searchMatch: string;
  searchMatchSel: string;
  ui: Record<string, string>;
  dark: boolean;
}) {
  return EditorView.theme(
    {
      "&": {
        backgroundColor: colors.bg,
        color: colors.fg,
        fontSize: "var(--code-size, 13.5px)",
        ...colors.ui,
      },
      ".cm-content": {
        fontFamily: '"Maple Mono NF CN", "Maple Mono", "JetBrains Mono", ui-monospace, monospace',
        fontVariantLigatures: "normal",
        caretColor: colors.caret,
        padding: "14px 0",
        lineHeight: "var(--code-lh, 1.6)",
      },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: colors.caret, borderLeftWidth: "1.5px" },
      "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground":
        { background: `${colors.selection} !important` },
      ".cm-activeLine": { backgroundColor: colors.activeLine },
      ".cm-gutters": {
        backgroundColor: colors.bg,
        color: colors.gutter,
        border: "none",
        fontFamily: '"Maple Mono NF CN", "Maple Mono", "JetBrains Mono", ui-monospace, monospace',
        fontSize: "calc(var(--code-size, 13.5px) - 1.5px)",
        paddingLeft: "10px",
      },
      ".cm-activeLineGutter": { backgroundColor: "transparent", color: colors.gutterActive },
      ".cm-lineNumbers .cm-gutterElement": { padding: "0 16px 0 8px" },
      ".cm-matchingBracket": {
        backgroundColor: colors.matchBracketBg,
        outline: `1px solid ${colors.matchBracketLine}`,
        borderRadius: "2px",
      },
      "&.cm-focused .cm-nonmatchingBracket, .cm-nonmatchingBracket": {
        backgroundColor: "transparent",
      },
      ".cm-selectionMatch": { backgroundColor: colors.selMatch, borderRadius: "2px" },
      ".cm-searchMatch": { backgroundColor: colors.searchMatch, borderRadius: "2px" },
      ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: colors.searchMatchSel },
      ".cm-foldPlaceholder": {
        background: colors.selMatch,
        border: "none",
        color: colors.gutterActive,
        borderRadius: "4px",
        padding: "0 6px",
        margin: "0 4px",
      },
      ".cm-lintRange-error": { textDecoration: "underline wavy #cf2d56" },
      ".cm-lintRange-warning": { textDecoration: "underline wavy #db704b" },
      ".cm-lintRange-active": { backgroundColor: "transparent" },
    },
    { dark: colors.dark }
  );
}
 
const darkChrome = chrome({
  bg: "#181818",
  fg: "#d6d6dd",
  caret: "#f0f0f0",
  selection: "#40404099",
  activeLine: "#262626",
  gutter: "#f0f0f05c",
  gutterActive: "#f0f0f0",
  matchBracketBg: "#f0f0f01e",
  matchBracketLine: "transparent",
  selMatch: "#404040cc",
  searchMatch: "#88c0d044",
  searchMatchSel: "#88c0d066",
  ui: {
    "--lumen-caret": "#f0f0f0",
    "--lumen-fg": "#f0f0f0",
    "--lumen-fg-2": "#f0f0f0bd",
    "--lumen-fg-3": "#f0f0f05c",
    "--lumen-surface": "#141414",
    "--lumen-surface-2": "#f0f0f011",
    "--lumen-surface-3": "#f0f0f01e",
    "--lumen-accent": "#f0f0f0",
    "--lumen-focus": "#f0f0f026",
    "--lumen-sym-method": "#efb080",
    "--lumen-sym-class": "#87c3ff",
    "--lumen-sym-keyword": "#82d2ce",
    "--lumen-sym-text": "#f0f0f099",
    "--lumen-fncall-c": "#ebc88d",
    "--lumen-fndef-c": "#f0f0f0",
    "--lumen-assign-c": "#82d2ce",
    "--lumen-strfmt-c": "#ebc88d",
    "--lumen-syslib-c": "#e394dc",
    "--lumen-scroll-thumb": "rgba(160, 160, 160, 0.25)",
    "--lumen-scroll-thumb-hover": "rgba(160, 160, 160, 0.4)",
    "--lumen-scroll-thumb-active": "rgba(160, 160, 160, 0.5)",
    "--lumen-shadow-pop":
      "0 0 0 1px rgba(240, 240, 240, 0.09), 0 2px 6px rgba(0, 0, 0, 0.25), 0 16px 48px rgba(0, 0, 0, 0.4)",
  },
  dark: true,
});
 
const lightChrome = chrome({
  bg: "#fcfcfc",
  fg: "#141414",
  caret: "#141414",
  selection: "#1414141e",
  activeLine: "#ededed",
  gutter: "#1414145c",
  gutterActive: "#141414bd",
  matchBracketBg: "#1414141e",
  matchBracketLine: "transparent",
  selMatch: "#14141411",
  searchMatch: "#6f9ba62e",
  searchMatchSel: "#6f9ba65c",
  ui: {
    "--lumen-caret": "#141414",
    "--lumen-fg": "#141414",
    "--lumen-fg-2": "#141414bd",
    "--lumen-fg-3": "#1414145c",
    "--lumen-surface": "#fcfcfc",
    "--lumen-surface-2": "#14141411",
    "--lumen-surface-3": "#1414141e",
    "--lumen-accent": "#141414",
    "--lumen-focus": "#14141426",
    "--lumen-sym-method": "#db704b",
    "--lumen-sym-class": "#206595",
    "--lumen-sym-keyword": "#b3003f",
    "--lumen-sym-text": "#14141499",
    "--lumen-fncall-c": "#db704b",
    "--lumen-fndef-c": "#db704b",
    "--lumen-assign-c": "#141414",
    "--lumen-strfmt-c": "#b3003f",
    "--lumen-syslib-c": "#9e94d5",
    "--lumen-scroll-thumb": "rgba(100, 100, 100, 0.28)",
    "--lumen-scroll-thumb-hover": "rgba(100, 100, 100, 0.45)",
    "--lumen-scroll-thumb-active": "rgba(90, 90, 90, 0.6)",
    "--lumen-shadow-pop":
      "0 0 0 1px rgba(20, 20, 20, 0.07), 0 2px 6px rgba(20, 20, 20, 0.04), 0 16px 48px rgba(20, 20, 20, 0.08)",
  },
  dark: false,
});
 
const darkHighlight: Extension[] = [
  syntaxHighlighting(
  HighlightStyle.define([
    { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.modifier, t.definitionKeyword, t.operatorKeyword], color: "#82d2ce" },
    { tag: [t.self], color: "#cc7c8a" },
    { tag: [t.compareOperator, t.logicOperator], color: "#82d2ce" },
    { tag: [t.typeName, t.standard(t.typeName)], color: "#82d2ce" },
    { tag: [t.className, t.namespace], color: "#87c3ff" },
    { tag: [t.function(t.definition(t.variableName))], color: "#f0f0f0" },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#ebc88d" },
    { tag: [t.propertyName, t.attributeName], color: "#aaa0fa" },
    { tag: [t.special(t.name), t.labelName], color: "#aaa0fa" },
    { tag: [t.constant(t.variableName), t.standard(t.variableName)], color: "#f8c762" },
    { tag: [t.string, t.character], color: "#e394dc" },
    { tag: [t.escape], color: "#f0f0f0bd" },
    { tag: [t.special(t.string)], color: "#f0f0f0bd" },
    { tag: [t.number], color: "#ebc88d" },
    { tag: [t.bool, t.null], color: "#82d2ce" },
    { tag: [t.processingInstruction, t.macroName, t.documentMeta], color: "#a8cc7c" },
    { tag: [t.comment], color: "#f0f0f099", fontStyle: "italic" },
    { tag: [t.operator, t.arithmeticOperator, t.bitwiseOperator, t.definitionOperator, t.updateOperator, t.derefOperator], color: "#82d2ce" },
    { tag: [t.separator], color: "#d6d6dd" },
    { tag: [t.punctuation, t.bracket], color: "#d6d6dd" },
    { tag: [t.variableName, t.definition(t.variableName)], color: "#d6d6dd" },
    { tag: t.meta, color: "#a8cc7c" },
    { tag: t.heading, color: "#87c3ff", fontWeight: "600" },
    { tag: t.strong, fontWeight: "600", color: "#f0f0f0" },
    { tag: t.emphasis, fontStyle: "italic", color: "#f0f0f0" },
    { tag: t.strikethrough, textDecoration: "line-through" },
    { tag: t.link, color: "#aaa0fa", textDecoration: "underline" },
    { tag: t.url, color: "#e394dc" },
    { tag: t.monospace, color: "#a8cc7c" },
    { tag: t.quote, color: "#f0f0f0bd" },
    { tag: t.contentSeparator, color: "#82d2ce" },
    { tag: t.invalid, color: "#f14c4c" },
  ])),
];
 
const lightHighlight: Extension[] = [
  syntaxHighlighting(
  HighlightStyle.define([
    { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.modifier, t.definitionKeyword, t.operatorKeyword], color: "#b3003f" },
    { tag: [t.self], color: "#b8448b" },
    { tag: [t.compareOperator, t.logicOperator, t.bitwiseOperator], color: "#b3003f" },
    { tag: [t.typeName, t.standard(t.typeName)], color: "#b3003f" },
    { tag: [t.className, t.namespace], color: "#206595" },
    { tag: [t.function(t.definition(t.variableName))], color: "#db704b" },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#db704b" },
    { tag: [t.propertyName, t.attributeName], color: "#6049b3" },
    { tag: [t.special(t.name), t.labelName], color: "#6049b3" },
    { tag: [t.constant(t.variableName), t.standard(t.variableName)], color: "#206595" },
    { tag: [t.string, t.character], color: "#9e94d5" },
    { tag: [t.escape], color: "#141414bd" },
    { tag: [t.special(t.string)], color: "#141414bd" },
    { tag: [t.number], color: "#b8448b" },
    { tag: [t.bool, t.null], color: "#206595" },
    { tag: [t.processingInstruction, t.macroName, t.documentMeta], color: "#1f8a65" },
    { tag: [t.comment], color: "#14141499", fontStyle: "italic" },
    { tag: [t.operator, t.arithmeticOperator, t.updateOperator], color: "#b3003f" },
    { tag: [t.definitionOperator, t.derefOperator], color: "#141414" },
    { tag: [t.separator], color: "#141414" },
    { tag: [t.punctuation, t.bracket], color: "#141414" },
    { tag: [t.variableName, t.definition(t.variableName)], color: "#141414" },
    { tag: t.meta, color: "#1f8a65" },
    { tag: t.heading, color: "#206595", fontWeight: "600" },
    { tag: t.strong, fontWeight: "600", color: "#141414" },
    { tag: t.emphasis, fontStyle: "italic", color: "#141414" },
    { tag: t.strikethrough, textDecoration: "line-through" },
    { tag: t.link, color: "#6049b3", textDecoration: "underline" },
    { tag: t.url, color: "#9e94d5" },
    { tag: t.monospace, color: "#1f8a65" },
    { tag: t.quote, color: "#141414bd" },
    { tag: t.contentSeparator, color: "#141414bd" },
    { tag: t.invalid, color: "#cf2d56" },
  ])),
];

export type ScopedLanguageId = "json" | "yaml" | "css" | "html" | "xml" | "markdown";

const scopedHighlights: Record<ScopedLanguageId, { dark: readonly TagStyle[]; light: readonly TagStyle[] }> = {
  json: {
    dark: [
      { tag: [t.propertyName, t.definition(t.propertyName)], color: "#aaa0fa" },
      { tag: [t.string], color: "#e394dc" },
      { tag: [t.bool, t.null], color: "#82d2ce" },
    ],
    light: [
      { tag: [t.propertyName, t.definition(t.propertyName)], color: "#1f8a65" },
      { tag: [t.string], color: "#9e94d5" },
      { tag: [t.bool, t.null], color: "#db704b" },
    ],
  },
  yaml: {
    dark: [
      { tag: [t.propertyName, t.definition(t.propertyName)], color: "#87c3ff" },
      { tag: [t.string], color: "#e394dc" },
    ],
    light: [
      { tag: [t.propertyName, t.definition(t.propertyName)], color: "#1f8a65" },
      { tag: [t.string], color: "#9e94d5" },
    ],
  },
  css: {
    dark: [
      { tag: [t.propertyName], color: "#aaa0fa" },
      { tag: [t.className], color: "#ebc88d" },
      { tag: [t.tagName], color: "#87c3ff" },
      { tag: [t.unit], color: "#e394dc" },
      { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: "#ebc88d" },
    ],
    light: [
      { tag: [t.propertyName], color: "#9e94d5" },
      { tag: [t.className], color: "#206595" },
      { tag: [t.tagName], color: "#6f9ba6" },
      { tag: [t.unit], color: "#d06ba6" },
      { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: "#b8448b" },
    ],
  },
  html: {
    dark: [
      { tag: [t.tagName], color: "#87c3ff" },
      { tag: [t.attributeName], color: "#aaa0fa" },
      { tag: [t.attributeValue], color: "#e394dc" },
      { tag: [t.angleBracket], color: "#f0f0f0bd" },
    ],
    light: [
      { tag: [t.tagName], color: "#206595" },
      { tag: [t.attributeName], color: "#6049b3" },
      { tag: [t.attributeValue], color: "#9e94d5" },
      { tag: [t.angleBracket], color: "#141414bd" },
    ],
  },
  xml: {
    dark: [
      { tag: [t.tagName], color: "#a8cc7c" },
      { tag: [t.attributeName], color: "#aaa0fa" },
      { tag: [t.attributeValue], color: "#e394dc" },
      { tag: [t.angleBracket], color: "#f0f0f0bd" },
    ],
    light: [
      { tag: [t.tagName], color: "#1f8a65" },
      { tag: [t.attributeName], color: "#6049b3" },
      { tag: [t.attributeValue], color: "#9e94d5" },
      { tag: [t.angleBracket], color: "#141414bd" },
    ],
  },
  markdown: {
    dark: [
      { tag: [t.processingInstruction, t.punctuation], color: "#f0f0f099" },
      { tag: [t.list], color: "#d6d6dd" },
    ],
    light: [
      { tag: [t.processingInstruction, t.punctuation], color: "#14141499" },
      { tag: [t.list], color: "#141414" },
    ],
  },
};

/** Keep parser-specific colors in the parser's lazy chunk. */
export function scopedLanguageHighlight(id: ScopedLanguageId, language: Language): Extension[] {
  const styles = scopedHighlights[id];
  return [
    syntaxHighlighting(HighlightStyle.define(styles.dark, { scope: language, themeType: "dark" })),
    syntaxHighlighting(HighlightStyle.define(styles.light, { scope: language, themeType: "light" })),
  ];
}
 
/** Like VS Code: hide the active-line highlight while a selection exists. */
const activeLineSelectionFix = EditorView.updateListener.of((update) => {
  if (update.selectionSet || update.focusChanged) {
    const hasSelection = update.state.selection.ranges.some((r) => !r.empty);
    update.view.dom.classList.toggle("cm-has-selection", hasSelection);
  }
});
 
const DARK_THEME: Extension[] = [darkChrome, ...darkHighlight, activeLineSelectionFix];
const LIGHT_THEME: Extension[] = [lightChrome, ...lightHighlight, activeLineSelectionFix];

export function editorTheme(dark: boolean): Extension[] {
  return dark ? DARK_THEME : LIGHT_THEME;
}
