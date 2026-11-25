# Region-locked image editing

Prose word count: 1608 (code and commands not counted)

When people use text prompts to edit part of an AI-generated image, the model can change other parts they wanted to keep. Building on my A1 literature review, this browser prototype lets users lock those areas so the system preserves them. In the current version (V2.1), the user names or paints the objects to edit, chooses for each one whether to change only the painted part or the whole object, checks the highlighted scope, and the system restores every pixel outside it.

Live page: https://lottie97-a11y.github.io/iisproject/

## Project status (V2.1)

| Part | Status |
| --- | --- |
| Sample image on a canvas, browser only | implemented |
| Brush, erase, clear and brush size; painted area tinted blue; optional dimming of unpainted areas | implemented |
| Reading the instruction in English or Chinese, with different effects (a colour, brighter or darker) for different objects | simulated: keyword rules stand in for a language model |
| Candidates: objects the words name, or with at least 10% of their own area painted (wall and floor included) | implemented |
| A scope for each ticked object, Local (the painted part) or Whole object, highlighted on the canvas before applying | implemented |
| Unwanted changes by the model (the cat turns grey, the vase and roses vanish), and the original pixels pasted back outside the scope | the edit is simulated; the lock is implemented |
| Counts of edited and restored pixels; red outlines for edits, green for restored areas; final, simulated and original views | implemented |
| Back to selection, keep result (this session only), start over; light and dark themes; reduced motion respected | implemented |
| Version history of kept results | not in scope: one step back is enough to check a single edit |
| Live AI models | not in scope: live models need a paid API key, which a public page cannot keep private, so the edits are simulated |

## Technology stack

- **HTML, CSS and plain JavaScript on a canvas, no server**: runs in any browser and on GitHub Pages; only the theme choice is stored in the browser.
- `static/rules.js`: English and Chinese keyword rules and a colour-based object list stand in for a language model and a segmentation model; the edit is drawn by code in place of an image model.
- **Python + Pillow (tools only)**: draw the sample image and embed it in `static/`.

## Running or inspecting

Open `index.html` in a browser, or use the live page. Main case: type `地毯变蓝、猫变红`, paint a small stroke on the cat's back, press **Select scope**, choose **Whole object** for the rug and **Local** for the cat, then **Apply edits**. The tags `V1.0`, `V2.0` and `V2.1` mark each version (`git checkout V1.0` shows the three-mode version).

To redraw the sample image (needs `pip install pillow`):

```
python tools/make_sample.py
python tools/embed_samples.py
```

## Development record

### V1.0: three modes (16–22 Nov, tag `V1.0`)

- **16 Nov – Browser-only page** ([4407188](https://github.com/Lottie97-a11y/iisproject/commit/4407188fc5e18b5c86adff5d8b61785b52c29a58)). Codex had surveyed similar projects on GitHub beforehand. Of the ways to run it (a Python server, Codespaces or browser-only), I first chose a Python server, but it needed a Python environment, so I switched to browser-only. Checked: opened from disk in Edge with no server; the image loaded and a canvas pixel could be read.
- **17–18 Nov – Mask painting, edit card, room scene.** The user, not the model, decides what may change, and nothing runs until they confirm. I built and checked the page controls: brush size, clear all, erasing part of a stroke, the mask, moving between pages and submitting. The first design opened the image with everything masked, which hid the picture, so the page now opens unmasked. I replaced the demo image with a room scene that matches my use case, my storyboards and my Lab 3 tests, where recolouring the rug also changed the cat and the vase.
- **18–19 Nov – Lock enforced after the edit.** Outside the confirmed scope the original pixels are pasted back, whatever the model returns, so the lock does not depend on the model obeying. Checked: painting half the rug by hand, the final image kept only my painted area; I compared outlines 7, 5 and 3 px wide and chose 3.
- **20 Nov – Three modes instead of recorded scenarios.** Following my A1, I designed three modes: B used the words only, C the painting only, and A their overlap. Checked: Claude ran my test cases, and I also ran three to five cases myself. Testing showed two problems: no mode could change only part of an object, and C demanded precise painting, which is hard for users.
- **21–22 Nov – Modes revised; page prompts added.** Following the 20 Nov tests, A gained a rule to change a whole object, B a rule to change only the painted part, and C stayed the same. The mode is now chosen after painting and typing, and the page checks the input and suggests a mode from where the user painted: an object painted over a set share is taken as one to change whole, which suggests A, with different shares for objects and for the wall and floor. The shares were first fixed pixel counts, but testing showed blurred boundaries, and Claude's analysis showed that fixed counts would misjudge a close-up, so they became percentages (10% of an object, 5% of the wall or floor). After these changes Codex ran 108 checks and found 5 where a prompt conflicted with the action: too many patches had tangled the rules, and page 2 had too much text to read easily.

### V2.0–V2.1: a scope for each object (23 Nov)

- **23 Nov – V2.0: candidate list and a scope for each object** (tag `V2.0`). I redrew the flowchart of the editing process and dropped the three modes. After the user types and paints, the system matches the painted objects and the object, colour and brightness keywords in the instruction, and combines them into a list of candidate objects with a drop-down of the colours found; an object with at least 10% of its area painted joins the list, and each object can be edited locally or as a whole. Why: the problems of 21–22 Nov. The prompts contained errors, and real users do not always follow prompts, which causes bugs; I wanted a more direct display with less text. Checked: I ran ten cases myself. Codex ran 213 checks in eight areas (page and brush; instructions and whole-object editing; local editing per object; candidate thresholds; input and scope confirmation; mixed scopes; results; layout and display). Two failed, both from one instruction: the rug changed colour, but "提亮" (brighten) after the Chinese list comma was not applied to it, because punctuation splits the instruction; I recorded this as a limitation that a language model may fix. Cases I wrote with deliberate errors were reported as errors, as intended. Codex and I also found that "light green" and "blue green" are not read correctly: a modifier is ignored, and a second colour replaces the first; I recorded this as a limitation too. Small parts such as the cat's eyes cannot be edited, because colour rules stand in for a segmentation model; the page disables Local for them, so this limit is visible to the user. Claude reran the main case: 29,569 rug pixels and 1,077 cat pixels changed, and 6,813 pixels of the vase and roses were restored. Codex also reran four cases that had caused problems in V1.0, among the 213 checks: painting only the cat's eyes now disables Local, and nothing can be applied until a valid scope is chosen; grazing 60 cat pixels while painting the rug keeps the cat protected, and only the rug becomes a candidate; the 10% rule uses each object's own area, while the canvas shows coverage of the whole image, and both were checked; and with the cat and vase named but only the rug ticked, the final image restores the cat and vase that the simulated model changed.
- **23 Nov – V2.1: canvas workspace and themes** (tag `V2.1`). The canvas fills the window and resizes with a bottom control panel; the scope preview pulses while it is reviewed; light and dark themes follow the system setting, and animations stop when the system asks for reduced motion. I built it quickly in my first language, and AI changed the interface text to English, so instructions can still be written in either language. The brush strokes are now shown more clearly on the scope page. Checked: I switched themes and resized the window to check the layout.

## AI assistance

- **Claude** wrote the V1.0 code and drafted this README from my plan and decisions; the project description is in my own words. It also tested V1.0 changes in a headless browser, made the V1.0 diagram and storyboards in `docs/`, polished my language, made the brush strokes show more clearly on the V2.1 scope page, and drew the V2.1 storyboards from my flowchart.
- **Codex** updated the input guidance, outlines and whole-object selection in V1.0, implemented V2.0 and V2.1 from my flowchart, and tested them.
- **My decisions**: a browser-only page; simulated edits rather than live models; a room scene from my storyboards; three modes comparing words-led, painting-led and overlap editing; then a scope for each object, shown on the canvas rather than in text. I also ran part of the tests, redrew the V2.1 flowchart, and rewrote the development record in this README to give the reasons for each change.
- **Changes I made to Claude's design**: a blue tint instead of greying out everything unpainted; replacing the pre-recorded results, which ignored my painting, with the three modes; then the mode definitions, advice rules and warnings, and treating the wall and floor as whole areas in A.

## Additional files

- `README.zh-CN.md`: a guide to V2.1 in Chinese.
- `samples/room.png`: the sample image, drawn in code by `tools/make_sample.py`.
- `static/samples.js`: generated copy of `samples/` that the page reads; do not edit by hand.
- `docs/`: the V1.0 system diagram and storyboards A–C (22 Nov).
- No ZIP file.
