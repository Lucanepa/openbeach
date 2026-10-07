"""Every OpenBeach logo raster, rendered from the SVGs in brand/.

    cd escoresheet/frontend && python3 scripts/make-brand-assets.py

The OpenBeach copy of OpenVolley's scripts/make-brand-assets.py (logo B2
"sun": OpenVolley's ball on a dune #efd8ae disc / tile). Rerun after changing
a file in brand/ (see brand/README.md), check the renders, commit them with
the SVG. It writes:

- public_beach/: favicon.svg, favicon.ico, apple-touch-icon.png,
  icon-192/512.png and icon-maskable-192/512.png (PWA manifest, pwa-icons.js),
  beachball.png (the serve indicator)
- android/app/src/main/res: launcher icons (square, round, adaptive
  foreground, themed-icon monochrome) for every density, pre-Android-12 splash
- fastlane/metadata/android/en-US/images/icon.png (repo root): store icon

The desktop app's icons live in OpenVolley (src-tauri/icons/beach, its
brand/beach/ and scripts/make-beach-icons.py), from the same icon-tile.svg.

The SVGs are rasterised by resvg through the Tauri CLI (`tauri icon --png`,
works offline): $TAURI_CLI, else node_modules/.bin/tauri, else
`npx --yes @tauri-apps/cli@2`. Pillow composes, crops and writes the .ico.
"""
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent          # escoresheet/frontend
REPO = ROOT.parent.parent
BRAND = ROOT / 'brand'
PUBLIC = ROOT / 'public_beach'
RES = ROOT / 'android/app/src/main/res'
DUNE = (0xef, 0xd8, 0xae, 255)                          # the OpenBeach colour
WHITE = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)


def _tauri():
    if os.environ.get('TAURI_CLI'):
        return [os.environ['TAURI_CLI']]
    local = ROOT / 'node_modules/.bin/tauri'
    if local.exists():
        return [str(local)]
    return ['npx', '--yes', '@tauri-apps/cli@2']


TAURI = _tauri()
_tmp = Path(tempfile.mkdtemp(prefix='ob-brand-'))
_cache = {}


def _svg(name):
    return (BRAND / name).read_text()


def _viewbox(text):
    return [float(v) for v in re.search(r'viewBox="([^"]+)"', text).group(1).split()]


def _in_square(text, w, h):
    """text drawn into a w x h box (top left) of a max(w, h) square canvas,
    since resvg (tauri icon) renders square outputs only."""
    vb = ' '.join(f'{v:g}' for v in _viewbox(text))
    inner = text[text.index('>') + 1:text.rindex('</svg>')]
    side = max(w, h)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {side} {side}">'
            f'<svg x="0" y="0" width="{w}" height="{h}" viewBox="{vb}">{inner}</svg></svg>')


def render(name, w, h=None):
    """brand/<name> rasterised to w x h px (aspect kept), RGBA."""
    h = h or w
    key = (name, w, h)
    if key not in _cache:
        text = _svg(name) if w == h else _in_square(_svg(name), w, h)
        side = max(w, h)
        n = len(_cache)
        (_tmp / f'{n}.svg').write_text(text)
        subprocess.run([*TAURI, 'icon', str(_tmp / f'{n}.svg'), '--png', str(side), '-o', str(_tmp / str(n))],
                       check=True, capture_output=True, cwd=ROOT)
        im = Image.open(_tmp / str(n) / f'{side}x{side}.png').convert('RGBA')
        _cache[key] = im.crop((0, 0, w, h))
    return _cache[key].copy()


def fit_box(name, box):
    """brand/<name> scaled to fit a box x box square, at its own aspect."""
    _, _, vw, vh = _viewbox(_svg(name))
    s = box / max(vw, vh)
    return render(name, max(1, round(vw * s)), max(1, round(vh * s)))


def on_canvas(size, name, fraction=1.0, background=WHITE):
    canvas = Image.new('RGBA', (size, size), background)
    art = fit_box(name, round(size * fraction))
    canvas.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2))
    return canvas


def masked(img, shape):
    ss = 4
    m = Image.new('L', (img.width * ss, img.height * ss), 0)
    if shape == 'circle':
        ImageDraw.Draw(m).ellipse((0, 0, m.width - 1, m.height - 1), fill=255)
    out = Image.new('RGBA', img.size, CLEAR)
    out.paste(img, (0, 0), m.resize(img.size, Image.LANCZOS))
    return out


def rel(path):
    return path.relative_to(REPO)


def save_png(im, path, rgb=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    (im.convert('RGB') if rgb else im).save(path, optimize=True)
    print('wrote', rel(path))


def save_ico(path, entries):
    """entries {size: brand svg}: every size drawn at its own size, no downscaling."""
    images = [render(name, s) for s, name in sorted(entries.items())]
    images[-1].save(path, format='ICO', sizes=[im.size for im in images], append_images=images[:-1])
    print('wrote', rel(path))


# ---- web ---------------------------------------------------------------
shutil.copyfile(BRAND / 'favicon.svg', PUBLIC / 'favicon.svg')
print('wrote', rel(PUBLIC / 'favicon.svg'))
# favicon.svg is the small-size cut (a fuller tile, the ball near its edge)
save_ico(PUBLIC / 'favicon.ico', {s: 'favicon.svg' for s in (16, 32, 48, 64, 128, 256)})
# iOS rounds the corners itself: the tile full bleed (dune square, the ball as in the tile)
save_png(on_canvas(180, 'icon-tile.svg', background=DUNE), PUBLIC / 'apple-touch-icon.png', rgb=True)
for s in (192, 512):
    save_png(render('icon-tile.svg', s), PUBLIC / f'icon-{s}.png')
    # maskable: full-bleed dune, the ball (diameter 59 %) inside the 80 % safe circle
    save_png(on_canvas(s, 'icon-tile.svg', background=DUNE), PUBLIC / f'icon-maskable-{s}.png', rgb=True)
# The serve indicator (20 to 130 px on screen): the ball on its dune disc
save_png(render('mark.svg', 512), PUBLIC / 'beachball.png')

# ---- Android -----------------------------------------------------------
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
for dens, d in DENSITIES.items():
    folder = RES / f'mipmap-{dens}'
    launcher = round(48 * d)   # legacy icons (API < 26): the dune tile, the dune disc
    save_png(render('icon-tile.svg', launcher), folder / 'ic_launcher.png')
    save_png(masked(render('mark.svg', launcher), 'circle'), folder / 'ic_launcher_round.png')
    fg = round(108 * d)        # adaptive layers: 108 dp canvas, 66 dp safe circle
    save_png(render('adaptive-foreground.svg', fg), folder / 'ic_launcher_foreground.png')
    save_png(render('adaptive-monochrome.svg', fg), folder / 'ic_launcher_monochrome.png')

# Pre-Android-12 splash (12+ draws the adaptive foreground on a dune disc, styles.xml)
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
    art = fit_box('lockup.svg', round(min(w, h) * 0.7))   # one-line lockup, 70 % of the short side wide
    canvas.alpha_composite(art, ((w - art.width) // 2, (h - art.height) // 2))
    save_png(canvas, RES / folder / 'splash.png', rgb=True)

# ---- store listing (F-Droid / fastlane) ----------------------------------
save_png(render('icon-tile.svg', 512), REPO / 'fastlane/metadata/android/en-US/images/icon.png')

shutil.rmtree(_tmp, ignore_errors=True)
