import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const ROOT_FACADE = [
  'export * from "./editor.js";',
  'export * from "./github.js";',
  'export * from "./sync.js";',
  'export * from "./preload.js";',
  "",
].join("\n");

/** 库构建：内置并压缩编辑器运行时，避免消费者安装 CodeMirror 源码依赖树。 */
export default defineConfig({
  plugins: [
    react(),
    {
      name: "lumen-root-facade",
      generateBundle() {
        this.emitFile({ type: "asset", fileName: "index.js", source: ROOT_FACADE });
      },
    },
  ],
  publicDir: false,
  build: {
    outDir: "dist-lib",
    emptyOutDir: true,
    minify: "esbuild",
    target: "es2022",
    sourcemap: false,
    // 图标等小资源直接内联进产物，消费方无需处理静态资源
      assetsInlineLimit: 1024 * 1024,
      lib: {
        entry: {
          editor: "src/entries/editor.ts",
          github: "src/entries/github.ts",
          sync: "src/entries/sync.ts",
          preload: "src/entries/preload.ts",
        },
        formats: ["es"],
        fileName: (_format, entryName) => `${entryName}.js`,
      },
    rollupOptions: {
      external: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react-dom/client",
      ],
    },
  },
});
