[![][image-banner]][demo-link]

Lumen is a fast, local-first code editor that runs entirely in your browser. Open any GitHub repository, browse and edit files with full syntax highlighting, run code right from the editor — no install, no server, nothing leaves your machine.

It ships with a Linear-style sync engine: the repository tree is snapshotted to IndexedDB for instant startup, remote changes are pulled in as incremental deltas and hot-applied to open files, and your commits go through a persistent offline-safe transaction queue that replays automatically when you're back online.

**[Live Demo][demo-link]** **[Report Issues][issues-link]**

> \[!WARNING]
> Lumen is still in **beta** — expect rough edges and the occasional bug. Actively being worked on.

## Features

- **GitHub sync engine** — branch head SHA as the sync version, IndexedDB local bootstrap, `compare` API deltas, conflict-aware three-way merge, offline transaction queue
- **Editing** — CodeMirror 6, 20+ languages, snippets, signature hints, 10M-line virtual scrolling
- **Run code** — execute C, C#, Python, Rust, and more via Wandbox, output in the built-in terminal
- **Split view** — drag any file from the explorer or a tab into either editor pane, lazy-loaded on drop
- **Branch switcher** — VS Code-style branch picker in the status bar, incremental branch checkout

![Split view](docs/images/split.png)

![Run code](docs/images/run.png)

## Quick Start

```bash
git clone https://github.com/shuakami/lumen-editor.git
cd lumen-editor
npm install
npm run dev
```

Or just open the [live demo][demo-link] — then `File → Open GitHub Repository` and paste any `owner/repo`.

> \[!NOTE]
> A personal access token (`ghp_…`) is only needed for private repositories or committing. It is stored in your browser's localStorage and never sent anywhere except api.github.com.

## Use as a Library

Lumen is also a reusable library: the editor component, GitHub layer, sync engine, local history and smart preloader can each be imported independently.

```bash
npm install lumenedit
```

Prefer the narrow entry point for production code so the editor and its language parsers are never downloaded by sync-only applications:

```tsx
import { Editor } from "lumenedit/editor";
import { openRepo, commitFile } from "lumenedit/github";
import { SyncEngine, loadLocalHistory } from "lumenedit/sync";
import { Preloader } from "lumenedit/preload";
```

The root entry remains available for compatibility and supports tree shaking:

```tsx
import {
  Editor,                      // CodeMirror 6 editor with doc cache / cursor restore / find panel
  openRepo, fetchBlob,         // GitHub API layer (pure functions)
  listCommits, commitFile,     // commit history + auto three-way-merge commits
  SyncEngine, repoKey,         // incremental sync engine with offline transaction queue
  loadLocalHistory,            // IndexedDB local edit history
  Preloader, brainScore,       // smart preloading with a learned open-model
} from "lumenedit";

const tree = await openRepo("shuakami", "lumen-editor");

const engine = new SyncEngine(tree.ref, tree.headSha, {
  onDeltas: (deltas, head) => console.log("remote changed", deltas),
  onTransactionDone: (tx, r) => console.log("committed", tx.path, r.newSha),
  onTransactionError: console.error,
  onState: (state, pending) => console.log(state, pending),
  onInfo: console.log,
});
await engine.start();
```

```tsx
<Editor fileId="gh:src/index.ts" filename="index.ts" initialDoc={code} dark
        onDocChange={(id) => {/* persist draft */}} />
```

Peer dependencies: `react >= 18` and `react-dom >= 18`. The minified CodeMirror and Lezer runtime is compiled into Lumen; consumers do not install their source packages, documentation or source maps.

### Production Size

Measured from the packed npm artifact with esbuild code splitting; React is external to the editor benchmark:

| Import | Initial JS | gzip | Brotli | Initial chunks |
| --- | ---: | ---: | ---: | ---: |
| `lumenedit/sync` | 9.0 kB | 3.3 kB | 2.9 kB | 1 |
| `lumenedit` (`SyncEngine` only) | 9.5 kB | 3.7 kB | 3.2 kB | 2 |
| `lumenedit/editor` | 472.6 kB | 154.1 kB | 131.1 kB | 2; lazy languages excluded |

The npm tarball is about 710.1 kB and installs 2.2 MB across 152 package files. Lumen has no production dependency tree beyond the React peer dependencies supplied by the host application. All 126 minified editor/runtime chunks total 2.22 MB before transport compression; language parsers remain lazy and load only when used.

## License

[MIT][license-link]

<!-- LINK GROUP -->

[image-banner]: docs/images/banner.png
[demo-link]: https://shuakami.github.io/lumen-editor/
[issues-link]: https://github.com/shuakami/lumen-editor/issues
[license-link]: LICENSE
