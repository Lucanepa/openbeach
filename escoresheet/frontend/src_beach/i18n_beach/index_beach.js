import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'
import it from './locales/it.json'
import de from './locales/de.json'
import deCH from './locales/de-CH.json'
import fr from './locales/fr.json'

const savedLang = localStorage.getItem('language') || 'en'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      it: { translation: it },
      de: { translation: de },
      'de-CH': { translation: deCH },
      fr: { translation: fr }
    },
    lng: savedLang,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false // React already escapes values
    }
  })

// Save language preference when changed
i18n.on('languageChanged', (lng) => {
  localStorage.setItem('language', lng)
})

export default i18n
