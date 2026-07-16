# Project Guidance

- Preserve the root `lumenedit` export for compatibility, but add new library surfaces through narrow subpath entries in `src/entries/`.
- Keep CodeMirror language parsers and optional preview tooling behind dynamic imports; production dependencies must match modules externalized by `vite.lib.config.ts`.
- Performance changes must preserve DOM, CSS, interactions, and syntax colors. Verify desktop and mobile screenshots against saved baselines before release.
- Measure package changes from a packed tarball installed into a clean consumer; repository build output alone does not represent consumer transfer size.
- Size HyperEditor virtual windows by parser work and viewport needs; benchmark immediate scrolling after first activation as well as steady-state scrolling.
