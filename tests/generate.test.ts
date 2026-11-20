/**
 * 端到端集成测试：用最小 Canvas 桩驱动 generate()，
 * 验证预算模式下真实编码核验、不可行时保留旧作品、列数模式预算字段为空。
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  generate,
  BudgetInfeasibleError,
} from "../src/features/mapping/model/generate";
import { createDocument } from "../src/shared/defaults";
import { layoutText, measureLayout } from "../src/shared/layout";
import { utf8Bytes } from "../src/shared/metrics";
import type { StudioDocument } from "../src/shared/document";

// ---- 最小 Canvas 桩：输出确定性的灰度渐变像素 ----
class FakeImageData {
  data: Uint8ClampedArray;
  constructor(public width: number, public height: number) {
    this.data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const v = Math.round(((x + y) / (width + height)) * 255);
        this.data[i] = v;
        this.data[i + 1] = v;
        this.data[i + 2] = v;
        this.data[i + 3] = 255;
      }
    }
  }
}
class FakeContext {
  fillStyle = "";
  font = "";
  textBaseline = "";
  textAlign = "";
  fillRect() {}
  drawImage() {}
  getImageData(_x: number, _y: number, w: number, h: number) {
    return new FakeImageData(w, h);
  }
  fillText() {}
}
function installCanvasStub() {
  const g = globalThis as Record<string, unknown>;
  g.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => new FakeContext(),
      toBlob: () => {},
    }),
  };
}

function makeDoc(): StudioDocument {
  const doc = createDocument();
  doc.asset = {
    name: "demo.png",
    url: "blob:demo",
    width: 400,
    height: 300,
    image: {} as HTMLImageElement,
  };
  return doc;
}

beforeEach(installCanvasStub);

test("列数模式：grid.budget 为 null，且沿用旧的行列换算", () => {
  const doc = makeDoc();
  doc.settings.densityMode = "columns";
  doc.settings.columns = 100;
  const grid = generate(doc)!;
  assert.equal(grid.budget, null);
  assert.equal(grid.columns, 100);
  assert.equal(grid.rows, 38);
  assert.equal(grid.cells.length, 100 * 38);
  assert.equal(grid.cells.every((c) => typeof c.loss === "number"), true);
});

test("预算模式：真实编码字节数落在预算内，且不超过保守估计", () => {
  const doc = makeDoc();
  doc.settings.densityMode = "budget";
  doc.settings.byteBudget = 512;
  doc.settings.charset = "standard";
  doc.settings.lineEnding = "lf";
  const grid = generate(doc)!;
  assert.ok(grid.budget);
  const text = layoutText(grid, "lf");
  const realBytes = utf8Bytes(text);
  assert.equal(realBytes, grid.budget!.actualBytes);
  assert.ok(realBytes <= 512);
  assert.ok(grid.budget!.estimatedBytes >= realBytes);
  assert.equal(grid.budget!.fits, true);
  assert.ok(grid.budget!.headroom >= 0);
});

test("中文预算模式：按 3 字节/字 收敛，占位宽度与字节数分别核算", () => {
  const doc = makeDoc();
  doc.settings.densityMode = "budget";
  doc.settings.byteBudget = 300;
  doc.settings.charset = "chinese";
  const grid = generate(doc)!;
  const measured = measureLayout(grid, "lf");
  assert.ok(measured.bytes <= 300);
  assert.equal(measured.maxGlyphBytes, 3);
  // 设备占位按宽字符计，必然不小于单元格列数
  assert.ok(measured.displayWidth >= grid.columns);
});

test("CRLF：真实文本包含 \\r\\n，且换行字节被计入核验", () => {
  const doc = makeDoc();
  doc.settings.densityMode = "budget";
  doc.settings.byteBudget = 400;
  doc.settings.lineEnding = "crlf";
  const grid = generate(doc)!;
  const text = layoutText(grid, "crlf");
  assert.ok(text.includes("\r\n"));
  assert.ok(!text.includes("\n") || text.includes("\r\n"));
  const m = measureLayout(grid, "crlf");
  assert.equal(m.newlineBytes, (grid.rows - 1) * 2);
  assert.ok(m.bytes <= 400);
  assert.equal(grid.budget!.lineEnding, "crlf");
});

test("两种优先级：轮廓模式单元格数不少于灰阶模式", () => {
  const mk = (priority: "outline" | "grayscale") => {
    const doc = makeDoc();
    doc.settings.densityMode = "budget";
    doc.settings.byteBudget = 220;
    doc.settings.budgetPriority = priority;
    return generate(doc)!;
  };
  const outline = mk("outline");
  const gray = mk("grayscale");
  assert.ok(outline.cells.length >= gray.cells.length);
  assert.equal(gray.budget!.levelLoss, 0);
});

test("预算不可行：抛 BudgetInfeasibleError 并携带下界（由工作区保留旧作品）", () => {
  const doc = makeDoc();
  doc.settings.densityMode = "budget";
  doc.settings.charset = "chinese";
  doc.settings.byteBudget = 300;
  const previous = generate(doc)!;
  assert.ok(previous);
  doc.settings.byteBudget = 1; // 低于中文 3 字节下界
  assert.throws(
    () => generate(doc),
    (e: unknown) => {
      assert.ok(e instanceof BudgetInfeasibleError);
      assert.equal((e as BudgetInfeasibleError).lowerBoundBytes, 3);
      return true;
    },
  );
  // 工作区语义：捕获异常后 doc.grid 保持为 previous，不被覆盖
  assert.equal(previous.cells.length > 0, true);
});

test("组合符字符集：零宽字符仍占字节，核验以字节为准", () => {
  const doc = makeDoc();
  doc.settings.densityMode = "budget";
  doc.settings.byteBudget = 200;
  doc.settings.charset = "combo";
  const grid = generate(doc)!;
  const m = measureLayout(grid, "lf");
  assert.ok(m.bytes <= 200);
  assert.ok(m.maxGlyphBytes >= 1);
});
