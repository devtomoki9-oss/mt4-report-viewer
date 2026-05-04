import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import ja from './locales/ja/common.json'
import en from './locales/en/common.json'

export const SUPPORTED_LANGUAGES = ['ja', 'en']
export const DEFAULT_LANGUAGE = 'ja'
export const LANGUAGE_STORAGE_KEY = 'app.lang'

export const LANGUAGE_LABELS = {
  ja: '日本語',
  en: 'English',
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ja: { common: ja },
      en: { common: en },
    },
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES,
    nonExplicitSupportedLngs: true,
    defaultNS: 'common',
    ns: ['common'],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
    },
    returnNull: false,
  })

const applyHtmlLang = (lng) => {
  const base = (lng || DEFAULT_LANGUAGE).split('-')[0]
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.setAttribute('lang', base)
  }
}

applyHtmlLang(i18n.resolvedLanguage || i18n.language)
i18n.on('languageChanged', applyHtmlLang)

export default i18n
