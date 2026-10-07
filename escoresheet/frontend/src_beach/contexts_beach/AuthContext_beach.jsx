import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { apiFrom, apiAuth, apiMe, apiRedeemInvite, apiJoinBeach } from '../lib_beach/apiClient_beach'
import { isBackendAvailable } from '../utils_beach/backendConfig_beach'
import { accessFromMe, accessFromRoles, accessChanged, ACCESS_CHANGED_EVENT, NO_ACCESS } from '../lib_beach/access_beach'

// A pending account re-reads its access this often, so an admin's approval
// (or an invite redeemed on another device) shows without a reload.
export const PENDING_PROFILE_POLL_MS = 60000
import { clearSavedTeams, clearSavedTeamsOfOtherAccount, refreshSavedTeams } from '../db_beach/savedTeams_beach'

function readCachedProfile() {
  try {
    const cached = localStorage.getItem('cachedProfile')
    return cached ? JSON.parse(cached) : null
  } catch {
    return null
  }
}

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  // /api/me (apps.beach: the OpenBeach access of the account), when the
  // backend has it; null keeps the access derived from profiles.roles
  const [me, setMe] = useState(null)
  // Only show loading if backend is configured (otherwise show sign-in immediately)
  const [loading, setLoading] = useState(isBackendAvailable())
  // Prevent duplicate profile fetches
  const fetchingProfile = useRef(false)

  // Fetch user profile from profiles table
  const fetchProfile = useCallback(async (userId) => {
    if (!isBackendAvailable() || !userId) {
      setProfile(null)
      return null
    }

    // Prevent duplicate concurrent fetches
    if (fetchingProfile.current) {
      return null
    }

    try {
      fetchingProfile.current = true

      // Add timeout to detect hanging queries (15s to allow for cold starts)
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Profile query timed out after 15s')), 15000)
      )

      const queryPromise = apiFrom('profiles')
        .select('*')
        .eq('user_id', userId)
        .single()

      const { data, error } = await Promise.race([queryPromise, timeoutPromise])


      if (error) {
        console.warn('[AuthContext] Failed to fetch profile:', error.message, error)
        setProfile(null)
        return null
      }

      setProfile(data)
      // Cache profile in localStorage for offline auto-fill
      localStorage.setItem('cachedProfile', JSON.stringify(data))
      // The per-app access, where the backend reports it (never blocks)
      apiMe().then(({ data: meData, error: meError }) => {
        // Tagged with the account it was asked for (a late answer after a
        // switch of account is never used for the next one)
        if (!meError && meData && typeof meData === 'object') setMe({ ...meData, _for: userId })
      }).catch(() => { /* older backend or offline: roles decide */ })
      return data
    } catch (err) {
      console.error('[AuthContext] Profile fetch error:', err.message, err)
      setProfile(null)
      return null
    } finally {
      fetchingProfile.current = false
    }
  }, [])

  // Initialize auth state
  useEffect(() => {
    if (!isBackendAvailable()) {
      setLoading(false)
      return
    }

    // Timeout to prevent infinite loading state (max 3 seconds)
    const loadingTimeout = setTimeout(() => {
      setLoading(false)
    }, 3000)

    // Listen for auth changes FIRST (this is the reliable way to get auth state)
    const { data: { subscription } } = apiAuth.onAuthStateChange(
      async (event, session) => {
        clearTimeout(loadingTimeout)
        setUser(session?.user ?? null)

        // Only fetch profile on events where we know auth is fully ready
        // SIGNED_IN fires during session recovery before token refresh - skip it here
        // (signIn function calls fetchProfile directly for fresh sign-ins)
        if (session?.user && (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED')) {
          await fetchProfile(session.user.id)
        } else if (!session?.user) {
          setProfile(null)
        }
        setLoading(false)
        // The desktop app checks for updates on a sign-in (at most every
        // 15 min, hooks_beach/useDesktopUpdate_beach.js). Once per sign-in.
        if (event === 'SIGNED_IN' && typeof window !== 'undefined') {
          try { window.dispatchEvent(new CustomEvent('ov-signed-in')) } catch { /* no window events */ }
        }
      }
    )

    // Get initial session (triggers onAuthStateChange with INITIAL_SESSION event)
    apiAuth.getSession().then(({ data: { session } }) => {
      // Don't call fetchProfile here - let onAuthStateChange handle it
      // This prevents duplicate fetches
    }).catch((err) => {
      clearTimeout(loadingTimeout)
      console.error('Failed to get auth session:', err)
      setLoading(false)
    })

    return () => {
      clearTimeout(loadingTimeout)
      subscription?.unsubscribe()
    }
  }, [fetchProfile])

  // Sign in with email/password
  const signIn = useCallback(async (email, password) => {
    if (!isBackendAvailable()) {
      return { error: { message: 'Backend not configured' } }
    }

    const { data, error } = await apiAuth.signInWithPassword({
      email,
      password
    })

    if (!error && data?.user) {
      await fetchProfile(data.user.id)
    }

    return { data, error }
  }, [fetchProfile])

  // No sign-up here: OpenBeach accounts are created on
  // manager-beach.openvolley.app/#signup (lib_beach/accountLinks_beach)

  // Sign out
  const signOut = useCallback(async () => {
    if (!isBackendAvailable()) {
      return { error: { message: 'Backend not configured' } }
    }

    const { error } = await apiAuth.signOut()
    if (!error) {
      setUser(null)
      setProfile(null)
      setMe(null)
      localStorage.removeItem('cachedProfile')
      // The saved teams cache holds personal data of this account
      await clearSavedTeams()
    }

    return { error }
  }, [])

  // Update profile
  const updateProfile = useCallback(async (updates) => {
    if (!isBackendAvailable() || !user) {
      return { error: { message: 'Not authenticated' } }
    }

    const { data, error } = await apiFrom('profiles')
      .update({
        first_name: updates.firstName,
        last_name: updates.lastName,
        country: updates.country,
        dob: updates.dob
        // No roles: the backend strips them (only an admin assigns roles)
      })
      .eq('user_id', user.id)
      .select()
      .single()

    if (!error && data) {
      setProfile(data)
      localStorage.setItem('cachedProfile', JSON.stringify(data))
    }

    return { data, error }
  }, [user])

  // Reset password
  const resetPassword = useCallback(async (email) => {
    if (!isBackendAvailable()) {
      return { error: { message: 'Backend not configured' } }
    }

    const { data, error } = await apiAuth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    })

    return { data, error }
  }, [])

  // Update email - sends confirmation to new email
  const updateEmail = useCallback(async (newEmail) => {
    if (!isBackendAvailable() || !user) {
      return { error: { message: 'Not authenticated' } }
    }

    const { data, error } = await apiAuth.updateUser({
      email: newEmail
    })

    return { data, error }
  }, [user])

  // Get cached profile for offline use
  const getCachedProfile = useCallback(() => {
    const cached = localStorage.getItem('cachedProfile')
    return cached ? JSON.parse(cached) : null
  }, [])

  // Delete account: POST /api/auth/delete-account (the backend deletes the
  // user, its sessions and its profile; apiAuth then drops the stored token)
  const deleteAccount = useCallback(async () => {
    if (!isBackendAvailable() || !user) {
      return { error: { message: 'Not authenticated' } }
    }

    try {
      const { error: deleteError } = await apiAuth.deleteUser()

      if (deleteError) {
        console.error('Delete account error:', deleteError)
        return { error: deleteError }
      }

      // Clear local state
      setUser(null)
      setProfile(null)
      setMe(null)
      localStorage.removeItem('cachedProfile')
      await clearSavedTeams()

      return { error: null }
    } catch (err) {
      console.error('Delete account error:', err)
      return { error: { message: err.message } }
    }
  }, [user])

  // What this account may do (roles from the profile, or the cached profile
  // of the same account offline). The backend enforces every rule; the UI
  // only hides. `known` is false while neither is at hand (profile still
  // loading, or its fetch failed on a new device): the UI then shows no
  // "pending" note yet. Ported from OpenVolley's AuthContext.
  const userId = user?.id ?? null
  const accessSource = useMemo(() => {
    if (!userId) return null
    if (profile) return profile
    const cached = readCachedProfile()
    return cached && (!cached.user_id || cached.user_id === userId) ? cached : null
  }, [userId, profile])
  const rolesKey = JSON.stringify(accessSource?.roles ?? [])
  const known = !!accessSource
  // /api/me's apps.beach wins over the roles when the backend reports it
  // (and only for this account)
  const meKey = me && me._for === userId ? JSON.stringify(me.apps?.beach ?? null) : 'null'
  const access = useMemo(() => {
    if (!userId) return NO_ACCESS
    const roles = JSON.parse(rolesKey)
    const beach = JSON.parse(meKey)
    const fromMe = beach ? accessFromMe({ apps: { beach } }, roles) : null
    return { ...(fromMe || accessFromRoles(roles)), known: known || !!fromMe }
  }, [userId, rolesKey, known, meKey])

  // A pending account re-reads its profile (and /api/me): every minute, on
  // focus and when the connection comes back
  const isPending = access.isPending && access.known
  useEffect(() => {
    if (!userId || !isPending || !isBackendAvailable()) return undefined
    const refresh = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      fetchProfile(userId)
    }
    const timer = setInterval(refresh, PENDING_PROFILE_POLL_MS)
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
    }
  }, [userId, isPending, fetchProfile])

  // Redeem an OpenBeach invite code: the granted roles apply at once, then
  // the profile and /api/me are read again from the server
  const redeemInvite = useCallback(async (code) => {
    if (!isBackendAvailable() || !userId) return { data: null, error: { message: 'Not authenticated', status: 401 }, status: 401 }
    const result = await apiRedeemInvite(code)
    if (!result.error && Array.isArray(result.data?.roles)) {
      setProfile(prev => {
        const next = { ...(prev || readCachedProfile() || { user_id: userId }), roles: result.data.roles }
        try { localStorage.setItem('cachedProfile', JSON.stringify(next)) } catch { /* storage blocked */ }
        return next
      })
      setMe(null)
      fetchProfile(userId)
    }
    return result
  }, [userId, fetchProfile])

  // Join OpenBeach with an existing OpenVolley account (same login): the
  // account becomes a member, pending until an invite code or an admin
  // approves it. /api/me is read again from the server.
  const joinBeach = useCallback(async () => {
    if (!isBackendAvailable() || !userId) return { data: null, error: { message: 'Not authenticated', status: 401 }, status: 401 }
    const result = await apiJoinBeach()
    if (!result.error) {
      // At once: the account is a member now (the server's answer follows)
      setMe(prev => (prev && prev._for === userId && prev.apps?.beach
        ? { ...prev, apps: { ...prev.apps, beach: { ...prev.apps.beach, member: true } } }
        : prev))
      fetchProfile(userId)
    }
    return result
  }, [userId, fetchProfile])

  // What the account may do changed (an invite redeemed, an admin's
  // approval, a join): the sync queue sends again what the backend refused
  // before (useSyncQueue_beach listens)
  const lastAccess = useRef(null)
  useEffect(() => {
    const prev = lastAccess.current
    lastAccess.current = access
    if (!prev || !userId || !access.known || !accessChanged(prev, access)) return
    if (typeof window === 'undefined') return
    try {
      window.dispatchEvent(new CustomEvent(ACCESS_CHANGED_EVENT, { detail: { canScore: !!access.canScore, isPending: !!access.isPending } }))
    } catch { /* no window events */ }
  }, [access, userId])

  // Another account, or none (sign-out, a login the server rejected or that
  // expired): drop the previous account's saved teams (personal data) and its
  // cached profile before anything reads them.
  const previousUserId = useRef(undefined)
  useEffect(() => {
    const prev = previousUserId.current
    previousUserId.current = userId
    if (prev === undefined || prev === null || prev === userId) return
    setMe(null)
    clearSavedTeams()
    if (!userId) {
      try { localStorage.removeItem('cachedProfile') } catch { /* storage blocked */ }
    }
  }, [userId])

  // Once the stored login is resolved, a cache left by another account (or
  // by an account whose login lapsed while the app was closed) goes too.
  useEffect(() => {
    if (loading) return
    clearSavedTeamsOfOtherAccount(userId)
  }, [loading, userId])

  // Approved accounts keep an offline copy of the saved beach teams
  // (keyed on the read flag: a profile reload with the same roles does not refetch)
  const accessRef = useRef(access)
  accessRef.current = access
  const canReadTeams = access.canReadTeams
  useEffect(() => {
    if (!user?.id || !canReadTeams) return
    refreshSavedTeams({ access: accessRef.current, userId: user.id }).catch(() => {})
  }, [user?.id, canReadTeams])

  const value = {
    user,
    profile,
    access,
    redeemInvite,
    joinBeach,
    loading,
    isAuthenticated: !!user,
    signIn,
    signOut,
    updateProfile,
    updateEmail,
    resetPassword,
    fetchProfile,
    getCachedProfile,
    deleteAccount
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export { AuthContext }
