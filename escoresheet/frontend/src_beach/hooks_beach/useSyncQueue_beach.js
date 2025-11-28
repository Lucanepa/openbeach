import { useEffect, useState } from 'react'
import { db } from '../db_beach/db_beach'
import { supabase } from '../lib_beach/supabaseClient_beach'

/**
 * Hook to manage sync queue and sync status
 * Returns sync status and online status
 */
export function useSyncQueue() {
  const [syncStatus, setSyncStatus] = useState('offline')
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

  useEffect(() => {
    // Monitor online/offline status
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => {
      setIsOnline(false)
      setSyncStatus('offline')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    if (!isOnline) {
      setSyncStatus('offline')
      return
    }

    if (!supabase) {
      setSyncStatus('online_no_supabase')
      return
    }

    // Process sync queue
    let isProcessing = false
    let intervalId = null

    const processSyncQueue = async () => {
      if (isProcessing) return
      isProcessing = true

      try {
        setSyncStatus('syncing')

        // Get queued items
        const queuedItems = await db.sync_queue
          .where('status')
          .equals('queued')
          .limit(10)
          .toArray()

        if (queuedItems.length === 0) {
          setSyncStatus('synced')
          isProcessing = false
          return
        }

        // Process each item
        for (const item of queuedItems) {
          try {
            // Update status to 'sent' before attempting sync
            await db.sync_queue.update(item.id, { status: 'sent' })

            // Map resource/action to Supabase operations
            const { resource, action, payload } = item

            if (action === 'insert') {
              // Map to Supabase table name (snake_case)
              const tableName = resource === 'match' ? 'matches' :
                              resource === 'set' ? 'sets' :
                              resource === 'event' ? 'events' :
                              resource === 'team' ? 'teams' :
                              resource === 'player' ? 'players' :
                              resource === 'referee' ? 'referees' :
                              resource === 'scorer' ? 'scorers' :
                              resource

              const { error } = await supabase
                .from(tableName)
                .insert(payload)

              if (error) throw error
            } else if (action === 'update') {
              const tableName = resource === 'match' ? 'matches' :
                              resource === 'set' ? 'sets' :
                              resource === 'event' ? 'events' :
                              resource === 'team' ? 'teams' :
                              resource === 'player' ? 'players' :
                              resource === 'referee' ? 'referees' :
                              resource === 'scorer' ? 'scorers' :
                              resource

              // Extract ID from payload
              const id = payload.id || payload.external_id
              if (!id) {
                throw new Error(`Missing id in update payload for ${resource}`)
              }

              // Remove id from payload for update
              const { id: _, external_id: __, ...updatePayload } = payload

              const { error } = await supabase
                .from(tableName)
                .update(updatePayload)
                .eq('id', id)

              if (error) throw error
            }

            // Remove successfully synced item
            await db.sync_queue.delete(item.id)
          } catch (error) {
            console.error(`Error syncing ${item.resource} ${item.action}:`, error)
            // Mark as error but keep in queue for retry
            await db.sync_queue.update(item.id, { status: 'error' })
            setSyncStatus('error')
          }
        }

        // Check if there are more items to process
        const remainingItems = await db.sync_queue
          .where('status')
          .equals('queued')
          .count()

        if (remainingItems === 0) {
          setSyncStatus('synced')
        } else {
          setSyncStatus('syncing')
        }
      } catch (error) {
        console.error('Error processing sync queue:', error)
        setSyncStatus('error')
      } finally {
        isProcessing = false
      }
    }

    // Initial status
    setSyncStatus('connecting')

    // Process immediately
    processSyncQueue()

    // Then process every 5 seconds
    intervalId = setInterval(processSyncQueue, 5000)

    return () => {
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [isOnline])

  return { syncStatus, isOnline }
}

