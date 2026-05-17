import { createContext, useContext, useState } from "react";
import { translations } from "../i18n/translations";

const LangContext = createContext();

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem("agri_lang") || "en");

  // t(key, vars) — e.g. t("dash_across_fields", { n: 4 })
  const t = (key, vars = {}) => {
    let str = translations[lang]?.[key] ?? translations.en[key] ?? key;
    Object.entries(vars).forEach(([k, v]) => {
      str = str.replace(`{${k}}`, v);
    });
    return str;
  };

  const setLanguage = (l) => {
    setLang(l);
    localStorage.setItem("agri_lang", l);
  };

  return (
    <LangContext.Provider value={{ lang, t, setLanguage }}>
      {children}
    </LangContext.Provider>
  );
}

export const useLang = () => useContext(LangContext);
