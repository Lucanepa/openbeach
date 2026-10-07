/**
 * The PDF scoresheet's Tailwind, compiled at build time with Tailwind v3.
 *
 * The scoresheet page (scoresheet_beach.html -> scoresheet_pdf_beach/) used to
 * load cdn.tailwindcss.com at runtime: Tailwind v3's JIT, which left the
 * official sheet and its PDF / ZIP unstyled at a venue with no internet (the
 * Android app, the desktop relay). The sheet was drawn against v3, and v4
 * resolves some of its class pairs differently (`text-center text-left` on
 * one input: v3 centres it, v4 left-aligns it), so it is compiled with the
 * same v3 (`tailwindcss3`, an npm alias) and the default config the CDN uses:
 * the layout stays as it was.
 *
 * scoresheet_pdf_beach/scoresheet_beach.css holds the v3 directives. This
 * plugin runs before @tailwindcss/vite (the app's v4) and hands it compiled
 * CSS, which v4 leaves alone (no directives left).
 */
import { readdirSync } from 'fs'
import { join, resolve } from 'path'
import postcss from 'postcss'
import tailwind3 from 'tailwindcss3'

export const SCORESHEET_CSS = 'scoresheet_pdf_beach/scoresheet_beach.css'

/** The files whose classes the sheet uses (the CDN scanned the page's DOM). */
export const scoresheetContent = (root) => [
  resolve(root, 'scoresheet_pdf_beach/**/*.{tsx,ts,jsx,js}'),
  resolve(root, 'scoresheet_beach.html')
]

/** Compile the scoresheet's v3 stylesheet. */
export async function compileScoresheetCss(css, { root, from }) {
  const result = await postcss([
    tailwind3({ content: scoresheetContent(root) })
  ]).process(css, { from })
  return result.css
}

export default function scoresheetTailwind() {
  let root = process.cwd()
  return {
    name: 'openbeach:scoresheet-tailwind-v3',
    enforce: 'pre',
    configResolved(config) {
      root = config.root
    },
    async transform(code, id) {
      const file = id.split('?')[0]
      if (file !== resolve(root, SCORESHEET_CSS)) return null
      // dev: a class added to the sheet recompiles it
      const dir = resolve(root, 'scoresheet_pdf_beach')
      for (const f of readdirSync(dir, { recursive: true })) {
        if (/\.(tsx?|jsx?)$/.test(f)) this.addWatchFile(join(dir, f))
      }
      this.addWatchFile(resolve(root, 'scoresheet_beach.html'))
      return { code: await compileScoresheetCss(code, { root, from: file }), map: null }
    }
  }
}
