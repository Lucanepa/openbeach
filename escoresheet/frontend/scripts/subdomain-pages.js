// The subdomain builds' pages (scripts/build-subdomains.js): each app's
// name, entry and HTML. Its own module, free of vite, so tests can read it.
import { THEME_COLOR } from '../pwa-icons.js'

// Subdomain configurations
export const subdomains = {
  beachapp: {
    name: 'OpenBeach eScoresheet',
    shortName: 'Beach',
    description: 'Beach volleyball match scoring application',
    title: 'OpenBeach eScoresheet',
    mainEntry: 'main_beach'
  },
  'beach-referee': {
    name: 'Beach Referee Dashboard',
    shortName: 'Referee',
    description: 'Referee view for beach volleyball match scoring',
    title: 'Beach Referee Dashboard - OpenBeach',
    mainEntry: 'referee-main_beach'
  },
  'beach-livescore': {
    name: 'Beach Live Scoreboard',
    shortName: 'Livescore',
    description: 'Live scoring display for beach volleyball match',
    title: 'Beach Live Scoreboard - OpenBeach',
    mainEntry: 'livescore-main_beach'
  },
  'beach-scoreboard': {
    name: 'Beach Scoreboard Display',
    shortName: 'Scoreboard',
    description: 'Arena scoreboard display for beach volleyball matches',
    title: 'Beach Scoreboard - OpenBeach',
    mainEntry: 'scoreboard-main_beach'
  },
  'beach-scoresheet': {
    name: 'Beach Scoresheet Archive',
    shortName: 'Scoresheet',
    description: 'View and download beach volleyball match scoresheets',
    title: 'Beach Scoresheet Archive - OpenBeach',
    mainEntry: 'scoresheet-main_beach',
    customHtml: true
  }
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
