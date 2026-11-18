"""Draw the three pre-recorded "model outputs" used by the prototype (simulated).

    pip install pillow
    python tools/make_mocks.py
    python tools/embed_runs.py

No image model is called. Each result starts from samples/room.png and is changed in
code, so it lines up pixel for pixel with the original and the lock-and-paste-back step
can compare them exactly. Objects are found by their flat colours (see make_sample.py).
Each case gets its own folder in recorded_runs/:

    mask.png    white = area the user means to edit, black = locked
    result.png  the simulated model output (same size as the original)
    card.json   the edit card shown before anything runs

Cases (they follow the storyboards)
    a_rug_blue      "make only the rug blue, keep everything else unchanged": only the rug changes
    b_rug_drift     "make the rug blue": the "model" also changes locked areas
                    (the cat becomes a grey tabby, the vase and roses disappear)
    c_roses_vague   "make it brighter": the card flags what is unclear
"""
import json
import os
import sys

from PIL import Image, ImageChops, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import make_sample as S  # noqa: E402  (shared colours)

ROOT = os.path.join(HERE, "..")
SAMPLE = "room.png"
ORIGINAL = os.path.join(ROOT, "samples", SAMPLE)
OUT = os.path.join(ROOT, "recorded_runs")
MARGIN = 6  # a painted mask is never exact, so leave a small border round the object

CAT_COLOURS = [S.CAT, S.CAT_STRIPE, S.CAT_DARK, S.CAT_PINK]
KEEP_ALL = "everything outside the painted area (cat, table, vase, roses, window, wall, floor)"


def pixels(img):
    """All pixels in order (works with old and new Pillow)."""
    get = getattr(img, "get_flattened_data", None) or img.getdata
    return list(get())


def colour_mask(img, colours):
    """White where the pixel has one of the given colours, black elsewhere."""
    wanted = set(colours)
    m = Image.new("L", img.size, 0)
    m.putdata([255 if p in wanted else 0 for p in pixels(img)])
    return m


def grow(mask, px=MARGIN):
    return mask.filter(ImageFilter.MaxFilter(2 * px + 1))


def recolour(img, mapping, within=None):
    """Swap colours (old -> new), only inside `within` when a mask is given."""
    out = img.copy()
    src = pixels(img)
    allowed = pixels(within) if within else [255] * len(src)
    out.putdata([mapping.get(p, p) if a else p for p, a in zip(src, allowed)])
    return out


def rug_mask(orig):
    # The user paints over the rug and round the cat, so the cat itself stays locked.
    painted = grow(colour_mask(orig, [S.RUG, S.RUG_EDGE]))
    return ImageChops.subtract(painted, colour_mask(orig, CAT_COLOURS))


BLUE_RUG = {S.RUG: (46, 84, 170), S.RUG_EDGE: (150, 182, 222)}


def case_a(orig):
    mask = rug_mask(orig)
    result = recolour(orig, BLUE_RUG, within=mask)
    card = {
        "instruction": "make only the rug blue, keep everything else unchanged",
        "target": "the rug",
        "change": "colour: red to blue",
        "keep": KEEP_ALL,
        "unclear": [],
    }
    return result, mask, card


def case_b(orig):
    mask = rug_mask(orig)
    result = recolour(orig, BLUE_RUG, within=mask)
    # Drift into locked areas, the failure A1 describes: details the user was happy with change.
    result = recolour(result, {S.CAT: (150, 150, 156), S.CAT_STRIPE: (92, 92, 98)})   # cat turns grey tabby
    result = recolour(result, {c: S.WALL for c in (S.VASE, S.ROSE, S.ROSE_LIGHT, S.STEM)})  # vase and roses vanish
    card = {
        "instruction": "make the rug blue",
        "target": "the rug",
        "change": "colour: red to blue",
        "keep": KEEP_ALL,
        "unclear": [],
    }
    return result, mask, card


def case_c(orig):
    mask = grow(colour_mask(orig, [S.ROSE, S.ROSE_LIGHT]))
    result = recolour(orig, {S.ROSE: (250, 92, 124), S.ROSE_LIGHT: (255, 196, 210)}, within=mask)
    card = {
        "instruction": "make it brighter",
        "target": "the roses (the area you painted)",
        "change": "brightness: lighter, more vivid petals",
        "keep": KEEP_ALL,
        "unclear": [
            "'it' could mean the roses, the vase or the whole room; the card assumes the painted roses",
            "'brighter' could mean a lighter colour or more light in the room; the card assumes lighter petals",
        ],
    }
    return result, mask, card


CASES = {
    "a_rug_blue": ("A: normal edit", case_a),
    "b_rug_drift": ("B: model changes locked areas", case_b),
    "c_roses_vague": ("C: vague instruction", case_c),
}


def main():
    orig = Image.open(ORIGINAL).convert("RGB")
    for name, (title, make) in CASES.items():
        result, mask, card = make(orig)
        folder = os.path.join(OUT, name)
        os.makedirs(folder, exist_ok=True)
        result.save(os.path.join(folder, "result.png"))
        mask.save(os.path.join(folder, "mask.png"))
        card = {"id": name, "title": title, "sample": SAMPLE, "status": "simulated",
                "source": "drawn in code by tools/make_mocks.py, no model called", **card}
        with open(os.path.join(folder, "card.json"), "w", encoding="utf-8") as f:
            json.dump(card, f, indent=2)
        print("wrote", os.path.normpath(folder))


if __name__ == "__main__":
    main()
