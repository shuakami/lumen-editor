import { StateField, StateEffect, RangeSet } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { gutter, GutterMarker } from "@codemirror/view";
 
const toggleBreakpoint = StateEffect.define<{ pos: number; on: boolean }>({
  map: (val, mapping) => ({ pos: mapping.mapPos(val.pos), on: val.on }),
});
 
const breakpointMarker = new (class extends GutterMarker {
  toDOM() {
    const dot = document.createElement("div");
    dot.className = "cm-breakpoint-dot";
    return dot;
  }
})();
 
const breakpointField = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(set, tr) {
    set = set.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(toggleBreakpoint)) {
        if (e.value.on) set = set.update({ add: [breakpointMarker.range(e.value.pos)] });
        else set = set.update({ filter: (from) => from !== e.value.pos });
      }
    }
    return set;
  },
});
 
export function breakpointGutter(): Extension {
  return [
    breakpointField,
    gutter({
      class: "cm-breakpoint-gutter",
      markers: (view) => view.state.field(breakpointField),
      initialSpacer: () => breakpointMarker,
      renderEmptyElements: true,
      domEventHandlers: {
        mousedown(view, line) {
          let on = false;
          view.state.field(breakpointField).between(line.from, line.from, () => {
            on = true;
          });
          view.dispatch({ effects: toggleBreakpoint.of({ pos: line.from, on: !on }) });
          return true;
        },
      },
    }),
  ];
}
