"""Recordings to the README clips: animated WebP with rounded, see-through corners.

    py clips.py <rec_dir> [out_dir]

<rec_dir> holds the recordings made by record.mjs, one folder per scenario:
pool, night, card and card-night.
"""
from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
rec = Path(sys.argv[1]).resolve()
out = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else HERE.parent

POOL = ('trim=start=0.3,setpts=PTS-STARTPTS', (1216, 460, 32, 104), 36, 960, 72)
CARD = ('trim=start=0.3:end=12.2,setpts=(PTS-STARTPTS)/1.15', (960, 720, 160, 50), 28, 800, 70)
# output: (recording, (timing, crop w/h/x/y, corner radius at crop size, output width, quality))
CLIPS = {
    'pool-day': ('pool', POOL),
    'pool-night': ('night', POOL),
    'card-day': ('card', CARD),
    'card-night': ('card-night', CARD),
}


def mask(w: int, h: int, r: int, path: Path) -> None:
    k = 4
    im = Image.new('L', (w * k, h * k), 0)
    ImageDraw.Draw(im).rounded_rectangle((0, 0, w * k - 1, h * k - 1), radius=r * k, fill=255)
    im.resize((w, h), Image.LANCZOS).save(path)


with tempfile.TemporaryDirectory() as tmp:
    for name, (src, (timing, (w, h, x, y), r, width, quality)) in CLIPS.items():
        m = Path(tmp) / f'{name}-mask.png'
        mask(w, h, r, m)
        target = out / f'{name}.webp'
        graph = (
            f'[0:v]{timing},fps=12,crop={w}:{h}:{x}:{y},format=rgba[v];[1:v]format=gray[m];'
            f'[v][m]alphamerge=shortest=1,scale={width}:-2:flags=lanczos,format=yuva420p'
        )
        subprocess.run(
            ['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', str(rec / src / 'list.txt'), '-loop', '1', '-i', str(m),
             '-filter_complex', graph, '-c:v', 'libwebp_anim', '-lossless', '0', '-quality', str(quality),
             '-compression_level', '6', '-loop', '0', '-an', str(target)],
            check=True,
        )
        print(f'{target.name}: {target.stat().st_size // 1024} KB')
