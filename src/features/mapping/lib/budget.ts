import type { BudgetPriority, LineEnding } from "../../../shared/document";
import type { CharsetMetrics, GlyphMetric } from "../../../shared/metrics";

/**
 * 字节预算规划器。
 * 关键约束：字符个数 ≠ 文件字节数（中文 3 字节、组合符 2~3 字节且零显示宽度），
 * 估计一律按字符集中「最宽字符」的 UTF-8 字节数做保守上界，
 * 保证生成前的估计永远不会低于真实编码结果。
 */

export const MIN_COLUMNS = 1;
export const MIN_ROWS = 1;
export const MAX_COLUMNS = 220;
export const MAX_ROWS = 1200;
const REF_MIN_COLUMNS = 30;

export interface BudgetPlan {
  feasible: boolean;
  columns: number;
  rows: number;
  levels: CharsetMetrics;
  /** 保守估计：N × 字符集最大字节 + 换行字节，必然 ≥ 真实结果 */
  estimatedBytes: number;
  estimatedMaxGlyphBytes: number;
  estimatedAvgGlyphBytes: number;
  newlineBytes: number;
  /** 灰阶层级损失 0..1：被压缩掉的字符比例 */
  levelLoss: number;
  /** 完整字符集的层级总数（未压缩前） */
  fullLevels: number;
  /** 尺寸损失 0..1：相对无预算参考网格减少的单元格比例 */
  sizeLoss: number;
  reference: { columns: number; rows: number };
  /** 当前约定下，最小画面（1×1）按保守估计需要的字节数，即可实现下界 */
  lowerBoundBytes: number;
  /** 不可行原因（可行为 null） */
  reason: string | null;
}

export function newlineByteSize(lineEnding: LineEnding): number {
  return lineEnding === "crlf" ? 2 : 1;
}

export function rowsForColumns(
  cropWidth: number,
  cropHeight: number,
  columns: number,
): number {
  return Math.max(1, Math.round((cropHeight / cropWidth) * columns * 0.5));
}

/** 从完整字符集中均匀抽取 count 个灰阶层级，保留明暗两端 */
export function subsetLevels(
  full: CharsetMetrics,
  count: number,
): CharsetMetrics {
  const k = full.metrics.length;
  if (count >= k) return full;
  const picked: GlyphMetric[] = [];
  const seen = new Set<number>();
  for (let j = 0; j < count; j++) {
    const idx = count === 1 ? 0 : Math.round((j * (k - 1)) / (count - 1));
    if (!seen.has(idx)) {
      seen.add(idx);
      picked.push(full.metrics[idx]!);
    }
  }
  return finalizeMetrics(picked);
}

function finalizeMetrics(metrics: GlyphMetric[]): CharsetMetrics {
  const maxBytes = metrics.reduce((m, x) => Math.max(m, x.bytes), 1);
  const avgBytes =
    metrics.reduce((sum, x) => sum + x.bytes, 0) / metrics.length;
  const maxWidth = metrics.reduce((m, x) => Math.max(m, x.width), 1);
  return {
    glyphs: metrics.map((m) => m.glyph),
    metrics,
    maxBytes,
    avgBytes,
    maxWidth,
  };
}

function conservativeBytes(
  columns: number,
  rows: number,
  levels: CharsetMetrics,
  newlineBytes: number,
): number {
  return (
    columns * rows * levels.maxBytes + Math.max(0, rows - 1) * newlineBytes
  );
}

/** 在给定层级集合下，寻找保守估计不超预算的最大列数；无解返回 null */
function fitColumns(
  cropWidth: number,
  cropHeight: number,
  levels: CharsetMetrics,
  budget: number,
  newlineBytes: number,
): number | null {
  let hi = MAX_COLUMNS;
  while (
    hi > MIN_COLUMNS &&
    rowsForColumns(cropWidth, cropHeight, hi) > MAX_ROWS
  ) {
    hi--;
  }
  const ok = (columns: number) => {
    const rows = rowsForColumns(cropWidth, cropHeight, columns);
    return (
      rows <= MAX_ROWS &&
      conservativeBytes(columns, rows, levels, newlineBytes) <= budget
    );
  };
  if (!ok(MIN_COLUMNS)) return null;
  let lo = MIN_COLUMNS;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ok(mid)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function planBudget(
  cropWidth: number,
  cropHeight: number,
  budget: number,
  priority: BudgetPriority,
  lineEnding: LineEnding,
  full: CharsetMetrics,
  referenceColumns: number,
): BudgetPlan {
  const newlineBytes = newlineByteSize(lineEnding);
  // 最小画面固定为 1×1、无换行；下界按保守估计（字符集最大单字字节）给出，
  // 因此预算 >= 下界时，至少 1×1 一定可行，不会出现「规划可行却渲染超限」。
  const lowerBoundBytes = full.maxBytes;

  const refCols = Math.max(
    REF_MIN_COLUMNS,
    Math.min(MAX_COLUMNS, Math.round(referenceColumns)),
  );
  const refRows = Math.min(
    MAX_ROWS,
    rowsForColumns(cropWidth, cropHeight, refCols),
  );
  const reference = { columns: refCols, rows: refRows };
  const refCells = refCols * refRows;

  const infeasible = (reason: string): BudgetPlan => ({
    feasible: false,
    columns: 0,
    rows: 0,
    levels: full,
    estimatedBytes: 0,
    estimatedMaxGlyphBytes: full.maxBytes,
    estimatedAvgGlyphBytes: full.avgBytes,
    newlineBytes,
    levelLoss: 0,
    fullLevels: full.metrics.length,
    sizeLoss: 0,
    reference,
    lowerBoundBytes,
    reason,
  });

  if (!Number.isFinite(budget) || budget < lowerBoundBytes) {
    return infeasible(
      `预算低于最小画面：1×1 网格按当前字符集至少需要 ${lowerBoundBytes} 字节`,
    );
  }

  const build = (
    columns: number,
    levels: CharsetMetrics,
    levelLoss: number,
  ): BudgetPlan => {
    const rows = Math.max(
      MIN_ROWS,
      rowsForColumns(cropWidth, cropHeight, columns),
    );
    const cells = columns * rows;
    return {
      feasible: true,
      columns,
      rows,
      levels,
      estimatedBytes: conservativeBytes(columns, rows, levels, newlineBytes),
      estimatedMaxGlyphBytes: levels.maxBytes,
      estimatedAvgGlyphBytes: levels.avgBytes,
      newlineBytes,
      levelLoss,
      fullLevels: full.metrics.length,
      sizeLoss: Math.max(0, Math.min(1, 1 - cells / refCells)),
      reference,
      lowerBoundBytes,
      reason: null,
    };
  };

  if (priority === "grayscale") {
    // 保局部灰阶：字符集一个不砍，只缩小画面
    const columns = fitColumns(
      cropWidth,
      cropHeight,
      full,
      budget,
      newlineBytes,
    );
    if (columns === null) {
      // 理论上 budget >= lowerBoundBytes 时不会发生，兜底处理
      return infeasible(
        `完整字符集单字符最多 ${full.maxBytes} 字节，1×1 网格仍超出预算；可改用「保完整轮廓」`,
      );
    }
    return build(columns, full, 0);
  }

  // 保完整轮廓：优先保住单元格数量（画面分辨率），必要时压缩灰阶层级
  const fullColumns = fitColumns(
    cropWidth,
    cropHeight,
    full,
    budget,
    newlineBytes,
  );
  if (
    fullColumns !== null &&
    fullColumns * rowsForColumns(cropWidth, cropHeight, fullColumns) >=
      refCells
  ) {
    // 完整字符集已能容纳参考网格，不牺牲任何灰阶
    return build(fullColumns, full, 0);
  }

  // 联合搜索：在每个层级数下求最大网格，按单元格数取胜，平局保留更多层级
  let best: {
    columns: number;
    levels: CharsetMetrics;
    cells: number;
  } | null = null;
  for (let count = 2; count <= full.metrics.length; count++) {
    const levels = subsetLevels(full, count);
    const columns = fitColumns(
      cropWidth,
      cropHeight,
      levels,
      budget,
      newlineBytes,
    );
    if (columns === null) continue;
    const cells =
      columns * rowsForColumns(cropWidth, cropHeight, columns);
    if (
      !best ||
      cells > best.cells ||
      (cells === best.cells && count > best.levels.metrics.length)
    ) {
      best = { columns, levels, cells };
    }
  }
  if (!best) {
    // 极端预算：退化为单字符的 1×1
    const single = subsetLevels(full, 1);
    const columns = fitColumns(
      cropWidth,
      cropHeight,
      single,
      budget,
      newlineBytes,
    );
    if (columns === null) return infeasible("预算无法容纳最小画面 1×1");
    best = {
      columns,
      levels: single,
      cells: columns * rowsForColumns(cropWidth, cropHeight, columns),
    };
  }
  const levelLoss = 1 - best.levels.metrics.length / full.metrics.length;
  return build(best.columns, best.levels, levelLoss);
}
