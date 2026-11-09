# Flow app icon

`flow-icon.png` is the original 1254 x 1254 transparent PNG, created with the built-in imagegen tool. Generation notes in `prompt.txt` are local-only and excluded from Git; they are not required to export the icons.

The soft vanilla clock face, chunky purple hands, peach timer button, and lavender tile give the Chrome icon a friendly look that matches the popup. Its broad silhouette stays recognizable at 16px, while the larger sizes retain a soft bevel and short shadow. It contains no letters, play triangle, green, or decorative progress imagery.

`scripts/generate-icons.ps1` exports the checked-in 16, 32, 48, and 128px PNGs under `public/icons/` with high-quality resampling and preserved transparency. Run that script on Windows after replacing the source artwork. Normal development and production builds use the checked-in PNGs and need no image tools.

The manifest already references these exported paths for the toolbar and extension page; notifications use the 128px export. Keep the source artwork outside `public/` so the full-resolution image is not shipped in the extension package.
