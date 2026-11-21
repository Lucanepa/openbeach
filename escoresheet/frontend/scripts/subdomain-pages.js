// The subdomain builds' pages (scripts/build-subdomains.js): each app's
// name, entry and HTML. Its own module, free of vite, so tests can read it.
import { existsSync, readFileSync } from 'fs'
import { basename, resolve } from 'path'
import { THEME_COLOR } from '../pwa-icons.js'

// The pages next to index.html, in the main build (vite.config.js: desktop,
// Android, dev) and on beach.openvolley.app (the beachapp build below). The
// scoretable opens them on its own origin: the PDF scoresheet window
// (/scoresheet_beach.html, its data in the scorer's sessionStorage), Open
// scoreboard (/scoreboard_beach.html?mode=local), the competitions admin, the
// referee and livescore views and the archive. The keys are vite.config.js's
// input names. beach.openvolley.app had only its index.html, so each of these
// answered 404 with the scoretable and the match-end PDF never came
// (21.11.2026).
export const APP_PAGES = Object.freeze({
  referee: './referee_beach.html',
  livescore: './livescore_beach.html',
  scoresheet: './scoresheet_beach.html',
  scoresheetArchive: './scoresheet_archive_beach.html',
  admin: './admin_beach.html',
  scoreboard: './scoreboard_beach.html'
})

// Subdomain configurations. Each PWA has its own name (its manifest, written
// by build-subdomains.js), so an installed referee or livescore app is not
// one more "OpenBeach eScoresheet" on the home screen. short_name is what a
// launcher shows under the icon (about 12 characters fit). host: the site's
// custom domain on Cloudflare Pages (the <function>-beach names; the build
// keys kept their old beach-<function> names). pages: the pages built next
// to its index.html.
export const subdomains = {
  beachapp: {
    name: 'OpenBeach eScoresheet',
    shortName: 'OpenBeach',
    description: 'Beach volleyball match scoring application',
    title: 'OpenBeach eScoresheet',
    mainEntry: 'main_beach',
    host: 'beach.openvolley.app',
    pages: APP_PAGES
  },
  'beach-referee': {
    name: 'OpenBeach Referee',
    shortName: 'OB Referee',
    description: 'Referee view for beach volleyball match scoring',
    title: 'OpenBeach Referee',
    mainEntry: 'referee-main_beach',
    host: 'referee-beach.openvolley.app'
  },
  'beach-livescore': {
    name: 'OpenBeach Livescore',
    shortName: 'OB Livescore',
    description: 'Live scoring display for beach volleyball match',
    title: 'OpenBeach Livescore',
    mainEntry: 'livescore-main_beach',
    host: 'livescore-beach.openvolley.app'
  },
  // No site of its own: the scoreboard opens on the scoretable's origin
  // (/scoreboard_beach.html, beachapp's pages)
  'beach-scoreboard': {
    name: 'OpenBeach Scoreboard',
    shortName: 'OB Board',
    description: 'Arena scoreboard display for beach volleyball matches',
    title: 'OpenBeach Scoreboard',
    mainEntry: 'scoreboard-main_beach'
  },
  'beach-scoresheet': {
    name: 'OpenBeach Scoresheets',
    shortName: 'OB Sheets',
    description: 'View and download beach volleyball match scoresheets',
    title: 'OpenBeach Scoresheets',
    mainEntry: 'scoresheet-main_beach',
    host: 'scoresheet-beach.openvolley.app',
    customHtml: true
  }
}

/** The public host of a subdomain build. */
export function hostFor(name) {
  return subdomains[name]?.host || `${name}.openvolley.app`
}

/**
 * The HTML pages a build's output must hold: index.html and its pages.
 * @param {object} config a subdomains entry
 */
export function builtPageNames(config) {
  return ['index.html', ...Object.values(config.pages || {}).map((p) => basename(p))]
}

/**
 * What a finished build lacks: each page that is not in its output, and,
 * with a service worker, each page its precache does not list (offline at a
 * beach, an unlisted page fails). An empty list when all is there.
 * build-subdomains.js fails the build on any, so Cloudflare Pages keeps the
 * last good deploy instead of publishing a site without its sheet page.
 * @param {string} outDir
 * @param {object} config a subdomains entry
 * @param {{ pwa?: boolean }} [opts]
 * @returns {string[]}
 */
export function missingFromBuild(outDir, config, { pwa = true } = {}) {
  const problems = []
  const swPath = resolve(outDir, 'sw.js')
  const sw = pwa && existsSync(swPath) ? readFileSync(swPath, 'utf8') : null
  if (pwa && sw === null) problems.push('sw.js')
  for (const page of builtPageNames(config)) {
    if (!existsSync(resolve(outDir, page))) problems.push(page)
    else if (sw !== null && !sw.includes(`"${page}"`)) problems.push(`${page} (not precached in sw.js)`)
  }
  return problems
}

function createIndexHtml(config) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="/favicon.ico" sizes="32x32" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="${THEME_COLOR}" />
    <meta name="description" content="${config.description}" />
    <title>${config.title}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src_beach/${config.mainEntry}.jsx"></script>
  </body>
</html>
`
}

function createScoresheetHtml(config) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="icon" href="/favicon.ico" sizes="32x32" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <meta name="theme-color" content="${THEME_COLOR}" />
  <meta name="description" content="${config.description}" />
  <title>${config.title}</title>
  <!-- No CDN: the archive app brings its own Tailwind (src_beach/tailwind_beach.css) -->
  <style>
    /* Global Font Setting */
    body {
      font-family: 'Aptos Display', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }

    /* Custom print styles to ensure background graphics/colors print */
    @media print {
      html,
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        margin: 0 !important;
        padding: 0 !important;
        height: 100% !important;
        overflow: hidden !important;
      }

      @page {
        size: A4 landscape;
        margin: 0;
      }

      #root {
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        height: 100vh !important;
        max-height: 100vh !important;
      }
    }

    /* Hide scrollbar for cleaner look in inputs */
    input[type="number"]::-webkit-inner-spin-button,
    input[type="number"]::-webkit-outer-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }

    .vertical-text {
      writing-mode: vertical-lr;
      transform: rotate(180deg);
    }

    /* Dense table utils */
    .input-dense {
      text-align: center;
      background-color: transparent;
      width: 100%;
      height: 100%;
      outline: none;
    }

    .input-dense:focus {
      background-color: rgba(59, 130, 246, 0.1);
    }
  </style>
</head>
<body class="bg-gray-100 text-gray-900 antialiased print:bg-white text-[10px] overflow-auto">
  <div id="root"></div>
  <script type="module" src="/src_beach/${config.mainEntry}.jsx"></script>
</body>
</html>
`
}

/** A page's HTML as the build writes it (tests). */
export function htmlFor(config) {
  return config.customHtml ? createScoresheetHtml(config) : createIndexHtml(config)
}
