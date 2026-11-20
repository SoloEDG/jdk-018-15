import type {
  StudioDocument,
  Grid,
  BudgetInfo,
  Cell,
} from "../../../shared/document";
import { metricsFor } from "../lib/charsets";
import { gridSize } from "../lib/gridSize";
import { sample } from "../lib/sample";
import { tone, luminance } from "../lib/tone";
import {
  planBudget,
  rowsForColumns,
  type BudgetPlan,
} from "../lib/budget";
import { measureLayout } from "../../../shared/layout";

/** 预算小到放不下最小画面时抛出，携带可实现的下界；调用方保留旧作品 */
export class BudgetInfeasibleError extends Error {
  lowerBoundBytes: number;
  constructor(message: string, lowerBoundBytes: number) {
    super(message);
    this.name = "BudgetInfeasibleError";
    this.lowerBoundBytes = lowerBoundBytes;
  }
}

/** 生成后真实编码核验失败：绝不截断末尾假装成功 */
export class BudgetOverflowError extends Error {
  actualBytes: number;
  budget: number;
  constructor(actualBytes: number, budget: number) {
    super(
      `真实编码核验未通过：${actualBytes} 字节超出预算 ${budget} 字节，已拒绝输出`,
    );
    this.name = "BudgetOverflowError";
    this.actualBytes = actualBytes;
    this.budget = budget;
  }
}

interface RenderInput {
  columns: number;
  rows: number;
  levelGlyphs: string[];
}

function renderCells(
  doc: StudioDocument,
  input: RenderInput,
): { cells: Cell[]; losses: number[] } {
  const { columns, rows, levelGlyphs } = input;
  const s = doc.settings;
  const pixels = sample(
    doc.asset!,
    doc.crop,
    columns,
    rows,
    s.background,
  );
  const levels = levelGlyphs.length;
  const cells: Cell[] = [];
  const losses: number[] = [];
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]!,
      g = pixels[i + 1]!,
      b = pixels[i + 2]!;
    const t = tone(luminance(r, g, b), s.contrast, s.gamma, s.invert);
    const idx = Math.round(t * (levels - 1));
    const quantized = levels === 1 ? 0 : idx / (levels - 1);
    const loss = Math.abs(t - quantized);
    cells.push({
      glyph: levelGlyphs[idx]!,
      color:
        "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join(""),
      // 本地灰阶量化损失：相对该层级集合能表达的最接近明暗
      loss,
    });
    losses.push(loss);
  }
  return { cells, losses };
}

function buildBudgetInfo(
  grid: Grid,
  plan: BudgetPlan,
  doc: StudioDocument,
  losses: number[],
): BudgetInfo {
  const s = doc.settings;
  const measured = measureLayout(grid, s.lineEnding);
  if (measured.bytes > s.byteBudget) {
    throw new BudgetOverflowError(measured.bytes, s.byteBudget);
  }
  const avgLoss =
    losses.length > 0
      ? losses.reduce((a, b) => a + b, 0) / losses.length
      : 0;
  const maxLoss = losses.reduce((m, x) => Math.max(m, x), 0);
  return {
    mode: "budget",
    priority: s.budgetPriority,
    lineEnding: s.lineEnding,
    budget: s.byteBudget,
    estimatedBytes: plan.estimatedBytes,
    estimatedMaxGlyphBytes: plan.estimatedMaxGlyphBytes,
    estimatedAvgGlyphBytes: plan.estimatedAvgGlyphBytes,
    actualBytes: measured.bytes,
    actualCellBytes: measured.cellBytes,
    actualNewlineBytes: measured.newlineBytes,
    actualMaxGlyphBytes: measured.maxGlyphBytes,
    actualAvgGlyphBytes: measured.avgGlyphBytes,
    headroom: s.byteBudget - measured.bytes,
    fits: measured.bytes <= s.byteBudget,
    levelLoss: plan.levelLoss,
    sizeLoss: plan.sizeLoss,
    avgLoss,
    maxLoss,
    charsetLevelsUsed: plan.levels.metrics.length,
    charsetLevelsTotal: plan.fullLevels,
    displayWidth: measured.displayWidth,
    displayRows: measured.displayRows,
  };
}

export function generate(doc: StudioDocument): Grid | null {
  if (!doc.asset) return null;
  const s = doc.settings;
  const full = metricsFor(s.charset, s.custom);
  const cropWidth = doc.asset.width * doc.crop.width;
  const cropHeight = doc.asset.height * doc.crop.height;

  if (s.densityMode === "columns") {
    // 列数模式：沿用原有换算与完整字符集，结果与旧版完全一致
    const size = gridSize(cropWidth, cropHeight, s.columns);
    const { cells } = renderCells(doc, {
      columns: size.columns,
      rows: size.rows,
      levelGlyphs: full.glyphs,
    });
    return { ...size, cells, revision: doc.revision, budget: null };
  }

  // 字节预算模式：先做保守规划，再按真实编码核验
  const plan = planBudget(
    cropWidth,
    cropHeight,
    s.byteBudget,
    s.budgetPriority,
    s.lineEnding,
    full,
    s.columns,
  );
  if (!plan.feasible) {
    throw new BudgetInfeasibleError(
      plan.reason ?? "预算无法容纳最小画面",
      plan.lowerBoundBytes,
    );
  }
  const rows = rowsForColumns(cropWidth, cropHeight, plan.columns);
  const { cells, losses } = renderCells(doc, {
    columns: plan.columns,
    rows,
    levelGlyphs: plan.levels.glyphs,
  });
  const grid: Grid = {
    columns: plan.columns,
    rows,
    cells,
    revision: doc.revision,
    budget: null,
  };
  grid.budget = buildBudgetInfo(grid, plan, doc, losses);
  return grid;
}
