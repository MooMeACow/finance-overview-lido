"""Frames (RGBA PNGs) to a compact GIF with transparent rounded corners.

GIF can't store "unchanged since last frame" and "see-through corner" as different things,
and ffmpeg gives up on frame differencing when the input has alpha. So: flatten the corners
onto a key colour, quantise every frame to one shared palette without dithering (still water
stays pixel-identical from frame to frame), then let ImageMagick turn the key colour and every
unchanged pixel into transparency.

    py encode_gif.py <frames_dir> <out.gif> [fps]
"""
from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

KEY = (255, 0, 255)

frames_dir, out = Path(sys.argv[1]), Path(sys.argv[2])
fps = int(sys.argv[3]) if len(sys.argv) > 3 else 12
frames = sorted(frames_dir.glob('f*.png'))
if not frames:
    raise SystemExit(f'no frames in {frames_dir}')

with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp)
    for i, f in enumerate(frames):
        im = Image.open(f).convert('RGBA')
        if any(px[:3] == KEY and px[3] > 0 for px in im.getdata()):
            raise SystemExit(f'{f.name} uses the key colour; pick another')
        flat = Image.new('RGB', im.size, KEY)
        flat.paste(im.convert('RGB'), mask=im.getchannel('A').point(lambda a: 255 if a >= 128 else 0))
        flat.save(tmp / f'k{i:05d}.png')
    pattern = str(tmp / 'k%05d.png')
    run = lambda *a: subprocess.run(a, check=True, capture_output=True)
    run('ffmpeg', '-y', '-framerate', str(fps), '-i', pattern, '-vf', 'palettegen=max_colors=256:stats_mode=full:reserve_transparent=0', str(tmp / 'pal.png'))
    run('ffmpeg', '-y', '-framerate', str(fps), '-i', pattern, '-i', str(tmp / 'pal.png'), '-lavfi', 'paletteuse=dither=none', '-loop', '0', str(tmp / 'raw.gif'))
    magick = shutil.which('magick') or 'magick'
    run(magick, str(tmp / 'raw.gif'), '-coalesce', '+dither', '-transparent', '#FF00FF', '-dispose', 'None', '-layers', 'OptimizeTransparency', str(out))

# check the result the way a browser will draw it
gif = Image.open(out)
assert gif.n_frames == len(frames), (gif.n_frames, len(frames))
for i in range(gif.n_frames):
    gif.seek(i)
    if i in (0, gif.n_frames // 2, gif.n_frames - 1):
        rgba = gif.convert('RGBA')
        w, h = rgba.size
        assert rgba.getpixel((1, 1))[3] == 0, f'frame {i}: corner not transparent'
        assert rgba.getpixel((w // 2, h // 2))[3] == 255, f'frame {i}: centre not opaque'
print(f'{out}: {gif.n_frames} frames, {out.stat().st_size // 1024} KB')
