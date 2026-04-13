import React, { createContext, useContext, useState } from 'react';
import { t as translate } from '../i18n';

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
  const [lang, setLang] = useState(() => localStorage.getItem('app_lang') || 'vi');

  const changeLang = (newLang) => {
    setLang(newLang);
    localStorage.setItem('app_lang', newLang);
  };

  const t = (key) => translate(key, lang);

  return (
    <LanguageContext.Provider value={{ lang, changeLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
};
