import ThemeToggle from "./ThemeToggle";
import LangToggle from "./LangToggle";

export default function Header({ children }) {
  return (
    <header className="site-header">
      <div className="container">
        {children}
        <div className="header-controls">
          <LangToggle />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
