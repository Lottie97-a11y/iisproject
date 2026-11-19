# Region-locked image editing (IIS A2 prototype)

Prose word count: 856 (code and commands not counted)

When people use text prompts to edit part of an AI-generated image, the model can change other parts they wanted to keep. Building on my A1 literature review, this browser prototype explores letting users lock those areas so the system preserves them during editing.

Live page: https://lottie97-a11y.github.io/iisproject/

## Project status

| Part | Status |
| --- | --- |
| Sample image on a canvas, browser only | implemented |
| Mask painting (brush size, erase, clear); painted area in blue, optional dark view of the locked area with the painted area in its true colours | implemented |
| Confirm / go back: the result step opens only after Confirm | implemented |
| Edit card text, fixed per scenario | simulated |
| Three model results, drawn in code | simulated |
| Pasting the original pixels back outside the painted area after generation | implemented |
| Counting and outlining blocked changes; switching between final, model output and original | implemented |
| Keep the result / back to the original image | implemented |
| Version history of kept results | planned |
| Live image model | not in scope |

## Technology stack

- **HTML, CSS and plain JavaScript, no server**: runs in any browser and on GitHub Pages, with nothing to install and no API key.
- **HTML canvas**: holds the image and the mask; the lock-and-paste-back step compares its pixels.
- **Python + Pillow (tools only)**: draw the sample and mock images and embed them in `static/`.
- Undecided: the edit card is a fixed file per scenario; if time allows, simple keyword rules will fill it from the instruction.

## Running or inspecting

Open `index.html` in a browser, or use the live page.

To regenerate the images (needs `pip install pillow`):

```
python tools/make_sample.py
python tools/embed_samples.py
python tools/make_mocks.py
python tools/embed_runs.py
```

## Development record

The first two changes are in commit [4407188](https://github.com/Lottie97-a11y/iisproject/commit/4407188fc5e18b5c86adff5d8b61785b52c29a58).

- **16 Nov – Page skeleton.** Sample image on a canvas; unbuilt parts labelled on the page. Why: the mask needs a second canvas layer, and later steps read pixels. Checked: the house sample appeared as drawn.
- **16 Nov – Browser-only page.** The first version needed Python installed just to view it. Of Claude's three options (keep the server, Codespaces, browser-only), I chose browser-only, as the prototype needs no server. Images are embedded so canvas pixels stay readable from disk. Checked: opened from disk in Edge with no server; the image loaded, the console showed no errors, and reading a canvas pixel returned the sky colour rather than a security error. The live GitHub Pages link also opened.
- **17 Nov – Mask painting, edit card, confirm / go back.** Why: the user, not the model, decides what may change, and nothing runs until they have checked the card. Checked: the brush, brush size, erase and clear worked; the card showed the planned edit before anything ran; painting and the instruction box were locked while it was shown; "Go back" kept my mask; the result step opened only after Confirm; and scenario C's card showed the yellow "instruction is unclear" box.
- **18 Nov – Room scene (rug, cat, table, vase of roses).** Why: it is more complex and matches my storyboards and Lab 3 tests, where recolouring the rug also changed the cat and the vase. The three mocks were redrawn to match. Checked: the house sample had worked before I replaced it, and the three room mocks looked right (rug only; rug plus a grey cat and a missing vase; brighter roses).
- **18 Nov – Whole image visible by default.** Greying out every unpainted area darkened the picture and made it hard to judge, so painted areas are now tinted blue and the grey view is optional. Unpainted areas stay locked. Checked: the page opens with no grey overlay and marks only what I paint.
- **18 Nov – Result step: lock enforced after generation.** Outside the painted area the original pixels are pasted back, whatever the model returned; changed pixels there are counted, reported and outlined in red, and "Back to original" undoes the edit. Why: the lock must not depend on the model obeying. Checked: TODO.
- **19 Nov – Clearer locked view.** When I ticked "Show locked area", the grey was too light, and the blue tint on top turned the painted rug purple, so I could not see its true colours. I asked for a darker grey and for the painted area to keep its original colours in this view. Checked: on my computer, the painted area kept its original colours while the locked areas were darkened.

## AI assistance

- **Claude** wrote the code (`index.html`, `static/`, `tools/`) and drafted this README from my plan and decisions; the project description is adapted in my own words.
- My decisions: a browser-only page rather than a server; simulated results rather than a live model; a room scene and scenarios that follow my storyboards.
- One change to Claude's design: its first version greyed out everything I had not painted. This hid the whole image, so I asked for a blue tint with an optional grey view.

## Additional files

- `samples/room.png`: the sample image, drawn in code by `tools/make_sample.py`. It replaced the first sample, `house.png`.
- `recorded_runs/`: three simulated results (rug only; rug plus unwanted changes to the cat and vase; a vague "make it brighter"), each with a mask, a result and an edit card, drawn by `tools/make_mocks.py`. No model is called.
- `static/samples.js` and `static/recorded_runs.js`: generated copies the page reads; do not edit by hand.
- No ZIP file.
