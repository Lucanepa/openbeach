"""OpenBeach Android launcher icons and splash images.

Adapted from OpenVolley's scripts/make-android-icons.py. The source is the
OpenBeach logo, public_beach/openbeach_no_bg.png (1024x1024, transparent): the
ball with sunglasses above the word "openbeach".

- launcher icons (every mipmap density): the ball alone, on white (legacy
  square + round icon), plus the adaptive-icon foreground (transparent) and a
  monochrome layer for Android 13+ themed icons (the ball's silhouette with
  the sunglasses cut out, one colour; the launcher tints it)
- pre-Android-12 splash drawables: the full logo, word included, centred on
  white (Android 12+ draws the adaptive icon on white, see styles.xml)

Rerun after changing the logo, then rebuild:

    cd escoresheet/frontend && python3 scripts/make-android-icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / 'android/app/src/main/res'
WHITE = (255, 255, 255, 255)

logo = Image.open(ROOT / 'public_beach/openbeach_no_bg.png').convert('RGBA')

# The ball: everything above the word (the word starts at about y = 715 of
# 1024; the ball and its sand end at about y = 712).
BALL_BOTTOM = 714
ball = logo.crop((0, 0, logo.width, round(logo.height * BALL_BOTTOM / 1024)))
# Crop to the ball itself (alpha > 128), not its faint glow
ball = ball.crop(ball.split()[3].point(lambda v: 255 if v > 128 else 0).getbbox())
logo = logo.crop(logo.getbbox())

# launcher size (dp 48) and adaptive foreground size (dp 108) per density
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}


def fit(img, box):
    """img scaled to fit a box x box square."""
    scale = box / max(img.size)
    w, h = round(img.width * scale), round(img.height * scale)
    return img.resize((w, h), Image.LANCZOS), w, h


def on_canvas(size, art, fraction, background=WHITE):
    canvas = Image.new('RGBA', (size, size), background)
    a, w, h = fit(art, size * fraction)
    canvas.alpha_composite(a, ((size - w) // 2, (size - h) // 2))
    return canvas


def circle_mask(img):
    ss = 4
    m = Image.new('L', (img.width * ss, img.height * ss), 0)
    ImageDraw.Draw(m).ellipse((0, 0, m.width - 1, m.height - 1), fill=255)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), m.resize(img.size, Image.LANCZOS))
    return out


def rounded(img, radius_fraction=0.18):
    ss = 4
    m = Image.new('L', (img.width * ss, img.height * ss), 0)
    r = int(m.width * radius_fraction)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, m.width - 1, m.height - 1), radius=r, fill=255)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), m.resize(img.size, Image.LANCZOS))
    return out


def monochrome(art):
    """One colour (white) with alpha: the silhouette minus the dark parts
    (the sunglasses), so the themed icon still reads as the ball."""
    # Smoothed at the source size so sand grains and highlights drop out and
    # only the ball and the frames of the sunglasses stay
    alpha = art.split()[3].point(lambda v: 255 if v > 200 else 0).filter(ImageFilter.MedianFilter(9))
    dark = art.convert('L').point(lambda v: 255 if v < 50 else 0).filter(ImageFilter.MedianFilter(7))
    mask = Image.composite(Image.new('L', art.size, 0), alpha, dark)
    out = Image.new('RGBA', art.size, (255, 255, 255, 0))
    out.putalpha(mask)
    return out


ball_mono = monochrome(ball)

for name, d in DENSITIES.items():
    folder = RES / f'mipmap-{name}'
    folder.mkdir(parents=True, exist_ok=True)
    launcher = round(48 * d)
    legacy = on_canvas(launcher, ball, 0.80)
    rounded(legacy).save(folder / 'ic_launcher.png')
    circle_mask(on_canvas(launcher, ball, 0.74)).save(folder / 'ic_launcher_round.png')
    # adaptive foreground: 108 dp canvas, the visible safe zone is the 66 dp circle
    fg = round(108 * d)
    clear = (0, 0, 0, 0)
    on_canvas(fg, ball, 0.56, background=clear).save(folder / 'ic_launcher_foreground.png')
    on_canvas(fg, ball_mono, 0.56, background=clear).save(folder / 'ic_launcher_monochrome.png')

# Pre-Android-12 splash (Android 12+ draws the adaptive icon on white, see styles.xml)
SPLASH = {
    'drawable': (480, 320),
    'drawable-land-mdpi': (480, 320), 'drawable-land-hdpi': (800, 480),
    'drawable-land-xhdpi': (1280, 720), 'drawable-land-xxhdpi': (1600, 960),
    'drawable-land-xxxhdpi': (1920, 1280),
    'drawable-port-mdpi': (320, 480), 'drawable-port-hdpi': (480, 800),
    'drawable-port-xhdpi': (720, 1280), 'drawable-port-xxhdpi': (960, 1600),
    'drawable-port-xxxhdpi': (1280, 1920),
}
for folder, (w, h) in SPLASH.items():
    canvas = Image.new('RGBA', (w, h), WHITE)
    a, aw, ah = fit(logo, min(w, h) * 0.45)
    canvas.alpha_composite(a, ((w - aw) // 2, (h - ah) // 2))
    (RES / folder).mkdir(parents=True, exist_ok=True)
    canvas.convert('RGB').save(RES / folder / 'splash.png', optimize=True)

# The store / F-Droid icon (fastlane metadata at the repo root): 512 px
STORE_ICON = ROOT.parent.parent / 'fastlane/metadata/android/en-US/images/icon.png'
STORE_ICON.parent.mkdir(parents=True, exist_ok=True)
on_canvas(512, ball, 0.80).convert('RGB').save(STORE_ICON, optimize=True)

print('icons and splash written to', RES, 'and', STORE_ICON)
