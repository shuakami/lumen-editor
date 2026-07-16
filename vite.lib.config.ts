import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** 库构建：独立入口避免同步引擎消费者加载编辑器和语言模块。 */
export default defineConfig({
  plugins: [react()],
  publicDir: false,
  build: {
    outDir: "dist-lib",
    emptyOutDir: true,
    sourcemap: false,
    // 图标等小资源直接内联进产物，消费方无需处理静态资源
    assetsInlineLimit: 1024 * 1024,
    lib: {
      entry: {
        index: "src/lib.ts",
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
        /^@codemirror\//,
        /^@lezer\//,
      ],
    },
  },
});
