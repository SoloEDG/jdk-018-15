<script setup lang="ts">
import { computed } from "vue";
import { Download, Copy, ArrowUpRight, FileCheck2 } from "lucide-vue-next";
import { useExport } from "../model/useExport";
import { measureLayout } from "../../../shared/layout";
import { formatBytes } from "../../../shared/metrics";
const e = useExport();
const measured = computed(() =>
  e.doc.grid ? measureLayout(e.doc.grid, e.doc.settings.lineEnding) : null,
);
const budget = computed(() => e.doc.grid?.budget ?? null);
</script>
<template>
  <section class="export-bar">
    <div>
      <span class="eyebrow">READY TO SHARE</span>
      <h3>带走你的字符作品</h3>
      <small>文本与 PNG 绑定同一份确定布局，下载前按真实 UTF-8 编码核验。</small>
      <div v-if="measured" class="export-metrics mono">
        <FileCheck2 :size="12" />
        <span>{{ formatBytes(measured.bytes) }}</span>
        <span class="muted">
          · {{ measured.displayWidth }} 占位 × {{ measured.displayRows }} 行
          · {{ measured.newlineCount }} 个换行</span
        >
        <span v-if="budget" :class="budget.fits ? 'fit-ok' : 'fit-bad'">
          · 预算 {{ formatBytes(budget.budget) }} ·
          {{ budget.fits ? "通过" : "超限" }}
        </span>
      </div>
    </div>
    <div class="export-actions">
      <button class="secondary" :disabled="!e.ready()" @click="e.copy">
        <Copy :size="15" /> 复制字符</button
      ><button class="secondary" :disabled="!e.ready()" @click="e.png">
        PNG <ArrowUpRight :size="15" /></button
      ><button class="primary" :disabled="!e.ready()" @click="e.saveText">
        <Download :size="16" /> 导出 .TXT
      </button>
    </div>
  </section>
</template>
