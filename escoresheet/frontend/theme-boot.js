/**
 * Colour theme boot (src_beach/utils_beach/theme_beach.js): an inline script
 * at the top of each page's <head> that sets <html data-theme> before the
 * first paint, so a dark or e-ink page does not flash light while the bundle
 * loads, and follows a change made in another tab. Not on the PDF scoresheet
 * page (scoresheet_beach.html): it is the paper form.
 *
 * Its own file (after OpenVolley's theme-boot.js) so the Content-Security-
 * Policy (csp.js) can allow exactly this inline script by its hash. Used by
 * vite.config.js, which every build loads (the subdomain builds too).
 */
export const THEME_BOOT_SCRIPT = "(function(){var r=document.documentElement;function a(){var t;try{t=localStorage.getItem('theme')}catch(e){}if(t==='dark'||t==='eink')r.setAttribute('data-theme',t);else r.removeAttribute('data-theme')}a();addEventListener('storage',function(e){if(e.key==='theme'||e.key===null)a()})})()"

/** Whether the page at this path (vite's transformIndexHtml ctx.path) gets the boot script. */
export function themedPage(path) {
  return !String(path || '').endsWith('/scoresheet_beach.html')
}

/** The vite plugin. */
export function themeBoot() {
  return {
    name: 'theme-boot',
    transformIndexHtml(html, ctx) {
      if (!themedPage(ctx.path)) return html
      return [{ tag: 'script', injectTo: 'head-prepend', children: THEME_BOOT_SCRIPT }]
    }
  }
}
