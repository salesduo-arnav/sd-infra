import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import ja from './locales/ja.json';
import pt from './locales/pt.json';
import it from './locales/it.json';
import nl from './locales/nl.json';
import pl from './locales/pl.json';
import sv from './locales/sv.json';
import tr from './locales/tr.json';
import zhCN from './locales/zh-CN.json';
import ar from './locales/ar.json';
import hi from './locales/hi.json';

export const supportedLanguages = [
    { code: 'en', label: 'English', flag: '🇺🇸' },
    { code: 'es', label: 'Español', flag: '🇪🇸' },
    { code: 'fr', label: 'Français', flag: '🇫🇷' },
    { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
    { code: 'ja', label: '日本語', flag: '🇯🇵' },
    { code: 'pt', label: 'Português', flag: '🇵🇹' },
    { code: 'it', label: 'Italiano', flag: '🇮🇹' },
    { code: 'nl', label: 'Nederlands', flag: '🇳🇱' },
    { code: 'pl', label: 'Polski', flag: '🇵🇱' },
    { code: 'sv', label: 'Svenska', flag: '🇸🇪' },
    { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
    { code: 'zh-CN', label: '中文 (简体)', flag: '🇨🇳' },
    { code: 'ar', label: 'العربية', flag: '🇸🇦' },
    { code: 'hi', label: 'हिन्दी', flag: '🇮🇳' },
] as const;

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            en: { translation: en },
            es: { translation: es },
            fr: { translation: fr },
            de: { translation: de },
            ja: { translation: ja },
            pt: { translation: pt },
            it: { translation: it },
            nl: { translation: nl },
            pl: { translation: pl },
            sv: { translation: sv },
            tr: { translation: tr },
            'zh-CN': { translation: zhCN },
            ar: { translation: ar },
            hi: { translation: hi },
        },
        fallbackLng: 'en',
        interpolation: {
            escapeValue: false, // React already escapes by default
        },
        detection: {
            order: ['localStorage', 'navigator'],
            caches: ['localStorage'],
            lookupLocalStorage: 'i18nextLng',
        },
    });

// Keep the HTML lang attribute in sync with the current language
i18n.on('languageChanged', (lng) => {
    document.documentElement.lang = lng;
});

// Set initial lang attribute
document.documentElement.lang = i18n.language;

export default i18n;
