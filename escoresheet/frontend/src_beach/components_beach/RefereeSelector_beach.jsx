import { useState, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Search } from 'lucide-react'
import { MENU_PANEL, MENU_ROW } from './chromeClasses_beach'
import { cn } from '../ui/volleyui/cn.js'
import { apiFrom } from '../lib_beach/apiClient_beach'
import { isBackendAvailable } from '../utils_beach/backendConfig_beach'

// Sport type for beach volleyball
const SPORT_TYPE = 'beach'

/**
 * Reusable RefereeSelector component for selecting referees from history
 * Uses Supabase referee_database table for suggestions
 * @param {boolean} open - Whether dropdown is open
 * @param {function} onClose - Function to call when closing
 * @param {function} onSelect - Function to call when a referee is selected: (referee) => void
 * @param {Object} position - Position config for dropdown placement
 */
export default function RefereeSelector({ open, onClose, onSelect, position = {} }) {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const [referees, setReferees] = useState([])
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef(null)

  // Load referees from Supabase history
  useEffect(() => {
    if (open) {
      loadReferees()
    }
  }, [open])

  const loadReferees = async () => {
    setLoading(true)
    try {
      if (!isBackendAvailable()) {
        setReferees([])
        return
      }

      const { data, error } = await apiFrom('referee_database')
        .select('first_name, last_name, country, dob, created_at')
        .contains('sport_type', JSON.stringify([SPORT_TYPE]))
        .order('last_name', { ascending: true })

      if (error) {
        console.error('Error loading referees from history:', error)
        setReferees([])
        return
      }

      // Data is already unique due to unique index, just map to expected format
      const uniqueReferees = (data || []).map(ref => ({
        id: `${ref.last_name}_${ref.first_name}`.toLowerCase(),
        firstName: ref.first_name || '',
        lastName: ref.last_name || '',
        country: ref.country || 'CHE',
        dob: ref.dob || ''
      }))

      setReferees(uniqueReferees)
    } catch (error) {
      console.error('Error loading referees:', error)
      setReferees([])
    } finally {
      setLoading(false)
    }
  }

  // Filter and sort referees
  const filteredReferees = useMemo(() => {
    if (!searchQuery.trim()) {
      return referees
    }

    const query = searchQuery.toLowerCase()
    return referees.filter(ref => {
      const fullName = `${ref.lastName || ''} ${ref.firstName || ''}`.toLowerCase()
      return fullName.includes(query)
    })
  }, [referees, searchQuery])

  // Always center the modal on screen
  useEffect(() => {
    if (!open || !dropdownRef.current) return

    // Always center the modal
    dropdownRef.current.style.position = 'fixed'
    dropdownRef.current.style.left = '50%'
    dropdownRef.current.style.top = '50%'
    dropdownRef.current.style.transform = 'translate(-50%, -50%)'
    dropdownRef.current.style.zIndex = '1000'
  }, [open])

  // Handle click outside
  useEffect(() => {
    if (!open) return

    const handleClickOutside = (e) => {
      if (!e.target.closest('[data-referee-selector]')) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open, onClose])

  if (!open) return null

  const isOnline = isBackendAvailable()

  // volleyui popover: a white anchored panel (centred), a search field and
  // kit menu rows. The transparent backdrop and the outside-press close are
  // unchanged.
  return (
    <div className="ov-kit contents">
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 999,
          background: 'transparent'
        }}
        onClick={onClose}
      />
      {/* Dropdown */}
      <div
        ref={dropdownRef}
        style={{
          position: 'fixed',
          zIndex: 1000
        }}
        className="modal-wrapper-roll-down"
      >
        <div
          data-referee-selector
          role="dialog"
          aria-label={t('refereeSelector.searchReferees', 'Search referees')}
          className={cn(MENU_PANEL, 'flex max-h-[400px] w-[min(92vw,400px)] min-w-[300px] flex-col gap-2 p-2')}
        >

          {/* Search Input */}
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" aria-hidden="true" />
            <input
              type="text"
              placeholder={t('refereeSelector.searchReferees', 'Search referees')}
              aria-label={t('refereeSelector.searchReferees', 'Search referees')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 w-full rounded-xl border border-stone-200 bg-white pl-9 pr-3 text-base text-stone-800 placeholder:text-stone-400 focus:border-red-700/40 focus:outline-none focus:ring-2 focus:ring-red-700/20"
              autoFocus
            />
          </div>

          {/* Referees List */}
          <div className="flex max-h-[280px] flex-col overflow-y-auto">
            {!isOnline ? (
              <p className="px-3 py-3 text-center text-sm text-stone-500">
                {t('refereeSelector.connectToInternet', 'Connect to the internet to load the referee history.')}
              </p>
            ) : loading ? (
              <p className="flex items-center justify-center gap-2 px-3 py-3 text-sm text-stone-500" role="status">
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                {t('common.loading')}
              </p>
            ) : filteredReferees.length === 0 ? (
              <p className="px-3 py-3 text-center text-sm text-stone-500">
                {searchQuery ? t('refereeSelector.noRefereesFound', 'No referees found') : t('refereeSelector.noRefereeHistory', 'No referee history yet')}
              </p>
            ) : (
              filteredReferees.map((referee) => (
                <button
                  type="button"
                  key={referee.id}
                  onClick={() => {
                    onSelect(referee)
                    setSearchQuery('') // Reset search for next use
                    onClose()
                  }}
                  className={MENU_ROW}
                >
                  <span className="truncate">{referee.lastName}, {referee.firstName}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
