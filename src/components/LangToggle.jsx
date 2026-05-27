import { useLang } from "../contexts/LangContext";

export default function LangToggle() {
  const { lang, toggle } = useLang();

  return (
    <button
      className="lang-toggle"
      onClick={toggle}
      aria-label={lang === "es" ? "Switch to English" : "Cambiar a Español"}
      title={lang === "es" ? "Switch to English" : "Cambiar a Español"}
    >
      {lang === "es" ? "EN" : "ES"}
    </button>
  );
}
