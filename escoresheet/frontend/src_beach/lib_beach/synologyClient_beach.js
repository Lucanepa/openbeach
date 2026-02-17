/**
 * Synology PostgreSQL Client via PostgREST
 *
 * This client provides a Supabase-compatible API for connecting to PostgreSQL
 * on Synology NAS via PostgREST. The API is designed to mirror supabase-js
 * so that the existing sync code can work with minimal changes.
 *
 * PostgREST is the same technology Supabase uses internally, so the
 * HTTP API is very similar.
 *
 * Usage:
 *   import { createSynologyClient, getSynologyClient } from './synologyClient_beach'
 *
 *   const client = getSynologyClient()
 *   if (client) {
 *     const { data, error } = await client.from('matches').select('*').eq('id', '123')
 *   }
 */

// Storage keys
const SYNOLOGY_URL_KEY = 'synology_url'
const SYNOLOGY_ENABLED_KEY = 'synology_enabled'

/**
 * Get the Synology PostgREST URL from localStorage or environment
 */
export function getSynologyUrl() {
  if (typeof localStorage === 'undefined') return null
  const saved = localStorage.getItem(SYNOLOGY_URL_KEY)
  if (saved) return saved
  return import.meta.env.VITE_SYNOLOGY_URL || null
}

/**
 * Set the Synology PostgREST URL in localStorage
 */
export function setSynologyUrl(url) {
  if (typeof localStorage === 'undefined') return
  if (url) {
    localStorage.setItem(SYNOLOGY_URL_KEY, url.replace(/\/$/, ''))
  } else {
    localStorage.removeItem(SYNOLOGY_URL_KEY)
  }
}

/**
 * Check if Synology sync is enabled
 */
export function isSynologyEnabled() {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem(SYNOLOGY_ENABLED_KEY) === 'true'
}

/**
 * Enable or disable Synology sync
 */
export function setSynologyEnabled(enabled) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(SYNOLOGY_ENABLED_KEY, enabled ? 'true' : 'false')
}

/**
 * Test connection to Synology PostgREST server
 * @param {string} url - The PostgREST URL to test
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function testSynologyConnection(url) {
  if (!url) {
    return { success: false, error: 'No URL provided' }
  }

  try {
    const testUrl = `${url.replace(/\/$/, '')}/matches?limit=1`
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000) // 10 second timeout
    })

    if (response.ok) {
      return { success: true }
    }

    // Check for specific error types
    if (response.status === 404) {
      return { success: false, error: 'Table "matches" not found. Run init.sql to create the schema.' }
    }
    if (response.status === 401 || response.status === 403) {
      return { success: false, error: 'Authentication failed. Check JWT_SECRET configuration.' }
    }

    const errorText = await response.text()
    return { success: false, error: `HTTP ${response.status}: ${errorText}` }
  } catch (err) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      return { success: false, error: 'Connection timeout. Check URL and network.' }
    }
    if (err.message?.includes('fetch') || err.message?.includes('network')) {
      return { success: false, error: 'Network error. Check URL and ensure PostgREST is running.' }
    }
    return { success: false, error: err.message || 'Unknown error' }
  }
}

/**
 * Query builder for PostgREST requests
 * Implements a subset of the Supabase client API
 */
class SynologyQueryBuilder {
  constructor(baseUrl, table) {
    this.baseUrl = baseUrl
    this.table = table
    this.filters = []
    this.selectColumns = '*'
    this.orderSpec = null
    this.limitSpec = null
    this.offsetSpec = null
    this.returnData = false
  }

  /**
   * Select specific columns
   * @param {string} columns - Comma-separated column names or '*'
   */
  select(columns = '*') {
    this.selectColumns = columns
    this.returnData = true
    return this
  }

  /**
   * Filter by column equality
   * @param {string} column - Column name
   * @param {any} value - Value to match
   */
  eq(column, value) {
    this.filters.push(`${encodeURIComponent(column)}=eq.${encodeURIComponent(value)}`)
    return this
  }

  /**
   * Filter by column not equal
   */
  neq(column, value) {
    this.filters.push(`${encodeURIComponent(column)}=neq.${encodeURIComponent(value)}`)
    return this
  }

  /**
   * Filter by column in array
   */
  in(column, values) {
    const valueList = values.map(v => encodeURIComponent(v)).join(',')
    this.filters.push(`${encodeURIComponent(column)}=in.(${valueList})`)
    return this
  }

  /**
   * Order results
   */
  order(column, { ascending = true } = {}) {
    this.orderSpec = `${column}.${ascending ? 'asc' : 'desc'}`
    return this
  }

  /**
   * Limit number of results
   */
  limit(count) {
    this.limitSpec = count
    return this
  }

  /**
   * Offset results (for pagination)
   */
  offset(count) {
    this.offsetSpec = count
    return this
  }

  /**
   * Build the query URL
   */
  _buildUrl() {
    const params = []

    if (this.selectColumns !== '*') {
      params.push(`select=${encodeURIComponent(this.selectColumns)}`)
    }

    params.push(...this.filters)

    if (this.orderSpec) {
      params.push(`order=${this.orderSpec}`)
    }
    if (this.limitSpec !== null) {
      params.push(`limit=${this.limitSpec}`)
    }
    if (this.offsetSpec !== null) {
      params.push(`offset=${this.offsetSpec}`)
    }

    const queryString = params.length > 0 ? `?${params.join('&')}` : ''
    return `${this.baseUrl}/${this.table}${queryString}`
  }

  /**
   * Execute SELECT query and return all matching rows
   */
  async execute() {
    const url = this._buildUrl()

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      })

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ message: response.statusText }))
        return { data: null, error: errorBody }
      }

      const data = await response.json()
      return { data, error: null }
    } catch (err) {
      return { data: null, error: { message: err.message } }
    }
  }

  /**
   * Execute SELECT and return single row or null
   */
  async maybeSingle() {
    const url = this._buildUrl()

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/vnd.pgrst.object+json',
          'Prefer': 'return=representation'
        }
      })

      // 406 means no rows found (PostgREST specific)
      if (response.status === 406) {
        return { data: null, error: null }
      }

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ message: response.statusText }))
        return { data: null, error: errorBody }
      }

      const data = await response.json()
      return { data, error: null }
    } catch (err) {
      return { data: null, error: { message: err.message } }
    }
  }

  /**
   * Execute SELECT and expect exactly one row
   */
  async single() {
    return this.maybeSingle()
  }

  /**
   * Insert data
   * @param {object|object[]} data - Data to insert
   */
  async insert(data) {
    const payload = Array.isArray(data) ? data : [data]

    try {
      const response = await fetch(`${this.baseUrl}/${this.table}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ message: response.statusText }))
        return { data: null, error: errorBody }
      }

      const result = await response.json().catch(() => null)
      return { data: result, error: null }
    } catch (err) {
      return { data: null, error: { message: err.message } }
    }
  }

  /**
   * Upsert data (insert or update on conflict)
   * @param {object|object[]} data - Data to upsert
   * @param {object} options - Options
   * @param {string} options.onConflict - Column name(s) for conflict resolution
   */
  async upsert(data, { onConflict } = {}) {
    const payload = Array.isArray(data) ? data : [data]

    const prefer = ['return=representation', 'resolution=merge-duplicates']
    if (onConflict) {
      prefer.push(`on_conflict=${onConflict}`)
    }

    try {
      const response = await fetch(`${this.baseUrl}/${this.table}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Prefer': prefer.join(',')
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ message: response.statusText }))
        return { data: null, error: errorBody }
      }

      const result = await response.json().catch(() => null)
      return { data: result, error: null }
    } catch (err) {
      return { data: null, error: { message: err.message } }
    }
  }

  /**
   * Update matching rows
   * @param {object} data - Data to update
   */
  async update(data) {
    const queryString = this.filters.length > 0 ? `?${this.filters.join('&')}` : ''

    try {
      const response = await fetch(`${this.baseUrl}/${this.table}${queryString}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(data)
      })

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ message: response.statusText }))
        return { data: null, error: errorBody }
      }

      const result = await response.json().catch(() => null)
      return { data: result, error: null }
    } catch (err) {
      return { data: null, error: { message: err.message } }
    }
  }

  /**
   * Delete matching rows
   */
  async delete() {
    const queryString = this.filters.length > 0 ? `?${this.filters.join('&')}` : ''

    try {
      const response = await fetch(`${this.baseUrl}/${this.table}${queryString}`, {
        method: 'DELETE',
        headers: {
          'Prefer': 'return=representation'
        }
      })

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ message: response.statusText }))
        return { data: null, error: errorBody, count: 0 }
      }

      const result = await response.json().catch(() => [])
      return { data: result, error: null, count: result?.length || 0 }
    } catch (err) {
      return { data: null, error: { message: err.message }, count: 0 }
    }
  }
}

/**
 * Synology PostgREST client
 * Provides a Supabase-compatible API for database operations
 */
class SynologyClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, '') // Remove trailing slash
  }

  /**
   * Create a query builder for a table
   * @param {string} table - Table name
   * @returns {SynologyQueryBuilder}
   */
  from(table) {
    return new SynologyQueryBuilder(this.baseUrl, table)
  }
}

/**
 * Create a new Synology client instance
 * @param {string} url - PostgREST URL
 * @returns {SynologyClient}
 */
export function createSynologyClient(url) {
  if (!url) return null
  return new SynologyClient(url)
}

/**
 * Get the global Synology client (if configured)
 * Auto-enables when URL is set - no need to manually enable
 * @returns {SynologyClient|null}
 */
export function getSynologyClient() {
  const url = getSynologyUrl()
  if (!url) return null
  // Auto-enable: if URL is configured, sync is enabled
  return new SynologyClient(url)
}

// For backwards compatibility with existing code patterns
export const synology = getSynologyClient()
