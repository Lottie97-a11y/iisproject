# Region-locked image editing (IIS A2 prototype)

Prose word count: XX (code blocks and commands not counted)

A local prototype for editing one part of an image while the rest stays locked.
[When people use text prompts to edit one part of an AI-generated image, the model can unintentionally change other parts they want to keep. Building on my A1 literature review, this prototype explores letting users lock those areas so the system preserves them during editing.]

## Project status

| Part | Status |
| --- | --- |
| Local server and page skeleton, sample image on a canvas | implemented |
| Mask painting and locked-area overlay | planned |
| Edit card with confirm / go back | planned |
| Mock results (pre-recorded) | planned |
| Pasting locked pixels back after generation | planned |
| Live image model | planned (not in scope for this submission) |

## Technology stack

- **Python 3, standard library only** (`http.server`): serves the page and sample images locally. Chosen so a reviewer needs no installs and no API key.
- **HTML canvas + plain JavaScript**: shows the image; the mask will be painted on a second canvas layer.
- **Pillow** (only for `tools/make_sample.py`): draws the sample image.
- Undecided: [the edit card currently comes from a fixed file per sample (simulated). If time allows, simple keyword rules will fill it from the user's instruction instead; a live LLM is out of scope.].

## Running or inspecting

Requires Python 3.9 or later.

```
python app.py --selftest
python app.py
```

Then open http://localhost:8000. Stop the server with Ctrl+C.

To redraw the sample image (optional):

```
pip install pillow
python tools/make_sample.py
```

## Development record

- **[date] Page skeleton.** Local server, sample image drawn on a canvas, placeholders for the edit card. Why: [your reason, e.g. a canvas rather than an image tag, because the mask will be painted on top]. Checked: [what you ran and saw]. Commit: [link added after pushing]

## AI assistance

- **Claude** generated the first page skeleton (`app.py`, `static/`) and the sample-image script (`tools/make_sample.py`), based on my plan.
- I ran `python app.py --selftest` and opened the page locally to check that the sample image loads. [Anything you changed or questioned, e.g. "I checked that file paths outside static/ are refused."]

## Additional files

- `samples/`: sample images used by the prototype. `house.png` is drawn in code by `tools/make_sample.py`.
- No separate ZIP at this stage.
