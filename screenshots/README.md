# Chrome Web Store images

Upload the PNG files directly. They are 24-bit RGB with no alpha channel.
SVG files are editable sources for the promo tiles, not store upload files.

| Store field        | Files                                                                              | Size            |
| ------------------ | ---------------------------------------------------------------------------------- | --------------- |
| Screenshots        | `flow-01-start-timer-1280x800.png` through `flow-05-website-blocking-1280x800.png` | 1280 × 800 each |
| Small promo tile   | `flow-small-promo-440x280.png`                                                     | 440 × 280       |
| Marquee promo tile | `flow-marquee-promo-1400x560.png`                                                  | 1400 × 560      |

Use the five numbered screenshots in filename order. Do not upload the promo
tiles in the screenshot field.

The screenshots capture the actual built extension at twice its display
resolution before composing the final images. Task names and history use
illustrative local data in a disposable browser profile. No real user data,
account credentials, or public publishing operations are involved.

To refresh these images after UI changes:

```sh
npm ci
npx playwright install chromium
npm run store:assets
```

The generator checks each PNG's dimensions, bit depth, and RGB color type.
Intermediate captures go in the ignored `.output/store-captures/` directory.
Review all seven final images before updating the store listing.

See [Chrome's image guidance](https://developer.chrome.com/docs/webstore/images).
