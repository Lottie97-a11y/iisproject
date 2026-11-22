// Rule-based stand-ins for the AI parts of the prototype (simulated, no model is called).
//
// 1. readInstruction(): finds which object(s) the user's words name and what change they
//    ask for (a colour, or brighter / darker). It stands in for a language model.
// 2. SCENE: the objects in samples/room.png. Every object is drawn in its own flat colours
//    (see tools/make_sample.py), so each pixel can be assigned to an object by its colour.
//    This stands in for a segmentation model.
// 3. editPixel(): draws the edit in code. It stands in for an image-editing model.

window.SCENE = {
  "room.png": {
    background: [236, 226, 208], // wall colour, used when something "vanishes"
    objects: [
      // colours: every colour of the object; recolour: the colours an edit changes
      { id: "rug", words: ["rug", "carpet", "mat"], colours: [[214, 172, 86], [176, 52, 52]] },
      { id: "cat", words: ["cat", "kitten"], colours: [[226, 140, 58], [178, 96, 34], [40, 34, 30], [240, 150, 160]],
        recolour: [[226, 140, 58], [178, 96, 34]] },
      { id: "vase", words: ["vase"], colours: [[60, 130, 160]] },
      { id: "roses", words: ["roses", "rose", "flowers", "flower"], colours: [[214, 40, 80], [236, 110, 140], [70, 130, 70]],
        recolour: [[214, 40, 80], [236, 110, 140]] },
      { id: "table", words: ["table"], colours: [[122, 82, 46]] },
      { id: "window", words: ["window"], colours: [[250, 250, 245], [178, 216, 240]] },
      { id: "wall", words: ["wall", "walls"], colours: [[236, 226, 208]], stuff: true }, // stuff = background, as a segmentation model would label it
      { id: "floor", words: ["floor"], colours: [[196, 164, 124]], stuff: true },
    ],
    // Unwanted changes a whole-image model also makes (as in my Lab 3 Test B), in every mode.
    // Each applies only if none of its objects is meant to change (see simulateModel()).
    drift: [
      { objects: ["cat"], map: [[[226, 140, 58], [150, 150, 156]], [[178, 96, 34], [92, 92, 98]]] }, // grey tabby
      { objects: ["vase", "roses"], vanish: true }, // the vase of roses disappears
    ],
  },
};

const COLOUR_WORDS = {
  red: [200, 40, 40], blue: [46, 84, 170], green: [50, 140, 70], yellow: [235, 200, 40],
  orange: [230, 130, 40], purple: [120, 60, 160], pink: [235, 120, 170], black: [35, 35, 35],
  white: [245, 245, 245], grey: [140, 140, 140], gray: [140, 140, 140], brown: [120, 80, 45],
};
const LIGHTER_WORDS = ["brighter", "lighter", "brighten", "lighten"];
const DARKER_WORDS = ["darker", "darken"];
const VAGUE_WORDS = ["it", "this", "that", "them", "everything"];

// Reads the instruction with keyword rules. Returns the named objects, the colour and/or
// tone change, and any vague words, so the edit card can show what was understood.
window.readInstruction = function (text, scene) {
  const words = text.toLowerCase().match(/[a-z]+/g) || [];
  const targets = scene.objects.filter((o) => o.words.some((w) => words.includes(w))).map((o) => o.id);
  const colourName = Object.keys(COLOUR_WORDS).find((c) => words.includes(c)) || null;
  const tone = words.some((w) => LIGHTER_WORDS.includes(w)) ? "lighter"
    : words.some((w) => DARKER_WORDS.includes(w)) ? "darker" : null;
  const vague = VAGUE_WORDS.filter((w) => words.includes(w));
  return { targets, colourName, colour: colourName ? COLOUR_WORDS[colourName] : null, tone, vague };
};

// Pixel -> object index (or -1) for the whole image, by exact colour.
window.objectMap = function (imageData, scene) {
  const index = new Map();
  scene.objects.forEach((o, k) => o.colours.forEach((c) => index.set(c.join(","), k)));
  const d = imageData.data;
  const map = new Int8Array(d.length / 4).fill(-1);
  for (let i = 0; i < d.length; i += 4) {
    const k = index.get(`${d[i]},${d[i + 1]},${d[i + 2]}`);
    if (k !== undefined) map[i / 4] = k;
  }
  return map;
};

// New colour for one pixel. A colour keeps the pixel's light and shade, so a two-tone rug
// becomes two tones of blue; "brighter" / "darker" adjust the existing colour.
window.editPixel = function (r, g, b, parsed) {
  let out = [r, g, b];
  if (parsed.colour) {
    const light = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const f = 0.6 + 0.8 * light;
    out = parsed.colour.map((c) => Math.max(0, Math.min(255, Math.round(c * f))));
  }
  if (parsed.tone === "lighter") out = out.map((c) => Math.round(c + (255 - c) * 0.4));
  if (parsed.tone === "darker") out = out.map((c) => Math.round(c * 0.6));
  return out;
};

// Can an edit change this pixel of this object? (Eyes and nose keep their colour.)
window.isRecolourable = function (obj, r, g, b) {
  const list = obj.recolour || obj.colours;
  return list.some((c) => c[0] === r && c[1] === g && c[2] === b);
};
