import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// 导入翻译资源
import en from './locales/en.json';
import zh from './locales/zh.json';

const resources = {
  en: {
    translation: en
  },
  zh: {
    translation: zh
  }
};

i18n
  .use(LanguageDetector) // 自动检测语言
  .use(initReactI18next) // 将i18n实例传递给react-i18next
  .init({
    resources,
    fallbackLng: 'zh', // 默认语言
    debug: import.meta.env.DEV,
    
    interpolation: {
      escapeValue: false, // react已经安全地转义了
    },
    
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag', 'path', 'subdomain'],
      caches: ['localStorage'],
    }
  });

export default i18n;