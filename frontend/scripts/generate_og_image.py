"""Generate the 1200x630 Open Graph card for AI Staff Copilot."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "og-image.png"

W, H = 2400, 1260  # 2x, downscaled to 1200x630
NAVY = (11, 22, 36)
NAVY_MID = (18, 39, 61)
NAVY_EDGE = (21, 43, 68)
STEEL = (159, 182, 207)
ICE = (244, 248, 253)
WHITE = (255, 255, 255)
CHIP_BG = (21, 39, 61)
CHIP_BORDER = (61, 93, 130)
CHIP_TEXT = (207, 224, 244)
FOOTER = (138, 163, 189)
GREEN = (34, 197, 94)
GRID = (26, 45, 69)
HAIRLINE = (42, 69, 99)
TOPBAR = (15, 28, 45)
SIDEBAR = (19, 34, 54)
CONTENT = (238, 244, 251)
PANEL = (255, 255, 255)
PANEL_BORDER = (207, 220, 235)
INK = (25, 36, 50)
MUTED = (74, 95, 118)
BTN = (23, 73, 121)
BTN_BG = (232, 239, 255)

FONT_UI = Path(r"C:\Windows\Fonts\segoeui.ttf")
FONT_UI_BOLD = Path(r"C:\Windows\Fonts\segoeuib.ttf")
FONT_MONO = Path(r"C:\Windows\Fonts\consola.ttf")
FONT_MONO_BOLD = Path(r"C:\Windows\Fonts\consolab.ttf")


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size)


def rounded_rect(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    radius: int,
    fill=None,
    outline=None,
    width: int = 2,
) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def text_size(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont) -> tuple[int, int]:
    box = draw.textbbox((0, 0), text, font=fnt)
    return box[2] - box[0], box[3] - box[1]


def draw_chip(draw: ImageDraw.ImageDraw, x: int, y: int, label: str) -> int:
    fnt = font(FONT_MONO, 28)
    tw, th = text_size(draw, label, fnt)
    pad_x, pad_y = 22, 14
    w, h = tw + pad_x * 2, th + pad_y * 2
    rounded_rect(draw, (x, y, x + w, y + h), 18, fill=CHIP_BG, outline=CHIP_BORDER, width=3)
    draw.text((x + pad_x, y + pad_y - 4), label, font=fnt, fill=CHIP_TEXT)
    return x + w + 16


def draw_dashboard(base: Image.Image, origin: tuple[int, int]) -> None:
    ox, oy = origin
    w, h = 980, 980
    # Drop shadow
    shadow = Image.new("RGBA", (w + 80, h + 80), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)
    sdraw.rounded_rectangle((20, 28, w + 20, h + 28), 28, fill=(0, 0, 0, 90))
    shadow = shadow.filter(ImageFilter.GaussianBlur(22))
    base.alpha_composite(shadow, (ox - 20, oy - 12))

    dash = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(dash)
    rounded_rect(d, (0, 0, w - 1, h - 1), 26, fill=CONTENT, outline=HAIRLINE, width=3)

    # Top bar
    d.rounded_rectangle((0, 0, w - 1, 78), 26, fill=TOPBAR)
    d.rectangle((0, 40, w - 1, 78), fill=TOPBAR)
    d.text((28, 24), "MY HOTEL // OPERATIONS", font=font(FONT_MONO, 22), fill=ICE)
    # Status pill
    pill = (w - 268, 18, w - 24, 60)
    rounded_rect(d, pill, 20, fill=(13, 27, 44), outline=(46, 70, 100), width=2)
    d.ellipse((w - 250, 28, w - 230, 48), fill=GREEN)
    d.text((w - 218, 26), "SYSTEM ONLINE", font=font(FONT_MONO, 18), fill=ICE)

    # Sidebar
    d.rectangle((0, 78, 250, h - 1), fill=SIDEBAR)
    d.pieslice((0, h - 54, 54, h - 1), 90, 180, fill=SIDEBAR)

    d.text((22, 100), "OPERATIONS", font=font(FONT_MONO, 18), fill=STEEL)

    def nav(y: int, label: str, active: bool = False) -> None:
        box = (16, y, 234, y + 52)
        if active:
            rounded_rect(d, box, 10, fill=(34, 57, 84), outline=(79, 111, 150), width=2)
        else:
            rounded_rect(d, box, 10, fill=(22, 40, 62), outline=(29, 50, 74), width=2)
        d.text((32, y + 14), label, font=font(FONT_UI, 22), fill=ICE)

    nav(138, "Copilot", True)
    nav(200, "SOP Manual")
    nav(262, "System Monitor")

    d.text((22, 640), "SYSTEM", font=font(FONT_MONO, 18), fill=STEEL)
    for i, name in enumerate(["MCP", "LangGraph", "Guardrails", "API", "SOP Index"]):
        yy = 680 + i * 44
        d.text((32, yy), name, font=font(FONT_MONO, 20), fill=(214, 228, 246))
        d.ellipse((200, yy + 8, 218, yy + 26), fill=GREEN)

    # Main content
    d.text((278, 100), "AI STAFF COPILOT", font=font(FONT_UI_BOLD, 28), fill=INK)

    def panel(box: tuple[int, int, int, int], title: str) -> None:
        rounded_rect(d, box, 16, fill=PANEL, outline=PANEL_BORDER, width=2)
        d.text((box[0] + 20, box[1] + 16), title, font=font(FONT_MONO, 16), fill=MUTED)

    panel((274, 156, 608, 560), "FRONT DESK QUERY")
    d.rounded_rectangle((294, 210, 588, 360), 10, fill=(248, 251, 255), outline=(196, 212, 232), width=2)
    d.text((308, 228), "Can room 302 have late", font=font(FONT_UI, 20), fill=INK)
    d.text((308, 258), "checkout until 3pm?", font=font(FONT_UI, 20), fill=INK)
    rounded_rect(d, (294, 392, 488, 444), 10, fill=BTN_BG, outline=(53, 101, 154), width=2)
    d.text((312, 404), "Ask Copilot", font=font(FONT_UI_BOLD, 18), fill=BTN)

    panel((628, 156, 952, 560), "COPILOT RESPONSE")
    d.rounded_rectangle((648, 210, 932, 520), 10, fill=(244, 250, 247), outline=(186, 214, 198), width=2)
    d.text((664, 226), "POLICY FOUND", font=font(FONT_MONO_BOLD, 18), fill=(22, 128, 72))
    d.text((664, 268), "Late checkout until 13:00", font=font(FONT_UI, 18), fill=INK)
    d.text((664, 296), "may be granted. 13:00 to", font=font(FONT_UI, 18), fill=INK)
    d.text((664, 324), "15:00 may require manager", font=font(FONT_UI, 18), fill=INK)
    d.text((664, 352), "approval.", font=font(FONT_UI, 18), fill=INK)
    d.text((664, 460), "Source: late_checkout_policy.md", font=font(FONT_MONO, 14), fill=MUTED)

    panel((274, 584, 952, 920), "SOP CONTEXT")
    d.text((294, 640), "late_checkout_policy.md", font=font(FONT_MONO_BOLD, 18), fill=BTN)
    d.text((294, 686), "Checkout until 13:00 may be granted by front desk.", font=font(FONT_UI, 18), fill=INK)
    d.text((294, 720), "13:00 to 15:00 requires duty manager approval.", font=font(FONT_UI, 18), fill=INK)

    # Clip dashboard to rounded mask and composite
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), 26, fill=255)
    base.paste(dash, (ox, oy), mask)


def main() -> None:
    img = Image.new("RGBA", (W, H), NAVY)
    px = img.load()
    assert px is not None
    for y in range(H):
        t = y / (H - 1)
        r = int(NAVY[0] + (NAVY_MID[0] - NAVY[0]) * t)
        g = int(NAVY[1] + (NAVY_MID[1] - NAVY[1]) * t)
        b = int(NAVY[2] + (NAVY_MID[2] - NAVY[2]) * t)
        for x in range(W):
            px[x, y] = (r, g, b, 255)

    draw = ImageDraw.Draw(img)

    # Subtle grid
    for x in range(0, W, 48):
        draw.line((x, 0, x, H), fill=GRID + (255,), width=1)
    for y in range(0, H, 48):
        draw.line((0, y, W, y), fill=GRID + (255,), width=1)

    # Outer hairline
    draw.rectangle((3, 3, W - 4, H - 4), outline=HAIRLINE, width=3)

    # Corner status glow
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    gdraw.ellipse((2080, -80, 2520, 360), fill=(34, 197, 94, 28))
    glow = glow.filter(ImageFilter.GaussianBlur(48))
    img.alpha_composite(glow)

    eyebrow = font(FONT_MONO, 32)
    title = font(FONT_UI_BOLD, 92)
    footer_f = font(FONT_UI, 28)

    draw.text((96, 92), "HOTEL // OPERATIONS", font=eyebrow, fill=STEEL)
    draw.text((92, 210), "AI STAFF", font=title, fill=WHITE)
    draw.text((92, 322), "COPILOT", font=title, fill=WHITE)

    x = 96
    for label in ("LangGraph", "MCP", "FastAPI", "Pydantic"):
        x = draw_chip(draw, x, 470, label)

    draw.text((96, 1128), "Pedro Pita  ·  AI Engineering / Full-Stack", font=footer_f, fill=FOOTER)

    draw_dashboard(img, (1288, 140))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    final = img.convert("RGB").resize((1200, 630), Image.Resampling.LANCZOS)
    final.save(OUT, "PNG", optimize=True)
    print(f"Wrote {OUT} ({final.size[0]}x{final.size[1]}, {OUT.stat().st_size} bytes)")
    write_apple_touch_icon()
    write_favicon_ico()


def _hotel_mark(size: int) -> Image.Image:
    icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(icon)
    margin = max(1, size // 16)
    radius = max(4, size // 5)
    draw.rounded_rectangle(
        (margin, margin, size - margin - 1, size - margin - 1),
        radius,
        fill=NAVY,
        outline=HAIRLINE,
        width=max(1, size // 32),
    )
    house = [
        (size * 0.25, size * 0.78),
        (size * 0.25, size * 0.42),
        (size * 0.50, size * 0.25),
        (size * 0.75, size * 0.42),
        (size * 0.75, size * 0.78),
        (size * 0.59, size * 0.78),
        (size * 0.59, size * 0.58),
        (size * 0.41, size * 0.58),
        (size * 0.41, size * 0.78),
    ]
    draw.polygon(house, fill=ICE)
    dot = size * 0.12
    draw.ellipse((size - margin - dot * 2.2, margin + dot * 0.3, size - margin - dot * 0.2, margin + dot * 2.3), fill=GREEN)
    return icon


def write_favicon_ico() -> None:
    sizes = [(16, 16), (32, 32), (48, 48)]
    mark = _hotel_mark(48)
    out = ROOT / "public" / "favicon.ico"
    mark.save(out, format="ICO", sizes=sizes)
    print(f"Wrote {out} ({out.stat().st_size} bytes)")


def write_apple_touch_icon() -> None:
    size = 180
    icon = Image.new("RGB", (size, size), NAVY)
    draw = ImageDraw.Draw(icon)
    draw.rounded_rectangle((8, 8, size - 9, size - 9), 36, outline=HAIRLINE, width=3)
    mark = font(FONT_UI_BOLD, 96)
    label = "H"
    tw, th = text_size(draw, label, mark)
    draw.text(((size - tw) / 2, (size - th) / 2 - 8), label, font=mark, fill=ICE)
    draw.ellipse((size - 42, 18, size - 18, 42), fill=GREEN)
    out = ROOT / "public" / "apple-touch-icon.png"
    icon.save(out, "PNG", optimize=True)
    print(f"Wrote {out} ({size}x{size}, {out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
