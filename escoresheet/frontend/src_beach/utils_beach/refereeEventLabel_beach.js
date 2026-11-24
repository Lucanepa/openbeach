// The referee screen's "Last action" text. Scores are printed as on the
// court the referee sees: the left team first, each with its letter
// ("A 20 : 16 B"), as on the scorer screen.

import { medicalEventLabel } from './refereeMedical_beach'

// Unsuccessful team BMP requests a team may make per set, as on the
// scorer's BMP button (Scoreboard_beach: 2 - unsuccessful used)
export const BMP_PER_SET = 2

export const REFEREE_DISPLAYABLE_EVENTS = [
  'point', 'timeout', 'set_end', 'sanction', 'court_captain_designation',
  'challenge', 'challenge_outcome', 'referee_bmp_request', 'referee_bmp_outcome',
  'mto', 'rit', 'medical_end'
]

/** "A 20 : 16 B" */
export function courtScore({ leftLabel, rightLabel, leftPoints, rightPoints }) {
  return `${leftLabel} ${leftPoints ?? 0} : ${rightPoints ?? 0} ${rightLabel}`
}

const SANCTION_SHORT = {
  improper_request: 'IR',
  delay_warning: 'DW',
  delay_penalty: 'DP',
  warning: 'W',
  penalty: 'P',
  expulsion: 'EXP',
  disqualification: 'DQ'
}

/**
 * @param {{type: string, team?: string, data?: object}} lastEvent
 * @param {object} ctx
 *   team1Label / team2Label: 'A' | 'B'
 *   team1Short / team2Short: the team names
 *   leftLabel / rightLabel, leftPoints / rightPoints: the court as seen
 *   t: i18next's t
 */
export function refereeEventLabel(lastEvent, ctx) {
  if (!lastEvent) return ''
  const t = typeof ctx.t === 'function' ? ctx.t : (_k, d) => (typeof d === 'string' ? d : d?.defaultValue || '')
  const team = lastEvent.team
  const teamLetter = team === 'team1' ? ctx.team1Label : team === 'team2' ? ctx.team2Label : ''
  const teamShort = team === 'team1' ? ctx.team1Short : team === 'team2' ? ctx.team2Short : ''
  const score = courtScore(ctx)
  const teamInfo = teamLetter ? `${teamLetter} ${teamShort || ''}`.trim() : ''
  const withScore = (text) => [text, teamInfo, `(${score})`].filter(Boolean).join(' ')
  const data = lastEvent.data || {}

  switch (lastEvent.type) {
    case 'point':
      return withScore(t('refereeDashboard.events.point', 'Point'))
    case 'timeout':
      return withScore(t('refereeDashboard.events.timeout', 'Timeout'))
    case 'challenge':
      return withScore(t('referee.events.teamBmp', 'Team BMP'))
    case 'challenge_outcome': {
      const result = data.result
      const resultLabel = result === 'successful' ? t('referee.events.successful', 'successful')
        : result === 'unsuccessful' ? t('referee.events.unsuccessful', 'unsuccessful')
          : result === 'judgment_impossible' ? t('referee.events.judgmentImpossible', 'judgment impossible')
            : (result || '')
      return withScore(`${t('referee.events.teamBmp', 'Team BMP')}: ${resultLabel}`)
    }
    case 'referee_bmp_request':
      return `${t('referee.events.refereeBmp', 'Referee BMP')} (${score})`
    case 'referee_bmp_outcome': {
      const result = data.result
      const resultLabel = result === 'in' ? 'IN'
        : result === 'out' ? 'OUT'
          : result === 'judgment_impossible' ? t('referee.events.judgmentImpossible', 'judgment impossible')
            : (result || '')
      const pointTo = data.pointAwarded && data.pointToTeam
        ? ` → ${data.pointToTeam === 'team1' ? ctx.team1Label : ctx.team2Label}`
        : ''
      return `${t('referee.events.refereeBmp', 'Referee BMP')}: ${resultLabel}${pointTo} (${score})`
    }
    case 'set_end':
      return t('refereeDashboard.events.setEnd', { set: data.setIndex || '', defaultValue: 'Set {{set}} ended' })
    case 'sanction': {
      const short = SANCTION_SHORT[data.type] || data.type || ''
      const isTeamSanction = ['delay_warning', 'delay_penalty', 'improper_request'].includes(data.type)
      const member = !isTeamSanction && data.playerNumber ? `#${data.playerNumber}` : ''
      return [short, teamInfo, member, `(${score})`].filter(Boolean).join(' ')
    }
    case 'court_captain_designation':
      return `${t('refereeDashboard.events.courtCaptainDesignation', 'Court captain')} ${teamInfo} #${data.playerNumber || '?'}`
    case 'mto':
    case 'rit':
    case 'medical_end':
      return medicalEventLabel(lastEvent.type, { ...data, team: data.team || team }, { teamLetter, t })
    default:
      return ''
  }
}
