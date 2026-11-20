import type { InjectionKey, Ref } from "vue";
import type { StudioDocument } from "./document";
export interface InfeasibleState {
  message: string;
  /** 当前字符集与换行约定下，可实现的最小文件字节数 */
  lowerBoundBytes: number;
}
export interface StudioContext {
  doc: StudioDocument;
  busy: Ref<boolean>;
  notice: Ref<string>;
  invalidate: () => void;
  infeasible: Ref<InfeasibleState | null>;
}
export const studioKey: InjectionKey<StudioContext> = Symbol("studio");
