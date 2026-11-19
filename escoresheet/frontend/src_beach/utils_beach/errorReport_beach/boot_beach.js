/**
 * Imported FIRST by every entry (before App and the rest load): the error
 * reporter is listening while the page's other modules are evaluated, so a
 * page that fails to start is reported too. The tool is guessed from the
 * address here; the entry then names it exactly (setErrorTool).
 */
import { installErrorReporter } from './index_beach'

/** The tool of this page by its host or path (the build per subdomain, or the paths of one build). */
export function guessTool(loc = typeof location !== 'undefined' ? location : null) {
  const host = String(loc?.hostname || '')
  const path = String(loc?.pathname || '')
  const sub = host.split('.')[0]
  // OpenBeach: the tournament admin is its manager, the scoreboard its own tool
  for (const [re, tool] of [[/admin/, 'manager'], [/referee/, 'referee'], [/livescore/, 'livescore'], [/scoresheet/, 'scoresheet'], [/scoreboard/, 'scoreboard']]) {
    if (re.test(sub) || re.test(path)) return tool
  }
  return 'scorer'
}

installErrorReporter({ tool: guessTool(), product: 'openbeach' })
