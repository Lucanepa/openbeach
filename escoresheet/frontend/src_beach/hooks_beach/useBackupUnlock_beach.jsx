import { useCallback, useEffect, useRef, useState } from 'react'
import BackupUnlockDialog from '../components_beach/BackupUnlockDialog_beach'
import { isEncryptedBackup } from '../utils_beach/backupCrypto/envelope_beach'

/**
 * Opens a picked backup file that is encrypted (the app backup files of a
 * match with a PIN, utils_beach/backupCrypto, audit SEC-22): `await
 * unlock(file)` shows the PIN dialog and resolves to the backup inside, with
 * `unlockedWith` (the PIN that opened it, which the restore keeps on the
 * match: backupManager_beach pinsForRestore), or null when the scorer
 * cancels. Any other file resolves as it is, at once. Render `dialog` in the
 * component.
 *
 *   const { unlock, dialog } = useBackupUnlock()
 *   const data = await unlock(matchBackupFromFile(picked))
 *   if (!data) return // cancelled
 *
 * Ported from OpenVolley src/hooks/useBackupUnlock.jsx.
 */
export function useBackupUnlock() {
  const [asking, setAsking] = useState(null) // { envelope, resolve }
  const askingRef = useRef(null)
  askingRef.current = asking

  // A component that goes away while asking: the caller gets "cancelled"
  useEffect(() => () => askingRef.current?.resolve(null), [])

  const unlock = useCallback((file) => {
    if (!isEncryptedBackup(file)) return Promise.resolve(file)
    return new Promise(resolve => {
      askingRef.current?.resolve(null)
      setAsking({ envelope: file, resolve })
    })
  }, [])

  const settle = (value) => {
    asking?.resolve(value)
    setAsking(null)
  }

  const dialog = asking ? (
    <BackupUnlockDialog
      envelope={asking.envelope}
      onOpened={(data) => settle(data)}
      onCancel={() => settle(null)}
    />
  ) : null

  return { unlock, dialog }
}

export default useBackupUnlock
