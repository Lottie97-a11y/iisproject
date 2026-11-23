const $ = (id) => document.getElementById(id);

const imageCanvas = $("imageCanvas");
const overlay = $("overlayCanvas");
const imgCtx = imageCanvas.getContext("2d");
const ovCtx = overlay.getContext("2d");
const maskCanvas = document.createElement("canvas"); // editable area = opaque pixels
const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });

// Outline radius in image pixels.
const OUTLINE_RADIUS = 3;
const EDITED = 1;
const PROTECTED = 2;
const EDIT_OUTLINE = [207, 34, 46, 255];
const PROTECTED_OUTLINE = [26, 127, 55, 255];
const samples = Array.isArray(window.SAMPLES) ? window.SAMPLES : [];

const state = {
  step: "select",
  sample: null,
  mode: "paint",      // "paint" | "erase"
  brush: 24,
  painting: false,
  last: null,
  pointer: null,
  editableShare: 0,   // share of pixels the user marked as editable (0..1)
  scene: null,        // objects in the current image (static/rules.js)
  objMap: null,       // pixel -> object index
  confirmed: null,
  original: null,     // ImageData of the unedited image
  outcome: null,      // { raw, final, drift, driftCount, editedCount, lockedCount }
  kept: false,
};

// ---------- loading ----------

function loadSample(sample) {
  const img = new Image();
  img.onload = () => {
    for (const c of [imageCanvas, overlay, maskCanvas]) {
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
    }
    $("canvasStack").style.setProperty("--ratio", img.naturalWidth / img.naturalHeight);
    imgCtx.drawImage(img, 0, 0);
    state.original = imgCtx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);
    $("imgInfo").textContent = `${img.naturalWidth} x ${img.naturalHeight} px`;
    $("loadMsg").textContent = "";
    state.sample = sample;
    state.scene = window.SCENE[sample.name] || null;
    state.objMap = state.scene ? window.objectMap(state.original, state.scene) : null;
    $("selectMsg").textContent = state.scene ? "" : "This image has no object list, so the modes cannot run.";
    clearMask();
  };
  img.onerror = () => { $("loadMsg").textContent = `Could not load ${sample.name}.`; };
  img.src = sample.src;
}

function updateInputGuide() {
  $("makeCard").disabled = state.step !== "select" || !state.scene;
}

// ---------- mask ----------

function clearMask() {
  maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  updateMaskInfo();
  renderOverlay();
}

function canvasPoint(evt) {
  const r = overlay.getBoundingClientRect();
  return {
    x: (evt.clientX - r.left) * (overlay.width / r.width),
    y: (evt.clientY - r.top) * (overlay.height / r.height),
  };
}

function strokeTo(p) {
  maskCtx.save();
  maskCtx.globalCompositeOperation = state.mode === "erase" ? "destination-out" : "source-over";
  maskCtx.strokeStyle = "#fff";
  maskCtx.fillStyle = "#fff";
  maskCtx.lineWidth = state.brush;
  maskCtx.lineCap = "round";
  maskCtx.lineJoin = "round";
  const from = state.last || p;
  maskCtx.beginPath();
  maskCtx.moveTo(from.x, from.y);
  maskCtx.lineTo(p.x, p.y);
  maskCtx.stroke();
  maskCtx.beginPath();
  maskCtx.arc(p.x, p.y, state.brush / 2, 0, Math.PI * 2);
  maskCtx.fill();
  maskCtx.restore();
  state.last = p;
}

function updateMaskInfo() {
  const { width, height } = maskCanvas;
  if (!width || !height) return;
  const data = maskCtx.getImageData(0, 0, width, height).data;
  let editable = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) editable++;
  state.editableShare = editable / (width * height);
  updateInputGuide();
  $("maskInfo").textContent = "笔画覆盖 " + (state.editableShare * 100).toFixed(1) + "%";
}

const tintCanvas = document.createElement("canvas"); // painted area, coloured for display
const tintCtx = tintCanvas.getContext("2d");

function renderOverlay() {
  // Default view: the whole image stays visible and only the painted (editable) area is
  // tinted blue, so the user can still judge the full picture. The optional brush view darkens the area outside the strokes.
  const { width, height } = overlay;
  ovCtx.clearRect(0, 0, width, height);
  ovCtx.globalCompositeOperation = "source-over";
  if (state.step === "result") {
    if (state.outcome && $("showDrift").checked && viewName() !== "original") {
      ovCtx.drawImage(state.outcome.driftLayer, 0, 0);
    }
    return;
  }
  if (state.step === "confirm") {
    if (state.preview) ovCtx.putImageData(state.preview, 0, 0);
    return;
  }
  if ($("showLocked").checked) {
    // Brush view: show the original colours beneath the strokes.
    ovCtx.fillStyle = "rgba(20, 24, 32, 0.78)";
    ovCtx.fillRect(0, 0, width, height);
    ovCtx.globalCompositeOperation = "destination-out";
    ovCtx.drawImage(maskCanvas, 0, 0);
    ovCtx.globalCompositeOperation = "source-over";
    drawBrushCursor();
    return;
  }
  tintCanvas.width = width;
  tintCanvas.height = height;
  tintCtx.drawImage(maskCanvas, 0, 0);
  tintCtx.globalCompositeOperation = "source-in";
  tintCtx.fillStyle = "rgba(31, 111, 235, 0.38)";
  tintCtx.fillRect(0, 0, width, height);
  tintCtx.globalCompositeOperation = "source-over";
  ovCtx.drawImage(tintCanvas, 0, 0);
  drawBrushCursor();
}

function drawBrushCursor() {
  if (state.step !== "select" || !state.pointer) return;
  ovCtx.beginPath();
  ovCtx.arc(state.pointer.x, state.pointer.y, state.brush / 2, 0, Math.PI * 2);
  ovCtx.strokeStyle = state.mode === "erase" ? "#cf222e" : "#1f6feb";
  ovCtx.lineWidth = 2;
  ovCtx.stroke();
}

overlay.addEventListener("pointerdown", (e) => {
  if (state.step !== "select") return;
  overlay.setPointerCapture(e.pointerId);
  state.painting = true;
  state.last = null;
  strokeTo(canvasPoint(e));
  renderOverlay();
});
overlay.addEventListener("pointermove", (e) => {
  state.pointer = canvasPoint(e);
  if (state.painting) strokeTo(state.pointer);
  renderOverlay();
});
const endStroke = () => {
  if (!state.painting) return;
  state.painting = false;
  state.last = null;
  updateMaskInfo();
  $("selectMsg").textContent = "";
};
overlay.addEventListener("pointerup", endStroke);
overlay.addEventListener("pointercancel", endStroke);
overlay.addEventListener("pointerleave", () => { state.pointer = null; renderOverlay(); });

// ---------- steps ----------

function setStep(step) {
  state.step = step;
  for (const li of document.querySelectorAll("#steps li")) {
    li.classList.toggle("active", li.dataset.step === step);
  }
  $("selectPanel").hidden = step === "result";
  $("confirmPanel").hidden = step !== "confirm";
  $("resultPanel").hidden = step !== "result";
  const editing = step === "select";
  $("instruction").disabled = step === "result";
  for (const id of ["sample", "brushSize", "modePaint", "modeErase", "clearMask", "showLocked"]) {
    $(id).disabled = !editing;
  }
  overlay.classList.toggle("locked", !editing);
  document.body.dataset.step = step;
  if (step === "confirm") $("confirmTitle").focus({preventScroll:true});
  if (step === "result") $("resultTitle").focus({preventScroll:true});
  updateInputGuide();
  renderOverlay();
}

let messageTimer;
function notifyInput(message) {
  const box = $("selectMsg");
  clearTimeout(messageTimer);
  box.textContent = message;
  box.classList.remove("visible");
  void box.offsetWidth;
  box.classList.add("visible");
  messageTimer = setTimeout(() => { box.textContent = ""; }, 4800);
}

function makeCard() {
  if (state.step !== "select" || !state.scene) return;
  const parsed = readInstruction($("instruction").value, state.scene);
  if (!parsed.options.length) return notifyInput("请描述要修改的颜色或明暗，已有笔画会保留。");
  const mask = maskCtx.getImageData(0, 0, overlay.width, overlay.height).data;
  const rows = state.scene.objects.map(obj => ({ obj, total: 0, painted: 0, local: 0, whole: 0,
    selected: false, selectionOverride: null, mode: "" }));
  const eligible = new Uint8Array(state.objMap.length);
  for (let p = 0; p < eligible.length; p++) {
    const row = rows[state.objMap[p]];
    if (!row) continue;
    const i = p * 4;
    const painted = mask[i + 3] > 0;
    row.total++;
    if (painted) row.painted++;
    const d = state.original.data;
    if (window.isRecolourable(row.obj, d[i], d[i+1], d[i+2])) {
      eligible[p] = painted ? 2 : 1;
      row.whole++;
      if (painted) row.local++;
    }
  }
  state.draft = { rows, eligible };
  if (!updateCandidates(parsed)) return;
  setStep("confirm");
}

// Brush coverage stays fixed while the prompt is editable in the confirmation panel.
function updateCandidates(parsed) {
  const draft = state.draft;
  draft.effects = parsed.options;
  draft.candidates = draft.rows.filter(row => parsed.targets.has(row.obj.id) || (row.total && row.painted * 10 >= row.total));
  for (const row of draft.rows) {
    const candidate = draft.candidates.includes(row);
    const named = parsed.targets.has(row.obj.id);
    row.selected = candidate && (row.selectionOverride ?? (named || draft.candidates.length === 1));
    const inferred = parsed.effects.get(row.obj.id) || parsed.shared;
    const inferredLabel = effectLabel(inferred);
    if (row.inferredLabel !== inferredLabel) row.effectOverride = null;
    row.inferredLabel = inferredLabel;
    const override = parsed.options.find(effect => effectLabel(effect) === row.effectOverride);
    row.effect = override || inferred;
  }
  const problem = !parsed.options.length ? "请描述要修改的颜色或明暗，已有笔画会保留。"
    : !draft.candidates.length ? "请点名一个元素，或至少涂到它的 10%。" : "";
  if (problem) notifyInput(problem);
  else $("selectMsg").textContent = "";
  showOptions();
  return !problem;
}

function showOptions() {
  const { candidates, effects } = state.draft;
  const list = $("card");
  list.replaceChildren();
  for (const row of candidates) {
    const line = document.createElement("div");
    line.className = "choice-row";
    const name = NAMES[row.obj.id];
    const label = document.createElement("label");
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = row.selected;
    check.dataset.object = row.obj.id;
    const settings = document.createElement("div");
    settings.className = "settings";
    label.append(check, " " + name);
    line.append(label, settings);
    if (!row.effect || effects.length > 1) {
      const select = document.createElement("select");
      select.setAttribute("aria-label", name + "的效果");
      select.add(new Option("选择效果", ""));
      effects.forEach((e, index) => select.add(new Option(effectLabel(e), String(index))));
      select.value = row.effect ? String(effects.indexOf(row.effect)) : "";
      select.onchange = () => {
        row.effect = select.value === "" ? null : effects[Number(select.value)];
        row.effectOverride = effectLabel(row.effect);
        refreshScope();
      };
      settings.append(select);
    } else {
      const effect = document.createElement("span");
      effect.textContent = effectLabel(row.effect);
      settings.append(effect);
    }
    for (const [mode,title] of [["A","局部"],["B","整体"]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.value = mode;
      button.textContent = title;
      button.setAttribute("aria-label", name + title);
      button.setAttribute("aria-pressed", String(row.mode === mode));
      button.onclick = () => {
        row.mode = row.mode === mode ? "" : mode;
        for (const option of settings.querySelectorAll("button")) {
          option.setAttribute("aria-pressed", String(option.value === row.mode));
        }
        refreshScope();
      };
      settings.append(button);
    }
    if (!row.local) {
      const hint = document.createElement("small");
      hint.textContent = "局部修改需先涂到可改色区域";
      settings.append(hint);
    }
    const enable = () => {
      for (const control of settings.querySelectorAll("button,select")) {
        control.disabled = !row.selected || (control.value === "A" && !row.local);
      }
    };
    check.onchange = () => {
      row.selectionOverride = check.checked;
      row.selected = check.checked;
      enable();
      refreshScope();
    };
    enable();
    list.append(line);
  }
  refreshScope();
}

function refreshScope() {
  const {rows, candidates, eligible} = state.draft;
  const selected = candidates.filter(row => row.selected);
  const ready = selected.length > 0 && selected.every(row => row.effect && row.mode && (row.mode === "B" ? row.whole : row.local));
  const scope = new Uint8Array(eligible.length);
  const preview = new ImageData(overlay.width, overlay.height);
  for (let p = 0; p < scope.length; p++) {
    const row = rows[state.objMap[p]];
    if (!row?.selected || !row.effect || !eligible[p]) continue;
    if (row.mode !== "B" && !(row.mode === "A" && eligible[p] === 2)) continue;
    scope[p] = 1;
    const i = p * 4;
    preview.data[i] = 85; preview.data[i+1] = 255; preview.data[i+2] = 190; preview.data[i+3] = 175;
  }
  state.pending = {scope, rows};
  state.preview = preview;
  $("confirmBtn").disabled = !ready;
  renderOverlay();
}

function confirmEdit() {
  if (state.step !== "confirm" || $("confirmBtn").disabled) return;
  state.confirmed = state.pending;
  state.outcome = enforceLock(simulateModel(state.confirmed));
  state.kept = false;
  $("resultMsg").textContent = "";
  $("showDrift").checked = false;
  document.querySelector('input[name="view"][value="final"]').checked = true;
  setStep("result");
  reportDrift();
  showView();
}

function simulateModel({scope, rows}) {
  const orig = state.original;
  const out = new ImageData(new Uint8ClampedArray(orig.data), orig.width, orig.height);
  const driftByObject = new Map();
  for (const drift of state.scene.drift) {
    if (rows.some(row => row.selected && drift.objects.includes(row.obj.id))) continue;
    for (const id of drift.objects) driftByObject.set(id, drift);
  }
  for (let p = 0; p < scope.length; p++) {
    const row = rows[state.objMap[p]];
    if (!row) continue;
    const i = p * 4;
    const [r,g,b] = [orig.data[i], orig.data[i+1], orig.data[i+2]];
    if (scope[p]) {
      out.data.set(window.editPixel(r,g,b,row.effect), i);
    } else {
      const drift = driftByObject.get(row.obj.id);
      if (drift?.vanish) out.data.set(state.scene.background, i);
      else if (drift) {
        const match = drift.map.find(([from]) => from[0] === r && from[1] === g && from[2] === b);
        if (match) out.data.set(match[1], i);
      }
    }
  }
  return out;
}

// Enforce the confirmed scope independently of the model output.
function enforceLock(raw) {
  const orig = state.original.data;
  const out = raw.data;
  const final = new ImageData(new Uint8ClampedArray(out), raw.width, raw.height);
  const drift = new ImageData(raw.width, raw.height);
  const changeKind = new Uint8Array(raw.width * raw.height);
  let driftCount = 0, editedCount = 0, lockedCount = 0;
  for (let i = 0; i < out.length; i += 4) {
    const changed = out[i] !== orig[i] || out[i + 1] !== orig[i + 1] || out[i + 2] !== orig[i + 2];
    const allowed = state.confirmed.scope[i / 4];
    if (allowed) {
      if (changed) {
        editedCount++;
        changeKind[i / 4] = EDITED;
      }
      continue;
    }
    lockedCount++;
    if (changed) driftCount++;
    if (changed) changeKind[i / 4] = PROTECTED;
    final.data[i] = orig[i]; final.data[i + 1] = orig[i + 1]; final.data[i + 2] = orig[i + 2]; final.data[i + 3] = orig[i + 3];
  }
  // Where an edit touches a restored area, keep each colour on its own side.
  const w = raw.width, h = raw.height;
  const r = OUTLINE_RADIUS;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const kind = changeKind[p];
      if (!kind) continue;
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
        changeKind[p - 1] !== kind || changeKind[p + 1] !== kind ||
        changeKind[p - w] !== kind || changeKind[p + w] !== kind;
      if (!edge) continue;
      const colour = kind === EDITED ? EDIT_OUTLINE : PROTECTED_OUTLINE;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue; // round brush
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const dest = ny * w + nx;
          if (changeKind[dest] && changeKind[dest] !== kind) continue;
          drift.data.set(colour, dest * 4);
        }
      }
    }
  }
  const driftLayer = document.createElement("canvas");
  driftLayer.width = raw.width;
  driftLayer.height = raw.height;
  driftLayer.getContext("2d").putImageData(drift, 0, 0);
  return { raw, final, driftLayer, driftCount, editedCount, lockedCount };
}

function reportDrift() {
  const {editedCount, driftCount} = state.outcome;
  $("driftReport").textContent = `修改 ${editedCount.toLocaleString()} 个像素 · 已还原 ${driftCount.toLocaleString()} 个越界像素`;
}

function viewName() {
  const v = document.querySelector('input[name="view"]:checked');
  return v ? v.value : "final";
}

function showView() {
  if (!state.outcome) return;
  const v = viewName();
  const data = v === "raw" ? state.outcome.raw : v === "original" ? state.original : state.outcome.final;
  imgCtx.putImageData(data, 0, 0);
  renderOverlay();
}

function keepResult() {
  if (state.step !== "result") return;
  state.kept = true;
  document.querySelector('input[name="view"][value="final"]').checked = true;
  showView();
  $("resultMsg").textContent = "已保留当前结果。";
}

// Page 3 -> page 2: undo the edit and return to the mode and edit card, keeping the
// painting, the words and the chosen mode, so another mode can be tried on the same input.
function backToPrevious() {
  if (state.step !== "result") return;
  state.outcome = null;
  state.kept = false;
  imgCtx.putImageData(state.original, 0, 0);
  $("resultMsg").textContent = "";
  setStep("confirm");
  showOptions();
}

function goBack() {
  $("card").innerHTML = "";
  $("confirmBtn").disabled = false;
  setStep("select");
  $("instruction").focus({preventScroll:true});
}

function restart() {
  state.confirmed = null;
  state.outcome = null;
  state.kept = false;
  if (state.original) imgCtx.putImageData(state.original, 0, 0);
  $("resultMsg").textContent = "";
  $("card").innerHTML = "";
  $("confirmBtn").disabled = false;
  clearMask();
  setStep("select");
}

// ---------- controls ----------

function setMode(mode) {
  state.mode = mode;
  $("modePaint").classList.toggle("on", mode === "paint");
  $("modeErase").classList.toggle("on", mode === "erase");
  $("modePaint").setAttribute("aria-pressed", String(mode === "paint"));
  $("modeErase").setAttribute("aria-pressed", String(mode === "erase"));
}

$("brushSize").addEventListener("input", (e) => {
  state.brush = Number(e.target.value);
  $("brushSizeLabel").textContent = `${state.brush} px`;
});
$("modePaint").addEventListener("click", () => setMode("paint"));
$("modeErase").addEventListener("click", () => setMode("erase"));
$("clearMask").addEventListener("click", clearMask);
$("showLocked").addEventListener("change", renderOverlay);
function syncInstruction() {
  if (state.step === "confirm") updateCandidates(readInstruction($("instruction").value, state.scene));
  else updateInputGuide();
}
$("instruction").addEventListener("input", e => {
  if (!e.isComposing) syncInstruction();
});
$("instruction").addEventListener("compositionend", syncInstruction);
$("makeCard").addEventListener("click", makeCard);
$("confirmBtn").addEventListener("click", confirmEdit);
$("backBtn").addEventListener("click", goBack);
$("restartBtn").addEventListener("click", restart);
$("keepBtn").addEventListener("click", keepResult);
$("undoBtn").addEventListener("click", backToPrevious);
$("showDrift").addEventListener("change", renderOverlay);
for (const r of document.querySelectorAll('input[name="view"]')) r.addEventListener("change", showView);

const themeChoice = window.matchMedia("(prefers-color-scheme: dark)");
let savedTheme;
try { savedTheme = localStorage.getItem("iis-theme"); } catch {}
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $("theme").textContent = theme === "dark" ? "切换浅色" : "切换深色";
  $("theme").setAttribute("aria-label", $("theme").textContent + "主题");
}
applyTheme(savedTheme || (themeChoice.matches ? "dark" : "light"));
$("theme").addEventListener("click", () => {
  savedTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(savedTheme);
  try { localStorage.setItem("iis-theme", savedTheme); } catch {}
});
themeChoice.addEventListener("change", e => {
  if (!savedTheme) applyTheme(e.matches ? "dark" : "light");
});

// Let the canvas resize with the dock throughout the transition.
const dockContent = document.querySelector(".dock-content");
new ResizeObserver(() => {
  $("dock").style.setProperty("--dock-height", Math.ceil(dockContent.getBoundingClientRect().height + 1) + "px");
}).observe(dockContent);

// ---------- start ----------

if (samples.length === 0) {
  $("loadMsg").textContent = "No sample images found. Run: python tools/embed_samples.py";
} else {
  samples.forEach((s, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = s.name;
    $("sample").appendChild(opt);
  });
  $("sample").addEventListener("change", () => loadSample(samples[Number($("sample").value)]));
  loadSample(samples[0]);
}

setStep("select");
