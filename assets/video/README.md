# Flow promo video

## Narrated edition

- `flow-promo-narrated-1920x1080.mp4`: Full-HD H.264/AAC promo with English
  narration, an original electronic soundtrack, kinetic titles, and beat-aligned
  scene changes.
- `flow-promo-narrated-poster-1920x1080.png`: matching poster.
- `flow-promo-narrated.en.srt`: timed English subtitles for YouTube.

The narration uses the installed Microsoft Zira Desktop synthesized voice.
Music is synthesized locally from original notes and percussion; no stock music,
samples, celebrity voices, or external speech service is used. Music ducks beneath
the voiceover. The product panels use actual app captures and illustrative data.

To regenerate on Windows after refreshing the captures:

```powershell
powershell -NoProfile -File scripts/generate-promo-narration.ps1
python scripts/generate-narrated-promo.py
```

Use your normal approved PowerShell execution policy. The narrator script does
not change system policy. The Python tools listed below are also required.

## Silent edition

- `flow-promo-1280x720.mp4`: 30-second, 1280 × 720, 30 fps H.264 video.
- `flow-promo-poster-1280x720.png`: matching poster image.

The video is silent, with on-screen captions and gentle crossfades. It uses real
extension captures with illustrative task and history data. No music licensing
or voiceover is required.

You can upload the MP4 to YouTube and use the YouTube link in the Chrome Web
Store's video field. This file is not included in the extension package.

## Regenerate

Optional local video tools do not affect the extension's dependencies:

```sh
python -m pip install Pillow opencv-python
python -m pip install --target .output/video-tools imageio-ffmpeg
npm run store:assets
python scripts/generate-promo-video.py
```

The renderer checks resolution, duration, frame rate, and decoding across the
video. Temporary renders and the storyboard stay in the ignored `.output/`
folder. Review the result after changes to interface captures or captions.
