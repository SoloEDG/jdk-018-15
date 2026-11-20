#!/usr/bin/env node
// 测试运行器：用 esbuild 的 JS API 打包测试文件，再交给 node:test 执行。
// 独立脚本可避免不同 shell / npm 对多文件参数的转义差异。
import { build } from "esbuild";
import { run } from "node:test";
import { spec } from "node:test/reporters";
import { glob, rm } from "node:fs/promises";
import path from "node:path";

const outdir = path.resolve("node_modules/.tmp/test");
await rm(outdir, { recursive: true, force: true });

const entryPoints = [];
for await (const file of glob("tests/*.test.ts")) entryPoints.push(file);

await build({
  entryPoints,
  bundle: true,
  platform: "node",
  format: "esm",
  outdir,
  outExtension: { ".js": ".mjs" },
});

const files = [];
for await (const file of glob(path.join(outdir, "*.mjs"))) files.push(file);

let failed = 0;
const stream = run({
  files,
  concurrency: 1,
});
stream.on("test:fail", () => {
  failed++;
});
stream.compose(spec).pipe(process.stdout);
stream.on("end", () => {
  process.exitCode = failed > 0 ? 1 : 0;
});
