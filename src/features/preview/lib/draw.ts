import type { Grid } from "../../../shared/document";
import { displayWidth } from "../../../shared/metrics";

/**
 * 按设备真实占位渲染：
 * - 普通字符占 1 格，中文/全角占 2 格，组合符附着在前一个字符上（0 格）
 * - 画布宽度按最长一行的显示宽度计算，而非字符个数
 */
const CELL_W = 8;
const CELL_H = 16;

function rowDisplayWidths(grid: Grid): number[] {
  const widths: number[] = [];
  for (let y = 0; y < grid.rows; y++) {
    let w = 0;
    for (let x = 0; x < grid.columns; x++) {
      w += displayWidth(grid.cells[y * grid.columns + x]!.glyph);
    }
    widths.push(w);
  }
  return widths;
}

export function drawGrid(
  canvas: HTMLCanvasElement,
  grid: Grid,
  color: boolean,
  background: string,
  showLoss = false,
) {
  const rowWidths = rowDisplayWidths(grid);
  const maxWidth = Math.max(grid.columns, ...rowWidths);
  canvas.width = maxWidth * CELL_W;
  canvas.height = grid.rows * CELL_H;
  const g = canvas.getContext("2d")!;
  g.fillStyle = background;
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.font = "14px monospace";
  g.textBaseline = "middle";
  g.textAlign = "left";

  for (let y = 0; y < grid.rows; y++) {
    let penX = 0;
    for (let x = 0; x < grid.columns; x++) {
      const i = y * grid.columns + x;
      const c = grid.cells[i]!;
      const w = displayWidth(c.glyph);
      if (showLoss && c.loss > 0) {
        // 损失热力：红底透明度随量化损失增强，直接画在该字符占位上
        g.fillStyle = `rgba(255, 92, 92, ${Math.min(0.62, c.loss * 1.4)})`;
        g.fillRect(
          penX * CELL_W,
          y * CELL_H,
          Math.max(1, w) * CELL_W,
          CELL_H,
        );
      }
      g.fillStyle = color ? c.color : "#e9eceb";
      g.fillText(
        c.glyph,
        penX * CELL_W + (w === 0 ? -CELL_W / 2 : 1),
        y * CELL_H + CELL_H / 2,
      );
      penX += w;
    }
  }
}

export function layoutPixelSize(grid: Grid): {
  width: number;
  height: number;
} {
  const rowWidths = rowDisplayWidths(grid);
  const maxWidth = Math.max(grid.columns, ...rowWidths);
  return { width: maxWidth * CELL_W, height: grid.rows * CELL_H };
}
