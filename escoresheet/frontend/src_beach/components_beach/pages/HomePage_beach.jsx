import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { openAppWindow } from '../../utils_beach/openAppWindow_beach'
import { ChevronDown, LifeBuoy, Loader2, MonitorPlay, Settings } from 'lucide-react'
import SupportFeedbackModal from '../SupportFeedbackModal_beach'
import { Button, FOCUS_RING_INSET } from '../../ui/volleyui/Button.jsx'
import { Card } from '../../ui/volleyui/Card.jsx'
import { StatusPill } from '../../ui/volleyui/StatusPill.jsx'
import { cn } from '../../ui/volleyui/cn.js'
import { BRAND } from '../../brand_beach'
import { formatTakeOver } from '../ScorerMovedModal_beach'

/** "Set 3 · 12:10 · sets 1:1", or "Not started" for a match with no set yet. */
export function scoreText(t, score) {
  if (!score || score.set == null) return t('home.continueCard.notStarted')
  return t('home.continueCard.score', { set: score.set, team1: score.team1, team2: score.team2, setsTeam1: score.setsTeam1, setsTeam2: score.setsTeam2 })
}

// The home page in the Volleyball style (volleyui), the same stack as
// OpenVolley's home: one card holding the match actions (brand red New match,
// the Continue card, soft Delete, Restore), then the quieter app actions.
export default function HomePage({
  newMatchMenuOpen,
  setNewMatchMenuOpen,
  createNewOfficialMatch,
  createNewTestMatch,
  testMatchLoading,
  currentOfficialMatch,
  currentTestMatch,
  continueMatch,
  continueTestMatch,
  showDeleteMatchModal,
  restartTestMatch,
  onOpenSettings,
  onRestoreMatch,
  // what the self-check found (App_beach, SelfCheckNotice_beach)
  selfCheckNotice = null,
  // the match Continue resumes (App_beach): { team1, team2, score, lastSaved, state, unsent }
  continueInfo = null
}) {
  const { t, i18n } = useTranslation()
  const [supportFeedbackOpen, setSupportFeedbackOpen] = useState(false)
  const hasMatch = !!(currentOfficialMatch || currentTestMatch)

  return (
    <div className="ov-kit flex w-full flex-1 flex-col items-center justify-center px-4 py-6 sm:py-8">
      <div className="w-full max-w-md">
        <h1 className="text-center text-2xl sm:text-3xl font-bold tracking-tight text-stone-900">{t('home.title')}</h1>
        <div className="my-4 flex justify-center">
          <img
            src={BRAND.mark}
            alt="OpenBeach"
            className="h-24 w-24 sm:h-28 sm:w-28"
            draggable={false}
          />
        </div>

        {selfCheckNotice}

        <Card className="w-full space-y-3">
          {/* New match, with its menu (pushes the stack down) */}
          <div className="space-y-2">
            <Button
              variant="primary"
              block
              data-help-id="home-new-match-button"
              aria-expanded={newMatchMenuOpen}
              onClick={() => setNewMatchMenuOpen(!newMatchMenuOpen)}
              className="h-14 rounded-xl text-base font-semibold"
              iconRight={<ChevronDown size={18} aria-hidden="true" className={cn('transition-transform', newMatchMenuOpen && 'rotate-180')} />}
            >
              {t('home.newMatch')}
            </Button>

            {newMatchMenuOpen && (
              // Flat sunken block under the CTA: no border, no shadow inside the card.
              <div className="overflow-hidden rounded-xl bg-stone-50 divide-y divide-stone-200/70">
                <button
                  type="button"
                  onClick={() => {
                    setNewMatchMenuOpen(false)
                    createNewOfficialMatch()
                  }}
                  className={cn('w-full min-h-12 inline-flex items-center justify-center gap-3 px-4 py-3 text-base font-semibold text-stone-800 hover:bg-stone-100 transition-colors', FOCUS_RING_INSET)}
                >
                  {t('home.officialMatch')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewMatchMenuOpen(false)
                    createNewTestMatch()
                  }}
                  disabled={testMatchLoading}
                  aria-busy={testMatchLoading || undefined}
                  className={cn('w-full min-h-12 inline-flex items-center justify-center gap-2 px-4 py-3 text-base font-semibold text-amber-800 hover:bg-amber-50 transition-colors disabled:cursor-not-allowed disabled:opacity-60', FOCUS_RING_INSET)}
                >
                  {testMatchLoading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                  {testMatchLoading ? t('home.preparing') : t('home.testMatch')}
                </button>
              </div>
            )}
          </div>

          {/* Continue: the match in progress on this device, in one tap.
              Opening the app always lands here, never on a match (the owner,
              2026-10-27, as the established e-scoresheets do): the card says
              which match, where it stands, when it was last saved and what
              the server said about it, so the scorer resumes the right one,
              and sees a copy closed on the server or scored on another
              device before opening it (read-only then). */}
          {hasMatch && (
            <div data-testid="continue-card" className="space-y-3 rounded-xl border border-stone-200/70 bg-stone-50/60 p-3">
              {continueInfo && (
                <div className="px-1">
                  <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                    <span className="min-w-0 text-base font-semibold leading-snug text-stone-900">
                      {`${continueInfo.team1 || t('common.team1', 'Team 1')} – ${continueInfo.team2 || t('common.team2', 'Team 2')}`}
                    </span>
                    <span className="flex flex-wrap items-center gap-1">
                      <MatchStateChips state={continueInfo.state} unsent={continueInfo.unsent} />
                    </span>
                  </div>
                  <div className="mt-1 text-xl font-bold tabular-nums text-stone-900">{scoreText(t, continueInfo.score)}</div>
                  {continueInfo.lastSaved != null && (
                    <div className="mt-0.5 text-xs tabular-nums text-stone-500">
                      {t('home.continueCard.lastSaved', { time: formatTakeOver(continueInfo.lastSaved, i18n?.language) || '–' })}
                    </div>
                  )}
                </div>
              )}
              <Button
                variant="dark"
                block
                data-help-id="home-continue-button"
                onClick={() => {
                  if (currentOfficialMatch) {
                    continueMatch(currentOfficialMatch.id)
                  } else if (currentTestMatch) {
                    continueTestMatch()
                  }
                }}
                className="h-14 rounded-xl text-base font-semibold"
              >
                {t('home.continueMatch')}
              </Button>
            </div>
          )}

          {/* Delete match - only when there is a match */}
          {hasMatch && (
            <Button
              variant="danger-soft"
              block
              data-help-id="home-delete-button"
              onClick={() => {
                if (currentOfficialMatch) {
                  showDeleteMatchModal()
                } else if (currentTestMatch) {
                  restartTestMatch()
                }
              }}
              className="h-12 rounded-xl text-base shadow-none"
            >
              {t('home.deleteMatch')}
            </Button>
          )}

          {/* Restore match */}
          <Button
            variant="secondary"
            block
            data-help-id="home-restore-button"
            onClick={onRestoreMatch}
            className="h-12 rounded-xl text-base"
          >
            {t('home.restoreMatch')}
          </Button>

          {/* Game PIN (if any) */}
          {currentOfficialMatch?.gamePin && (
            <div className="rounded-xl border border-stone-200/70 bg-stone-50/60 px-4 py-3 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">{t('home.gamePin')}</div>
              <div className="mt-0.5 font-mono text-xl font-bold tracking-[0.3em] tabular-nums text-stone-900">
                {currentOfficialMatch.gamePin}
              </div>
            </div>
          )}
        </Card>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            size="xl"
            block
            icon={MonitorPlay}
            className="col-span-2"
            onClick={() => {
              openAppWindow('/scoreboard_beach.html?mode=local', { features: 'width=1280,height=720' })
            }}
          >
            {t('home.openScoreboard', 'Open scoreboard')}
          </Button>
          <Button variant="secondary" size="xl" block onClick={onOpenSettings} icon={Settings}>
            {t('home.options')}
          </Button>
          <Button variant="ghost" size="xl" block onClick={() => setSupportFeedbackOpen(true)} icon={LifeBuoy} className="bg-white">
            {t('supportFeedback.button')}
          </Button>
        </div>

        {/* Support & Feedback Modal */}
        <SupportFeedbackModal
          open={supportFeedbackOpen}
          onClose={() => setSupportFeedbackOpen(false)}
          currentPage="mainPage"
        />
      </div>
    </div>
  )
}

// What the server said about a copy (utils_beach/deviceSelfCheck_beach
// copyState), and whether it holds changes the server does not have yet
const MATCH_STATE_TONE = { here: 'done', moved: 'attention', closed: 'brand', unchecked: 'neutral' }

function MatchStateChips({ state, unsent = 0 }) {
  const { t } = useTranslation()
  return (
    <>
      {state && (
        <span data-testid="match-state" className="inline-flex">
          <StatusPill tone={MATCH_STATE_TONE[state] || 'neutral'}>{t(`home.matchState.${state}`)}</StatusPill>
        </span>
      )}
      {unsent > 0 && (
        <span data-testid="match-state" className="inline-flex">
          <StatusPill tone="todo">{t('home.matchState.unsent')}</StatusPill>
        </span>
      )}
    </>
  )
}
