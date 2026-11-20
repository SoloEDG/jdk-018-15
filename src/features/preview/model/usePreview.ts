import { ref, computed } from "vue";
import { useStudio } from "../../../shared/useStudio";
import { measureLayout } from "../../../shared/layout";
import { formatBytes } from "../../../shared/metrics";

/** 损失分布开关为预览与 PNG 导出共享，保证两者渲染同一份布局的同一视图 */
const showLoss = ref(false);

export function usePreview() {
  const { doc, busy, infeasible } = useStudio();
  const mode = ref<"art" | "text">("art");
  const zoom = ref(100);
  const count = computed(() => doc.grid?.cells.length.toLocaleString() ?? "0");
  const measured = computed(() =>
    doc.grid ? measureLayout(doc.grid, doc.settings.lineEnding) : null,
  );
  const actualBytesLabel = computed(() =>
    measured.value ? formatBytes(measured.value.bytes) : "—",
  );
  const displayLabel = computed(() => {
    if (!measured.value) return "";
    return `${measured.value.displayWidth} 占位 × ${measured.value.displayRows} 行`;
  });
  return {
    doc,
    busy,
    infeasible,
    mode,
    zoom,
    showLoss,
    count,
    measured,
    actualBytesLabel,
    displayLabel,
  };
}
