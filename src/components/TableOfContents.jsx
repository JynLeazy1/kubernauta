import { useEffect, useState } from "react";

export default function TableOfContents({ headings, label }) {
  const [activeId, setActiveId] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!headings?.length) return;
    const elements = headings
      .map((h) => document.getElementById(h.id))
      .filter(Boolean);
    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        setActiveId(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [headings]);

  if (!headings?.length) return null;

  const handleClick = (e, id) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    const top = el.getBoundingClientRect().top + window.scrollY - 72;
    window.scrollTo({ top, behavior: "smooth" });
    window.history.replaceState(null, "", `#${id}`);
    setActiveId(id);
    // Auto-collapse after tapping a link on mobile
    setMobileOpen(false);
  };

  return (
    <aside
      className={`toc ${mobileOpen ? "toc--open" : ""}`}
      aria-label={label}
    >
      <button
        type="button"
        className="toc-label"
        onClick={() => setMobileOpen((v) => !v)}
        aria-expanded={mobileOpen}
      >
        {label}
      </button>
      <nav className="toc-nav">
        <ul>
          {headings.map((h) => (
            <li key={h.id} className={`toc-level-${h.level}`}>
              <a
                href={`#${h.id}`}
                className={activeId === h.id ? "active" : ""}
                onClick={(e) => handleClick(e, h.id)}
              >
                {h.text}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
