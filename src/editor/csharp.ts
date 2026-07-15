import { StreamLanguage, syntaxTree } from "@codemirror/language";
import { csharp } from "@codemirror/legacy-modes/mode/clike";
import { cpp } from "@codemirror/lang-cpp";
import { Decoration, ViewPlugin, ViewUpdate, type DecorationSet } from "@codemirror/view";
import {
  autocompletion,
  completeFromList,
  snippetCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { hoverTooltip } from "@codemirror/view";
import { linter, type Diagnostic } from "@codemirror/lint";
import type { EditorView } from "codemirror";
import type { Extension } from "@codemirror/state";
import { smoothCaret } from "./caret";
 
export const csharpLanguage = StreamLanguage.define(csharp);
 
const KEYWORDS =
  `abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly record ref required return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using var virtual void volatile while yield async await when where select from group into orderby join let ascending descending on equals by global init nint nuint not and or with file scoped`.split(
    " "
  );
 
const BCL: Array<[string, string]> = [
  ["Console", "static class System.Console"],
  ["Math", "static class System.Math"],
  ["String", "class System.String"],
  ["StringBuilder", "class System.Text.StringBuilder"],
  ["List<>", "class System.Collections.Generic.List<T>"],
  ["Dictionary<,>", "class System.Collections.Generic.Dictionary<TKey,TValue>"],
  ["HashSet<>", "class System.Collections.Generic.HashSet<T>"],
  ["Queue<>", "class System.Collections.Generic.Queue<T>"],
  ["Stack<>", "class System.Collections.Generic.Stack<T>"],
  ["IEnumerable<>", "interface System.Collections.Generic.IEnumerable<T>"],
  ["Task", "class System.Threading.Tasks.Task"],
  ["Task<>", "class System.Threading.Tasks.Task<TResult>"],
  ["ValueTask", "struct System.Threading.Tasks.ValueTask"],
  ["CancellationToken", "struct System.Threading.CancellationToken"],
  ["Span<>", "ref struct System.Span<T>"],
  ["ReadOnlySpan<>", "ref struct System.ReadOnlySpan<T>"],
  ["Memory<>", "struct System.Memory<T>"],
  ["DateTime", "struct System.DateTime"],
  ["DateTimeOffset", "struct System.DateTimeOffset"],
  ["TimeSpan", "struct System.TimeSpan"],
  ["Guid", "struct System.Guid"],
  ["Exception", "class System.Exception"],
  ["ArgumentNullException", "class System.ArgumentNullException"],
  ["InvalidOperationException", "class System.InvalidOperationException"],
  ["Nullable<>", "struct System.Nullable<T>"],
  ["Action", "delegate System.Action"],
  ["Func<>", "delegate System.Func<TResult>"],
  ["Linq", "namespace System.Linq"],
  ["Enumerable", "static class System.Linq.Enumerable"],
  ["Regex", "class System.Text.RegularExpressions.Regex"],
  ["JsonSerializer", "static class System.Text.Json.JsonSerializer"],
  ["HttpClient", "class System.Net.Http.HttpClient"],
  ["Stopwatch", "class System.Diagnostics.Stopwatch"],
  ["Interlocked", "static class System.Threading.Interlocked"],
  ["Channel<>", "class System.Threading.Channels.Channel<T>"],
  ["ILogger", "interface Microsoft.Extensions.Logging.ILogger"],
];
 
const MEMBERS: Array<[string, string]> = [
  ["WriteLine", "void Console.WriteLine(string? value)"],
  ["ReadLine", "string? Console.ReadLine()"],
  ["ToString", "string object.ToString()"],
  ["Equals", "bool object.Equals(object? obj)"],
  ["GetHashCode", "int object.GetHashCode()"],
  ["Length", "int string.Length { get; }"],
  ["Count", "int ICollection<T>.Count { get; }"],
  ["Add", "void List<T>.Add(T item)"],
  ["AddRange", "void List<T>.AddRange(IEnumerable<T> collection)"],
  ["Remove", "bool List<T>.Remove(T item)"],
  ["Contains", "bool List<T>.Contains(T item)"],
  ["Select", "IEnumerable<TResult> Select<TSource,TResult>(Func<TSource,TResult> selector)"],
  ["Where", "IEnumerable<TSource> Where<TSource>(Func<TSource,bool> predicate)"],
  ["OrderBy", "IOrderedEnumerable<TSource> OrderBy<TSource,TKey>(Func<TSource,TKey> keySelector)"],
  ["FirstOrDefault", "TSource? FirstOrDefault<TSource>()"],
  ["ToList", "List<TSource> ToList<TSource>()"],
  ["ToArray", "TSource[] ToArray<TSource>()"],
  ["Aggregate", "TSource Aggregate<TSource>(Func<TSource,TSource,TSource> func)"],
  ["Sum", "int Sum(this IEnumerable<int> source)"],
  ["Any", "bool Any<TSource>(Func<TSource,bool> predicate)"],
  ["ConfigureAwait", "ConfiguredTaskAwaitable Task.ConfigureAwait(bool continueOnCapturedContext)"],
  ["WhenAll", "Task Task.WhenAll(params Task[] tasks)"],
  ["Delay", "Task Task.Delay(int millisecondsDelay)"],
  ["TryGetValue", "bool Dictionary<K,V>.TryGetValue(K key, out V value)"],
  ["StartNew", "Stopwatch Stopwatch.StartNew()"],
  ["ElapsedMilliseconds", "long Stopwatch.ElapsedMilliseconds { get; }"],
];
 
const SNIPPETS: Completion[] = [
  snippetCompletion("class ${Name}\n{\n\t${}\n}", { label: "class", detail: "class declaration", type: "keyword", boost: 2 }),
  snippetCompletion("public ${int} ${Property} { get; set; }", { label: "prop", detail: "auto property", type: "keyword", boost: 2 }),
  snippetCompletion("for (var ${i} = 0; ${i} < ${length}; ${i}++)\n{\n\t${}\n}", { label: "for", detail: "for loop", type: "keyword", boost: 2 }),
  snippetCompletion("foreach (var ${item} in ${collection})\n{\n\t${}\n}", { label: "foreach", detail: "foreach loop", type: "keyword", boost: 2 }),
  snippetCompletion("if (${condition})\n{\n\t${}\n}", { label: "if", detail: "if statement", type: "keyword", boost: 2 }),
  snippetCompletion("try\n{\n\t${}\n}\ncatch (${Exception} ex)\n{\n\t${}\n}", { label: "try", detail: "try/catch", type: "keyword", boost: 2 }),
  snippetCompletion("public async Task${} ${Method}Async(${})\n{\n\t${}\n}", { label: "async", detail: "async method", type: "keyword", boost: 2 }),
  snippetCompletion('Console.WriteLine($"${}");', { label: "cw", detail: "Console.WriteLine", type: "function", boost: 3 }),
  snippetCompletion("public record ${Name}(${});", { label: "record", detail: "record declaration", type: "keyword", boost: 2 }),
  snippetCompletion("switch (${value})\n{\n\tcase ${pattern}:\n\t\t${}\n\t\tbreak;\n\tdefault:\n\t\tbreak;\n}", { label: "switch", detail: "switch statement", type: "keyword" }),
];
 
const STATIC_COMPLETIONS: Completion[] = [
  ...KEYWORDS.map((k): Completion => ({ label: k, type: "keyword" })),
  ...BCL.map(([label, detail]): Completion => ({ label: label.replace(/<.*>$/, ""), detail, type: "class", boost: 1 })),
  ...MEMBERS.map(([label, detail]): Completion => ({ label, detail, type: "method" })),
  ...SNIPPETS,
];
 
const staticSource = completeFromList(STATIC_COMPLETIONS);
 
const WORD_RE = /[A-Za-z_][A-Za-z0-9_]*/g;
const STATIC_LABELS = new Set(STATIC_COMPLETIONS.map((c) => c.label));
 
function documentWords(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/[A-Za-z_][A-Za-z0-9_]*$/);
  if (!word || (!context.explicit && word.text.length < 2)) return null;
  const seen = new Set<string>();
  const options: Completion[] = [];
  const doc = context.state.doc;
  const text = doc.sliceString(Math.max(0, context.pos - 20000), Math.min(doc.length, context.pos + 20000));
  for (const m of text.matchAll(WORD_RE)) {
    const w = m[0];
    if (w === word.text || seen.has(w) || w.length < 3 || STATIC_LABELS.has(w)) continue;
    seen.add(w);
    options.push({ label: w, type: "text", boost: -1 });
    if (seen.size > 200) break;
  }
  return { from: word.from, options, validFor: /^[A-Za-z_][A-Za-z0-9_]*$/ };
}
 
export const csharpCompletion = autocompletion({
  activateOnTyping: true,
  maxRenderedOptions: 60,
  override: [
    (ctx) => staticSource(ctx),
    documentWords,
  ],
});
 
const HOVER_DOCS = new Map<string, string>([
  ...BCL.map(([k, v]): [string, string] => [k.replace(/<.*>$/, ""), v]),
  ...MEMBERS.map(([k, v]): [string, string] => [k, v]),
  ...KEYWORDS.map((k): [string, string] => [k, `keyword ${k}`]),
]);
 
export const csharpHover = hoverTooltip((view, pos) => {
  const { from, to, text } = view.state.doc.lineAt(pos);
  let start = pos, end = pos;
  while (start > from && /[\w$]/.test(text[start - from - 1])) start--;
  while (end < to && /[\w$]/.test(text[end - from])) end++;
  if (start === end) return null;
  const word = text.slice(start - from, end - from);
  const doc = HOVER_DOCS.get(word);
  if (!doc) return null;
  return {
    pos: start,
    end,
    above: true,
    create() {
      const dom = document.createElement("div");
      dom.textContent = doc;
      return { dom };
    },
  };
});
 
function simpleLint(view: EditorView): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const doc = view.state.doc;
  if (doc.length > 200_000) return diagnostics;
  const text = doc.toString();
  const todoRe = /\/\/\s*(TODO|FIXME|HACK)\b[^\n]*/g;
  for (const m of text.matchAll(todoRe)) {
    diagnostics.push({
      from: m.index,
      to: m.index + m[0].length,
      severity: "warning",
      message: `Unresolved ${m[1]} comment`,
      source: "lumen",
    });
  }
  const emptyCatch = /catch\s*(\([^)]*\))?\s*\{\s*\}/g;
  for (const m of text.matchAll(emptyCatch)) {
    diagnostics.push({
      from: m.index,
      to: m.index + m[0].length,
      severity: "warning",
      message: "Empty catch block swallows exceptions",
      source: "lumen",
    });
  }
  return diagnostics;
}
 
export const csharpLinter = linter(simpleLint, { delay: 400 });
 
const FN_CALL_RE = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
const NON_FN = new Set(
  "if for foreach while switch catch lock using return throw sizeof typeof nameof checked unchecked fixed when is as new await default".split(" ")
);
const fnCallMark = Decoration.mark({ class: "cm-fncall" });
 
const csharpFnCalls = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) this.decorations = this.build(update.view);
    }
    build(view: EditorView): DecorationSet {
      const ranges: Array<{ from: number; to: number }> = [];
      for (const { from, to } of view.visibleRanges) {
        const text = view.state.doc.sliceString(from, to);
        for (const m of text.matchAll(FN_CALL_RE)) {
          const name = m[1];
          if (NON_FN.has(name)) continue;
          ranges.push({ from: from + m.index, to: from + m.index + name.length });
        }
      }
      return Decoration.set(ranges.map((r) => fnCallMark.range(r.from, r.to)));
    }
  },
  { decorations: (v) => v.decorations }
);
 
export function csharpExtensions(): Extension[] {
  return [csharpLanguage, csharpFnCalls, csharpCompletion, csharpHover, csharpLinter, smoothCaret()];
}
 
const C_KEYWORDS =
  `auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while _Bool _Complex _Atomic _Thread_local bool true false NULL size_t ssize_t int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t intptr_t uintptr_t ptrdiff_t FILE printf fprintf sprintf snprintf scanf malloc calloc realloc free memcpy memmove memset strlen strcmp strncmp strcpy strncpy strcat fopen fclose fread fwrite fseek ftell exit abort assert`.split(
    " "
  );
 
const C_SNIPPETS: Completion[] = [
  snippetCompletion("for (int ${i} = 0; ${i} < ${n}; ${i}++) {\n\t${}\n}", { label: "for", detail: "for loop", type: "keyword", boost: 2 }),
  snippetCompletion("if (${condition}) {\n\t${}\n}", { label: "if", detail: "if statement", type: "keyword", boost: 2 }),
  snippetCompletion("while (${condition}) {\n\t${}\n}", { label: "while", detail: "while loop", type: "keyword", boost: 2 }),
  snippetCompletion('printf("${}\\n");', { label: "pf", detail: "printf", type: "function", boost: 3 }),
  snippetCompletion("typedef struct {\n\t${}\n} ${Name};", { label: "struct", detail: "typedef struct", type: "keyword", boost: 2 }),
  snippetCompletion("int main(int argc, char *argv[]) {\n\t${}\n\treturn 0;\n}", { label: "main", detail: "main function", type: "function", boost: 2 }),
];
 
const cStaticSource = completeFromList([
  ...C_KEYWORDS.map((k): Completion => ({ label: k, type: "keyword" })),
  ...C_SNIPPETS,
]);
 
const cCompletion = autocompletion({
  activateOnTyping: true,
  maxRenderedOptions: 60,
  override: [(ctx) => cStaticSource(ctx), documentWords],
});
 
function cLint(view: EditorView): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const doc = view.state.doc;
  if (doc.length > 200_000) return diagnostics;
  const text = doc.toString();
  const todoRe = /\/\/\s*(TODO|FIXME|HACK)\b[^\n]*|\/\*\s*(TODO|FIXME|HACK)\b[^*]*/g;
  for (const m of text.matchAll(todoRe)) {
    diagnostics.push({
      from: m.index,
      to: m.index + m[0].length,
      severity: "warning",
      message: `Unresolved ${m[1] ?? m[2]} comment`,
      source: "lumen",
    });
  }
  return diagnostics;
}
 
export const cLinter = linter(cLint, { delay: 400 });

const cCallMark = Decoration.mark({ class: "cm-fncall-c" });
const cDefMark = Decoration.mark({ class: "cm-fndef-c" });
const cAssignMark = Decoration.mark({ class: "cm-assign-c" });
const cFmtMark = Decoration.mark({ class: "cm-strfmt-c" });
const cSysLibMark = Decoration.mark({ class: "cm-syslib-c" });
const FMT_RE = /%[-+ #0']*\d*(?:\.\d+)?(?:hh|h|ll|l|L|z|j|t)?[diouxXeEfFgGaAcspn%]/g;

const cCallHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) this.decorations = this.build(update.view);
    }
    build(view: EditorView): DecorationSet {
      const ranges: Array<{ from: number; to: number; mark: Decoration }> = [];
      const tree = syntaxTree(view.state);
      for (const { from, to } of view.visibleRanges) {
        tree.iterate({
          from,
          to,
          enter(node) {
            if (node.name === "CallExpression") {
              const callee = node.node.firstChild;
              if (callee && (callee.name === "Identifier" || callee.name === "FieldIdentifier"))
                ranges.push({ from: callee.from, to: callee.to, mark: cCallMark });
            } else if (node.name === "FunctionDeclarator") {
              const name = node.node.getChild("Identifier");
              if (name) ranges.push({ from: name.from, to: name.to, mark: cDefMark });
            } else if (node.name === "String") {
              const text = view.state.sliceDoc(node.from, node.to);
              for (const m of text.matchAll(FMT_RE))
                ranges.push({ from: node.from + m.index, to: node.from + m.index + m[0].length, mark: cFmtMark });
            } else if (node.name === "SystemLibString") {
              ranges.push({ from: node.from, to: node.to, mark: cSysLibMark });
            } else if (node.name === "InitDeclarator" || node.name === "AssignmentExpression") {
              const first = node.node.firstChild;
              const last = node.node.lastChild;
              if (first && last && first !== last) {
                const between = view.state.sliceDoc(first.to, last.from);
                const i = between.indexOf("=");
                if (i >= 0 && between[i + 1] !== "=" && !"+-*/%&|^<>!".includes(between[i - 1] ?? "")) {
                  const pos = first.to + i;
                  ranges.push({ from: pos, to: pos + 1, mark: cAssignMark });
                }
              }
            }
          },
        });
      }
      ranges.sort((a, b) => a.from - b.from);
      return Decoration.set(ranges.map((r) => r.mark.range(r.from, r.to)));
    }
  },
  { decorations: (v) => v.decorations }
);

export function cppHighlightExtras(): Extension[] {
  return [cCallHighlight];
}
 
export function cExtensions(): Extension[] {
  return [cpp(), cCompletion, cLinter, cppHighlightExtras(), smoothCaret()];
}
