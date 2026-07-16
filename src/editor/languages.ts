import { StateEffect, type Extension } from "@codemirror/state";
import { ViewPlugin } from "@codemirror/view";
import type { StreamParser } from "@codemirror/language";
import { smoothCaret } from "./caret";
import { scopedLanguageHighlight } from "./theme";
 
import csharpIcon from "material-icon-theme/icons/csharp.svg";
import cIcon from "material-icon-theme/icons/c.svg";
import cppIcon from "material-icon-theme/icons/cpp.svg";
import jsIcon from "material-icon-theme/icons/javascript.svg";
import reactIcon from "material-icon-theme/icons/react.svg";
import reactTsIcon from "material-icon-theme/icons/react_ts.svg";
import tsIcon from "material-icon-theme/icons/typescript.svg";
import pyIcon from "material-icon-theme/icons/python.svg";
import rustIcon from "material-icon-theme/icons/rust.svg";
import goIcon from "material-icon-theme/icons/go.svg";
import javaIcon from "material-icon-theme/icons/java.svg";
import jsonIcon from "material-icon-theme/icons/json.svg";
import htmlIcon from "material-icon-theme/icons/html.svg";
import cssIcon from "material-icon-theme/icons/css.svg";
import mdIcon from "material-icon-theme/icons/markdown.svg";
import sqlIcon from "material-icon-theme/icons/database.svg";
import xmlIcon from "material-icon-theme/icons/xml.svg";
import yamlIcon from "material-icon-theme/icons/yaml.svg";
import phpIcon from "material-icon-theme/icons/php.svg";
import shellIcon from "material-icon-theme/icons/console.svg";
import rubyIcon from "material-icon-theme/icons/ruby.svg";
import luaIcon from "material-icon-theme/icons/lua.svg";
import swiftIcon from "material-icon-theme/icons/swift.svg";
import dockerIcon from "material-icon-theme/icons/docker.svg";
import diffIcon from "material-icon-theme/icons/diff.svg";
import tomlIcon from "material-icon-theme/icons/toml.svg";
import perlIcon from "material-icon-theme/icons/perl.svg";
import rIcon from "material-icon-theme/icons/r.svg";
import clojureIcon from "material-icon-theme/icons/clojure.svg";
import powershellIcon from "material-icon-theme/icons/powershell.svg";
import imageIcon from "material-icon-theme/icons/image.svg";
import fontIcon from "material-icon-theme/icons/font.svg";
import zipIcon from "material-icon-theme/icons/zip.svg";
import pdfIcon from "material-icon-theme/icons/pdf.svg";
import audioIcon from "material-icon-theme/icons/audio.svg";
import videoIcon from "material-icon-theme/icons/video.svg";
import docIcon from "../assets/file-text.svg";
 
export interface LanguageDef {
  id: string;
  label: string;
  icon: string;
  extensions: () => Extension[];
}

type LanguageLoader = () => Promise<Extension[]>;

const extensionCache = new Map<string, Promise<Extension[]>>();

/** Load a parser after the editor mounts, then reuse the immutable extensions across views. */
function deferred(id: string, loader: LanguageLoader): () => Extension[] {
  const plugin = ViewPlugin.define((view) => {
    let active = true;
    let pending = extensionCache.get(id);
    if (!pending) {
      pending = loader();
      extensionCache.set(id, pending);
    }
    void pending.then(
      (extensions) => {
        if (active) view.dispatch({ effects: StateEffect.appendConfig.of(extensions) });
      },
      (error: unknown) => console.error(`Failed to load ${id} language support`, error)
    );
    return { destroy: () => { active = false; } };
  });
  return () => [plugin];
}

const BAT_KEYWORDS = new Set([
  "echo", "set", "if", "else", "goto", "call", "for", "in", "do", "exit", "pause",
  "cd", "chdir", "start", "shift", "setlocal", "endlocal", "not", "exist", "defined",
  "errorlevel", "rem", "cls", "copy", "del", "dir", "md", "mkdir", "move", "rd",
  "rmdir", "ren", "type", "title", "color", "choice", "timeout", "pushd", "popd",
  "equ", "neq", "lss", "leq", "gtr", "geq", "off", "on", "nul",
]);

const batch: StreamParser<unknown> = {
  name: "batch",
  token(stream) {
    if (stream.sol()) {
      if (stream.match(/^\s*(::|rem\b)/i)) {
        stream.skipToEnd();
        return "comment";
      }
      if (stream.match(/^\s*:[^:\s][^\s]*/)) return "labelName";
    }
    if (stream.eatSpace()) return null;
    if (stream.match(/^%%?[~]?[\w:*~=,-]+%?/)) return "variableName.special";
    if (stream.match(/^"[^"]*"?/)) return "string";
    if (stream.match(/^\d+\b/)) return "number";
    if (stream.match(/^[@&|<>()=,;]+/)) return "operator";
    if (stream.match(/^[\w.-]+/)) {
      return BAT_KEYWORDS.has(stream.current().toLowerCase()) ? "keyword" : null;
    }
    stream.next();
    return null;
  },
};
 
const DEFS: Array<{ def: LanguageDef; exts: string[]; filenames?: string[] }> = [
  { def: { id: "csharp", label: "C#", icon: csharpIcon, extensions: deferred("csharp", async () => (await import("./csharp")).csharpExtensions()) }, exts: ["cs", "csx", "cake"] },
  { def: { id: "c", label: "C", icon: cIcon, extensions: deferred("c", async () => (await import("./csharp")).cExtensions()) }, exts: ["c", "i"] },
  { def: { id: "cpp", label: "C++", icon: cppIcon, extensions: deferred("cpp", async () => { const [lang, extra] = await Promise.all([import("@codemirror/lang-cpp"), import("./csharp")]); return [lang.cpp(), extra.cppHighlightExtras(), smoothCaret()]; }) }, exts: ["cc", "cpp", "cxx", "c++", "h", "hh", "hpp", "hxx", "inl", "ipp", "ixx", "cu", "cuh"] },
  { def: { id: "javascript", label: "JavaScript", icon: jsIcon, extensions: deferred("javascript", async () => [(await import("@codemirror/lang-javascript")).javascript(), smoothCaret()]) }, exts: ["js", "mjs", "cjs", "es6"] },
  { def: { id: "javascriptreact", label: "JavaScript JSX", icon: reactIcon, extensions: deferred("javascriptreact", async () => [(await import("@codemirror/lang-javascript")).javascript({ jsx: true }), smoothCaret()]) }, exts: ["jsx"] },
  { def: { id: "typescript", label: "TypeScript", icon: tsIcon, extensions: deferred("typescript", async () => [(await import("@codemirror/lang-javascript")).javascript({ typescript: true }), smoothCaret()]) }, exts: ["ts", "mts", "cts"] },
  { def: { id: "typescriptreact", label: "TypeScript JSX", icon: reactTsIcon, extensions: deferred("typescriptreact", async () => [(await import("@codemirror/lang-javascript")).javascript({ typescript: true, jsx: true }), smoothCaret()]) }, exts: ["tsx"] },
  { def: { id: "python", label: "Python", icon: pyIcon, extensions: deferred("python", async () => [(await import("@codemirror/lang-python")).python(), smoothCaret()]) }, exts: ["py", "pyi", "pyw", "ipy", "rpy"] },
  { def: { id: "rust", label: "Rust", icon: rustIcon, extensions: deferred("rust", async () => [(await import("@codemirror/lang-rust")).rust(), smoothCaret()]) }, exts: ["rs"] },
  { def: { id: "go", label: "Go", icon: goIcon, extensions: deferred("go", async () => [(await import("@codemirror/lang-go")).go(), smoothCaret()]) }, exts: ["go"] },
  { def: { id: "java", label: "Java", icon: javaIcon, extensions: deferred("java", async () => [(await import("@codemirror/lang-java")).java(), smoothCaret()]) }, exts: ["java", "jav"] },
  { def: { id: "json", label: "JSON", icon: jsonIcon, extensions: deferred("json", async () => { const lang = await import("@codemirror/lang-json"); return [lang.json(), ...scopedLanguageHighlight("json", lang.jsonLanguage), smoothCaret()]; }) }, exts: ["json", "jsonc", "jsonl", "geojson", "webmanifest", "ipynb"] },
  { def: { id: "html", label: "HTML", icon: htmlIcon, extensions: deferred("html", async () => { const lang = await import("@codemirror/lang-html"); return [lang.html(), ...scopedLanguageHighlight("html", lang.htmlLanguage), smoothCaret()]; }) }, exts: ["html", "htm", "xhtml", "shtml"] },
  { def: { id: "css", label: "CSS", icon: cssIcon, extensions: deferred("css", async () => { const lang = await import("@codemirror/lang-css"); return [lang.css(), ...scopedLanguageHighlight("css", lang.cssLanguage), smoothCaret()]; }) }, exts: ["css", "scss", "less"] },
  { def: { id: "markdown", label: "Markdown", icon: mdIcon, extensions: deferred("markdown", async () => { const [lang, data] = await Promise.all([import("@codemirror/lang-markdown"), import("@codemirror/language-data")]); return [lang.markdown({ base: lang.markdownLanguage, codeLanguages: data.languages }), ...scopedLanguageHighlight("markdown", lang.markdownLanguage), smoothCaret()]; }) }, exts: ["md", "markdown", "mdown", "mkd", "mdc"] },
  { def: { id: "sql", label: "SQL", icon: sqlIcon, extensions: deferred("sql", async () => [(await import("@codemirror/lang-sql")).sql(), smoothCaret()]) }, exts: ["sql", "dsql"] },
  { def: { id: "xml", label: "XML", icon: xmlIcon, extensions: deferred("xml", async () => { const lang = await import("@codemirror/lang-xml"); return [lang.xml(), ...scopedLanguageHighlight("xml", lang.xmlLanguage), smoothCaret()]; }) }, exts: ["xml", "xsd", "xsl", "svg", "csproj", "props", "targets"] },
  { def: { id: "yaml", label: "YAML", icon: yamlIcon, extensions: deferred("yaml", async () => { const lang = await import("@codemirror/lang-yaml"); return [lang.yaml(), ...scopedLanguageHighlight("yaml", lang.yamlLanguage), smoothCaret()]; }) }, exts: ["yaml", "yml"] },
  { def: { id: "php", label: "PHP", icon: phpIcon, extensions: deferred("php", async () => [(await import("@codemirror/lang-php")).php(), smoothCaret()]) }, exts: ["php", "php4", "php5", "phtml"] },
  { def: { id: "shellscript", label: "Shell Script", icon: shellIcon, extensions: deferred("shellscript", async () => { const [core, mode] = await Promise.all([import("@codemirror/language"), import("@codemirror/legacy-modes/mode/shell")]); return [core.StreamLanguage.define(mode.shell), smoothCaret()]; }) }, exts: ["sh", "bash", "zsh", "ksh", "fish", "bashrc", "zshrc"] },
  { def: { id: "bat", label: "Batch", icon: shellIcon, extensions: deferred("bat", async () => [(await import("@codemirror/language")).StreamLanguage.define(batch), smoothCaret()]) }, exts: ["bat", "cmd"] },
  { def: { id: "powershell", label: "PowerShell", icon: powershellIcon, extensions: deferred("powershell", async () => { const [core, mode] = await Promise.all([import("@codemirror/language"), import("@codemirror/legacy-modes/mode/powershell")]); return [core.StreamLanguage.define(mode.powerShell), smoothCaret()]; }) }, exts: ["ps1", "psm1", "psd1"] },
  { def: { id: "ruby", label: "Ruby", icon: rubyIcon, extensions: deferred("ruby", async () => { const [core, mode] = await Promise.all([import("@codemirror/language"), import("@codemirror/legacy-modes/mode/ruby")]); return [core.StreamLanguage.define(mode.ruby), smoothCaret()]; }) }, exts: ["rb", "rake", "gemspec", "ru"], filenames: ["gemfile", "rakefile"] },
  { def: { id: "lua", label: "Lua", icon: luaIcon, extensions: deferred("lua", async () => { const [core, mode] = await Promise.all([import("@codemirror/language"), import("@codemirror/legacy-modes/mode/lua")]); return [core.StreamLanguage.define(mode.lua), smoothCaret()]; }) }, exts: ["lua"] },
  { def: { id: "swift", label: "Swift", icon: swiftIcon, extensions: deferred("swift", async () => { const [core, mode] = await Promise.all([import("@codemirror/language"), import("@codemirror/legacy-modes/mode/swift")]); return [core.StreamLanguage.define(mode.swift), smoothCaret()]; }) }, exts: ["swift"] },
  { def: { id: "dockerfile", label: "Dockerfile", icon: dockerIcon, extensions: deferred("dockerfile", async () => { const [core, mode] = await Promise.all([import("@codemirror/language"), import("@codemirror/legacy-modes/mode/dockerfile")]); return [core.StreamLanguage.define(mode.dockerFile), smoothCaret()]; }) }, exts: ["dockerfile", "containerfile"], filenames: ["dockerfile", "containerfile"] },
  { def: { id: "diff", label: "Diff", icon: diffIcon, extensions: deferred("diff", async () => { const [core, mode] = await Promise.all([import("@codemirror/language"), import("@codemirror/legacy-modes/mode/diff")]); return [core.StreamLanguage.define(mode.diff), smoothCaret()]; }) }, exts: ["diff", "patch", "rej"] },
  { def: { id: "toml", label: "TOML", icon: tomlIcon, extensions: deferred("toml", async () => { const [core, mode] = await Promise.all([import("@codemirror/language"), import("@codemirror/legacy-modes/mode/toml")]); return [core.StreamLanguage.define(mode.toml), smoothCaret()]; }) }, exts: ["toml"] },
  { def: { id: "perl", label: "Perl", icon: perlIcon, extensions: deferred("perl", async () => { const [core, mode] = await Promise.all([import("@codemirror/language"), import("@codemirror/legacy-modes/mode/perl")]); return [core.StreamLanguage.define(mode.perl), smoothCaret()]; }) }, exts: ["pl", "pm", "pod", "psgi"] },
  { def: { id: "r", label: "R", icon: rIcon, extensions: deferred("r", async () => { const [core, mode] = await Promise.all([import("@codemirror/language"), import("@codemirror/legacy-modes/mode/r")]); return [core.StreamLanguage.define(mode.r), smoothCaret()]; }) }, exts: ["r", "rhistory", "rprofile"] },
  { def: { id: "clojure", label: "Clojure", icon: clojureIcon, extensions: deferred("clojure", async () => { const [core, mode] = await Promise.all([import("@codemirror/language"), import("@codemirror/legacy-modes/mode/clojure")]); return [core.StreamLanguage.define(mode.clojure), smoothCaret()]; }) }, exts: ["clj", "cljc", "cljs", "edn"] },
  { def: { id: "image", label: "图片", icon: imageIcon, extensions: () => [smoothCaret()] }, exts: ["png", "jpg", "jpeg", "gif", "ico", "webp", "bmp", "avif", "tiff"] },
  { def: { id: "font", label: "字体", icon: fontIcon, extensions: () => [smoothCaret()] }, exts: ["ttf", "otf", "woff", "woff2", "eot"] },
  { def: { id: "archive", label: "压缩包", icon: zipIcon, extensions: () => [smoothCaret()] }, exts: ["zip", "gz", "tar", "tgz", "rar", "7z", "jar"] },
  { def: { id: "pdf", label: "PDF", icon: pdfIcon, extensions: () => [smoothCaret()] }, exts: ["pdf"] },
  { def: { id: "audio", label: "音频", icon: audioIcon, extensions: () => [smoothCaret()] }, exts: ["mp3", "wav", "ogg", "flac", "m4a"] },
  { def: { id: "video", label: "视频", icon: videoIcon, extensions: () => [smoothCaret()] }, exts: ["mp4", "webm", "mov", "avi", "mkv"] },
];
 
const byExt = new Map<string, LanguageDef>();
const byFilename = new Map<string, LanguageDef>();
const resolved = new Map<string, LanguageDef>();
for (const { def, exts, filenames } of DEFS) {
  for (const e of exts) byExt.set(e, def);
  for (const f of filenames ?? []) byFilename.set(f, def);
}
 
export const PLAIN_TEXT: LanguageDef = {
  id: "plaintext",
  label: "纯文本",
  icon: docIcon,
  extensions: () => [smoothCaret()],
};
 
export function languageFor(filename: string): LanguageDef {
  const lower = filename.toLowerCase();
  const cached = resolved.get(lower);
  if (cached) return cached;
  const exact = byFilename.get(lower);
  if (exact) {
    resolved.set(lower, exact);
    return exact;
  }
  const parts = lower.split(".");
  for (let i = 1; i < parts.length; i++) {
    const def = byExt.get(parts.slice(i).join("."));
    if (def) {
      resolved.set(lower, def);
      return def;
    }
  }
  resolved.set(lower, PLAIN_TEXT);
  return PLAIN_TEXT;
}
