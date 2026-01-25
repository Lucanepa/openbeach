import { useMemo } from 'react'
import countries from 'i18n-iso-countries'
import enLocale from 'i18n-iso-countries/langs/en.json'

// Register locale (may already be registered by CountrySelect, but safe to call again)
countries.registerLocale(enLocale)

/**
 * Small country flag component that displays a flag icon based on ISO3 country code
 * Uses flag-icons CSS library (already included in project)
 *
 * @param {string} countryCode - ISO3 (3-letter) country code, e.g., "USA", "CHE", "DEU"
 * @param {string} size - Size of the flag: "xs" (12px), "sm" (16px), "md" (20px), "lg" (24px)
 * @param {object} style - Additional inline styles
 */
export default function CountryFlag({ countryCode, size = 'sm', style = {} }) {
  // Convert ISO3 to ISO2 for flag-icons library
  const iso2 = useMemo(() => {
    if (!countryCode) return null
    // flag-icons uses lowercase ISO2 codes
    const converted = countries.alpha3ToAlpha2(countryCode.toUpperCase())
    return converted ? converted.toLowerCase() : null
  }, [countryCode])

  if (!iso2) return null

  const sizeMap = {
    xs: '12px',
    sm: '16px',
    md: '20px',
    lg: '24px'
  }

  const fontSize = sizeMap[size] || sizeMap.sm

  return (
    <span
      className={`fi fi-${iso2}`}
      style={{
        fontSize,
        borderRadius: '2px',
        lineHeight: 1,
        display: 'inline-block',
        verticalAlign: 'middle',
        ...style
      }}
      title={countryCode}
    />
  )
}
