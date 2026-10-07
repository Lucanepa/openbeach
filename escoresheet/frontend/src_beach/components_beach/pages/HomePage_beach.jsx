import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { openAppWindow } from '../../utils_beach/openAppWindow_beach'
import { ChevronDown, LifeBuoy, Loader2, MonitorPlay, Settings } from 'lucide-react'
import SupportFeedbackModal from '../SupportFeedbackModal_beach'
import { Button, FOCUS_RING_INSET } from '../../ui/volleyui/Button.jsx'
import { Card } from '../../ui/volleyui/Card.jsx'
import { cn } from '../../ui/volleyui/cn.js'

// The home page in the Volleyball style (volleyui), the same stack as
// OpenVolley's home: one card holding the match actions (brand red New match,
// dark Continue, soft Delete, Restore), then the quieter app actions.
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
  onRestoreMatch
}) {
  const { t } = useTranslation()
  const [supportFeedbackOpen, setSupportFeedbackOpen] = useState(false)
  const hasMatch = !!(currentOfficialMatch || currentTestMatch)

  return (
    <div className="ov-kit flex w-full flex-1 flex-col items-center justify-center px-4 py-6 sm:py-8">
      <div className="w-full max-w-md">
        <h1 className="text-center text-2xl sm:text-3xl font-bold tracking-tight text-stone-900">{t('home.title')}</h1>
        <div className="my-4 flex justify-center">
          <img
            src={`${import.meta.env.BASE_URL}openbeach_no_bg.png`}
            alt="OpenBeach"
            className="h-28 w-auto sm:h-32"
            draggable={false}
          />
        </div>

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

          {/* Continue match - only when there is a match */}
          {hasMatch && (
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
