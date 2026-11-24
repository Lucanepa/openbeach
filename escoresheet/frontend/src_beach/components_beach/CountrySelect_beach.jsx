import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Search } from 'lucide-react'
import { MENU_PANEL, MENU_SUBROW } from './chromeClasses_beach'
import { FOCUS_RING } from '../ui/volleyui/Button.jsx'
import { cn } from '../ui/volleyui/cn.js'
import countries from 'i18n-iso-countries'
import enLocale from 'i18n-iso-countries/langs/en.json'

// Register locale
countries.registerLocale(enLocale)

export default function CountrySelect({ value, onChange, placeholder = "Select Country", fontSize = '14px', triggerStyle = {} }) {
    const { t } = useTranslation()
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

    // volleyui: the trigger is a white h-11 select face, the list a white
    // anchored panel with a search field and kit rows. Same open / pick /
    // outside-press behaviour. `.ov-kit` scopes the kit preflight to it.
    return (
        <div className="country-select ov-kit relative inline-block min-w-[120px]" ref={wrapperRef}>
            <button
                type="button"
                className={cn('country-select-trigger inline-flex min-h-11 w-full items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-stone-800 hover:bg-stone-50 transition-colors cursor-pointer', FOCUS_RING)}
                onClick={() => setIsOpen(!isOpen)}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                style={{ fontSize, ...triggerStyle }}
            >
                {selectedCountry ? (
                    <>
                        <span className={`fi fi-${selectedCountry.iso2}`} style={{ borderRadius: '2px' }}></span>
                        <span className="font-semibold">{selectedCountry.iso3}</span>
                    </>
                ) : (
                    <span className="text-stone-400">{placeholder}</span>
                )}
                <ChevronDown size={16} className={cn('ml-auto shrink-0 text-stone-400 transition-transform', isOpen && 'rotate-180')} aria-hidden="true" />
            </button>

            {isOpen && (
                <div className={cn('country-dropdown absolute left-0 top-full z-[1000] mt-1 flex max-h-[300px] w-max min-w-full max-w-[300px] flex-col p-1.5', MENU_PANEL)}>
                    <div className="relative mb-1.5">
                        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" aria-hidden="true" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={t('countrySelect.search', 'Search country')}
                            aria-label={t('countrySelect.search', 'Search country')}
                            className="h-11 w-full rounded-xl border border-stone-200 bg-white pl-9 pr-3 text-base text-stone-800 placeholder:text-stone-400 focus:border-red-700/40 focus:outline-none focus:ring-2 focus:ring-red-700/20"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                    <div className="flex-1 overflow-y-auto" role="listbox">
                        {filteredCountries.length > 0 ? (
                            filteredCountries.map(country => (
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected={country.iso3 === value}
                                    key={country.iso3}
                                    onClick={() => {
                                        onChange(country.iso3)
                                        setIsOpen(false)
                                        setSearch('')
                                    }}
                                    className={MENU_SUBROW}
                                >
                                    <span className={`fi fi-${country.iso2}`} style={{ fontSize: '1.2em', borderRadius: '2px' }}></span>
                                    <span className="flex-1">{country.name}</span>
                                    <span className="text-xs tabular-nums text-stone-500">{country.iso3}</span>
                                </button>
                            ))
                        ) : (
                            <p className="px-3 py-3 text-center text-sm text-stone-500">
                                {t('countrySelect.noResults', 'No countries found')}
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
