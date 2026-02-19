import React, { useState, useEffect, useRef, useMemo } from 'react'
import countries from 'i18n-iso-countries'
import enLocale from 'i18n-iso-countries/langs/en.json'

// Register locale
countries.registerLocale(enLocale)

export default function CountrySelect({ value, onChange, placeholder = "Select Country", fontSize = '14px' }) {
    const [isOpen, setIsOpen] = useState(false)
    const [search, setSearch] = useState('')
    const wrapperRef = useRef(null)

    // Generate country list
    const countryList = useMemo(() => {
        const names = countries.getNames('en', { select: 'official' })
        return Object.entries(names)
            .map(([iso2, name]) => {
                const iso3 = countries.alpha2ToAlpha3(iso2)
                return {
                    iso2: iso2.toLowerCase(),
                    iso3,
                    name
                }
            })
            .filter(c => c.iso3) // Ensure valid ISO3
            .sort((a, b) => a.name.localeCompare(b.name))
    }, [])

    // Filter countries based on search
    const filteredCountries = useMemo(() => {
        if (!search) return countryList
        const query = search.toLowerCase()
        return countryList.filter(c =>
            c.name.toLowerCase().includes(query) ||
            c.iso3.toLowerCase().includes(query)
        )
    }, [countryList, search])

    // Find selected country object
    const selectedCountry = useMemo(() => {
        if (!value) return null
        return countryList.find(c => c.iso3 === value)
    }, [value, countryList])

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => {
            document.removeEventListener("mousedown", handleClickOutside)
        }
    }, [])

    // Focus input when opening
    const inputRef = useRef(null)
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus()
        }
    }, [isOpen])

    return (
        <div className="country-select" ref={wrapperRef} style={{ position: 'relative', minWidth: '120px' }}>
            <div
                className="country-select-trigger"
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '4px 8px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    minHeight: '28px',
                    fontSize
                }}
            >
                {selectedCountry ? (
                    <>
                        <span className={`fi fi-${selectedCountry.iso2}`} style={{ borderRadius: '2px' }}></span>
                        <span style={{ fontWeight: 600 }}>{selectedCountry.iso3}</span>
                    </>
                ) : (
                    <span style={{ color: 'rgba(255, 255, 255, 0.5)' }}>{placeholder}</span>
                )}
                <span style={{ marginLeft: 'auto', fontSize: '10px', opacity: 0.7 }}>▼</span>
            </div>

            {isOpen && (
                <div className="country-dropdown" style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0, // Expand to at least width of container
                    width: 'max-content', // Allow to be wider if needed
                    minWidth: '100%',
                    maxWidth: '300px',
                    background: '#1f2937',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '4px',
                    marginTop: '4px',
                    zIndex: 1000,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    maxHeight: '300px',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <div style={{ padding: '8px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                        <input
                            ref={inputRef}
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search country..."
                            style={{
                                width: '100%',
                                padding: '6px 8px',
                                background: 'rgba(0, 0, 0, 0.2)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: '4px',
                                color: 'white',
                                fontSize: '14px'
                            }}
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        {filteredCountries.length > 0 ? (
                            filteredCountries.map(country => (
                                <div
                                    key={country.iso3}
                                    onClick={() => {
                                        onChange(country.iso3)
                                        setIsOpen(false)
                                        setSearch('')
                                    }}
                                    style={{
                                        padding: '6px 12px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        cursor: 'pointer',
                                        transition: 'background 0.1s',
                                        fontSize: '13px'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    <span className={`fi fi-${country.iso2}`} style={{ fontSize: '1.2em', borderRadius: '2px' }}></span>
                                    <span style={{ flex: 1 }}>{country.name}</span>
                                    <span style={{ opacity: 0.5, fontSize: '0.9em' }}>[{country.iso3}]</span>
                                </div>
                            ))
                        ) : (
                            <div style={{ padding: '12px', textAlign: 'center', opacity: 0.5, fontSize: '13px' }}>
                                No countries found
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
