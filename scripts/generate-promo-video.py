"""Render Flow's silent HD product promo from the real 2x UI captures.

Optional local tooling: Python, Pillow, opencv-python, imageio-ffmpeg.
Run `npm run store:assets` first, then `python scripts/generate-promo-video.py`.
"""

from pathlib import Path
import math
import os
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
CAPTURES = ROOT / ".output" / "store-captures"
OUTPUT = ROOT / "assets" / "video"
PREVIEW = ROOT / ".output" / "video"
WIDTH, HEIGHT, FPS = 1280, 720, 30
INK, MUTED, ACCENT = "#3b2e56", "#65587d", "#7052b5"
OUTPUT.mkdir(parents=True, exist_ok=True)
PREVIEW.mkdir(parents=True, exist_ok=True)
# The optional encoder can live in the ignored folder instead of global Python.
sys.path.insert(0, str(ROOT / ".output" / "video-tools"))
import imageio_ffmpeg


def font(size, bold=False):
    fonts = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"
    choices = [
        fonts / ("seguisb.ttf" if bold else "segoeui.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else
             "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    for path in choices:
        if path.exists():
            return ImageFont.truetype(str(path), size)
    raise RuntimeError("Install Segoe UI or DejaVu Sans before rendering.")


def background():
    x = np.linspace(0, 1, WIDTH)[None, :, None]
    y = np.linspace(0, 1, HEIGHT)[:, None, None]
    start, end = np.array([255, 254, 250]), np.array([228, 220, 250])
    blend = np.clip(x * .72 + y * .12, 0, 1)
    return Image.fromarray(np.uint8(start * (1 - blend) + end * blend)).convert("RGBA")


BASE = background()


def text(draw, xy, value, size, fill=INK, bold=False, spacing=8):
    draw.multiline_text(xy, value, font=font(size, bold), fill=fill, spacing=spacing)


def brand(draw, xy=(76, 48), size=42):
    text(draw, xy, "flow", size, bold=True)
    width = draw.textlength("flow", font=font(size, True))
    text(draw, (xy[0] + width, xy[1]), ".", size, ACCENT, True)


def product(image, name):
    source = Image.open(CAPTURES / f"{name}.png").convert("RGBA")
    source.thumbnail((470, 570), Image.Resampling.LANCZOS)
    x, y = 916 - source.width // 2, 360 - source.height // 2
    mask = Image.new("L", source.size)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, source.width, source.height), 23, fill=255)
    source.putalpha(mask)
    shadow = Image.new("RGBA", image.size)
    ImageDraw.Draw(shadow).rounded_rectangle(
        (x, y + 14, x + source.width, y + source.height + 14), 23,
        fill=(59, 46, 86, 32),
    )
    image.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(22)))
    image.alpha_composite(source, (x, y))


SCENES = [
    (4, "A LITTLE TIME. YOUR FULL ATTENTION.", "Find your flow.",
     "A focus timer for Chrome.", "home"),
    (5, "START SIMPLY", "Choose your time.\nStart your timer.",
     "Keep working. Flow keeps time.", "focus"),
    (5, "FEWER DISTRACTIONS", "Keep distractions\nout of the way.",
     "Block the websites that pull you away.", "blocking"),
    (5, "TIME FOR WHAT MATTERS", "Make time for\neach task.",
     "Your tasks. Your daily goals.", "tasks"),
    (5, "A CLEARER PICTURE", "See your time\nin flow.",
     "Days, weeks, months, and years.", "statistics"),
    (6, "", "Your time.\nYour device.",
     "No account. No ads. No tracking.", None),
]


def scene(index):
    _, eyebrow, heading, caption, capture = SCENES[index]
    image = BASE.copy()
    draw = ImageDraw.Draw(image)
    if capture:
        brand(draw)
        text(draw, (78, 220), eyebrow, 14, ACCENT, True)
        text(draw, (74, 264), heading, 52, bold=True)
        text(draw, (78, 433), caption, 21, MUTED)
        text(draw, (78, 628), f"0{index + 1} / 05", 13, MUTED)
        product(image, capture)
    else:
        # Quiet end card with no competing call to action or unsupported claims.
        word_width = draw.textlength("flow.", font=font(68, True))
        brand(draw, ((WIDTH - word_width) // 2, 92), 68)
        draw.multiline_text((WIDTH // 2, 260), heading, font=font(64, True),
                            fill=INK, anchor="ma", align="center", spacing=2)
        draw.text((WIDTH // 2, 448), caption, font=font(24), fill=MUTED, anchor="ma")
        draw.text((WIDTH // 2, 584), "Find your flow with Flow for Chrome.",
                  font=font(21), fill=ACCENT, anchor="ma")
    return image.convert("RGB")


scenes = [scene(index) for index in range(len(SCENES))]
destination = OUTPUT / "flow-promo-1280x720.mp4"
draft = PREVIEW / "flow-promo-draft.mp4"
writer = cv2.VideoWriter(str(draft), cv2.VideoWriter_fourcc(*"mp4v"), FPS,
                         (WIDTH, HEIGHT))
if not writer.isOpened():
    raise RuntimeError("An MPEG-4 encoder is required to export the promo.")

try:
    for index, (seconds, *_) in enumerate(SCENES):
        for frame in range(seconds * FPS):
            # Gentle crossfades only. No zoom, bouncing, or motion through text.
            fade_frames = 15
            if index and frame < fade_frames:
                mix = .5 - .5 * math.cos(math.pi * frame / fade_frames)
                image = Image.blend(scenes[index - 1], scenes[index], mix)
            else:
                image = scenes[index]
            writer.write(cv2.cvtColor(np.asarray(image), cv2.COLOR_RGB2BGR))
        print(f"Rendered scene {index + 1}/{len(SCENES)}", flush=True)
finally:
    writer.release()

subprocess.run([
    imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-hide_banner", "-loglevel", "error",
    "-i", str(draft), "-c:v", "libx264", "-crf", "18", "-preset", "medium",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
    "-metadata", "title=Flow | Find your flow", str(destination),
], check=True)

scenes[0].save(OUTPUT / "flow-promo-poster-1280x720.png")
sheet = Image.new("RGB", (960, 360), "white")
for index, image in enumerate(scenes):
    sheet.paste(image.resize((320, 180), Image.Resampling.LANCZOS),
                ((index % 3) * 320, (index // 3) * 180))
sheet.save(PREVIEW / "flow-promo-storyboard.jpg", quality=95)

video = cv2.VideoCapture(str(destination))
try:
    assert video.isOpened(), "Video could not be decoded"
    assert int(video.get(cv2.CAP_PROP_FRAME_WIDTH)) == WIDTH
    assert int(video.get(cv2.CAP_PROP_FRAME_HEIGHT)) == HEIGHT
    assert round(video.get(cv2.CAP_PROP_FPS)) == FPS
    expected = sum(scene[0] for scene in SCENES) * FPS
    assert int(video.get(cv2.CAP_PROP_FRAME_COUNT)) == expected
    for second in (2, 6, 11, 16, 21, 27, 29):
        video.set(cv2.CAP_PROP_POS_MSEC, second * 1000)
        valid, pixels = video.read()
        assert valid and pixels.std() > 10, f"Invalid frame at {second}s"
    print(f"Verified {destination.name}: {WIDTH}x{HEIGHT}, 30 seconds, {FPS} fps")
finally:
    video.release()
