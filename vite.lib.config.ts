import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** 库构建：`npm run build:lib` 产出 dist-lib/（ESM + 类型声明由 tsconfig.lib.json 生成）。 */
export default defineConfig({
  plugins: [react()],
  publicDir: false,
  build: {
    outDir: "dist-lib",
    emptyOutDir: true,
    sourcemap: true,
    // 图标等小资源直接内联进产物，消费方无需处理静态资源
    assetsInlineLimit: 1024 * 1024,
    lib: {
      entry: "src/lib.ts",
      formats: ["es"],
      fileName: () => "lumen.js",
    },
    rollupOptions: {
      external: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react-dom/client",
        "codemirror",
        /^@codemirror\//,
        /^@lezer\//,
        "@hyperscroll/core",
      ],
    },
  },
});
