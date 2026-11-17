"""Draw the sample image used by the prototype (samples/house.png).

    pip install pillow
    python tools/make_sample.py

A simple flat scene drawn in code, so the sample has a known origin and contains
separate objects (house, door, window, tree, sun) that a user can choose to edit.
"""
import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "samples", "house.png")
W, H = 640, 480


def draw():
    img = Image.new("RGB", (W, H), (178, 216, 240))           # sky
    d = ImageDraw.Draw(img)
    d.rectangle([0, 330, W, H], fill=(120, 180, 90))            # grass
    d.ellipse([520, 40, 590, 110], fill=(250, 210, 80))         # sun
    d.rectangle([180, 200, 400, 360], fill=(235, 220, 190))     # house wall
    d.polygon([(160, 205), (290, 110), (420, 205)], fill=(170, 70, 60))  # roof
    d.rectangle([265, 270, 315, 360], fill=(110, 75, 50))       # door
    d.ellipse([302, 312, 309, 319], fill=(230, 200, 90))        # door knob
    d.rectangle([200, 230, 250, 275], fill=(150, 200, 230), outline=(90, 90, 90), width=3)  # window
    d.rectangle([330, 230, 380, 275], fill=(150, 200, 230), outline=(90, 90, 90), width=3)  # window
    d.rectangle([488, 260, 508, 360], fill=(110, 80, 55))       # tree trunk
    d.ellipse([440, 170, 556, 280], fill=(60, 130, 70))         # tree crown
    return img


if __name__ == "__main__":
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    draw().save(OUT)
    print("wrote", os.path.normpath(OUT))
