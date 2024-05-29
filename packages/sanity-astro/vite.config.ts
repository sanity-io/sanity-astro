import { defineConfig, type Plugin } from "vite";
import path from "path";
import dts from "vite-plugin-dts";

const name = "sanity-astro";

export default defineConfig(() => {
  return {
    base: "/src",
    build: {
      lib: {
        entry: [path.resolve(__dirname, "src/index.ts")],
        name,
        fileName: (format) => (format === "es" ? `${name}.mjs` : `${name}.js`),
      },
    },
    plugins: [
      dts({
        outDir: "dist/types",
      }) as unknown as Plugin,
    ],
  };
});
