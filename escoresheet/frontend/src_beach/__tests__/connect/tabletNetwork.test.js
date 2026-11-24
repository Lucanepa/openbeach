import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  bluetoothNetwork, displayedWifi, firewall, generateWifiPassword, hotspot, isTabletNetworkAvailable, needsFirewallStep, netError,
  rememberedWifi, renewWifiPassword
} from '../../components_beach/connect/tabletNetwork_beach'
import { useMemoryLocalStorage } from '../helpers/memoryStorage'

// Ported from OpenVolley src/utils/__tests__/tabletNetwork.test.js (448a30ca, 42a5f74b).

function fakeTauri(handlers) {
  const invoke = vi.fn(async (cmd, args) => {
    const h = handlers[cmd]
    if (!h) throw { code: 'unknown', detail: cmd }
    return h(args)
  })
  return { win: { __TAURI_INTERNALS__: { invoke } }, invoke }
}

describe('tabletNetwork', () => {
  beforeEach(() => { useMemoryLocalStorage() })

  it('is only available in the desktop app', async () => {
    expect(isTabletNetworkAvailable({})).toBe(false)
    expect(isTabletNetworkAvailable(fakeTauri({}).win)).toBe(true)
    await expect(hotspot.status({})).rejects.toMatchObject({ code: 'not-desktop' })
  })

  it('starts with the remembered name and password so tablets rejoin by themselves', async () => {
    const { win, invoke } = fakeTauri({
      hotspot_start: (args) => ({ active: true, ssid: args.ssid || 'OpenBeach-NEW1', password: args.password || 'example-gen1', gatewayIp: '10.42.0.1' })
    })
    const first = await hotspot.start(win)
    expect(invoke).toHaveBeenLastCalledWith('hotspot_start', {})
    expect(first.ssid).toBe('OpenBeach-NEW1')
    expect(rememberedWifi()).toEqual({ ssid: 'OpenBeach-NEW1', password: 'example-gen1' })

    await hotspot.start(win)
    expect(invoke).toHaveBeenLastCalledWith('hotspot_start', { ssid: 'OpenBeach-NEW1', password: 'example-gen1' })
  })

  it('forgets remembered credentials the app refuses and starts with its own', async () => {
    localStorage.setItem('ob_tablet_wifi', JSON.stringify({ ssid: 'Bad;Name', password: 'short' }))
    const { win, invoke } = fakeTauri({
      hotspot_start: (args) => {
        if (args.ssid) throw { code: 'invalid-credentials', detail: 'the network name may only use letters' }
        return { active: true, ssid: 'OpenBeach-SES1', password: 'example-ses1', gatewayIp: '10.42.0.1' }
      }
    })
    const status = await hotspot.start(win)
    expect(invoke).toHaveBeenNthCalledWith(1, 'hotspot_start', { ssid: 'Bad;Name', password: 'short' })
    expect(invoke).toHaveBeenNthCalledWith(2, 'hotspot_start', {})
    expect(status.ssid).toBe('OpenBeach-SES1')
    expect(rememberedWifi()).toEqual({ ssid: 'OpenBeach-SES1', password: 'example-ses1' })
  })

  it('does not retry other start errors, and never remembers a hotspot started elsewhere', async () => {
    localStorage.setItem('ob_tablet_wifi', JSON.stringify({ ssid: 'OpenBeach-OLD1', password: 'example-old1' }))
    const failing = fakeTauri({ hotspot_start: () => { throw { code: 'wifi-off', detail: '' } } })
    await expect(hotspot.start(failing.win)).rejects.toMatchObject({ code: 'wifi-off' })
    expect(failing.invoke).toHaveBeenCalledTimes(1)
    expect(rememberedWifi()).toEqual({ ssid: 'OpenBeach-OLD1', password: 'example-old1' })
    expect(displayedWifi({ active: true, external: true, ssid: 'Luca-PC', password: 'home-secret' })).toEqual({ ssid: 'Luca-PC', password: 'home-secret' })
    expect(displayedWifi({ active: true, external: true, ssid: '' })).toBeNull()
  })

  it('makes a new password with the app\'s rules and keeps the name', () => {
    for (let i = 0; i < 50; i++) {
      const p = generateWifiPassword()
      expect(p).toMatch(/^[a-km-np-zA-HJKMNP-Z2-9]{12}$/)
      expect(p).toMatch(/[g-zG-Z]/)
    }
    expect(renewWifiPassword(null)).toBeNull()
    const next = renewWifiPassword({ ssid: 'OpenBeach-AB12', password: 'example-leak' })
    expect(next.ssid).toBe('OpenBeach-AB12')
    expect(next.password).not.toBe('example-leak')
    expect(rememberedWifi()).toEqual(next)
  })

  it('shows the remembered credentials until the Wi-Fi runs', () => {
    expect(displayedWifi({ active: false, ssid: 'OpenBeach-RUN1', password: 'example-ses1' })).toEqual({ ssid: 'OpenBeach-RUN1', password: 'example-ses1' })
    localStorage.setItem('ob_tablet_wifi', JSON.stringify({ ssid: 'OpenBeach-OLD1', password: 'example-old1' }))
    expect(displayedWifi({ active: false, ssid: 'OpenBeach-RUN1', password: 'example-ses1' })).toEqual({ ssid: 'OpenBeach-OLD1', password: 'example-old1' })
    expect(displayedWifi({ active: true, ssid: 'OpenBeach-RUN1', password: 'example-ses1' })).toEqual({ ssid: 'OpenBeach-RUN1', password: 'example-ses1' })
    localStorage.setItem('ob_tablet_wifi', '{broken')
    expect(rememberedWifi()).toBeNull()
  })

  it('calls the Bluetooth commands and normalises errors', async () => {
    const { win, invoke } = fakeTauri({ bluetooth_status: () => ({ supported: false, reason: 'windows-cannot-serve' }) })
    expect(await bluetoothNetwork.status(win)).toMatchObject({ reason: 'windows-cannot-serve' })
    expect(invoke).toHaveBeenCalledWith('bluetooth_status', {})
    await expect(bluetoothNetwork.start(win)).rejects.toMatchObject({ code: 'unknown' })
    expect(netError({ code: 'no-ap-mode', detail: 'wlp1s0' })).toEqual({ code: 'no-ap-mode', detail: 'wlp1s0' })
    expect(netError('boom')).toEqual({ code: 'failed', detail: 'boom' })
    expect(netError(new Error('x'))).toEqual({ code: 'failed', detail: 'x' })
  })

  it('firewall: asks the app, and shows the manual step only on Windows without the rule', async () => {
    const { win, invoke } = fakeTauri({ firewall_status: () => ({ platform: 'windows', supported: true, ready: true }) })
    expect(await firewall.status(win)).toEqual({ platform: 'windows', supported: true, ready: true })
    expect(invoke).toHaveBeenCalledWith('firewall_status', {})
    await expect(firewall.status({})).rejects.toMatchObject({ code: 'not-desktop' })

    expect(needsFirewallStep({ platform: 'windows', ready: true }, null)).toBe(false)
    expect(needsFirewallStep({ platform: 'windows', ready: false, reason: 'rule-missing' }, null)).toBe(true)
    // the check failed: the hotspot's platform decides, and the step shows
    expect(needsFirewallStep(null, { platform: 'windows' })).toBe(true)
    // the check has not answered yet: no step (it would flash on every opening)
    expect(needsFirewallStep(undefined, { platform: 'windows' })).toBe(false)
    expect(needsFirewallStep(undefined, null)).toBe(false)
    // a Block rule for the app: the step
    expect(needsFirewallStep({ platform: 'windows', ready: false, reason: 'blocked-by-rule' }, null)).toBe(true)
    expect(needsFirewallStep({ platform: 'linux', ready: false }, { platform: 'linux' })).toBe(false)
    expect(needsFirewallStep(null, { platform: 'linux' })).toBe(false)
    expect(needsFirewallStep(null, null)).toBe(false)
  })
})
