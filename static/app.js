// Region-locked image editing: browser-only prototype.
//
// Step 1 (select):  the user paints the area that may change (shown in blue); everything
//                   else is locked. The image stays fully visible; a checkbox can grey
//                   out the locked area for a check.
// Step 2 (confirm): an edit card says what will change and what is kept. Nothing runs
//                   until the user confirms; "Go back" returns to step 1.
// Step 3 (result):  reached only from the Confirm button. The pre-recorded model output is
//                   loaded; outside the painted area the original pixels are pasted back,
//                   so the lock holds even when the model changes too much. Pixels the
//                   model changed in the locked area are counted and reported; every
//                   change the model made (allowed or blocked) is outlined in red.
//                   "Back to original" returns to step 1 with the mask kept.
//
// Simulated parts: the edit card text and the result come from static/recorded_runs.js
// (drawn in code by tools/make_mocks.py). No model is called.

const $ = (id) => document.getElementById(id);

const imageCanvas = $("imageCanvas");
const overlay = $("overlayCanvas");
const imgCtx = imageCanvas.getContext("2d");
const ovCtx = overlay.getContext("2d");
const maskCanvas = document.createElement("canvas"); // editable area = opaque pixels
const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });

// Red outline round blocked changes: radius in image pixels (3 gives a line about 7 px wide).
const OUTLINE_RADIUS = 3;

const samples = Array.isArray(window.SAMPLES) ? window.SAMPLES : [];
const runs = Array.isArray(window.RECORDED_RUNS) ? window.RECORDED_RUNS : [];

const state = {
  step: "select",
  sample: null,
  mode: "paint",      // "paint" | "erase"
  brush: 24,
  painting: false,
  last: null,
  pointer: null,
  editableShare: 0,   // share of pixels the user marked as editable (0..1)
  confirmed: null,    // what the user confirmed: { runId, instruction, editableShare }
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
    imgCtx.drawImage(img, 0, 0);
    state.original = imgCtx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);
    $("imgInfo").textContent = `${img.naturalWidth} x ${img.naturalHeight} px`;
    $("loadMsg").textContent = "";
    state.sample = sample;
    clearMask();
    fillScenarios();
  };
  img.onerror = () => { $("loadMsg").textContent = `Could not load ${sample.name}.`; };
  img.src = sample.src;
}

function fillScenarios() {
  const sel = $("scenario");
  sel.innerHTML = "";
  const forSample = runs.filter((r) => r.sample === state.sample.name);
  for (const r of forSample) {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = r.card.title;
    sel.appendChild(opt);
  }
  sel.disabled = forSample.length === 0;
  $("useScenarioMask").disabled = forSample.length === 0;
  $("makeCard").disabled = forSample.length === 0;
  if (forSample.length === 0) {
    $("selectMsg").textContent = "No recorded scenarios for this image.";
  } else {
    onScenarioChange();
  }
}

function currentRun() {
  return runs.find((r) => r.id === $("scenario").value) || null;
}

function onScenarioChange() {
  const run = currentRun();
  $("instruction").value = run ? run.card.instruction : "";
  $("selectMsg").textContent = "";
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
  const pct = (state.editableShare * 100).toFixed(1);
  $("maskInfo").textContent = editable === 0
    ? "Paint over the part you want to change. Anything you do not paint stays locked."
    : `Editable (blue): ${pct}% of the image. The other ${(100 - pct).toFixed(1)}% is locked.`;
}

const tintCanvas = document.createElement("canvas"); // painted area, coloured for display
const tintCtx = tintCanvas.getContext("2d");

function renderOverlay() {
  // Default view: the whole image stays visible and only the painted (editable) area is
  // tinted blue, so the user can still judge the full picture. Unpainted areas are locked
  // either way; "Show locked area" darkens them instead and leaves the painted area in its
  // true colours.
  const { width, height } = overlay;
  ovCtx.clearRect(0, 0, width, height);
  ovCtx.globalCompositeOperation = "source-over";
  if (state.step === "result") {
    // Result view: the red outline of every change the model made, when asked for.
    if (state.outcome && $("showDrift").checked && viewName() !== "original") {
      ovCtx.drawImage(state.outcome.driftLayer, 0, 0);
    }
    return;
  }
  if ($("showLocked").checked) {
    // Locked view: darken only the locked area; the painted area keeps its true colours.
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

function useScenarioMask() {
  const run = currentRun();
  if (!run) return;
  const img = new Image();
  img.onload = () => {
    const tmp = document.createElement("canvas");
    tmp.width = maskCanvas.width;
    tmp.height = maskCanvas.height;
    const t = tmp.getContext("2d");
    t.drawImage(img, 0, 0, tmp.width, tmp.height);
    const src = t.getImageData(0, 0, tmp.width, tmp.height);
    const out = maskCtx.createImageData(tmp.width, tmp.height);
    for (let i = 0; i < src.data.length; i += 4) {
      const on = src.data[i] > 127; // white = editable
      out.data[i] = out.data[i + 1] = out.data[i + 2] = 255;
      out.data[i + 3] = on ? 255 : 0;
    }
    maskCtx.putImageData(out, 0, 0);
    updateMaskInfo();
    renderOverlay();
    $("selectMsg").textContent = "";
  };
  img.src = run.mask;
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
  $("selectPanel").hidden = step !== "select";
  $("confirmPanel").hidden = step !== "confirm";
  $("resultPanel").hidden = step !== "result";
  const editing = step === "select";
  for (const id of ["sample", "scenario", "instruction", "brushSize", "modePaint", "modeErase", "clearMask", "useScenarioMask"]) {
    $(id).disabled = !editing;
  }
  overlay.classList.toggle("locked", !editing);
  renderOverlay();
}

function makeCard() {
  const run = currentRun();
  const typed = $("instruction").value.trim();
  if (state.editableShare === 0) {
    $("selectMsg").textContent = "Paint the area you want to change first, or use the scenario's mask.";
    return;
  }
  if (!typed) {
    $("selectMsg").textContent = "Write what you want to change.";
    return;
  }
  renderCard(run, typed);
  setStep("confirm");
}

function renderCard(run, typed) {
  const c = run.card;
  const card = $("card");
  card.innerHTML = "";
  const rows = [
    ["You asked", typed],
    ["Will change", `${c.target}: ${c.change}`],
    ["Area that may change", `${(state.editableShare * 100).toFixed(1)}% of the image (the area you painted)`],
    ["Will be kept", c.keep],
  ];
  const dl = document.createElement("dl");
  for (const [k, v] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = v;
    dl.append(dt, dd);
  }
  card.appendChild(dl);

  if (c.unclear && c.unclear.length) {
    const box = document.createElement("div");
    box.className = "unclear";
    const h = document.createElement("strong");
    h.textContent = "Check before confirming: your instruction is unclear";
    const ul = document.createElement("ul");
    for (const u of c.unclear) {
      const li = document.createElement("li");
      li.textContent = u;
      ul.appendChild(li);
    }
    box.append(h, ul);
    card.appendChild(box);
  }

  if (typed.toLowerCase() !== c.instruction.toLowerCase()) {
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = `Simulation note: this card was pre-recorded for "${c.instruction}". Your wording is shown above, but the card does not read it.`;
    card.appendChild(note);
  }
  const src = document.createElement("p");
  src.className = "muted";
  src.textContent = `Source: ${c.source}.`;
  card.appendChild(src);
}

function confirmEdit() {
  if (state.step !== "confirm") return; // the result step is reachable only from here
  const run = currentRun();
  state.confirmed = {
    runId: run.id,
    instruction: $("instruction").value.trim(),
    editableShare: state.editableShare,
  };
  const img = new Image();
  img.onload = () => {
    const tmp = document.createElement("canvas");
    tmp.width = imageCanvas.width;
    tmp.height = imageCanvas.height;
    const t = tmp.getContext("2d");
    t.drawImage(img, 0, 0, tmp.width, tmp.height);
    state.outcome = enforceLock(t.getImageData(0, 0, tmp.width, tmp.height));
    state.kept = false;
    $("resultMsg").textContent = "";
    document.querySelector('input[name="view"][value="final"]').checked = true;
    setStep("result");
    reportDrift();
    showView();
  };
  img.onerror = () => { $("selectMsg").textContent = "Could not load the recorded result."; };
  img.src = run.result;
}

// The lock is enforced here, outside the model: every pixel the user did not paint is
// copied back from the original, whatever the model returned. Pixels that differed are
// counted as blocked changes ("drift").
function enforceLock(raw) {
  const orig = state.original.data;
  const out = raw.data;
  const mask = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
  const final = new ImageData(new Uint8ClampedArray(out), raw.width, raw.height);
  const drift = new ImageData(raw.width, raw.height);
  const blocked = new Uint8Array(raw.width * raw.height); // every pixel the model changed
  let driftCount = 0, editedCount = 0, lockedCount = 0;
  for (let i = 0; i < out.length; i += 4) {
    const changed = out[i] !== orig[i] || out[i + 1] !== orig[i + 1] || out[i + 2] !== orig[i + 2];
    if (mask[i + 3] > 0) {
      if (changed) {
        editedCount++;
        blocked[i / 4] = 1; // outlined too: every change the model made is circled in red
      }
      continue;
    }
    lockedCount++;
    if (changed) {
      driftCount++;
      blocked[i / 4] = 1;
    }
    final.data[i] = orig[i]; final.data[i + 1] = orig[i + 1]; final.data[i + 2] = orig[i + 2]; final.data[i + 3] = orig[i + 3];
  }
  // Outline every changed region in red (allowed and blocked), so colours inside stay true.
  const w = raw.width, h = raw.height;
  const r = OUTLINE_RADIUS;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!blocked[y * w + x]) continue;
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
        !blocked[y * w + x - 1] || !blocked[y * w + x + 1] || !blocked[(y - 1) * w + x] || !blocked[(y + 1) * w + x];
      if (!edge) continue;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue; // round brush
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = (ny * w + nx) * 4;
          drift.data[j] = 207; drift.data[j + 1] = 34; drift.data[j + 2] = 46; drift.data[j + 3] = 255;
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
  const o = state.outcome;
  const box = $("driftReport");
  const pct = o.lockedCount ? ((o.driftCount / o.lockedCount) * 100).toFixed(1) : "0.0";
  if (o.driftCount > 0) {
    box.className = "report warn-box";
    box.textContent = `The model also changed ${o.driftCount.toLocaleString()} pixels outside the area you painted (${pct}% of the locked area). They were put back from the original, so only your painted area changed. Compare "Model output" with "Final" to see what was blocked.`;
  } else if (o.editedCount > 0) {
    box.className = "report ok-box";
    box.textContent = `The model changed only the area you painted (${o.editedCount.toLocaleString()} pixels). Nothing outside it changed.`;
  } else {
    box.className = "report";
    box.textContent = "The model made no visible change inside the area you painted.";
  }
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
  $("resultMsg").textContent = "Kept for this session. Saving versions to come back to is planned.";
}

function backToOriginal() {
  if (state.step !== "result") return;
  state.outcome = null;
  state.kept = false;
  imgCtx.putImageData(state.original, 0, 0);
  $("card").innerHTML = "";
  setStep("select");
  $("selectMsg").textContent = "Back to the original image. Your painted area is kept, so you can adjust it and try again.";
}

function goBack() {
  $("card").innerHTML = "";
  setStep("select");
}

function restart() {
  state.confirmed = null;
  state.outcome = null;
  state.kept = false;
  if (state.original) imgCtx.putImageData(state.original, 0, 0);
  $("resultMsg").textContent = "";
  $("card").innerHTML = "";
  clearMask();
  onScenarioChange();
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
$("scenario").addEventListener("change", onScenarioChange);
$("useScenarioMask").addEventListener("click", useScenarioMask);
$("makeCard").addEventListener("click", makeCard);
$("confirmBtn").addEventListener("click", confirmEdit);
$("backBtn").addEventListener("click", goBack);
$("restartBtn").addEventListener("click", restart);
$("keepBtn").addEventListener("click", keepResult);
$("undoBtn").addEventListener("click", backToOriginal);
$("showDrift").addEventListener("change", renderOverlay);
for (const r of document.querySelectorAll('input[name="view"]')) r.addEventListener("change", showView);

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
