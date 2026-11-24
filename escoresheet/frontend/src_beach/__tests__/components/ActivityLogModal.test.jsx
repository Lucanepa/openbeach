// The beach activity log in the app (ActivityLogModal_beach) and its entry
// in the options (ActivityLogSection_beach). Ported from OpenVolley
// src/components/__tests__/ActivityLogModal.test.jsx.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k, opts) => (opts && typeof opts === 'object' && opts.count != null ? `${k}:${opts.count}` : k) })
}))

import { db } from '../../db_beach/db_beach'
import ActivityLogModal, { activityExport, activityFilterOf } from '../../components_beach/ActivityLogModal_beach'
import ActivityLogSection from '../../components_beach/options/ActivityLogSection_beach'

const row = (uid, kind, extra = {}) => ({ uid, ts: `2026-10-07T10:00:0${uid.length}.000Z`, kind, level: 'info', app: 'beach', matchId: 7, data: {}, synced: 0, ...extra })

describe('ActivityLogModal_beach', () => {
  beforeEach(async () => {
    await db.open()
    await db.activity_log.clear()
    await db.activity_log.bulkAdd([
      row('a', 'event.add', { data: { type: 'point', team: 'team1', scoreA: 1, scoreB: 0 }, synced: 1 }),
      row('bb', 'event.undo', { data: { type: 'point', seq: 3, reason: 'undo' } }),
      row('ccc', 'sync.error', { level: 'warn', data: { resource: 'event', action: 'void', status: 409, code: 'OV_MATCH_CLOSED' }, synced: 2 }),
      row('dddd', 'app.start', { matchId: null })
    ])
  })

  it('shows the entries of the match, newest first, with their upload state and filters', async () => {
    render(<ActivityLogModal open matchId={7} onClose={() => {}} />)
    const list = await screen.findByTestId('activity-list')
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0].textContent).toContain('activity.kinds.sync_error')
    expect(items[0].textContent).toContain('activity.status.local')
    expect(items[2].textContent).toContain('point team1 1:0')
    expect(items[2].textContent).toContain('activity.status.uploaded')
    expect(screen.getByText('activity.notUploaded:1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /activity.filters.corrections/ }))
    await waitFor(() => expect(within(screen.getByTestId('activity-list')).getAllByRole('listitem')).toHaveLength(1))
    expect(screen.getByTestId('activity-list').textContent).toContain('activity.kinds.event_undo')
  })

  it('exports CSV without formulas and JSON without local ids', () => {
    const rows = [{ lid: 1, ts: 't', kind: 'match.manual_change', data: { after: '=1+1' }, deviceId: '=evil' }]
    expect(activityExport(rows, 'csv').split('\n')[1]).toContain("'=evil")
    expect(JSON.parse(activityExport(rows, 'json'))[0]).not.toHaveProperty('lid')
    expect(activityFilterOf({ kind: 'event.add', level: 'error' })).toBe('errors')
  })

  it('the options: this match\'s log and its diagnostic log in the scoreboard; every match at home', async () => {
    const { unmount } = render(<ActivityLogSection matchId={7} />)
    expect(screen.getByTestId('options-diagnostic-log')).toBeTruthy()
    fireEvent.click(screen.getByTestId('options-activity-log'))
    expect(await screen.findByTestId('activity-list')).toBeTruthy()
    unmount()
    render(<ActivityLogSection scope="all" />)
    expect(screen.queryByTestId('options-diagnostic-log')).toBeNull()
    fireEvent.click(screen.getByTestId('options-activity-log'))
    // every match: the picker, and the app.start of no match is listed too
    expect(await screen.findByRole('combobox', { name: 'activity.match' })).toBeTruthy()
    await waitFor(() => expect(within(screen.getByTestId('activity-list')).getAllByRole('listitem')).toHaveLength(4))
  })
})
