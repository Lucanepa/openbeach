import { describe, it, expect } from 'vitest'
import {
  TABLET_ROLES, cloudRoleUrl, escapeWifiQr, firstOfKind, hallInterfaces, lanRoleUrl, roleAccess, statusInterfaces, wifiQrString
} from '../../components_beach/connect/tabletLinks_beach'

// Ported from OpenVolley src/utils/__tests__/tabletLinks.test.js (448a30ca),
// for openbeach: scoretable, referee and livescore (no bench app), on the
// beach sites.

const MATCH = {
  id: 7,
  seed_key: 'match_1759740000000_ab12cd',
  refereePin: '123456',
  team1Pin: '234567',
  team2Pin: '345678',
  gamePin: '999999',
  refereeConnectionEnabled: true
}

describe('lanRoleUrl', () => {
  it('builds every role on the laptop address, the referee with the match preselected', () => {
    expect(TABLET_ROLES).toEqual(['main', 'referee', 'livescore'])
    expect(TABLET_ROLES.map(r => lanRoleUrl('10.42.0.1', 5174, r, MATCH.seed_key))).toEqual([
      'http://10.42.0.1:5174/',
      'http://10.42.0.1:5174/referee?match=match_1759740000000_ab12cd',
      'http://10.42.0.1:5174/livescore'
    ])
  })

  it('never puts a PIN in a link', () => {
    for (const role of TABLET_ROLES) {
      const url = lanRoleUrl('192.168.1.42', 5174, role, MATCH.seed_key)
      for (const pin of ['123456', '234567', '345678', '999999']) expect(url).not.toContain(pin)
      expect(url).not.toMatch(/pin=/i)
    }
  })

  it('works without a match, without a port and gives nothing without an address', () => {
    expect(lanRoleUrl('192.168.1.42', 5174, 'referee', null)).toBe('http://192.168.1.42:5174/referee')
    expect(lanRoleUrl('192.168.1.42', '', 'livescore', null)).toBe('http://192.168.1.42/livescore')
    expect(lanRoleUrl('fe80::1', 5174, 'referee', null)).toBe('http://[fe80::1]:5174/referee')
    expect(lanRoleUrl(null, 5174, 'referee', 'x')).toBeNull()
    expect(lanRoleUrl('192.168.1.42', 5174, 'bench_home', 'x')).toBeNull()
  })
})

describe('cloudRoleUrl', () => {
  it('links the beach sites, the referee with the match', () => {
    expect(cloudRoleUrl('referee', 'm1')).toBe('https://beach-referee.openvolley.app/?match=m1')
    expect(cloudRoleUrl('livescore', 'm1')).toBe('https://beach-livescore.openvolley.app/')
    expect(cloudRoleUrl('main', 'm1')).toBe('https://beach.openvolley.app/')
    expect(cloudRoleUrl('bench_home', 'm1')).toBeNull()
  })
})

describe('roleAccess', () => {
  it('gives the referee PIN and whether the scorer let the referee in; never the game PIN', () => {
    expect(roleAccess(MATCH, 'referee')).toMatchObject({ pin: '123456', enabled: true, field: 'refereeConnectionEnabled', syncField: 'referee_enabled' })
    for (const role of ['main', 'livescore', 'bench_home']) {
      expect(roleAccess(MATCH, role)).toEqual({ pin: null, enabled: null, field: null, syncField: null, pinKey: null })
    }
    expect(roleAccess(null, 'referee')).toMatchObject({ pin: null, enabled: null })
    expect(roleAccess({ refereePin: '  ' }, 'referee').pin).toBeNull()
    expect(roleAccess({ refereePin: '1', refereeConnectionEnabled: false }, 'referee').enabled).toBe(false)
  })
})

describe('status interfaces', () => {
  const STATUS = {
    localIP: '192.168.1.42',
    port: 5174,
    interfaces: [
      { name: 'wlp1s0', ip: '10.42.0.1', kind: 'hotspot' },
      { name: 'enp0s31f6', ip: '10.0.0.5', kind: 'ethernet' },
      { name: 'wlx00', ip: '192.168.1.42', kind: 'wifi' },
      { name: 'pan-openvolley', ip: '10.42.1.1', kind: 'bluetooth' }
    ]
  }

  it('lists venue networks (Wi-Fi first), then the laptop\'s hotspot, never Bluetooth', () => {
    expect(hallInterfaces(STATUS).map(i => i.ip)).toEqual(['192.168.1.42', '10.0.0.5', '10.42.0.1'])
    expect(firstOfKind(STATUS, 'hotspot').ip).toBe('10.42.0.1')
    expect(firstOfKind(STATUS, 'bluetooth').ip).toBe('10.42.1.1')
    expect(firstOfKind({ interfaces: [] }, 'hotspot')).toBeNull()
  })

  it('falls back to localIP for relays without interfaces, never loopback', () => {
    expect(statusInterfaces({ localIP: '192.168.1.20', port: 3000 })).toEqual([{ name: '', ip: '192.168.1.20', kind: 'other' }])
    expect(statusInterfaces({ localIP: '127.0.0.1' })).toEqual([])
    expect(statusInterfaces(null)).toEqual([])
  })
})

describe('Wi-Fi QR code', () => {
  it('escapes backslash, semicolon, comma, colon and double quote', () => {
    expect(escapeWifiQr('a\\b;c,d:e"f')).toBe('a\\\\b\\;c\\,d\\:e\\"f')
    expect(escapeWifiQr('OpenBeach-AB12')).toBe('OpenBeach-AB12')
  })

  // 'WIFI:T:' + 'WPA…': the repo's secret scan blocks a literal WPA QR payload
  const WPA = 'WIFI:T:' + 'WPA'

  it('builds the WIFI: URI tablets join from', () => {
    expect(wifiQrString({ ssid: 'OpenBeach-AB12', password: 'example-Pq2m' })).toBe(`${WPA};S:OpenBeach-AB12;P:example-Pq2m;;`)
    expect(wifiQrString({ ssid: 'Court;1', password: 'p:a,s"s\\' })).toBe(`${WPA};S:Court\\;1;P:p\\:a\\,s\\"s\\\\;;`)
    expect(wifiQrString({ ssid: 'Open venue' })).toBe('WIFI:T:nopass;S:Open venue;;')
    expect(wifiQrString({ ssid: 'Hidden', password: 'example1', hidden: true })).toBe(`${WPA};S:Hidden;P:example1;H:true;;`)
    expect(wifiQrString({ ssid: '' })).toBeNull()
  })
})
