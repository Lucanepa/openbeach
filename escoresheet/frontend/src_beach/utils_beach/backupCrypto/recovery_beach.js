/**
 * The recovery key of the backup files (envelope_beach.js recovery slot): a
 * strong key beside the 6-digit PINs. With one in the build, every file the
 * app encrypts also has its data key wrapped for this public key; its private
 * half is kept offline by the operator, never on a scoring device or the
 * server.
 *
 * The key is a P-256 public key (SPKI, base64), set at build time:
 * VITE_BACKUP_RECOVERY_KEY, else BUILT_IN_RECOVERY_KEY below (what a build
 * from source, e.g. F-Droid's, reads). Empty, as now: the files have PIN
 * slots only, and a file whose PINs are lost cannot be opened. Whether
 * OpenBeach gets OpenVolley's recovery key (and a recovery tool that reads
 * the openbeach format) is the owner's decision (audit SEC-22).
 *
 * Ported from OpenVolley src/utils/backupCrypto/recovery.js (the public-key
 * half; the key pair and the private key belong to the recovery tool).
 */

import { fromBase64 } from './envelope_beach.js'

// The operator's recovery public key: none yet (see above)
export const BUILT_IN_RECOVERY_KEY = ''

const ECDH = { name: 'ECDH', namedCurve: 'P-256' }

const subtle = () => {
  const s = globalThis.crypto?.subtle
  if (!s) throw new Error('No WebCrypto on this device')
  return s
}

/** The recovery public key of this build (SPKI, base64), or '' for none. */
export function configuredRecoveryKey() {
  let fromBuild = ''
  try {
    fromBuild = import.meta.env.VITE_BACKUP_RECOVERY_KEY || ''
  } catch {
    // not a Vite build (no import.meta.env)
  }
  return String(fromBuild || BUILT_IN_RECOVERY_KEY).replace(/\s+/g, '')
}

/** The id a recovery slot names its key by: the first 8 bytes of SHA-256 over the SPKI, hex. */
export async function recoveryKeyId(spkiBytes) {
  const hash = new Uint8Array(await subtle().digest('SHA-256', spkiBytes))
  return [...hash.subarray(0, 8)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * The recovery public key, ready for envelope_beach.recoverySlot. Throws for
 * anything but a P-256 SPKI key.
 * @param {string} spkiBase64
 * @returns {Promise<{ id: string, publicKey: CryptoKey }>}
 */
export async function importRecoveryPublicKey(spkiBase64) {
  const spki = fromBase64(String(spkiBase64 || '').replace(/\s+/g, ''))
  const publicKey = await subtle().importKey('spki', spki, ECDH, true, [])
  return { id: await recoveryKeyId(spki), publicKey }
}
