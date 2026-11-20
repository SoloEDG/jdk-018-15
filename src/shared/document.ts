export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Asset {
  name: string;
  url: string;
  width: number;
  height: number;
  image: HTMLImageElement;
}
/** 尺寸控制模式：columns 沿用原来的列数逻辑，budget 按最终文件字节预算重新分配行列 */
export type DensityMode = "columns" | "budget";
/** 预算紧张时的取舍：outline 保完整轮廓（优先更多单元格，压缩灰阶层级），grayscale 保局部灰阶（保留完整字符集，缩小画面） */
export type BudgetPriority = "outline" | "grayscale";
/** 设备换行约定，换行符的字节数会被计入预算 */
export type LineEnding = "lf" | "crlf";
export interface Settings {
  columns: number;
  charset: string;
  custom: string;
  contrast: number;
  gamma: number;
  invert: boolean;
  color: boolean;
  background: string;
  densityMode: DensityMode;
  /** 最终 UTF-8 文本文件的字节预算（含换行符） */
  byteBudget: number;
  budgetPriority: BudgetPriority;
  lineEnding: LineEnding;
}
export interface Cell {
  glyph: string;
  color: string;
  /** 该单元格的灰阶量化损失 0..1，用于损失分布可视化 */
  loss: number;
}
/** 一次生成确定下来的预算核算信息，预览与下载都绑定这份布局 */
export interface BudgetInfo {
  mode: DensityMode;
  priority: BudgetPriority;
  lineEnding: LineEnding;
  budget: number;
  /** 生成前的保守估计（按字符集中最宽字符计算，保证不超限） */
  estimatedBytes: number;
  estimatedMaxGlyphBytes: number;
  estimatedAvgGlyphBytes: number;
  /** 生成后按真实 UTF-8 编码重新核验的结果 */
  actualBytes: number;
  actualCellBytes: number;
  actualNewlineBytes: number;
  actualMaxGlyphBytes: number;
  actualAvgGlyphBytes: number;
  headroom: number;
  fits: boolean;
  /** 灰阶层级损失：相对完整字符集被压缩掉的比例 0..1 */
  levelLoss: number;
  /** 尺寸损失：相对无预算约束参考网格减少的单元格比例 0..1 */
  sizeLoss: number;
  avgLoss: number;
  maxLoss: number;
  charsetLevelsUsed: number;
  charsetLevelsTotal: number;
  displayWidth: number;
  displayRows: number;
}
export interface Grid {
  columns: number;
  rows: number;
  cells: Cell[];
  revision: number;
  budget: BudgetInfo | null;
}
export interface StudioDocument {
  asset: Asset | null;
  crop: Crop;
  settings: Settings;
  grid: Grid | null;
  revision: number;
}
