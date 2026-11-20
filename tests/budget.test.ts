import { test } from "node:test";
import assert from "node:assert/strict";
import {
  utf8Bytes,
  displayWidth,
  charsetMetrics,
  formatBytes,
} from "../src/shared/metrics";
import {
  planBudget,
  newlineByteSize,
  rowsForColumns,
  subsetLevels,
} from "../src/features/mapping/lib/budget";
import { measureLayout, layoutText, lineSeparator } from "../src/shared/layout";
import type { Grid, LineEnding, Cell } from "../src/shared/document";

test("UTF-8 字节数与字符个数不同：中文 3 字节、组合符 2~3 字节", () => {
  assert.equal(utf8Bytes("A"), 1);
  assert.equal(utf8Bytes("墨"), 3);
  assert.equal(utf8Bytes("国"), 3);
  assert.equal(utf8Bytes("à"), 2); // U+00E0
  assert.equal(utf8Bytes("á"), 3); // a + combining acute
  assert.equal(utf8Bytes("░"), 3); // U+2591
  assert.equal(utf8Bytes("一人大"), 9);
});

test("显示宽度：中文占 2 格，组合符占 0 格，ASCII 占 1 格", () => {
  assert.equal(displayWidth("A"), 1);
  assert.equal(displayWidth("墨"), 2);
  assert.equal(displayWidth("́"), 0);
  assert.equal(displayWidth("á"), 1);
  assert.equal(displayWidth("一A"), 3);
  assert.equal(displayWidth(" ░▒▓█"), 5);
  assert.equal(displayWidth(" 墨"), 3);
  // 假名 / 全角字符同样占双格
  assert.equal(displayWidth("ア"), 2);
  assert.equal(displayWidth("Ａ"), 2);
});

test("字符集度量：最大/平均字节与最大占位", () => {
  const m = charsetMetrics(" 墨A");
  assert.equal(m.metrics.length, 3);
  assert.equal(m.maxBytes, 3);
  assert.equal(m.maxWidth, 2);
  assert.ok(Math.abs(m.avgBytes - (1 + 3 + 1) / 3) < 1e-9);
});

test("formatBytes 人类可读", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1024), "1.0 KB");
  assert.equal(formatBytes(1536), "1.5 KB");
});

test("换行约定字节数", () => {
  assert.equal(newlineByteSize("lf"), 1);
  assert.equal(newlineByteSize("crlf"), 2);
  assert.equal(lineSeparator("lf"), "\n");
  assert.equal(lineSeparator("crlf"), "\r\n");
});

test("行列换算保持 0.5 纵横系数", () => {
  assert.equal(rowsForColumns(100, 100, 100), 50);
  assert.equal(rowsForColumns(200, 100, 80), 20);
});

const ascii = () => charsetMetrics(" .:-=+*#%@");
const chinese = () => charsetMetrics(" 一人大天日月田国墨");

test("预算极小：低于 1×1 下界时判定不可行并给出下界", () => {
  const plan = planBudget(100, 100, 0, "outline", "lf", ascii(), 100);
  assert.equal(plan.feasible, false);
  assert.equal(plan.lowerBoundBytes, 1);
  assert.ok(plan.reason);
});

test("中文字符集下界为 3 字节：预算 2B 不可行且保留旧作品的判断成立", () => {
  const m = chinese();
  const plan = planBudget(100, 100, 2, "outline", "lf", m, 100);
  assert.equal(plan.feasible, false);
  assert.equal(plan.lowerBoundBytes, 3);
  // 预算恰好 3 字节时，最小 1×1 画面可行
  const ok = planBudget(100, 100, 3, "outline", "lf", m, 100);
  assert.equal(ok.feasible, true);
  assert.equal(ok.columns * ok.rows >= 1, true);
  assert.ok(ok.estimatedBytes <= 3);
});

test("ASCII 预算 256B / LF：保守估计不超预算，且布局可被真实编码核验", () => {
  const budget = 256;
  const plan = planBudget(100, 100, budget, "outline", "lf", ascii(), 100);
  assert.equal(plan.feasible, true);
  const cells = plan.columns * plan.rows;
  const est = cells * plan.levels.maxBytes + (plan.rows - 1);
  assert.equal(est, plan.estimatedBytes);
  assert.ok(plan.estimatedBytes <= budget);

  const grid = fakeGrid(plan.columns, plan.rows, plan.levels.glyphs, "lf");
  const measured = measureLayout(grid, "lf");
  assert.ok(measured.bytes <= plan.estimatedBytes);
  assert.ok(measured.bytes <= budget);
  assert.equal(measured.newlineCount, plan.rows - 1);
});

test("中文字符集：每个字符 3 字节，容量按字节而非字符数计算", () => {
  const m = chinese();
  assert.equal(m.maxBytes, 3);
  const budget = 120;
  const plan = planBudget(100, 100, budget, "outline", "lf", m, 100);
  assert.equal(plan.feasible, true);
  const cells = plan.columns * plan.rows;
  // 3*N + (rows-1) <= 120
  assert.ok(cells * 3 + (plan.rows - 1) <= budget);
  // 若错按字符数算，本可放 120 个；按字节最多约 39 个
  assert.ok(cells < 45);

  const grid = fakeGrid(plan.columns, plan.rows, plan.levels.glyphs, "lf");
  const measured = measureLayout(grid, "lf");
  assert.ok(measured.bytes <= budget);
  assert.equal(measured.maxGlyphBytes, 3);
});

test("CRLF 换行比 LF 多占字节，收紧容量", () => {
  const lf = planBudget(100, 100, 300, "grayscale", "lf", ascii(), 100);
  const crlf = planBudget(100, 100, 300, "grayscale", "crlf", ascii(), 100);
  assert.ok(crlf.columns * crlf.rows <= lf.columns * lf.rows);
});

test("保局部灰阶：层级不压缩（levelLoss=0），通过缩小画面满足预算", () => {
  const full = ascii();
  const plan = planBudget(100, 100, 160, "grayscale", "lf", full, 100);
  assert.equal(plan.feasible, true);
  assert.equal(plan.levels.metrics.length, full.metrics.length);
  assert.equal(plan.levelLoss, 0);
  assert.ok(plan.sizeLoss > 0);
});

test("保完整轮廓：优先单元格数量，必要时压缩层级", () => {
  const full = ascii(); // 10 级
  const plan = planBudget(100, 100, 120, "outline", "lf", full, 100);
  assert.equal(plan.feasible, true);
  const gray = planBudget(100, 100, 120, "grayscale", "lf", full, 100);
  assert.ok(
    plan.columns * plan.rows >= gray.columns * gray.rows,
    "轮廓模式的单元格数不少于灰阶模式",
  );
});

test("subsetLevels 均匀抽样并保留明暗两端", () => {
  const full = ascii();
  const sub = subsetLevels(full, 3);
  assert.equal(sub.metrics.length, 3);
  assert.equal(sub.glyphs[0], full.glyphs[0]);
  assert.equal(sub.glyphs[2], full.glyphs[full.glyphs.length - 1]);
});

test("真实编码核验：构造超预算文本时能被发现（绝不静默截断）", () => {
  const plan = planBudget(100, 100, 64, "outline", "lf", chinese(), 100);
  assert.equal(plan.feasible, true);
  const grid = fakeGrid(plan.columns, plan.rows, plan.levels.glyphs, "lf");
  const measured = measureLayout(grid, "lf");
  // 规划保证真实字节不超预算
  assert.ok(measured.bytes <= 64);
  // 人为放大网格后应超限，证明校验能拦住
  const big = fakeGrid(40, 20, chinese().glyphs, "lf");
  assert.ok(measureLayout(big, "lf").bytes > 64);
});

test("确定布局：layoutText 与 measureLayout 文本一致，CRLF 正确落地", () => {
  const grid = fakeGrid(3, 2, ["a", "b"], "crlf");
  const text = layoutText(grid, "crlf");
  assert.equal(text, "aba\r\nbab");
  const measured = measureLayout(grid, "crlf");
  assert.equal(measured.text, text);
  assert.equal(measured.newlineBytes, 2);
  assert.equal(measured.bytes, utf8Bytes(text));
});

test("组合符字符集：零显示宽度但仍占字节，容量按字节收敛", () => {
  const m = charsetMetrics(" aàáâãäå");
  // à 等预组合字符宽度 1；组合用重音 U+0301 宽度 0
  assert.equal(displayWidth("́"), 0);
  assert.ok(m.maxBytes >= 2);
  const plan = planBudget(100, 100, 50, "outline", "lf", m, 100);
  assert.equal(plan.feasible, true);
  const grid = fakeGrid(plan.columns, plan.rows, plan.levels.glyphs, "lf");
  assert.ok(measureLayout(grid, "lf").bytes <= 50);
});

test("预算 1B（ASCII 下界）：得到 1×1 最小画面而非空结果", () => {
  const plan = planBudget(100, 100, 1, "outline", "lf", ascii(), 100);
  assert.equal(plan.feasible, true);
  assert.equal(plan.columns, 1);
  assert.equal(plan.rows, 1);
});

test("宽字符网格的显示宽度大于列数", () => {
  const grid = fakeGrid(4, 1, ["墨", " "], "lf");
  const measured = measureLayout(grid, "lf");
  assert.ok(measured.displayWidth >= 4);
});

function fakeGrid(
  columns: number,
  rows: number,
  glyphs: string[],
  lineEnding: LineEnding,
): Grid {
  const cells: Cell[] = [];
  for (let i = 0; i < columns * rows; i++) {
    cells.push({ glyph: glyphs[i % glyphs.length]!, color: "#000000", loss: 0 });
  }
  return { columns, rows, cells, revision: 0, budget: null };
}
