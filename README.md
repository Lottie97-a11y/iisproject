# Region-locked image editing (IIS A2 prototype)

Prose word count: 1538 (code and commands not counted)

When people use text prompts to edit part of an AI-generated image, the model can change other parts they wanted to keep. Building on my A1 literature review, this browser prototype explores letting users lock those areas so the system preserves them during editing. It compares three ways of combining the user's words with their painting.

Live page: https://lottie97-a11y.github.io/iisproject/

## Project status

| Part | Status |
| --- | --- |
| Sample image on a canvas, browser only | implemented |
| Mask painting (brush size, erase, clear); painted area in blue; optional dimming outside the brush strokes, with painted areas in their true colours | implemented |
| Three modes: A changes every object the brush touches, as a whole (wall and floor only where painted); B changes only the objects the words name, only where painted; C changes everything painted. In every mode the simulated model also makes unwanted changes (the cat turns grey, the vase of roses vanishes), which the lock puts back | the choice is implemented; each mode's edit is simulated |
| Reading the instruction (object, colour, brighter or darker) | simulated: keyword rules stand in for a language model |
| Mode chosen on the edit-card step, with advice on which mode to choose; the card is built from the words, the painting and the mode and rebuilt when the mode changes; it warns about painted objects the words do not name and blocks a run that would change nothing | implemented |
| Confirm / go back: the result step opens only after Confirm | implemented |
| Pasting the original pixels back outside the confirmed edit scope after the edit | implemented |
| Counting blocked changes; red outlines for edits, green for changes the lock reversed; final, model and original views | implemented |
| Keep the result / back to the previous step (edit undone; painting, words and mode kept) | implemented |
| Version history of kept results | planned |
| Live AI models | not in scope |

## Technology stack

- **HTML, CSS and plain JavaScript, no server**: runs in any browser and on GitHub Pages, with nothing to install and no API key.
- **HTML canvas**: holds the image and the mask; the lock compares its pixels.
- **`static/rules.js`**: keyword rules that read the instruction, and a colour-based object list for the sample image. They stand in for a language model and a segmentation model; the edit is drawn by code in place of an image model.
- **Python + Pillow (tools only)**: draw the sample image and embed it in `static/`.

## Running or inspecting

Open `index.html` in a browser, or use the live page.

To redraw the sample image (needs `pip install pillow`):

```
python tools/make_sample.py
python tools/embed_samples.py
```

## Development record

The first two changes are in commit [4407188](https://github.com/Lottie97-a11y/iisproject/commit/4407188fc5e18b5c86adff5d8b61785b52c29a58).

- **16 Nov – Page skeleton.** Sample image on a canvas; unbuilt parts labelled on the page. Why: the mask needs a second canvas layer, and later steps read pixels. Checked: the house sample appeared as drawn.
- **16 Nov – Browser-only page.** The first version needed Python installed just to view it. Of Claude's three options (keep the server, Codespaces, browser-only), I chose browser-only, as the prototype needs no server. Checked: opened from disk in Edge with no server; the image loaded, the console showed no errors, reading a canvas pixel returned the sky colour rather than a security error, and the live link opened.
- **17 Nov – Mask painting, edit card, confirm / go back.** Why: the user, not the model, decides what may change, and nothing runs until they have checked the card. Checked: brush, brush size, erase and clear worked; painting and the instruction box were locked while the card was shown; "Go back" kept my mask; the result step opened only after Confirm.
- **18 Nov – Room scene (rug, cat, table, vase of roses).** Why: it matches my storyboards and Lab 3 tests, where recolouring the rug also changed the cat and the vase. Checked: the house sample had worked before I replaced it, and the first room mocks looked right.
- **18 Nov – Whole image visible by default.** Greying out every unpainted area darkened the picture and made it hard to judge, so painted areas are tinted blue and the grey view is optional. Checked: the page opens with no grey overlay and marks only what I paint.
- **18 Nov – Lock enforced after the edit.** Outside the painted area the original pixels are pasted back, whatever the model returned; changed pixels there are counted and reported, and "Back to original" undoes the edit. Why: the lock must not depend on the model obeying. Checked: painting half the rug by hand, I saw the final image keep only my painted area and the "Model output" view show what the lock had blocked; the same test exposed the problem fixed on 20 Nov.
- **19 Nov – Clearer views.** The grey locked view was too light and its blue tint turned the rug purple, so I asked for a darker grey and true colours in the painted area (checked on my computer). I also asked for every change, not only blocked ones, to be outlined in red. Checked: I compared outlines 7, 5 and 3 px wide in screenshots and chose 3.
- **20 Nov – Three modes instead of three recorded scenarios.** Painting by hand showed that the pre-recorded results ignored my painting: in the "normal" scenario the message was always red. I proposed three modes instead. My A1 argued that words give intent but no position, and painting gives position but no intent; B (words only) and C (painting only) show each failing, and A uses their overlap. The words are now read by keyword rules, and the edit card blocks a run that would change nothing (for example, words about the vase with only the rug painted). Checked: Claude ran my test cases in a headless browser and I reviewed the results: words about the vase with only the rug painted were blocked; with half the rug painted, the lock restored everything outside it; C with no object named ran without a warning, which I kept as a limitation.

- **21 Nov – Whole-object selection in A.** A brush stroke selects each named object it touches in full. Unnamed objects touched by the same stroke keep their original colours and get green outlines. Replaced the same day (next entry).
- **21 Nov – Three modes redefined.** A now changes every object the brush touches, as a whole (wall and floor only where painted); B changes only the named objects, only where painted (the former A); C is unchanged. The model's unwanted changes now happen in every mode, so the lock is tested in all three. The mode is now chosen on the edit-card step, so the same painting and words can be compared across modes; on the result page, "Back to previous step" (formerly "Back to original") undoes the edit and returns to that step. On that step, advice suggests a mode: if the words name exactly the painted objects, A (whole objects) or B (painted parts), with the painted share of each object when there are several; otherwise C. In mode A, the edit card also warns whenever the brush touches more than one object, since each will change as a whole. An object counts as painted only from 40 pixels, and the background (wall, floor) only from 500 pixels, because it surrounds every object and a brush edge touches it easily. Page 1 states this rule and names the objects and the background; page 2 lists anything the brush touched that was not counted, only when there is something. Why: whole-object selection could not change part of an object, such as half the rug, while the overlap rule needed the whole object painted to change all of it; giving each rule its own mode covers both, and choosing the mode after painting lets the same input be compared. Checked: after each change Claude ran test cases in a headless browser and I reviewed the screenshots; counting the floor like an object made almost every case "unclear", so I chose a 500-pixel threshold for the background; on the live page I checked the tool and result buttons and asked for them to match.

## AI assistance

- **Codex** updated the input guidance, result outlines and whole-object selection in A following my specifications.
- **Claude** wrote the code (`index.html`, `static/`, `tools/`) and drafted this README from my plan and decisions; the project description is adapted in my own words.
- **Claude** also tested each change in a headless browser and made the system diagram and storyboards in `docs/` from screenshots of the working prototype, for me to review.
- My decisions: a browser-only page; simulated edits rather than live models; a room scene that follows my storyboards; three modes that compare words-led, painting-led and overlap editing.
- Changes I made to Claude's design: its first version greyed out everything I had not painted, which hid the whole image, so I asked for a blue tint with an optional dark view; and I noticed its pre-recorded results ignored my painting, which led to the three modes. Later I redefined the modes, moved the mode choice to the edit-card step, and specified the advice rules and the warning for several objects in A.

## Additional files

- `samples/room.png`: the sample image, drawn in code by `tools/make_sample.py`. It replaced the first sample, `house.png`.
- `static/samples.js`: generated copy of `samples/` that the page reads; do not edit by hand.
- `static/rules.js`: the object list and keyword rules described above.
- `docs/`: the system diagram (`system_diagram.png`, `system_diagram.svg`) and storyboards A–C (`storyboard_A.png`, `storyboard_B.png`, `storyboard_C.png`), made from the version in commit 3cb852f.
- No ZIP file.
