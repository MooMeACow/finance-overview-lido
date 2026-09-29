# README visuals

Everything in `assets/readme/` comes from the app itself. The hero and the otter close-up are drawn by the app's own water shader and otter engine on a controlled clock, the clips are recordings of the live demo, and the diagram is generated SVG.

| File | Made by |
| --- | --- |
| `hero-day.webp`, `hero-night.webp` | `stage.js` scene `hero`, rendered by `grab.mjs` |
| `otters.gif` | `stage.js` scene `specimen`, frames from `frames.mjs`, encoded by `encode_gif.py` |
| `screens.webp` | screenshots from `shots.mjs`, laid out by `stage.js` scene `wall` |
| `pool-day.webp`, `pool-night.webp`, `card-day.webp`, `card-night.webp` | `record.mjs` scenarios `pool`, `night`, `card` and `card-night`, encoded by `clips.py` |
| `workflow-day.svg`, `workflow-night.svg` | `workflow.py` |

You need Node 22, Python 3 with Pillow, fontTools, NumPy and SciPy, ffmpeg (with libwebp), ImageMagick, and a Chrome started with `--remote-debugging-port=9222`. The scripts take that browser's address; any path works after the port, for example `ws://127.0.0.1:9222/x`.

```bash
node build.mjs     # copies the otter engine, the shader and the fonts out of src/ into .build/
node serve.mjs     # serves stage.html on http://127.0.0.1:5178

WS=ws://127.0.0.1:9222/x
node grab.mjs $WS hero '{"night":false}' hero-day.png
node grab.mjs $WS hero '{"night":true}' hero-night.png
node frames.mjs $WS specimen '{"S":1}' frames/specimen && python encode_gif.py frames/specimen ../otters.gif 12
node shots.mjs $WS && node grab.mjs $WS wall '{"S":2}' screens.png
python workflow.py
```

The stills are saved as WebP with Pillow (`quality=92` for the hero, `90` for the wall, `method=6`).

Headless Chrome paints about 12 frames a second, so `record.mjs` runs the page's clock three times slower (JS time, timers, animation frames and CSS animations; `SLOW` changes the factor) and plays the capture back at normal speed. `clips.py` then crops, rounds the corners and encodes:

```bash
for s in pool night card card-night; do node record.mjs $WS $s rec/$s; done
python clips.py rec
```

The clips are WebP rather than GIF because moving water changes every pixel of every frame: the pool clip is 2.7 MB as WebP and over 15 MB as a GIF. The otter close-up keeps its water still, so it stays a GIF.
