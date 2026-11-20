import { useStudio } from "../../../shared/useStudio";
import { layoutText, measureLayout } from "../../../shared/layout";
import { download, exportName } from "../lib/download";
import { drawGrid } from "../../preview";
import { usePreview } from "../../preview/model/usePreview";
import { utf8Bytes, formatBytes } from "../../../shared/metrics";
export function useExport() {
  const { doc, notice, busy } = useStudio();
  const { showLoss } = usePreview();
  function ready() {
    return doc.grid && doc.grid.revision === doc.revision && !busy.value;
  }
  /** 下载前再次用真实编码核验：超限直接拒绝，绝不截断末尾 */
  function verifiedText(): string | null {
    if (!doc.grid) return null;
    const text = layoutText(doc.grid, doc.settings.lineEnding);
    const bytes = utf8Bytes(text);
    const budget = doc.grid.budget;
    if (budget && bytes > budget.budget) {
      notice.value = `核验失败：${formatBytes(bytes)} 超出预算 ${formatBytes(
        budget.budget,
      )}，已取消导出`;
      return null;
    }
    return text;
  }
  function saveText() {
    if (!ready()) return;
    const text = verifiedText();
    if (text === null) return;
    download(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
      exportName(doc.asset?.name ?? "art", "txt"),
    );
    notice.value = "文本已导出（与预览为同一份确定布局）";
  }
  async function copy() {
    if (!ready()) return;
    const text = verifiedText();
    if (text === null) return;
    try {
      await navigator.clipboard.writeText(text);
      notice.value = "字符画已复制";
    } catch {
      notice.value = "无法访问剪贴板，请使用文本导出";
    }
  }
  function png() {
    if (!ready()) return;
    const c = document.createElement("canvas");
    // PNG 与预览共用同一个 grid 与同一个损失分布开关（确定布局）
    drawGrid(
      c,
      doc.grid!,
      doc.settings.color,
      doc.settings.background,
      showLoss.value,
    );
    c.toBlob((b) => {
      if (b) download(b, exportName(doc.asset?.name ?? "art", "png"));
    }, "image/png");
  }
  return { doc, busy, ready, saveText, copy, png };
}
