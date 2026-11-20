import type { Grid, LineEnding } from "./document";
import { displayWidth, utf8Bytes } from "./metrics";

/**
 * 文本布局是「确定」的：预览、复制、下载与核验都走这一个函数，
 * 换行约定由设置决定（LF 1 字节 / CRLF 2 字节），
 * 任何下游都不允许自行截断末尾。
 */
export function lineSeparator(lineEnding: LineEnding): string {
  return lineEnding === "crlf" ? "\r\n" : "\n";
}

export function gridRows(grid: Grid): string[] {
  return Array.from({ length: grid.rows }, (_, y) =>
    grid.cells
      .slice(y * grid.columns, (y + 1) * grid.columns)
      .map((c) => c.glyph)
      .join(""),
  );
}

export function layoutText(grid: Grid, lineEnding: LineEnding): string {
  return gridRows(grid).join(lineSeparator(lineEnding));
}

export interface TextMetrics {
  text: string;
  bytes: number;
  cellBytes: number;
  newlineBytes: number;
  newlineCount: number;
  /** 设备真实占位（显示列数，宽字符 2 格、组合符 0 格） */
  displayWidth: number;
  displayRows: number;
  maxGlyphBytes: number;
  avgGlyphBytes: number;
}

export function measureLayout(
  grid: Grid,
  lineEnding: LineEnding,
): TextMetrics {
  const rows = gridRows(grid);
  const text = rows.join(lineSeparator(lineEnding));
  const bytes = utf8Bytes(text);
  const separator = lineSeparator(lineEnding);
  const newlineCount = Math.max(0, rows.length - 1);
  const newlineBytes = utf8Bytes(separator) * newlineCount;
  const cellBytes = bytes - newlineBytes;
  const glyphBytes = grid.cells.map((c) => utf8Bytes(c.glyph));
  const maxGlyphBytes = glyphBytes.reduce((m, b) => Math.max(m, b), 0);
  const avgGlyphBytes =
    grid.cells.length > 0 ? cellBytes / grid.cells.length : 0;
  const widestRow = rows.reduce(
    (m, row) => Math.max(m, displayWidth(row)),
    0,
  );
  return {
    text,
    bytes,
    cellBytes,
    newlineBytes,
    newlineCount,
    displayWidth: widestRow,
    displayRows: rows.length,
    maxGlyphBytes,
    avgGlyphBytes,
  };
}
