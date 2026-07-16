/** VS Code 风格的查找/替换组件：右上角悬浮小面板，输入框内嵌 Aa / ab / .* 开关，
 * 结果计数 X/Y，↑↓ 导航，左侧竖排 chevron 展开替换行。替换 @codemirror/search 默认面板。 */

import type { Extension } from "@codemirror/state";
import type { EditorView, Panel, ViewUpdate } from "@codemirror/view";
import {
  SearchQuery,
  search,
  setSearchQuery,
  getSearchQuery,
  findNext,
  findPrevious,
  replaceNext,
  replaceAll,
  closeSearchPanel,
} from "@codemirror/search";

const ICONS = {
  chevronRight: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M5.7 13.7L5 13l4.6-4.6L5 3.7l.7-.7L11 8.4v.6l-5.3 4.7z"/></svg>',
  chevronDown: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M7.976 10.072l4.357-4.357.62.618L8.284 11h-.618L3 6.333l.619-.618 4.357 4.357z"/></svg>',
  arrowUp: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M13.854 7l-5-5h-.708l-5 5 .708.707L7.5 4.061V14h1V4.06l3.646 3.647.708-.707z"/></svg>',
  arrowDown: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M2.146 9l5 5h.708l5-5-.708-.707L8.5 11.939V2h-1v9.94L3.854 8.292 2.146 9z"/></svg>',
  close: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.708-.708L8 7.293 4.354 3.646l-.708.708L7.293 8l-3.647 3.646.708.708L8 8.707z"/></svg>',
  replace: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M3.221 3.739l2.261 2.269L7.7 3.784l-.7-.7-1.012 1.007-.008-1.6a.523.523 0 0 1 .5-.526H8V1H6.48A1.482 1.482 0 0 0 5 2.489V4.1L3.927 3.033l-.706.706zm6.67 1.794h.01c.183.311.451.467.806.467.393 0 .706-.168.94-.503.236-.335.353-.78.353-1.333 0-.537-.106-.952-.319-1.246-.212-.295-.502-.442-.869-.442-.229 0-.426.058-.592.173-.166.115-.29.28-.371.494h-.01V2H9v4h.831v-.437l.06-.03zm-.06-.712v-.323c0-.234.061-.421.183-.561.122-.14.276-.21.463-.21.204 0 .358.074.462.223.104.148.156.362.156.643 0 .3-.056.53-.169.692a.53.53 0 0 1-.462.243c-.181 0-.331-.07-.451-.211-.12-.14-.181-.306-.182-.496zM2 12h2.5v2.5h1V12H8v3H2v-3zm12.259-8.184A2.463 2.463 0 0 0 11.5 3h-.5v1h.5c.667 0 1.183.229 1.548.686.365.457.548 1.089.548 1.897V7H12l1.5 2.5L15 7h-1.404v-.417c0-1.005-.253-1.792-.759-2.36l.422-.407zM9 12h6v1H9v-1zm0 2h6v1H9v-1z"/></svg>',
  replaceAll: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M11.6 2.677c.147-.31.356-.465.626-.465.248 0 .44.118.573.353.134.236.201.557.201.966 0 .443-.078.798-.235 1.067-.156.268-.365.402-.627.402-.237 0-.416-.125-.539-.374h-.008v.31H11V1h.591v1.677h.009zm-.016 1.1a.78.78 0 0 0 .107.426c.071.113.163.169.274.169.136 0 .24-.072.314-.216.075-.145.113-.35.113-.615 0-.22-.035-.39-.104-.514-.067-.124-.163-.187-.288-.187-.117 0-.213.062-.288.185a.887.887 0 0 0-.113.483v.27h-.015zM4.12 7.695L2 5.568l.662-.662 1.006 1v-1.51A1.39 1.39 0 0 1 5.055 3H7.4v.905H5.055a.49.49 0 0 0-.468.493l.007 1.5.949-.944.656.656-2.08 2.085zM9.356 4.93H10V3.22C10 2.408 9.685 2 9.056 2c-.135 0-.285.024-.45.073a1.444 1.444 0 0 0-.388.167v.665c.237-.203.487-.304.75-.304.261 0 .392.156.392.469l-.6.103c-.506.086-.76.406-.76.961 0 .263.061.473.183.631A.61.61 0 0 0 8.69 5c.29 0 .509-.16.657-.48h.009v.41zm.004-1.355v.193a.75.75 0 0 1-.12.436.368.368 0 0 1-.313.17.276.276 0 0 1-.22-.095.38.38 0 0 1-.08-.248c0-.222.11-.351.332-.389l.4-.067zM7 12.93h-.644v-.41h-.009c-.148.32-.367.48-.657.48a.61.61 0 0 1-.507-.235c-.122-.158-.183-.368-.183-.63 0-.556.254-.876.76-.962l.6-.103c0-.313-.13-.47-.392-.47-.263 0-.513.102-.75.305v-.665c.095-.063.224-.119.388-.167.165-.049.315-.073.45-.073.629 0 .944.407.944 1.22v1.71zm-.64-1.162v-.193l-.4.068c-.222.037-.333.166-.333.388 0 .1.027.183.08.248a.276.276 0 0 0 .22.095.368.368 0 0 0 .312-.17c.08-.116.12-.261.12-.436zM9.262 9.5c-.203 0-.384.055-.542.164-.159.11-.28.265-.365.466h-.008V9.5H7.7v4.362h.647v-1.601h.008c.084.161.201.284.351.371.15.086.313.13.492.13.359 0 .642-.16.849-.479.207-.319.31-.741.31-1.267 0-.492-.089-.883-.267-1.171-.177-.288-.454-.345-.828-.345zm-.29 2.674c-.187 0-.34-.076-.46-.229-.121-.153-.181-.354-.181-.603v-.339c0-.262.062-.475.185-.638a.573.573 0 0 1 .478-.246c.194 0 .345.077.454.231.11.154.164.376.164.666 0 .329-.056.577-.169.752a.548.548 0 0 1-.47.406zM2 14h4v1H2v-1zm12.213-8.941l.664-.702-2.121-2.121-.708.707 1.017 1.017c-1.18.075-2.065.462-2.653 1.162-.66.785-.99 2.008-.99 3.669V9h1v-.209c0-1.397.252-2.4.756-3.011.437-.53 1.114-.816 2.03-.86l-.867.918.702.664 1.17-1.238v-.205z"/></svg>',
  wholeWord: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M0 11h1v2h14v-2h1v3H0v-3z"/><path d="M6.84 9h-.88v-.86h-.022c-.383.66-.947.989-1.692.989-.548 0-.977-.145-1.289-.435-.308-.29-.462-.675-.462-1.155 0-1.028.605-1.626 1.816-1.794l1.649-.23c0-.935-.378-1.403-1.134-1.403-.662 0-1.26.226-1.794.677v-.902c.541-.344 1.164-.516 1.87-.516 1.292 0 1.938.684 1.938 2.052V9zm-.88-2.782l-1.327.183c-.409.057-.717.159-.924.306-.208.143-.311.399-.311.767 0 .268.095.488.284.66.194.168.45.252.767.252.437 0 .797-.153 1.08-.46.288-.31.431-.703.431-1.177v-.531zM9.936 8.14h-.021V9h-.882V.75h.882v3.657h.021c.434-.73 1.068-1.096 1.902-1.096.708 0 1.26.246 1.658.741.401.49.602 1.15.602 1.977 0 .921-.224 1.659-.672 2.213-.447.551-1.06.827-1.837.827-.726 0-1.277-.31-1.653-.929zm-.021-2.223v.769c0 .455.147.841.44 1.16.298.315.674.472 1.128.472.532 0 .95-.204 1.252-.612.305-.408.457-.975.457-1.702 0-.611-.142-1.09-.427-1.438-.284-.347-.67-.521-1.155-.521-.516 0-.93.18-1.245.537-.3.358-.45.803-.45 1.335z"/></svg>',
  matchCase: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8.854 11.702h-1l-.816-2.159H3.772l-.768 2.16H2L4.954 4h.935l2.965 7.702zm-2.111-2.97L5.534 5.45a3.142 3.142 0 0 1-.118-.515h-.021c-.036.218-.077.39-.124.515L4.073 8.732h2.67zM13.756 11.7h-.877v-.86h-.022c-.38.66-.94.99-1.678.99-.543 0-.97-.144-1.279-.431-.306-.288-.458-.67-.458-1.146 0-1.02.6-1.612 1.8-1.778l1.637-.229c0-.928-.376-1.393-1.126-1.393-.657 0-1.25.224-1.779.671v-.898c.537-.342 1.156-.513 1.856-.513 1.284 0 1.926.679 1.926 2.036V11.7zm-.873-2.762l-1.317.181c-.406.057-.712.158-.917.304-.206.142-.308.396-.308.76 0 .266.094.483.282.653.191.167.445.25.76.25.435 0 .793-.151 1.073-.455.284-.307.427-.696.427-1.167v-.526z"/></svg>',
  regex: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M10.012 2h.976v3.113l2.56-1.557.486.885L11.47 6l2.564 1.559-.485.885-2.561-1.557V10h-.976V6.887l-2.56 1.557-.486-.885L9.53 6 6.966 4.441l.485-.885 2.561 1.557V2zM2 10h4v4H2v-4z"/></svg>',
};

function iconBtn(cls: string, title: string, icon: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = `lmf-btn ${cls}`;
  b.title = title;
  b.type = "button";
  b.innerHTML = icon;
  b.addEventListener("click", (e) => {
    e.preventDefault();
    onClick();
  });
  return b;
}

function createFindPanel(view: EditorView): Panel {
  const dom = document.createElement("div");
  dom.className = "lmf";

  let expanded = false;

  /* 左侧竖排 chevron：展开/收起替换行 */
  const toggle = iconBtn("lmf-toggle", "切换替换", ICONS.chevronRight, () => setExpanded(!expanded));

  const main = document.createElement("div");
  main.className = "lmf-main";

  /* —— 查找行 —— */
  const findRow = document.createElement("div");
  findRow.className = "lmf-row";

  const findWrap = document.createElement("div");
  findWrap.className = "lmf-input-wrap";
  const findInput = document.createElement("input");
  findInput.className = "lmf-input";
  findInput.placeholder = "查找";
  findInput.setAttribute("main-field", "true");
  const optCase = iconBtn("lmf-opt", "区分大小写 (Alt+C)", ICONS.matchCase, () => toggleOpt("case"));
  const optWord = iconBtn("lmf-opt", "全字匹配 (Alt+W)", ICONS.wholeWord, () => toggleOpt("word"));
  const optRe = iconBtn("lmf-opt", "使用正则表达式 (Alt+R)", ICONS.regex, () => toggleOpt("re"));
  const opts = document.createElement("div");
  opts.className = "lmf-opts";
  opts.append(optCase, optWord, optRe);
  findWrap.append(findInput, opts);

  const count = document.createElement("span");
  count.className = "lmf-count";
  count.textContent = "无结果";

  const prevBtn = iconBtn("", "上一个匹配项 (Shift+Enter)", ICONS.arrowUp, () => findPrevious(view));
  const nextBtn = iconBtn("", "下一个匹配项 (Enter)", ICONS.arrowDown, () => findNext(view));
  const closeBtn = iconBtn("", "关闭 (Escape)", ICONS.close, () => closeSearchPanel(view));

  findRow.append(findWrap, count, prevBtn, nextBtn, closeBtn);

  /* —— 替换行 —— */
  const replaceRow = document.createElement("div");
  replaceRow.className = "lmf-row lmf-replace-row";
  const repWrap = document.createElement("div");
  repWrap.className = "lmf-input-wrap";
  const repInput = document.createElement("input");
  repInput.className = "lmf-input";
  repInput.placeholder = "替换";
  repWrap.append(repInput);
  const repBtn = iconBtn("", "替换 (Enter)", ICONS.replace, () => replaceNext(view));
  const repAllBtn = iconBtn("", "全部替换", ICONS.replaceAll, () => replaceAll(view));
  replaceRow.append(repWrap, repBtn, repAllBtn);

  main.append(findRow, replaceRow);
  dom.append(toggle, main);

  function setExpanded(v: boolean): void {
    expanded = v;
    toggle.innerHTML = v ? ICONS.chevronDown : ICONS.chevronRight;
    replaceRow.style.display = v ? "" : "none";
    if (v) repInput.focus();
  }
  setExpanded(false);

  let caseSensitive = false;
  let wholeWord = false;
  let regexp = false;

  function commit(): void {
    optCase.classList.toggle("on", caseSensitive);
    optWord.classList.toggle("on", wholeWord);
    optRe.classList.toggle("on", regexp);
    const query = new SearchQuery({
      search: findInput.value,
      replace: repInput.value,
      caseSensitive,
      wholeWord,
      regexp,
      literal: !regexp,
    });
    view.dispatch({ effects: setSearchQuery.of(query) });
    updateCount();
  }

  function toggleOpt(which: "case" | "word" | "re"): void {
    if (which === "case") caseSensitive = !caseSensitive;
    else if (which === "word") wholeWord = !wholeWord;
    else regexp = !regexp;
    commit();
    findInput.focus();
  }

  /** 结果计数 X/Y（上限 999+，避免超大文件卡顿）。 */
  function updateCount(): void {
    const q = getSearchQuery(view.state);
    if (!q.search || !q.valid) {
      count.textContent = "";
      count.classList.remove("none");
      return;
    }
    const sel = view.state.selection.main;
    let total = 0;
    let current = 0;
    try {
      const cursor = q.getCursor(view.state);
      let step = cursor.next();
      while (!step.done && total < 999) {
        total++;
        if (step.value.from <= sel.from) current = total;
        step = cursor.next();
      }
      if (!step.done) {
        count.textContent = `${current || "?"} / 999+`;
        count.classList.remove("none");
        return;
      }
    } catch {
      count.textContent = "";
      return;
    }
    if (total === 0) {
      count.textContent = "无结果";
      count.classList.add("none");
    } else {
      count.textContent = `${Math.max(current, 1)} / ${total}`;
      count.classList.remove("none");
    }
  }

  findInput.addEventListener("input", commit);
  repInput.addEventListener("input", commit);
  findInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) findPrevious(view);
      else findNext(view);
    } else if (e.altKey && (e.key === "c" || e.key === "C")) {
      e.preventDefault();
      toggleOpt("case");
    } else if (e.altKey && (e.key === "w" || e.key === "W")) {
      e.preventDefault();
      toggleOpt("word");
    } else if (e.altKey && (e.key === "r" || e.key === "R")) {
      e.preventDefault();
      toggleOpt("re");
    }
  });
  repInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      replaceNext(view);
    }
  });

  return {
    dom,
    top: true,
    mount() {
      const q = getSearchQuery(view.state);
      if (q.search) findInput.value = q.search;
      caseSensitive = q.caseSensitive;
      wholeWord = q.wholeWord;
      regexp = q.regexp;
      const sel = view.state.selection.main;
      if (sel.from !== sel.to && sel.to - sel.from < 200) {
        const text = view.state.sliceDoc(sel.from, sel.to);
        if (!text.includes("\n")) findInput.value = text;
      }
      findInput.focus();
      findInput.select();
      // mount 在视图更新周期内被调用，dispatch 需要推迟到更新结束后
      window.setTimeout(() => commit(), 0);
    },
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet) updateCount();
    },
  };
}

/** VS Code 风格查找面板扩展。 */
export function findPanel(): Extension {
  return search({ top: true, createPanel: createFindPanel });
}
