import { build } from "esbuild";

const common = {
  bundle: true,
  minify: true,
  sourcemap: false,
  target: "es2018"
};

await Promise.all([
  build({
    ...common,
    entryPoints: ["src/client/app.ts"],
    outfile: "public/app.js",
    platform: "browser",
    format: "iife"
  }),
  build({
    ...common,
    entryPoints: ["src/client/mini.ts"],
    outfile: "public/mini.js",
    platform: "browser",
    format: "iife"
  })
]);
