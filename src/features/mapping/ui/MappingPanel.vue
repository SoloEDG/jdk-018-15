<script setup lang="ts">
import { computed } from "vue";
import { SlidersHorizontal, ShieldAlert, ScanLine } from "lucide-vue-next";
import { useStudio } from "../../../shared/useStudio";
import {
  charsets,
  charsetValue,
  metricsFor,
  planBudget,
  newlineByteSize,
} from "../index";
import { formatBytes } from "../../../shared/metrics";
const { doc, invalidate, infeasible } = useStudio();

const fullMetrics = computed(() =>
  metricsFor(doc.settings.charset, doc.settings.custom),
);
const activeCharsetValue = computed(() =>
  charsetValue(doc.settings.charset, doc.settings.custom),
);

/** 生成前的预算估计：基于当前裁剪、换行约定与字符集最大字节做保守上界 */
const estimate = computed(() => {
  if (!doc.asset || doc.settings.densityMode !== "budget") return null;
  const cropWidth = doc.asset.width * doc.crop.width;
  const cropHeight = doc.asset.height * doc.crop.height;
  const plan = planBudget(
    cropWidth,
    cropHeight,
    doc.settings.byteBudget,
    doc.settings.budgetPriority,
    doc.settings.lineEnding,
    fullMetrics.value,
    doc.settings.columns,
  );
  return plan;
});

const newlineBytes = computed(() =>
  newlineByteSize(doc.settings.lineEnding),
);

function clampBudget(value: number) {
  doc.settings.byteBudget = Math.max(
    1,
    Math.min(1024 * 1024, Math.round(value) || 1),
  );
  invalidate();
}
</script>
<template>
  <section class="panel">
    <div class="section-title">
      <span>03 / CHARACTER LAB</span><SlidersHorizontal :size="15" />
    </div>

    <div class="mode-switch" role="tablist" aria-label="尺寸控制模式">
      <button
        role="tab"
        :class="{ active: doc.settings.densityMode === 'columns' }"
        :aria-selected="doc.settings.densityMode === 'columns'"
        @click="doc.settings.densityMode = 'columns'; invalidate()"
      >
        列数模式
      </button>
      <button
        role="tab"
        :class="{ active: doc.settings.densityMode === 'budget' }"
        :aria-selected="doc.settings.densityMode === 'budget'"
        @click="doc.settings.densityMode = 'budget'; invalidate()"
      >
        字节预算
      </button>
    </div>

    <template v-if="doc.settings.densityMode === 'columns'">
      <label class="field"
        >字符密度 <b>{{ doc.settings.columns }} 列</b
        ><input
          aria-label="字符密度"
          type="range"
          min="30"
          max="220"
          step="1"
          v-model.number="doc.settings.columns"
          @input="invalidate"
      /></label>
      <div class="range-ends"><span>疏朗</span><span>精细</span></div>
    </template>

    <template v-else>
      <label class="field"
        >文件字节预算
        <b>{{ formatBytes(doc.settings.byteBudget) }}</b>
        <input
          aria-label="文件字节预算"
          type="number"
          min="1"
          max="1048576"
          step="1"
          class="budget-input"
          :value="doc.settings.byteBudget"
          @change="clampBudget(Number(($event.target as HTMLInputElement).value))"
      /></label>
      <label class="field"
        >快速预算
        <span class="budget-presets">
          <button
            v-for="preset in [256, 1024, 4096, 16384, 65536]"
            :key="preset"
            type="button"
            class="preset-chip"
            :class="{ active: doc.settings.byteBudget === preset }"
            @click="doc.settings.byteBudget = preset; invalidate()"
          >
            {{ formatBytes(preset) }}
          </button>
        </span>
      </label>

      <label class="field compact"
        >预算不足时优先
        <select
          aria-label="预算优先级"
          v-model="doc.settings.budgetPriority"
          @change="invalidate"
        >
          <option value="outline">保完整轮廓（压缩灰阶层级）</option>
          <option value="grayscale">保局部灰阶（缩小画面尺寸）</option>
        </select></label
      >
      <label class="field compact"
        >设备换行约定
        <select
          aria-label="换行约定"
          v-model="doc.settings.lineEnding"
          @change="invalidate"
        >
          <option value="lf">LF（{{ newlineBytes }} 字节/换行）</option>
          <option value="crlf">CRLF（{{ newlineBytes }} 字节/换行）</option>
        </select></label
      >

      <div
        v-if="estimate"
        class="estimate-card"
        :class="{ bad: !estimate.feasible }"
      >
        <template v-if="estimate.feasible">
          <div class="estimate-row">
            <ScanLine :size="12" />
            <span>规划布局</span>
            <b
              >{{ estimate.columns }} × {{ estimate.rows }} ·
              {{ estimate.levels.metrics.length }} 灰阶层级</b
            >
          </div>
          <div class="estimate-row">
            <span>保守估计（生成前）</span>
            <b>{{ formatBytes(estimate.estimatedBytes) }}</b>
          </div>
          <div class="estimate-row">
            <span>换行开销</span>
            <b>
              {{
                formatBytes(
                  Math.max(0, estimate.rows - 1) * estimate.newlineBytes,
                )
              }}
            </b>
          </div>
          <div class="estimate-row">
            <span>预计余量</span>
            <b>{{
              formatBytes(doc.settings.byteBudget - estimate.estimatedBytes)
            }}</b>
          </div>
          <small class="estimate-note">
            按字符集最大单字
            {{ estimate.estimatedMaxGlyphBytes }} 字节（均值
            {{ estimate.estimatedAvgGlyphBytes.toFixed(2) }}）保守估算，实际通常更小，生成后按真实 UTF-8 核验。
          </small>
        </template>
        <template v-else>
          <div class="estimate-row bad-text">
            <ShieldAlert :size="13" />
            <span>{{ estimate.reason }}</span>
          </div>
          <small class="estimate-note">
            可实现下界：<b>{{ formatBytes(estimate.lowerBoundBytes) }}</b
            >，旧作品不会被覆盖。
          </small>
        </template>
      </div>
      <div v-if="infeasible" class="infeasible-inline">
        <ShieldAlert :size="12" />
        当前预算不可行，已保留上一份成功作品。
      </div>
    </template>

    <label class="field"
      >字符集<select
        aria-label="字符集"
        v-model="doc.settings.charset"
        @change="invalidate"
      >
        <option v-for="c in charsets" :key="c.id" :value="c.id">
          {{ c.name }}
        </option>
        <option value="custom">自定义字符集</option>
      </select></label
    ><input
      v-if="doc.settings.charset === 'custom'"
      aria-label="自定义字符"
      class="custom"
      maxlength="100"
      v-model="doc.settings.custom"
      @input="invalidate"
    />
    <div class="glyph-strip">
      {{ activeCharsetValue }}
    </div>
    <div class="charset-metrics mono muted">
      {{ fullMetrics.metrics.length }} 个字符 · 单字峰值
      {{ fullMetrics.maxBytes }} B · 均值
      {{ fullMetrics.avgBytes.toFixed(2) }} B · 最大占位
      {{ fullMetrics.maxWidth }} 格
    </div>
    <label class="field"
      >对比度 <b>{{ doc.settings.contrast.toFixed(2) }}</b><input
        aria-label="对比度"
        type="range"
        min="0.3"
        max="2.5"
        step="0.05"
        v-model.number="doc.settings.contrast"
        @input="invalidate" /></label
    ><label class="field"
      >伽马 <b>{{ doc.settings.gamma.toFixed(2) }}</b><input
        aria-label="伽马"
        type="range"
        min="0.3"
        max="2.5"
        step="0.05"
        v-model.number="doc.settings.gamma"
        @input="invalidate" /></label
    ><label class="toggle-row"
      ><span>反转明暗</span
      ><input
        aria-label="反转明暗"
        type="checkbox"
        v-model="doc.settings.invert"
        @change="invalidate"
    /></label>
  </section>
</template>
