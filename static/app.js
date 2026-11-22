// Region-locked image editing: browser-only prototype.
//
// Step 1 (select):  the user writes an instruction and paints the editable area.
// Step 2 (confirm): the user chooses a mode; an edit card, built by rules from the words,
//                   the painting and the mode, says what will change and what is kept, and
//                   flags mismatches. Changing the mode rebuilds the card. Nothing runs
//                   until the user confirms; "Go back" returns to step 1.
// Step 3 (result):  reached only from the Confirm button. The simulated model makes its
//                   edit; outside the permitted scope the original pixels are pasted back, so
//                   the lock holds even when the model changes too much. Blocked changes
//                   are counted and reported. Red outlines mark edits, green outlines mark
//                   changes the lock reversed.
//
// Three modes: which pixels the confirmed edit may change.
//   A  whole objects: every object the brush touches changes as a whole
//      (wall and floor only where painted)
//   B  named and painted: only the objects the words name, only where painted
//   C  painting: everything painted, whatever it is
// In every mode the simulated model also changes things it was not asked to (like my Lab 3
// Test B: the cat turns grey, the vase of roses vanishes); the lock puts those back.
//
// Simulated parts (static/rules.js): the instruction is read by keyword rules and the edit
// is drawn by code. No AI model is called. The lock and its checks are real code.

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
const BACKGROUND = new Set(["wall", "floor"]); // changed only where painted, never as a whole
const MIN_TOUCH = 40; // an object counts as painted only from this many pixels (brush edges)
const MIN_TOUCH_BG = 500; // wall and floor surround every object, so they need more

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
  confirmed: null,    // what the user confirmed: { mode, instruction, parsed }
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
    state.scene = window.SCENE[sample.name] || null;
    state.objMap = state.scene ? window.objectMap(state.original, state.scene) : null;
    if (state.scene) { // page 1: name the two classes the 40 / 500 pixel rule refers to
      const ids = state.scene.objects.map((o) => o.id);
      $("countClasses").textContent = `Objects: ${listNames(ids.filter((id) => !BACKGROUND.has(id)))}. `
        + `Background: ${listNames(ids.filter((id) => BACKGROUND.has(id)))}.`;
    }
    $("selectMsg").textContent = state.scene ? "" : "This image has no object list, so the modes cannot run.";
    clearMask();
  };
  img.onerror = () => { $("loadMsg").textContent = `Could not load ${sample.name}.`; };
  img.src = sample.src;
}

const MODE_HELP = {
  A: "Changes every object your brush touches (at least 40 pixels of it), as a whole. Wall and floor change only where you painted.",
  B: "Changes only the objects your words name, and only where you painted them.",
  C: "Changes everything you painted, whatever it is.",
};

function updateModeHelp() {
  $("modeHelp").textContent = MODE_HELP[$("editMode").value] || "";
}

function updateInputGuide() {
  const typed = $("instruction").value.trim();
  const painted = state.editableShare > 0;
  $("makeCard").disabled = state.step !== "select" || !state.scene || !typed || !painted;

  let message;
  if (!typed) {
    message = painted
      ? "Your selection is saved. No instruction entered yet. Describe the change you want."
      : "No instruction entered yet. Describe your edit and paint the area you want to change.";
  } else if (!painted) {
    const targets = state.scene ? window.readInstruction(typed, state.scene).targets : [];
    message = targets.length
      ? `Your instruction names ${listNames(targets)}. Paint the area you want to change.`
      : "Paint the area you want to change.";
  } else {
    message = "Your instruction and selection are ready. Next, choose a mode.";
  }
  if ($("inputGuide").textContent !== message) $("inputGuide").textContent = message;
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
  const pct = (state.editableShare * 100).toFixed(1);
  $("maskInfo").textContent = editable === 0
    ? "Brush over the image to make a selection."
    : `Brush strokes cover ${pct}% of the image.`;
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
  $("selectPanel").hidden = step !== "select";
  $("confirmPanel").hidden = step !== "confirm";
  $("resultPanel").hidden = step !== "result";
  const editing = step === "select";
  for (const id of ["sample", "instruction", "brushSize", "modePaint", "modeErase", "clearMask"]) {
    $(id).disabled = !editing;
  }
  overlay.classList.toggle("locked", !editing);
  $("editMode").disabled = step !== "confirm";
  updateInputGuide();
  renderOverlay();
}

function objName(id) { return `the ${id}`; }
function listNames(ids) {
  const n = ids.map(objName);
  return n.length <= 1 ? (n[0] || "") : `${n.slice(0, -1).join(", ")} and ${n.at(-1)}`;
}

// Counts, for the card: painted pixels per object, and pixels of the named objects.
function analyse(parsed) {
  const mask = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
  const objs = state.scene.objects;
  const paintedBy = new Map(), totalBy = new Map();
  let painted = 0, overlap = 0;
  for (let p = 0; p < state.objMap.length; p++) {
    const k = state.objMap[p];
    const id = k >= 0 ? objs[k].id : null;
    if (id) totalBy.set(id, (totalBy.get(id) || 0) + 1);
    if (mask[p * 4 + 3] > 0) {
      painted++;
      if (id) paintedBy.set(id, (paintedBy.get(id) || 0) + 1);
      if (id && parsed.targets.includes(id)) overlap++;
    }
  }
  const targetTotal = parsed.targets.reduce((s, id) => s + (totalBy.get(id) || 0), 0);
  // painted objects the words do not name (ignore slivers under 40 px at an edge)
  const others = [...paintedBy.entries()].filter(([id, n]) => n >= 40 && !parsed.targets.includes(id)
    && id !== "wall" && id !== "floor").map(([id]) => id);
  // painted objects, wall and floor included; under MIN_TOUCH pixels an object does not count
  const minFor = (id) => (BACKGROUND.has(id) ? MIN_TOUCH_BG : MIN_TOUCH);
  const paintedObjects = [...paintedBy.entries()].filter(([id, n]) => n >= minFor(id)).map(([id]) => id);
  const ignored = [...paintedBy.entries()].filter(([id, n]) => n < minFor(id));
  const touched = paintedObjects.filter((id) => !BACKGROUND.has(id)); // objects A changes whole
  // A changes wall and floor wherever painted, however little, so the card lists any of it
  const bgTouched = [...paintedBy.keys()].filter((id) => BACKGROUND.has(id));
  // share of each object that is painted, in per cent
  const share = Object.fromEntries([...paintedBy.entries()].map(([id, n]) => [id, Math.round((100 * n) / totalBy.get(id))]));
  return { painted, overlap, targetTotal, others, touched, bgTouched, paintedObjects, ignored, share };
}

// Step 2 advice (user's rules, 21 Nov), shown above the mode list:
//   the words name exactly the painted objects:
//     one object      -> suggest A (whole) or B (painted part)
//     several objects -> the same, with the painted share of each object
//   otherwise (words name none, other or more/fewer objects than painted):
//     one object      -> the object is not clear: suggest C
//     several objects -> the scope is not clear: suggest C
// Nothing painted except wall or floor: no advice.
function modeAdvice(parsed, a) {
  const painted = a.paintedObjects;
  if (!painted.length) return null;
  const named = parsed.targets;
  const same = named.length === painted.length && painted.every((id) => named.includes(id));
  const choice = (what) => `To change the whole of ${what}, choose A. To change only the parts you painted, choose B.`;
  if (same && painted.length === 1) {
    const name = objName(painted[0]);
    return { text: `You want to change ${name}. ${choice(name).replace("the parts", "the part")}` };
  }
  if (same) {
    const shares = painted.map((id) => `${objName(id)} ${a.share[id]}%`).join(", ");
    const bgNote = painted.some((id) => BACKGROUND.has(id)) ? " (In A, the wall and floor still change only where you painted.)" : "";
    return { text: `You want to change ${listNames(painted)}. Share of each object you painted: ${shares}. ${choice("these objects")}${bgNote}` };
  }
  if (painted.length === 1) {
    return { text: `You have not made clear which object to change. We suggest mode C, which changes exactly what you painted (${objName(painted[0])}).` };
  }
  return { text: `You have not made clear the scope of the change: you painted ${listNames(painted)}, but your words name ${named.length ? listNames(named) : "no object"}. We suggest mode C, which changes exactly what you painted.` };
}

function makeCard() {
  if ($("makeCard").disabled) return;
  const typed = $("instruction").value.trim();
  const parsed = window.readInstruction(typed, state.scene);
  const a = analyse(parsed);
  state.draft = { typed, parsed, a, advice: modeAdvice(parsed, a) };
  setStep("confirm");
  const box = $("modeAdvice"), adv = state.draft.advice;
  box.hidden = !adv;
  box.className = adv && adv.block ? "advice blocked" : "advice";
  box.textContent = adv ? adv.text : "";
  if (adv && a.ignored.length) { // only when something the brush touched was not counted
    const rule = document.createElement("small");
    rule.className = "advice-rule";
    const skipped = a.ignored.map(([id, n]) =>
      `${objName(id)} (${n} px, under ${BACKGROUND.has(id) ? `${MIN_TOUCH_BG} for the background` : MIN_TOUCH})`);
    rule.textContent = `Not counted as painted: ${skipped.join(", ")}.`;
    box.appendChild(rule);
  }
  showCardForMode();
}

// Step 2: the card follows the chosen mode; it is rebuilt whenever the mode changes.
function showCardForMode() {
  updateModeHelp();
  if (!state.draft) return;
  const locked = !!(state.draft.advice && state.draft.advice.block);
  $("editMode").disabled = locked;
  const mode = locked ? "" : $("editMode").value;
  if (locked) {
    $("editMode").value = "";
    $("card").innerHTML = "";
    $("confirmBtn").disabled = true;
    state.pending = null;
    $("modeHelp").textContent = "";
    return;
  }
  if (!mode) {
    $("card").innerHTML = "";
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "Choose a mode above to see what it will change.";
    $("card").appendChild(p);
    $("confirmBtn").disabled = true;
    state.pending = null;
    return;
  }
  renderCard(mode, state.draft.typed, state.draft.parsed, state.draft.a);
}

function renderCard(mode, typed, parsed, a) {
  const card = $("card");
  card.innerHTML = "";
  const block = [], warn = [];
  const change = [parsed.colourName && `colour to ${parsed.colourName}`, parsed.tone].filter(Boolean).join(", ");
  const named = parsed.targets.length ? listNames(parsed.targets) : "";
  const px = (n) => `${n.toLocaleString()} px`;

  if (!change) block.push("I could not find a change in your words. Name a colour (e.g. blue) or say brighter / darker.");
  if (mode === "B" && !named) {
    block.push(`I could not find an object in your words. Try: ${state.scene.objects.map((o) => o.words[0]).join(", ")}.`);
    if (parsed.vague.length) warn.push(`"${parsed.vague[0]}" does not say which object you mean.`);
  }
  let willChange = "";
  let willKeep = "everything you did not paint; if the model changes it, it is put back.";
  if (mode === "A") {
    // 21 Nov (user's design): A changes every object the brush touches, as a whole.
    const parts = [];
    if (a.touched.length) parts.push(`the whole of ${listNames(a.touched)}`);
    if (a.bgTouched.length) parts.push(`${listNames(a.bgTouched)} only where you painted`);
    willChange = parts.join("; ") || "nothing yet";
    willKeep = "every object your brush did not touch; if the model changes it, it is put back.";
    const missed = parsed.targets.filter((id) => !a.touched.includes(id) && !a.bgTouched.includes(id));
    const extra = a.touched.filter((id) => !parsed.targets.includes(id));
    if (missed.length) warn.push(`Your words name ${listNames(missed)}, but your brush did not touch ${missed.length > 1 ? "them" : "it"}. This mode changes what you touch, so ${listNames(missed)} will not change.`);
    if (a.touched.length > 1) {
      // 22 Nov: extra warning whenever the brush range will change more than one whole object
      warn.push(`Your brush touches ${a.touched.length} objects: ${listNames(a.touched)}. Mode A will change each of them as a whole`
        + (extra.length ? `, including ${listNames(extra)}, which your words do not name` : "")
        + `. If you meant only one object, go back and paint inside it, or choose B.`);
    } else if (named && extra.length) {
      warn.push(`Your brush also touched ${listNames(extra)}, which your words do not name. In this mode ${extra.length > 1 ? "they" : "it"} will change too, as a whole.`);
    }
  } else if (mode === "B") {
    willChange = named ? `${named}, only where you painted (${px(a.overlap)})` : "nothing yet";
    if (named) willKeep = `everything except the painted part of ${named}; if the model changes it, it is put back.`;
    if (named && a.overlap === 0) {
      block.push(`Your words are about ${named}, but your painting does not cover ${parsed.targets.length > 1 ? "them" : "it"}, so nothing would change. Paint ${named} or change your words.`);
    }
    if (named && a.others.length) warn.push(`You also painted ${listNames(a.others)}; ${a.others.length > 1 ? "they" : "it"} will not change, because your words do not name ${a.others.length > 1 ? "them" : "it"}.`);
  } else {
    willChange = `everything you painted (${px(a.painted)})`;
    if (named && a.overlap === 0) warn.push(`Your words name ${named}, but you did not paint ${parsed.targets.length > 1 ? "them" : "it"}. In this mode only the painted area changes, so ${named} will not.`);
    if (named && a.others.length) warn.push(`You also painted ${listNames(a.others)}, which your words do not name. In this mode ${a.others.length > 1 ? "they" : "it"} will change too.`);
  }

  const rows = [
    ["You asked", typed],
    ["Mode", `${mode}: ${MODE_HELP[mode]}`],
    ["Read from your words", `object: ${named || "none found"}; change: ${change || "none found"}`],
    ["Will change", willChange],
    ["Will be kept", willKeep],
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

  const box = (cls, title, items) => {
    const div = document.createElement("div");
    div.className = cls;
    const h = document.createElement("strong");
    h.textContent = title;
    const ul = document.createElement("ul");
    for (const it of items) {
      const li = document.createElement("li");
      li.textContent = it;
      ul.appendChild(li);
    }
    div.append(h, ul);
    card.appendChild(div);
  };
  if (block.length) box("blocked", "Cannot run yet", block);
  if (warn.length) box("unclear", "Check before confirming", warn);

  const note = document.createElement("p");
  note.className = "muted";
  note.textContent = "Simulated: your words are read by keyword rules (standing in for a language model) and the edit is drawn by code (standing in for an image model).";
  card.appendChild(note);

  $("confirmBtn").disabled = block.length > 0;
  state.pending = { mode, instruction: typed, parsed, touched: a.touched };
}

function confirmEdit() {
  if (state.step !== "confirm" || !state.pending || $("confirmBtn").disabled) return; // the result step is reachable only from here
  state.confirmed = state.pending;
  state.outcome = enforceLock(simulateModel(state.confirmed));
  state.kept = false;
  $("resultMsg").textContent = "";
  document.querySelector('input[name="view"][value="final"]').checked = true;
  setStep("result");
  reportDrift();
  showView();
}

// Simulated model (no model is called; rules in static/rules.js). Returns the image the
// "model" would produce for the chosen mode. enforceLock() then decides what the user gets.
// The confirmed scope of each mode: may pixel p change? Used by the model and by the lock.
function inScope(conf, p, painted) {
  const k = state.objMap[p];
  const id = k >= 0 ? state.scene.objects[k].id : null;
  if (conf.mode === "A") return id && !BACKGROUND.has(id) ? conf.touched.includes(id) : painted;
  if (conf.mode === "B") return painted && !!id && conf.parsed.targets.includes(id);
  return painted;
}

function simulateModel(conf) {
  const { mode, parsed } = conf;
  const orig = state.original.data;
  const out = new ImageData(new Uint8ClampedArray(orig), state.original.width, state.original.height);
  const mask = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
  const objs = state.scene.objects;
  const edited = new Uint8Array(orig.length / 4);
  const set = (i, c) => { out.data[i] = c[0]; out.data[i + 1] = c[1]; out.data[i + 2] = c[2]; };
  for (let i = 0; i < orig.length; i += 4) {
    const k = state.objMap[i / 4];
    const obj = k >= 0 ? objs[k] : null;
    const r = orig[i], g = orig[i + 1], b = orig[i + 2];
    if (!inScope(conf, i / 4, mask[i + 3] > 0)) continue;
    if (mode !== "C" && obj && !window.isRecolourable(obj, r, g, b)) continue; // eyes, outlines
    set(i, window.editPixel(r, g, b, parsed));
    edited[i / 4] = 1;
  }
  // Unwanted extra changes, as a real model makes (my Lab 3 Test B), in every mode. Objects
  // the edit is meant to change are left alone; the lock puts the rest back.
  const meant = new Set(mode === "A" ? conf.touched : parsed.targets);
  if (mode === "C") for (let p = 0; p < edited.length; p++) if (edited[p] && state.objMap[p] >= 0) meant.add(objs[state.objMap[p]].id);
  {
    for (const d of state.scene.drift) {
      if (d.objects.some((id) => meant.has(id))) continue;
      for (let i = 0; i < orig.length; i += 4) {
        const k = state.objMap[i / 4];
        if (k < 0 || edited[i / 4] || !d.objects.includes(objs[k].id)) continue;
        if (d.vanish) { set(i, state.scene.background); continue; }
        for (const [from, to] of d.map) {
          if (orig[i] === from[0] && orig[i + 1] === from[1] && orig[i + 2] === from[2]) set(i, to);
        }
      }
    }
  }
  return out;
}

// Enforce the confirmed scope independently of the model output.
function enforceLock(raw) {
  const orig = state.original.data;
  const out = raw.data;
  const mask = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
  const final = new ImageData(new Uint8ClampedArray(out), raw.width, raw.height);
  const drift = new ImageData(raw.width, raw.height);
  const changeKind = new Uint8Array(raw.width * raw.height);
  let driftCount = 0, editedCount = 0, lockedCount = 0;
  for (let i = 0; i < out.length; i += 4) {
    const changed = out[i] !== orig[i] || out[i + 1] !== orig[i + 1] || out[i + 2] !== orig[i + 2];
    const allowed = inScope(state.confirmed, i / 4, mask[i + 3] > 0);
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
  const o = state.outcome;
  const box = $("driftReport");
  const pct = o.lockedCount ? ((o.driftCount / o.lockedCount) * 100).toFixed(1) : "0.0";
  const conf = state.confirmed;
  const scope = conf.mode === "A" ? "the objects your brush touched"
    : conf.mode === "B" ? `the painted part of ${listNames(conf.parsed.targets)}` : "the area you painted";
  $("outlineKey").textContent = "Red marks edits kept in the final image. Green marks changes the lock reversed.";
  const offTarget = offTargetChanges();
  const pron = offTarget.length > 1 ? "them" : "it";
  const why = conf.mode === "A" ? `your brush touched ${pron}, so ${offTarget.length > 1 ? "they were" : "it was"} part of the edit` : "the lock cannot protect what you painted";
  if (o.driftCount > 0) {
    box.className = "report warn-box";
    box.textContent = `The model also changed ${o.driftCount.toLocaleString()} pixels outside ${scope} (${pct}% of the locked area). They were put back from the original, ${o.editedCount > 0 ? `so only ${scope} changed` : "so the image did not change"}. Compare "Model output" with "Final" to see what was blocked.`
      + (offTarget.length ? ` It also changed ${listNames(offTarget)}, which your words did not name: ${why}.` : "");
  } else if (offTarget.length) {
    box.className = "report note-box";
    box.textContent = `Only ${scope} changed (${o.editedCount.toLocaleString()} pixels), but it included ${listNames(offTarget)}, which your words did not name: ${why}.`;
  } else if (o.editedCount > 0) {
    box.className = "report ok-box";
    box.textContent = `The model changed only ${scope} (${o.editedCount.toLocaleString()} pixels). Nothing outside it changed.`;
  } else {
    box.className = "report";
    box.textContent = `The model made no visible change inside ${scope}.`;
  }
}

// Objects changed in the final image that the user's words did not name (modes A and C).
function offTargetChanges() {
  const { parsed } = state.confirmed;
  if (!parsed.targets.length) return [];
  const f = state.outcome.final.data, orig = state.original.data;
  const count = new Map();
  for (let i = 0; i < f.length; i += 4) {
    if (f[i] === orig[i] && f[i + 1] === orig[i + 1] && f[i + 2] === orig[i + 2]) continue;
    const k = state.objMap[i / 4];
    if (k < 0) continue;
    const id = state.scene.objects[k].id;
    if (!parsed.targets.includes(id) && id !== "wall" && id !== "floor") count.set(id, (count.get(id) || 0) + 1);
  }
  return [...count.entries()].filter(([, n]) => n >= 40).map(([id]) => id);
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

// Page 3 -> page 2: undo the edit and return to the mode and edit card, keeping the
// painting, the words and the chosen mode, so another mode can be tried on the same input.
function backToPrevious() {
  if (state.step !== "result") return;
  state.outcome = null;
  state.kept = false;
  imgCtx.putImageData(state.original, 0, 0);
  $("resultMsg").textContent = "";
  setStep("confirm");
  showCardForMode();
}

function goBack() {
  $("card").innerHTML = "";
  $("confirmBtn").disabled = false;
  setStep("select");
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
$("instruction").addEventListener("input", updateInputGuide);
$("editMode").addEventListener("change", showCardForMode);
$("makeCard").addEventListener("click", makeCard);
$("confirmBtn").addEventListener("click", confirmEdit);
$("backBtn").addEventListener("click", goBack);
$("restartBtn").addEventListener("click", restart);
$("keepBtn").addEventListener("click", keepResult);
$("undoBtn").addEventListener("click", backToPrevious);
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
updateModeHelp();
setStep("select");
