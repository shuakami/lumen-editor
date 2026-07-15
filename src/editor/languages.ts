import type { Extension } from "@codemirror/state";
import { StreamLanguage } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { go } from "@codemirror/lang-go";
import { java } from "@codemirror/lang-java";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages as codeLanguages } from "@codemirror/language-data";
import { sql } from "@codemirror/lang-sql";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import { php } from "@codemirror/lang-php";
import { cpp } from "@codemirror/lang-cpp";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { ruby } from "@codemirror/legacy-modes/mode/ruby";
import { lua } from "@codemirror/legacy-modes/mode/lua";
import { swift } from "@codemirror/legacy-modes/mode/swift";
import { dockerFile } from "@codemirror/legacy-modes/mode/dockerfile";
import { diff } from "@codemirror/legacy-modes/mode/diff";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { perl } from "@codemirror/legacy-modes/mode/perl";
import { r } from "@codemirror/legacy-modes/mode/r";
import { clojure } from "@codemirror/legacy-modes/mode/clojure";
import { powerShell } from "@codemirror/legacy-modes/mode/powershell";
import { csharpExtensions, cExtensions, cppHighlightExtras } from "./csharp";
import { smoothCaret } from "./caret";
 
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
 
function legacy(mode: Parameters<typeof StreamLanguage.define>[0]): () => Extension[] {
  return () => [StreamLanguage.define(mode), smoothCaret()];
}

const BAT_KEYWORDS = new Set([
  "echo", "set", "if", "else", "goto", "call", "for", "in", "do", "exit", "pause",
  "cd", "chdir", "start", "shift", "setlocal", "endlocal", "not", "exist", "defined",
  "errorlevel", "rem", "cls", "copy", "del", "dir", "md", "mkdir", "move", "rd",
  "rmdir", "ren", "type", "title", "color", "choice", "timeout", "pushd", "popd",
  "equ", "neq", "lss", "leq", "gtr", "geq", "off", "on", "nul",
]);

const batch: Parameters<typeof StreamLanguage.define>[0] = {
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
  { def: { id: "csharp", label: "C#", icon: csharpIcon, extensions: csharpExtensions }, exts: ["cs", "csx", "cake"] },
  { def: { id: "c", label: "C", icon: cIcon, extensions: cExtensions }, exts: ["c", "i"] },
  { def: { id: "cpp", label: "C++", icon: cppIcon, extensions: () => [cpp(), cppHighlightExtras(), smoothCaret()] }, exts: ["cc", "cpp", "cxx", "c++", "h", "hh", "hpp", "hxx", "inl", "ipp", "ixx", "cu", "cuh"] },
  { def: { id: "javascript", label: "JavaScript", icon: jsIcon, extensions: () => [javascript(), smoothCaret()] }, exts: ["js", "mjs", "cjs", "es6"] },
  { def: { id: "javascriptreact", label: "JavaScript JSX", icon: reactIcon, extensions: () => [javascript({ jsx: true }), smoothCaret()] }, exts: ["jsx"] },
  { def: { id: "typescript", label: "TypeScript", icon: tsIcon, extensions: () => [javascript({ typescript: true }), smoothCaret()] }, exts: ["ts", "mts", "cts"] },
  { def: { id: "typescriptreact", label: "TypeScript JSX", icon: reactTsIcon, extensions: () => [javascript({ typescript: true, jsx: true }), smoothCaret()] }, exts: ["tsx"] },
  { def: { id: "python", label: "Python", icon: pyIcon, extensions: () => [python(), smoothCaret()] }, exts: ["py", "pyi", "pyw", "ipy", "rpy"] },
  { def: { id: "rust", label: "Rust", icon: rustIcon, extensions: () => [rust(), smoothCaret()] }, exts: ["rs"] },
  { def: { id: "go", label: "Go", icon: goIcon, extensions: () => [go(), smoothCaret()] }, exts: ["go"] },
  { def: { id: "java", label: "Java", icon: javaIcon, extensions: () => [java(), smoothCaret()] }, exts: ["java", "jav"] },
  { def: { id: "json", label: "JSON", icon: jsonIcon, extensions: () => [json(), smoothCaret()] }, exts: ["json", "jsonc", "jsonl", "geojson", "webmanifest", "ipynb"] },
  { def: { id: "html", label: "HTML", icon: htmlIcon, extensions: () => [html(), smoothCaret()] }, exts: ["html", "htm", "xhtml", "shtml"] },
  { def: { id: "css", label: "CSS", icon: cssIcon, extensions: () => [css(), smoothCaret()] }, exts: ["css", "scss", "less"] },
  { def: { id: "markdown", label: "Markdown", icon: mdIcon, extensions: () => [markdown({ base: markdownLanguage, codeLanguages }), smoothCaret()] }, exts: ["md", "markdown", "mdown", "mkd", "mdc"] },
  { def: { id: "sql", label: "SQL", icon: sqlIcon, extensions: () => [sql(), smoothCaret()] }, exts: ["sql", "dsql"] },
  { def: { id: "xml", label: "XML", icon: xmlIcon, extensions: () => [xml(), smoothCaret()] }, exts: ["xml", "xsd", "xsl", "svg", "csproj", "props", "targets"] },
  { def: { id: "yaml", label: "YAML", icon: yamlIcon, extensions: () => [yaml(), smoothCaret()] }, exts: ["yaml", "yml"] },
  { def: { id: "php", label: "PHP", icon: phpIcon, extensions: () => [php(), smoothCaret()] }, exts: ["php", "php4", "php5", "phtml"] },
  { def: { id: "shellscript", label: "Shell Script", icon: shellIcon, extensions: legacy(shell) }, exts: ["sh", "bash", "zsh", "ksh", "fish", "bashrc", "zshrc"] },
  { def: { id: "bat", label: "Batch", icon: shellIcon, extensions: legacy(batch) }, exts: ["bat", "cmd"] },
  { def: { id: "powershell", label: "PowerShell", icon: powershellIcon, extensions: legacy(powerShell) }, exts: ["ps1", "psm1", "psd1"] },
  { def: { id: "ruby", label: "Ruby", icon: rubyIcon, extensions: legacy(ruby) }, exts: ["rb", "rake", "gemspec", "ru"], filenames: ["gemfile", "rakefile"] },
  { def: { id: "lua", label: "Lua", icon: luaIcon, extensions: legacy(lua) }, exts: ["lua"] },
  { def: { id: "swift", label: "Swift", icon: swiftIcon, extensions: legacy(swift) }, exts: ["swift"] },
  { def: { id: "dockerfile", label: "Dockerfile", icon: dockerIcon, extensions: legacy(dockerFile) }, exts: ["dockerfile", "containerfile"], filenames: ["dockerfile", "containerfile"] },
  { def: { id: "diff", label: "Diff", icon: diffIcon, extensions: legacy(diff) }, exts: ["diff", "patch", "rej"] },
  { def: { id: "toml", label: "TOML", icon: tomlIcon, extensions: legacy(toml) }, exts: ["toml"] },
  { def: { id: "perl", label: "Perl", icon: perlIcon, extensions: legacy(perl) }, exts: ["pl", "pm", "pod", "psgi"] },
  { def: { id: "r", label: "R", icon: rIcon, extensions: legacy(r) }, exts: ["r", "rhistory", "rprofile"] },
  { def: { id: "clojure", label: "Clojure", icon: clojureIcon, extensions: legacy(clojure) }, exts: ["clj", "cljc", "cljs", "edn"] },
  { def: { id: "image", label: "图片", icon: imageIcon, extensions: () => [smoothCaret()] }, exts: ["png", "jpg", "jpeg", "gif", "ico", "webp", "bmp", "avif", "tiff"] },
  { def: { id: "font", label: "字体", icon: fontIcon, extensions: () => [smoothCaret()] }, exts: ["ttf", "otf", "woff", "woff2", "eot"] },
  { def: { id: "archive", label: "压缩包", icon: zipIcon, extensions: () => [smoothCaret()] }, exts: ["zip", "gz", "tar", "tgz", "rar", "7z", "jar"] },
  { def: { id: "pdf", label: "PDF", icon: pdfIcon, extensions: () => [smoothCaret()] }, exts: ["pdf"] },
  { def: { id: "audio", label: "音频", icon: audioIcon, extensions: () => [smoothCaret()] }, exts: ["mp3", "wav", "ogg", "flac", "m4a"] },
  { def: { id: "video", label: "视频", icon: videoIcon, extensions: () => [smoothCaret()] }, exts: ["mp4", "webm", "mov", "avi", "mkv"] },
];
 
const byExt = new Map<string, LanguageDef>();
const byFilename = new Map<string, LanguageDef>();
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
  const exact = byFilename.get(lower);
  if (exact) return exact;
  const parts = lower.split(".");
  for (let i = 1; i < parts.length; i++) {
    const def = byExt.get(parts.slice(i).join("."));
    if (def) return def;
  }
  return PLAIN_TEXT;
}
