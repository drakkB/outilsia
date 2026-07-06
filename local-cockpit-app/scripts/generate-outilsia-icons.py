#!/usr/bin/env python3
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "src-tauri" / "icons"
ICON_DIR.mkdir(parents=True, exist_ok=True)

SIZES = [16, 24, 32, 48, 64, 128, 256, 512]


def font(size: int):
    for name in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
    ]:
        path = Path(name)
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def make_icon(size: int) -> Image.Image:
    scale = size / 512
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    def box(values):
        return tuple(int(v * scale) for v in values)

    # Squircle-like dark base with subtle border.
    draw.rounded_rectangle(
        box((28, 28, 484, 484)),
        radius=int(92 * scale),
        fill=(8, 18, 25, 255),
        outline=(95, 232, 206, 180),
        width=max(1, int(9 * scale)),
    )
    draw.rounded_rectangle(
        box((58, 58, 454, 454)),
        radius=int(70 * scale),
        outline=(76, 114, 132, 120),
        width=max(1, int(3 * scale)),
    )

    # Local hardware chip.
    chip = box((132, 145, 380, 367))
    draw.rounded_rectangle(
        chip,
        radius=int(42 * scale),
        fill=(18, 35, 43, 255),
        outline=(103, 232, 249, 230),
        width=max(2, int(9 * scale)),
    )

    # Circuit pins.
    for y in [182, 226, 270, 314]:
        draw.line(box((94, y, 132, y)), fill=(74, 222, 128, 220), width=max(2, int(8 * scale)))
        draw.line(box((380, y, 418, y)), fill=(74, 222, 128, 220), width=max(2, int(8 * scale)))
    for x in [176, 220, 264, 308, 352]:
        draw.line(box((x, 107, x, 145)), fill=(103, 232, 249, 200), width=max(2, int(7 * scale)))
        draw.line(box((x, 367, x, 405)), fill=(103, 232, 249, 200), width=max(2, int(7 * scale)))

    # OutilsIA monogram: OI.
    f = font(max(10, int(112 * scale)))
    text = "OI"
    bbox = draw.textbbox((0, 0), text, font=f)
    tx = (size - (bbox[2] - bbox[0])) / 2
    ty = (size - (bbox[3] - bbox[1])) / 2 - int(4 * scale)
    draw.text((tx, ty), text, font=f, fill=(236, 253, 245, 255))

    # Small local dot.
    draw.ellipse(box((341, 319, 376, 354)), fill=(74, 222, 128, 255))
    return img


png512 = make_icon(512)
png512.save(ICON_DIR / "icon.png")
png512.save(ICON_DIR / "128x128.png")
png512.resize((32, 32), Image.Resampling.LANCZOS).save(ICON_DIR / "32x32.png")

ico_images = [make_icon(size) for size in SIZES]
ico_images[-1].save(ICON_DIR / "icon.ico", sizes=[(size, size) for size in SIZES])

print(f"outilsia_icons_ok {ICON_DIR / 'icon.png'} {ICON_DIR / 'icon.ico'}")
