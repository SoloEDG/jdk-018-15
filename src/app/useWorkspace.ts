import { reactive, ref, provide, watch } from "vue";
import { createDocument } from "../shared/defaults";
import { studioKey, type InfeasibleState } from "../shared/context";
import { generate, BudgetInfeasibleError } from "../features/mapping";

export function useWorkspace() {
  const doc = reactive(createDocument());
  const busy = ref(false),
    notice = ref("所有处理均在你的浏览器中完成");
  /** 当前预算不可行的原因与可实现下界；可行或列数模式下为 null，旧作品保持不动 */
  const infeasible = ref<InfeasibleState | null>(null);
  let timer: ReturnType<typeof setTimeout>;
  function invalidate() {
    doc.revision++;
    busy.value = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const previous = doc.grid;
      try {
        const next = generate(doc);
        doc.grid = next;
        infeasible.value = null;
      } catch (e) {
        if (e instanceof BudgetInfeasibleError) {
          // 预算放不下最小画面：给出可实现下界，并保留上一份成功的作品
          infeasible.value = {
            message: e.message,
            lowerBoundBytes: e.lowerBoundBytes,
          };
          doc.grid = previous;
          notice.value = e.message;
        } else {
          notice.value = e instanceof Error ? e.message : "生成失败";
        }
      } finally {
        busy.value = false;
      }
    }, 60);
  }
  watch(() => doc.settings.background, invalidate);
  provide(studioKey, { doc, busy, notice, invalidate, infeasible });
  return { doc, busy, notice, infeasible };
}
