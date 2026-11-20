<script setup lang="ts">
import { computed } from "vue";
import { Code2, Scan, Minus, Plus, Flame, AlertTriangle } from "lucide-vue-next";
import { usePreview } from "../model/usePreview";
import { layoutText } from "../../../shared/layout";
import { formatBytes } from "../../../shared/metrics";
import ArtCanvas from "./ArtCanvas.vue";
const p = usePreview();
const text = computed(() =>
  p.doc.grid
    ? layoutText(p.doc.grid, p.doc.settings.lineEnding)
    : "",
);
const budget = computed(() => p.doc.grid?.budget ?? null);
function percent(v: number): string {
  return `${Math.round(v * 100)}%`;
}
</script>
<template>
  <main class="workspace">
    <div class="preview-toolbar">
      <div class="tabs">
        <button
          :class="{ active: p.mode.value === 'art' }"
          @click="p.mode.value = 'art'"
        >
          <Scan :size="14" /> 字符预览</button
        ><button
          :class="{ active: p.mode.value === 'text' }"
          @click="p.mode.value = 'text'"
        >
          <Code2 :size="14" /> 纯文本
        </button>
      </div>
      <div class="toolbar-toggles">
        <label v-if="budget" class="color-toggle"
          ><Flame :size="11" /> 损失分布<input
            aria-label="显示损失分布"
            type="checkbox"
            v-model="p.showLoss.value"
        /></label>
        <label class="color-toggle"
          ><span class="color-dot" /> 彩色<input
            aria-label="彩色预览"
            type="checkbox"
            v-model="p.doc.settings.color"
        /></label>
      </div>
    </div>
    <div class="art-stage">
      <div class="stage-label">OUTPUT / LIVE RENDER <span>●</span></div>
      <div class="art-scroll">
        <ArtCanvas
          v-if="p.doc.grid && p.mode.value === 'art'"
          :grid="p.doc.grid"
          :color="p.doc.settings.color"
          :background="p.doc.settings.background"
          :zoom="p.zoom.value"
          :show-loss="p.showLoss.value"
        />
        <pre
          v-else-if="p.doc.grid"
          data-testid="text-preview"
          :style="{
            fontSize: (14 * p.zoom.value) / 100 + 'px',
            lineHeight: (16 * p.zoom.value) / 100 + 'px',
          }"
          >{{ text }}</pre
        >
        <span v-else>正在准备字符画…</span>
      </div>
      <div class="stage-corner">
        <template v-if="budget">
          {{ p.doc.grid?.columns }}×{{ p.doc.grid?.rows }} 单元格 ·
          {{ p.displayLabel.value }}</template
        >
        <template v-else
          >{{ p.doc.grid?.columns }} COL × {{ p.doc.grid?.rows }} ROW</template
        >
      </div>
    </div>
    <div v-if="p.infeasible.value" class="infeasible-banner" role="alert">
      <AlertTriangle :size="14" />
      <div>
        <strong>预算放不下最小画面</strong>
        <span>{{ p.infeasible.value.message }}</span>
        <small
          >当前字符集与换行约定下可实现的下界：
          <b>{{ formatBytes(p.infeasible.value.lowerBoundBytes) }}</b
          >。旧作品已保留，未被覆盖。</small
        >
      </div>
    </div>
    <div v-if="budget" class="budget-report">
      <div class="budget-report-head">
        <span class="eyebrow">BUDGET VERIFY</span>
        <span :class="['budget-state', budget.fits ? 'ok' : 'bad']">{{
          budget.fits ? "真实编码核验通过" : "超出预算"
        }}</span>
      </div>
      <div class="budget-meters">
        <div class="meter">
          <div class="meter-label">
            <span>实际文件 / 预算</span>
            <b>{{ formatBytes(budget.actualBytes) }} / {{ formatBytes(budget.budget) }}</b>
          </div>
          <div class="meter-track">
            <i
              :style="{
                width:
                  Math.min(100, (budget.actualBytes / budget.budget) * 100) +
                  '%',
              }"
              :class="budget.actualBytes > budget.budget ? 'over' : ''"
            />
          </div>
          <small>余量 {{ formatBytes(budget.headroom) }}（不含截断）</small>
        </div>
        <div class="budget-facts">
          <div><span>生成前估计</span><b>{{ formatBytes(budget.estimatedBytes) }}</b></div>
          <div><span>字符净字节</span><b>{{ formatBytes(budget.actualCellBytes) }}</b></div>
          <div>
            <span>换行 ({{ budget.lineEnding.toUpperCase() }})</span
            ><b>{{ formatBytes(budget.actualNewlineBytes) }}</b>
          </div>
          <div>
            <span>单字符字节</span
            ><b
              >峰值 {{ budget.actualMaxGlyphBytes }} · 均值
              {{ budget.actualAvgGlyphBytes.toFixed(2) }}</b
            >
          </div>
        </div>
      </div>
      <div class="loss-row">
        <div class="loss-chip">
          <Flame :size="12" />
          <span>层级损失</span><b>{{ percent(budget.levelLoss) }}</b>
          <small
            >{{ budget.charsetLevelsUsed }}/{{ budget.charsetLevelsTotal }}
            级</small
          >
        </div>
        <div class="loss-chip">
          <Flame :size="12" />
          <span>尺寸损失</span><b>{{ percent(budget.sizeLoss) }}</b>
          <small>相对参考网格</small>
        </div>
        <div class="loss-chip">
          <Flame :size="12" />
          <span>量化损失</span
          ><b
            >均值 {{ percent(budget.avgLoss) }} · 峰值
            {{ percent(budget.maxLoss) }}</b
          >
        </div>
      </div>
    </div>
    <div class="preview-bottom">
      <span class="mono"
        ><i class="status-dot" />{{
          p.busy.value
            ? "生成中"
            : p.doc.grid?.revision === p.doc.revision
              ? "已同步"
              : "待重新生成"
        }}
        <span class="muted">/ {{ p.count.value }} 个字符 · {{ p.actualBytesLabel.value }} 真实 UTF-8</span></span
      >
      <div class="zoom">
        <button
          aria-label="缩小"
          @click="p.zoom.value = Math.max(25, p.zoom.value - 25)"
        >
          <Minus :size="14" /></button
        ><span>{{ p.zoom.value }}%</span
        ><button
          aria-label="放大"
          @click="p.zoom.value = Math.min(200, p.zoom.value + 25)"
        >
          <Plus :size="14" />
        </button>
      </div>
    </div>
    <div class="workspace-note">
      <span>从像素，到字符。</span
      ><small>每一个符号，都是光影的另一种表达。</small
      ><span class="note-symbol">{ Aa }</span>
    </div>
  </main>
</template>
