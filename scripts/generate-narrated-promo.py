"""Full-HD Flow promo: local Windows narration, original music, kinetic titles.

Run generate-promo-narration.ps1 first. Uses the optional local video tools
documented in assets/video/README.md. No audio is downloaded or sent to a service.
"""
from pathlib import Path
import math
import os
import subprocess
import sys
import wave

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
TEMP = ROOT / ".output/video"
OUT = ROOT / "assets/video"
sys.path.insert(0, str(ROOT / ".output/video-tools"))
import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
W, H, FPS, SR = 1920, 1080, 30, 48000
INK, ACCENT, MUTED = "#3b2e56", "#7052b5", "#65587d"
LINES = [
    "Too many tabs. Too many distractions?",
    "Meet Flow. A focus timer that helps you settle into work.",
    "Choose your time, and block the websites that pull you away.",
    "Give each task a daily goal. Make time for what matters.",
    "See where your time goes, with clear focus statistics.",
    "Your data stays on your device. No account. No ads.",
    "Open Flow. Start your timer. Find your focus.",
]
TITLES = [
    ("TOO MUCH NOISE?", "Too many tabs.\nNot enough focus.", None),
    ("MEET FLOW", "A little time.\nYour full attention.", "home"),
    ("MAKE ROOM FOR WORK", "Distractions\ncan wait.", "blocking"),
    ("ONE THING AT A TIME", "Your tasks.\nYour daily goals.", "tasks"),
    ("SEE YOUR PROGRESS", "Your time,\nmade visible.", "statistics"),
    ("PRIVATE BY DESIGN", "Your time.\nYour device.", None),
    ("FIND YOUR FLOW", "Settle in.\nStart your timer.", "focus"),
]


def run(args, **kwargs):
    return subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", *args],
                          check=True, **kwargs)


def voice(index):
    result = run(["-i", str(TEMP / f"audio/{index}.wav"), "-f", "f32le",
                  "-ac", "1", "-ar", str(SR), "pipe:1"], stdout=subprocess.PIPE)
    audio = np.frombuffer(result.stdout, dtype=np.float32).copy()
    if np.max(np.abs(audio)) > 0:
        audio *= .83 / np.max(np.abs(audio))
    return audio


voices = [voice(i) for i in range(len(LINES))]
# Scene boundaries align to a 100 BPM backing track, leaving room to breathe.
lengths = [max(4.8, math.ceil((len(v) / SR + .85) / .6) * .6) for v in voices]
starts = np.cumsum([0, *lengths[:-1]])
duration = round(sum(lengths), 2)
samples = int(duration * SR)
rng = np.random.default_rng(42)
music = np.zeros((samples, 2), dtype=np.float32)
narration = np.zeros(samples, dtype=np.float32)
duck = np.ones(samples, dtype=np.float32)


def add(sound, start, gain=1, pan=0):
    offset = round(start * SR)
    count = min(len(sound), samples - offset)
    if count <= 0:
        return
    music[offset:offset + count, 0] += sound[:count] * gain * math.sqrt((1 - pan) / 2)
    music[offset:offset + count, 1] += sound[:count] * gain * math.sqrt((1 + pan) / 2)


def note(midi, seconds, bright=False):
    t = np.arange(int(seconds * SR)) / SR
    frequency = 440 * 2 ** ((midi - 69) / 12)
    if bright:
        envelope = np.minimum(t / .008, 1) * np.exp(-t * 4)
        return (np.sin(2 * np.pi * frequency * t) + .2 * np.sin(4 * np.pi * frequency * t)) * envelope
    envelope = np.minimum(t / .25, 1) * np.minimum((seconds - t) / .45, 1)
    return (np.sin(2 * np.pi * frequency * t) + .14 * np.sin(4 * np.pi * frequency * t)) * envelope


chords = [(50, 57, 61, 66), (47, 54, 59, 62), (43, 50, 55, 59), (45, 52, 57, 61)]
for bar, start in enumerate(np.arange(0, duration, 2.4)):
    chord = chords[bar % len(chords)]
    for index, midi in enumerate(chord):
        add(note(midi + 12, 2.7), start, .035, (index - 1.5) / 2)
    add(note(chord[0] - 12, 2.1), start, .09)
    for eighth in range(8):
        add(note(chord[[0, 2, 1, 3, 0, 2, 3, 1][eighth]] + 24, .7, True),
            start + eighth * .3, .04, .35 if eighth % 2 else -.35)

for beat, start in enumerate(np.arange(0, duration, .6)):
    t = np.arange(int(.22 * SR)) / SR
    kick = np.sin(2 * np.pi * (48 * t + 5 * (1 - np.exp(-t * 30)))) * np.exp(-t * 24)
    add(kick, start, .17)
    if beat % 2:
        noise = rng.normal(0, 1, len(t))
        snare = (noise - np.roll(noise, 1)) * np.exp(-t * 35)
        add(snare, start, .022)
    for off in (0, .3):
        t = np.arange(int(.065 * SR)) / SR
        noise = rng.normal(0, 1, len(t))
        add((noise - np.roll(noise, 1)) * np.exp(-t * 90), start + off, .009, .25)

for start, audio in zip(starts, voices):
    offset = round((start + .3) * SR)
    count = min(len(audio), samples - offset)
    narration[offset:offset + count] += audio[:count]
    duck[max(0, offset - int(.1 * SR)):min(samples, offset + count + int(.15 * SR))] = .28
duck = np.convolve(duck, np.ones(2400) / 2400, mode="same")
mix = music * duck[:, None] + narration[:, None]
fade = np.minimum(np.arange(samples) / (SR * .5), 1)
fade *= np.minimum((samples - np.arange(samples)) / (SR * .9), 1)
mix *= fade[:, None]
mix = np.clip(mix, -.96, .96)
soundtrack = TEMP / "flow-original-soundtrack.wav"
with wave.open(str(soundtrack), "wb") as target:
    target.setnchannels(2)
    target.setsampwidth(2)
    target.setframerate(SR)
    target.writeframes(np.int16(mix * 32767).tobytes())

fonts = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"


def font(size, bold=False):
    return ImageFont.truetype(str(fonts / ("seguisb.ttf" if bold else "segoeui.ttf")), size)


def text(draw, xy, value, size, fill=INK, bold=False, **kwargs):
    draw.multiline_text(xy, value, font=font(size, bold), fill=fill, spacing=6, **kwargs)


x = np.linspace(0, 1, W)[None, :, None]
y = np.linspace(0, 1, H)[:, None, None]
blend = np.clip(x * .7 + y * .1, 0, 1)
base = Image.fromarray(np.uint8(np.array([255, 254, 250]) * (1 - blend) +
                                    np.array([225, 214, 248]) * blend)).convert("RGBA")
products = {}
for name in ("home", "focus", "tasks", "statistics", "blocking"):
    source = Image.open(ROOT / f".output/store-captures/{name}.png").convert("RGBA")
    source.thumbnail((680 if name == "blocking" else 570, 850), Image.Resampling.LANCZOS)
    mask = Image.new("L", source.size)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, *source.size), 30, fill=255)
    source.putalpha(mask)
    layer = Image.new("RGBA", (W, H))
    left, top = 1385 - source.width // 2, 540 - source.height // 2
    shadow = Image.new("RGBA", (W, H))
    ImageDraw.Draw(shadow).rounded_rectangle((left, top + 20, left + source.width,
                                             top + source.height + 20), 30,
                                            fill=(59, 46, 86, 36))
    layer.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(26)))
    layer.alpha_composite(source, (left, top))
    products[name] = layer


def ease(value):
    value = min(1, max(0, value))
    return 1 - (1 - value) ** 3


def frame(index, elapsed):
    eyebrow, title, product = TITLES[index]
    image = base.copy()
    draw = ImageDraw.Draw(image)
    text(draw, (112, 64), "flow.", 60, bold=True)
    # Short kinetic entrances and a calm hold keep every caption readable.
    entrance = ease(elapsed / .6)
    offset = round(26 * (1 - entrance))
    if product:
        image.alpha_composite(products[product], (round(40 * (1 - entrance)), 0))
    else:
        card_x = 1130
        labels = ["12 open tabs", "Another notification", "One more scroll"] if index == 0 else ["On-device storage", "No account", "No ads or analytics"]
        for row, label in enumerate(labels):
            slide = round(35 * (1 - ease((elapsed - row * .12) / .55)))
            top = 338 + row * 142
            draw.rounded_rectangle((card_x + slide, top, 1778 + slide, top + 110),
                                   radius=25, fill="#f7f2ff", outline="#c5b5e1", width=2)
            text(draw, (card_x + 35 + slide, top + 30), label, 32, MUTED)
    text(draw, (116, 300 + offset), eyebrow, 22, ACCENT, True)
    text(draw, (108, 367 + offset), title, 80, bold=True)
    text(draw, (116, 668), LINES[index] if len(LINES[index]) < 56 else
         LINES[index].replace("that helps", "\nthat helps").replace("that pull", "\nthat pull").replace("Make time", "\nMake time"),
         27, MUTED)
    # Beat-synced progress uses a thin functional line, never flashing full frames.
    draw.rounded_rectangle((116, 948, 894, 952), 2, fill="#d6c9ef")
    progress = (starts[index] + elapsed) / duration
    draw.rounded_rectangle((116, 948, 116 + int(778 * progress), 952), 2, fill=ACCENT)
    return image.convert("RGB")


draft = TEMP / "flow-narrated-draft.mp4"
writer = cv2.VideoWriter(str(draft), cv2.VideoWriter_fourcc(*"mp4v"), FPS, (W, H))
assert writer.isOpened()
poster = None
previous = None
try:
    for index, seconds in enumerate(lengths):
        for count in range(round(seconds * FPS)):
            image = frame(index, count / FPS)
            if previous is not None and count < 8:
                image = Image.blend(previous, image, ease(count / 8))
            writer.write(cv2.cvtColor(np.asarray(image), cv2.COLOR_RGB2BGR))
            if index == 1 and count == 45:
                poster = image.copy()
        previous = image
        print(f"Rendered narrated scene {index + 1}/7", flush=True)
finally:
    writer.release()

destination = OUT / "flow-promo-narrated-1920x1080.mp4"
run(["-y", "-i", str(draft), "-i", str(soundtrack), "-c:v", "libx264",
     "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac",
     "-b:a", "192k", "-af", "loudnorm=I=-16:TP=-1.5:LRA=8", "-movflags", "+faststart",
     "-shortest", str(destination)])
poster.save(OUT / "flow-promo-narrated-poster-1920x1080.png")


def timestamp(seconds):
    milliseconds = round(seconds * 1000)
    return f"{milliseconds // 3600000:02}:{milliseconds // 60000 % 60:02}:{milliseconds // 1000 % 60:02},{milliseconds % 1000:03}"


subtitles = "\n\n".join(f"{i + 1}\n{timestamp(start + .3)} --> {timestamp(start + .3 + len(audio) / SR)}\n{line}"
                          for i, (start, audio, line) in enumerate(zip(starts, voices, LINES)))
(OUT / "flow-promo-narrated.en.srt").write_text(subtitles + "\n", encoding="utf-8")
video = cv2.VideoCapture(str(destination))
assert video.isOpened()
assert int(video.get(cv2.CAP_PROP_FRAME_WIDTH)) == W
assert int(video.get(cv2.CAP_PROP_FRAME_HEIGHT)) == H
assert abs(video.get(cv2.CAP_PROP_FRAME_COUNT) / video.get(cv2.CAP_PROP_FPS) - duration) < .1
for start in starts:
    video.set(cv2.CAP_PROP_POS_MSEC, (start + 1) * 1000)
    valid, pixels = video.read()
    assert valid and pixels.std() > 10
video.release()
decoded_audio = run(["-i", str(destination), "-vn", "-f", "f32le", "-ac", "1", "pipe:1"], stdout=subprocess.PIPE)
assert np.frombuffer(decoded_audio.stdout, dtype=np.float32).std() > .01
print(f"Verified Full-HD H.264/AAC promo: {duration}s, narration, music, captions.")
