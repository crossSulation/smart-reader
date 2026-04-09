import React from 'react';
import { useTranslation } from 'react-i18next';

const LanguageSwitcher: React.FC = () => {
  const { i18n } = useTranslation();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div className="language-switcher p-4">
      <button 
        onClick={() => changeLanguage('zh')}
        className={`mr-2 px-3 py-1 rounded ${i18n.language === 'zh' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
      >
        中文
      </button>
      <button 
        onClick={() => changeLanguage('en')}
        className={`px-3 py-1 rounded ${i18n.language === 'en' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
      >
        EN
      </button>
    </div>
  );
};

export default LanguageSwitcher;