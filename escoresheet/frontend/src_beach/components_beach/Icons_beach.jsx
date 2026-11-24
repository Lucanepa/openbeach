/**
 * Icons_beach - inline SVG icon set.
 *
 * These replace the pictographic emoji that used to stand in for icons in the
 * UI. Emoji are drawn by the operating system as colour bitmaps: they ignore
 * `color` and `font-weight`, and every platform (Windows / macOS / Android /
 * the referee's tablet) ships a different picture for the same codepoint. An
 * inline SVG inherits `currentColor` and, by default, sizes itself in `em`, so
 * an icon always matches the colour and size of the label beside it.
 *
 * Icons are lucide (24x24 grid, stroke-width 2, round caps) unless noted;
 * the few lucide lacks come from tabler / hugeicons re-cut to the same grammar.
 * No runtime dependency - the path data is inlined.
 *
 * Usage:
 *   <Volleyball />                          matches the surrounding font-size
 *   <Volleyball size={18} />                explicit px
 *   <Card style={{ color: '#eab308' }} />   any CSS colour
 *   <Card fill="currentColor" />            solid instead of outlined
 */

const SVG_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
}

function icon(name, body) {
  const Icon = ({ size = '1em', style, ...rest }) => (
    <svg
      {...SVG_PROPS}
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      style={{ display: 'inline-block', verticalAlign: '-0.125em', flexShrink: 0, ...style }}
      {...rest}
    >
      {body}
    </svg>
  )
  Icon.displayName = name
  return Icon
}

export const ArrowLeftRight = icon('ArrowLeftRight', <><path d="M8 3L4 7l4 4M4 7h16m-4 14l4-4l-4-4m4 4H4" /></>) // lucide:arrow-left-right
export const Bell = icon('Bell', <><path d="M10.268 21a2 2 0 0 0 3.464 0m-10.47-5.674A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" /></>) // lucide:bell
export const BookOpen = icon('BookOpen', <><path d="M12 5v16m8.001-2A2 2 0 0 0 22 17V5a2 2 0 0 0-1.999-2L16 3.002A5 5 0 0 0 12 5a5 5 0 0 0-4-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 1.999 2H8a5 5 0 0 1 4 2a5 5 0 0 1 4-2z" /></>) // lucide:book-open
export const Camera = icon('Camera', <><path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z" /><circle cx="12" cy="13" r="3" /></>) // lucide:camera
export const Card = icon('Card', <><rect width="12" height="20" x="6" y="2" rx="2" /></>) // lucide:rectangle-vertical
export const ChartColumn = icon('ChartColumn', <><path d="M3 3v16a2 2 0 0 0 2 2h16m-3-4V9m-5 8V5M8 17v-3" /></>) // lucide:chart-column
export const Check = icon('Check', <><path d="M20 6L9 17l-5-5" /></>) // lucide:check
export const CircleAlert = icon('CircleAlert', <><circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" /></>) // lucide:circle-alert
export const ClipboardList = icon('ClipboardList', <><rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2m4 7h4m-4 5h4m-8-5h.01M8 16h.01" /></>) // lucide:clipboard-list
export const CloudUpload = icon('CloudUpload', <><path d="M12 13v8m-8-6.101A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" /><path d="m8 17l4-4l4 4" /></>) // lucide:cloud-upload
export const Coin = icon('Coin', <><path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0" /><path d="M14.8 9A2 2 0 0 0 13 8h-2a2 2 0 1 0 0 4h2a2 2 0 1 1 0 4h-2a2 2 0 0 1-1.8-1M12 7v10" /></>) // tabler:coin
export const Copy = icon('Copy', <><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></>) // lucide:copy
export const Database = icon('Database', <><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14a9 3 0 0 0 18 0V5" /><path d="M3 12a9 3 0 0 0 18 0" /></>) // lucide:database
export const Download = icon('Download', <><path d="M12 15V3m9 12v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10l5 5l5-5" /></>) // lucide:download
export const FileText = icon('FileText', <><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" /><path d="M14 2v5a1 1 0 0 0 1 1h5M10 9H8m8 4H8m8 4H8" /></>) // lucide:file-text
export const Globe = icon('Globe', <><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20a14.5 14.5 0 0 0 0-20M2 12h20" /></>) // lucide:globe
export const House = icon('House', <><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" /><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>) // lucide:house
export const Info = icon('Info', <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4m0-4h.01" /></>) // lucide:info
export const Keyboard = icon('Keyboard', <><path d="M10 8h.01M12 12h.01M14 8h.01M16 12h.01M18 8h.01M6 8h.01M7 16h10m-9-4h.01" /><rect width="20" height="16" x="2" y="4" rx="2" /></>) // lucide:keyboard
export const Lightbulb = icon('Lightbulb', <><path d="M15 14c.2-1 .7-1.7 1.5-2.5c1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5c.7.7 1.3 1.5 1.5 2.5m0 4h6m-5 4h4" /></>) // lucide:lightbulb
export const Link = icon('Link', <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>) // lucide:link
export const LockOpen = icon('LockOpen', <><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" /></>) // lucide:lock-open
export const Monitor = icon('Monitor', <><rect width="20" height="14" x="2" y="3" rx="2" /><path d="M8 21h8m-4-4v4" /></>) // lucide:monitor
export const Moon = icon('Moon', <><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" /></>) // lucide:moon
export const NotebookPen = icon('NotebookPen', <><path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4M2 6h4m-4 4h4m-4 4h4m-4 4h4" /><path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z" /></>) // lucide:notebook-pen
export const OctagonX = icon('OctagonX', <><path d="m15 9l-6 6m-6.414 1.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586zM9 9l6 6" /></>) // lucide:octagon-x
export const Pause = icon('Pause', <><rect width="5" height="18" x="14" y="3" rx="1" /><rect width="5" height="18" x="5" y="3" rx="1" /></>) // lucide:pause
export const Play = icon('Play', <><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" /></>) // lucide:play
export const Plus = icon('Plus', <><path d="M5 12h14m-7-7v14" /></>) // lucide:plus
export const RefreshCw = icon('RefreshCw', <><path d="M3 12a9 9 0 0 1 9-9a9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5m5 4a9 9 0 0 1-9 9a9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></>) // lucide:refresh-cw
export const Rocket = icon('Rocket', <><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09" /><path d="M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05" /></>) // lucide:rocket
export const RotateCw = icon('RotateCw', <><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></>) // lucide:rotate-cw
export const SatelliteDish = icon('SatelliteDish', <><path d="M4 10a7.31 7.31 0 0 0 10 10Zm5 5l3-3m5 1a6 6 0 0 0-6-6m10 6A10 10 0 0 0 11 3" /></>) // lucide:satellite-dish
export const Save = icon('Save', <><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7M7 3v4a1 1 0 0 0 1 1h7" /></>) // lucide:save
export const Search = icon('Search', <><path d="m21 21l-4.34-4.34" /><circle cx="11" cy="11" r="8" /></>) // lucide:search
export const Settings = icon('Settings', <><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0a2.34 2.34 0 0 0 3.319 1.915a2.34 2.34 0 0 1 2.33 4.033a2.34 2.34 0 0 0 0 3.831a2.34 2.34 0 0 1-2.33 4.033a2.34 2.34 0 0 0-3.319 1.915a2.34 2.34 0 0 1-4.659 0a2.34 2.34 0 0 0-3.32-1.915a2.34 2.34 0 0 1-2.33-4.033a2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" /><circle cx="12" cy="12" r="3" /></>) // lucide:settings
export const Shield = icon('Shield', <><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></>) // lucide:shield
export const Signature = icon('Signature', <><path d="m21 17l-2.156-1.868A.5.5 0 0 0 18 15.5v.5a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1c0-2.545-3.991-3.97-8.5-4a1 1 0 0 0 0 5c4.153 0 4.745-11.295 5.708-13.5a2.5 2.5 0 1 1 3.31 3.284M3 21h18" /></>) // lucide:signature
export const Smartphone = icon('Smartphone', <><rect width="14" height="20" x="5" y="2" rx="2" ry="2" /><path d="M12 18h.01" /></>) // lucide:smartphone
export const SquareNumber3 = icon('SquareNumber3', <><path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M10 9a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-2h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1" /></>) // tabler:square-number-3
export const Sun = icon('Sun', <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></>) // lucide:sun
export const Target = icon('Target', <><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></>) // lucide:target
export const Timer = icon('Timer', <><path d="M10 2h4m-2 12l3-3" /><circle cx="12" cy="14" r="8" /></>) // lucide:timer
export const Trash = icon('Trash', <><path d="M10 11v6m4-6v6m5-11v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>) // lucide:trash-2
export const TrendingUp = icon('TrendingUp', <><path d="M16 7h6v6" /><path d="m22 7l-8.5 8.5l-5-5L2 17" /></>) // lucide:trending-up
export const TriangleAlert = icon('TriangleAlert', <><path d="m21.73 18l-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4m0 4h.01" /></>) // lucide:triangle-alert
export const Trophy = icon('Trophy', <><path d="M10 14.66V17a1 1 0 0 1-1 1a2 2 0 0 0-2 2v2m7-7.34V17a1 1 0 0 0 1 1a2 2 0 0 1 2 2v2m.916-12H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3M4 22h16" /><path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z" /><path d="M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3" /></>) // lucide:trophy
export const Undo = icon('Undo', <><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" /></>) // lucide:undo-2
export const Users = icon('Users', <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3.128a4 4 0 0 1 0 7.744M22 21v-2a4 4 0 0 0-3-3.87" /><circle cx="9" cy="7" r="4" /></>) // lucide:users
export const Volleyball = icon('Volleyball', <><path d="M11 7a16 16 20 0 1 10.98 4.362M12 12a13 13 0 0 1-8.66 5m13.49-3.366a16 16 0 0 1-9.267 7.328" /><path d="M20.66 17A13 13 0 0 0 12 12a13 13 0 0 1 0-10M8.17 15.366a16 16 0 0 1-1.713-11.69" /><circle cx="12" cy="12" r="10" /></>) // lucide:volleyball
export const Whistle = icon('Whistle', <><path d="M3.104 11.525c1.448-2.087 3.964-2.66 5.434-2.524h2.523c.528.09.673.309 1.327 1.342c.119.324 2.054.106 2.563.159c.558-.541 0-1.651 1.24-1.494c2.129 0 4.168-.091 5.102.046c.385.057.57.405.626.79c.223 1.55-.043 2.685-.3 2.944c-.687 1.216-2.669 2.395-3.651 2.208c-2.835 0-3.448-.074-3.694.396l-.864 2.235c-.577 1.23-2.6 3.656-5.994 3.344s-4.869-3.026-5.172-4.314c-.303-.824-.59-3.043.86-5.132M13.49 5.003V3.002m-2.496 3.002l-.998-1m5.989 1l.998-1" /><path d="M8.084 17a2 2 0 1 0 0-4a2 2 0 0 0 0 4Z" /></>) // hugeicons:whistle
export const Wrench = icon('Wrench', <><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z" /></>) // lucide:wrench
export const X = icon('X', <><path d="M18 6L6 18M6 6l12 12" /></>) // lucide:x
export const Zap = icon('Zap', <><path d="M15.914 4a1.5 1.5 0 0 0-2.474-1.561l-9 9A1.5 1.5 0 0 0 5.5 14h4.002a.5.5 0 0 1 .471.666L8.086 20a1.5 1.5 0 0 0 2.475 1.56l9-9A1.5 1.5 0 0 0 18.5 10h-3.997a.5.5 0 0 1-.472-.667z" /></>) // lucide:zap
