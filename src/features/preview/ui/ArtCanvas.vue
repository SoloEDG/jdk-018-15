<script setup lang="ts">
import { ref, watch, onMounted, computed } from "vue";
import type { Grid } from "../../../shared/document";
import { drawGrid, layoutPixelSize } from "../lib/draw";
const props = defineProps<{
  grid: Grid;
  color: boolean;
  background: string;
  zoom: number;
  showLoss: boolean;
}>();
const canvas = ref<HTMLCanvasElement>();
const size = computed(() => layoutPixelSize(props.grid));
function draw() {
  if (canvas.value)
    drawGrid(
      canvas.value,
      props.grid,
      props.color,
      props.background,
      props.showLoss,
    );
}
onMounted(draw);
watch(() => [props.grid, props.color, props.background, props.showLoss], draw);
</script>
<template>
  <canvas
    ref="canvas"
    aria-label="字符画预览"
    :style="{
      width: (size.width * zoom) / 100 + 'px',
      height: (size.height * zoom) / 100 + 'px',
    }"
  />
</template>
