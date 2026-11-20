import { charsetMetrics, type CharsetMetrics } from "../../../shared/metrics";

export const charsets = [
  { id: "standard", name: "经典 ASCII", value: " .:-=+*#%@" },
  { id: "blocks", name: "块状字符", value: " ░▒▓█" },
  { id: "binary", name: "二进制", value: " 01" },
  {
    id: "detail",
    name: "精细阶梯",
    value: " .`^,:;Il!i~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  },
  { id: "chinese", name: "中文墨阶", value: " 一人大天日月田国墨" },
  { id: "combo", name: "组合符", value: " aàáâãäå" },
];

export function charsetValue(id: string, custom: string): string {
  return id === "custom"
    ? custom
    : (charsets.find((c) => c.id === id)?.value ?? charsets[0]!.value);
}

export function glyphs(id: string, custom: string): string[] {
  const chars = charsetMetrics(charsetValue(id, custom)).glyphs;
  return chars.length ? chars : [" "];
}

export function metricsFor(id: string, custom: string): CharsetMetrics {
  return charsetMetrics(charsetValue(id, custom));
}
