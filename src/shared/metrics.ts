/**
 * 字符集度量：显示宽度（设备占位）与 UTF-8 编码字节数分开计算。
 * 字符集可能包含中文（宽显示、3 字节）与组合符（零宽附着、2~3 字节），
 * 因此绝不能用字符个数代替文件大小。
 */

export interface GlyphMetric {
  glyph: string;
  /** 设备显示占位宽度：East Asian 宽/全角 = 2，组合符 = 0，其余 = 1 */
  width: number;
  /** 该字符（含组合字符序列）的 UTF-8 编码字节数 */
  bytes: number;
}

export interface CharsetMetrics {
  glyphs: string[];
  metrics: GlyphMetric[];
  /** 字符集中单字符的最大 UTF-8 字节数，用于保守的预算估计 */
  maxBytes: number;
  avgBytes: number;
  /** 单字符的最大显示宽度 */
  maxWidth: number;
}

const textEncoder = new TextEncoder();

export function utf8Bytes(text: string): number {
  return textEncoder.encode(text).length;
}

/**
 * 组合用附加符号（重音等）在设备上不单独占位，显示宽度为 0。
 * 覆盖常见的 Combining Diacritical Marks / Supplement / Symbols 区间，
 * 以及变体选择符、零宽连接符等。
 */
function isCombining(codePoint: number): boolean {
  return (
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) ||
    (codePoint >= 0x1dc0 && codePoint <= 0x1dff) ||
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f) ||
    (codePoint >= 0xe0100 && codePoint <= 0xe01ef) ||
    codePoint === 0x200d ||
    codePoint === 0xfe0f ||
    codePoint === 0x200b
  );
}

/**
 * 显示宽度：遵循常见终端/设备的 East Asian Wide / Fullwidth 占两格约定，
 * 组合符占 0 格，其余（含 emoji 常见区段按 2 格保守处理）占 1 或 2 格。
 */
export function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (isCombining(cp)) continue;
    width += isWide(cp) ? 2 : 1;
  }
  return width;
}

/** 常见设备（终端/单片机屏）按双格渲染的 East Asian Wide / Fullwidth 区段 */
const WIDE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f], // Hangul Jamo
  [0x2e80, 0x303e], // CJK 部首、注音、假名等
  [0x3040, 0xa4cf], // 平假名/片假名、CJK 兼容、彝文
  [0xac00, 0xd7a3], // Hangul 音节
  [0xf900, 0xfaff], // CJK 兼容表意文字
  [0xfe10, 0xfe19], // 竖排标点
  [0xfe30, 0xfe6f], // CJK 兼容符号与全角小符号
  [0xff00, 0xff60], // 全角 ASCII
  [0xffe0, 0xffe6], // 全角货币符号
  [0x1f300, 0x1faff], // emoji 与符号
  [0x20000, 0x3fffd], // CJK 扩展 B 以后
];
const WIDE_POINTS = new Set([0x2329, 0x232a]);

function isWide(cp: number): boolean {
  if (WIDE_POINTS.has(cp)) return true;
  return WIDE_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);
}

function codePoints(value: string): string[] {
  // 按码点切分；组合符作为独立字符保留（它本身可作为字符集的一员）
  return Array.from(value).filter(
    (c) => c !== "\n" && c !== "\r" && c !== "\t",
  );
}

export function charsetMetrics(value: string): CharsetMetrics {
  const glyphs = [...new Set(codePoints(value))];
  const list = glyphs.length ? glyphs : [" "];
  const metrics = list.map((glyph) => ({
    glyph,
    width: displayWidth(glyph),
    bytes: utf8Bytes(glyph),
  }));
  const maxBytes = metrics.reduce((m, x) => Math.max(m, x.bytes), 1);
  const avgBytes =
    metrics.reduce((sum, x) => sum + x.bytes, 0) / metrics.length;
  const maxWidth = metrics.reduce((m, x) => Math.max(m, x.width), 1);
  return { glyphs: list, metrics, maxBytes, avgBytes, maxWidth };
}

/** 字节数的人类可读格式，设备容量提示用 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb >= 100 ? Math.round(kb) : kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}
