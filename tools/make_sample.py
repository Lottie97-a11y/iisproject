"""Draw the sample image used by the prototype (samples/room.png).

    pip install pillow
    python tools/make_sample.py
    python tools/embed_samples.py

A simple flat room scene drawn in code, so the sample has a known origin. It holds the
objects used in the storyboards: a rug, a cat sitting on it, a table, and a vase of roses
on the table, plus a window as background. Each object uses its own flat colours (no
anti-aliasing), so tools/make_mocks.py can find every object by colour.
"""
import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "samples", "room.png")
W, H = 640, 480

# Colours, shared with tools/make_mocks.py
WALL = (236, 226, 208)
FLOOR = (196, 164, 124)
SKY = (178, 216, 240)
FRAME = (250, 250, 245)
RUG_EDGE = (214, 172, 86)
RUG = (176, 52, 52)
TABLE = (122, 82, 46)
VASE = (60, 130, 160)
STEM = (70, 130, 70)
ROSE = (214, 40, 80)
ROSE_LIGHT = (236, 110, 140)
CAT = (226, 140, 58)
CAT_STRIPE = (178, 96, 34)
CAT_DARK = (40, 34, 30)
CAT_PINK = (240, 150, 160)


def draw():
    img = Image.new("RGB", (W, H), WALL)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 300, W, H], fill=FLOOR)                       # floor

    d.rectangle([70, 60, 230, 200], fill=FRAME)                   # window
    d.rectangle([80, 70, 220, 190], fill=SKY)
    d.rectangle([147, 70, 153, 190], fill=FRAME)
    d.rectangle([80, 127, 220, 133], fill=FRAME)

    d.ellipse([40, 340, 400, 470], fill=RUG_EDGE)                 # rug
    d.ellipse([56, 352, 384, 458], fill=RUG)

    d.rectangle([420, 250, 610, 266], fill=TABLE)                 # table
    d.rectangle([436, 266, 450, 400], fill=TABLE)
    d.rectangle([580, 266, 594, 400], fill=TABLE)

    d.line([(500, 150), (488, 118)], fill=STEM, width=4)          # roses
    d.line([(510, 150), (512, 108)], fill=STEM, width=4)
    d.line([(520, 150), (536, 120)], fill=STEM, width=4)
    for cx, cy in [(486, 112), (512, 100), (538, 114)]:
        d.ellipse([cx - 14, cy - 14, cx + 14, cy + 14], fill=ROSE)
        d.ellipse([cx - 6, cy - 6, cx + 6, cy + 6], fill=ROSE_LIGHT)
    d.rectangle([498, 150, 522, 172], fill=VASE)                  # vase
    d.ellipse([480, 166, 540, 250], fill=VASE)

    d.ellipse([160, 360, 240, 384], fill=CAT)                     # cat: tail
    d.ellipse([170, 330, 280, 420], fill=CAT)                     # body
    d.rectangle([200, 345, 250, 352], fill=CAT_STRIPE)
    d.rectangle([196, 365, 254, 372], fill=CAT_STRIPE)
    d.polygon([(200, 300), (206, 262), (226, 290)], fill=CAT)     # ears
    d.polygon([(260, 290), (280, 262), (284, 300)], fill=CAT)
    d.ellipse([196, 276, 288, 350], fill=CAT)                     # head
    d.ellipse([220, 304, 232, 316], fill=CAT_DARK)                # eyes
    d.ellipse([252, 304, 264, 316], fill=CAT_DARK)
    d.polygon([(236, 324), (248, 324), (242, 332)], fill=CAT_PINK)  # nose
    return img


if __name__ == "__main__":
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    draw().save(OUT)
    print("wrote", os.path.normpath(OUT))
