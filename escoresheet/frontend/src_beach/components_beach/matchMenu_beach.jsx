import {
  Users, ListChecks, ScrollText, MessageSquareText, IdCard,
  SlidersHorizontal, MonitorPlay, KeyRound, Download, Settings, Ban
} from 'lucide-react'

/**
 * The scorer's "Menu" (scoreboard toolbar), grouped instead of one flat list
 * with "Stop the match" in the middle. Most used first, the destructive
 * "Stop the match" alone at the end:
 *
 *   Match info      rosters, sanctions and results, action log, remarks, match setup
 *   Corrections     manual changes
 *   Devices & data  open scoreboard, PINs, download game data
 *   Settings        options
 *   End of match    stop the match (red; it opens its own confirmation)
 *
 * Ported from OpenVolley src/components/matchMenu.jsx (3296d997, f8ec14e7),
 * with the beach rows: no roster reopening (beach teams of two are set up
 * before the match), "Open scoreboard" with the devices.
 *
 * `actions` holds the handlers (the Scoreboard's own setters); a missing
 * handler drops its row (openMatchSetup only exists when the page offers it).
 *
 * @param {Function} t i18next t
 * @param {Record<string, Function|undefined>} actions
 * @returns {Array<{ key: string, title: string, danger?: boolean,
 *   items: Array<{ key: string, Icon: any, label: string, onClick: Function, danger?: boolean }> }>}
 */
export function matchMenuSections(t, actions) {
  const row = (key, Icon, label, action, extra = {}) => (action ? [{ key, Icon, label, onClick: action, ...extra }] : [])
  const sections = [
    {
      key: 'info',
      title: t('scoreboard.menu.sections.matchInfo', 'Match info'),
      items: [
        ...row('rosters', Users, t('scoreboard.menu.showRosters', 'Show rosters'), actions.showRosters),
        ...row('sanctions', ListChecks, t('scoreboard.menu.showSanctionsResults', 'Show sanctions and results'), actions.showSanctions),
        ...row('action-log', ScrollText, t('scoreboard.menu.showActionLog', 'Show action log'), actions.showActionLog),
        ...row('remarks', MessageSquareText, t('scoreboard.menu.openRemarksRecording', 'Open remarks recording'), actions.openRemarks),
        ...row('match-setup', IdCard, t('scoreboard.menu.showMatchSetup', 'Show match setup'), actions.openMatchSetup)
      ]
    },
    {
      key: 'corrections',
      title: t('scoreboard.menu.sections.corrections', 'Corrections'),
      items: [
        ...row('manual', SlidersHorizontal, t('scoreboard.menu.manualChanges', 'Manual changes'), actions.manualChanges)
      ]
    },
    {
      key: 'devices',
      title: t('scoreboard.menu.sections.devicesData', 'Devices and data'),
      items: [
        ...row('open-scoreboard', MonitorPlay, t('scoreboard.menu.openScoreboard', 'Open scoreboard'), actions.openScoreboard),
        ...row('pins', KeyRound, t('scoreboard.menu.showPins', 'Show PINs'), actions.showPins),
        ...row('export', Download, t('scoreboard.menu.downloadGameData', 'Download game data (JSON)'), actions.downloadGameData)
      ]
    },
    {
      key: 'settings',
      title: t('scoreboard.menu.sections.settings', 'Settings'),
      items: [
        ...row('options', Settings, t('scoreboard.menu.options', 'Options'), actions.options)
      ]
    },
    {
      key: 'end',
      danger: true,
      title: t('scoreboard.menu.sections.endOfMatch', 'End of match'),
      items: [
        ...row('stop-match', Ban, t('scoreboard.menu.stopMatch', 'Stop the match'), actions.stopMatch, { danger: true })
      ]
    }
  ]
  return sections.filter(s => s.items.length > 0)
}

/**
 * The sections as MenuList_beach items: a header per group, a hairline before
 * the destructive group, the icon drawn as an element.
 */
export function toMenuListItems(sections) {
  const items = []
  for (const section of sections) {
    if (section.danger && items.length > 0) items.push({ separator: true })
    items.push({ key: `section-${section.key}`, header: section.title })
    for (const { Icon, danger, ...item } of section.items) {
      items.push({
        ...item,
        icon: <Icon size={18} className={danger ? 'text-red-600' : undefined} />,
        ...(danger ? { className: 'text-red-600 hover:bg-red-50' } : {})
      })
    }
  }
  return items
}
