import { useState, useEffect, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import Header from "../components/Header";
import TableOfContents from "../components/TableOfContents";
import { useLang } from "../contexts/LangContext";
import { strings } from "../i18n/strings";
import tutorials from "../data/tutorials/index.js";
import { buildToc } from "../utils/toc";

export default function TutorialPart() {
  const { tutorialSlug, partSlug } = useParams();
  const { lang } = useLang();
  const t = strings[lang];
  const tutorial = tutorials.find((tr) => tr.slug === tutorialSlug);
  const [content, setContent] = useState(null);

  const partIndex = tutorial ? tutorial.parts.findIndex((p) => p.slug === partSlug) : -1;
  const part = partIndex !== -1 ? tutorial.parts[partIndex] : null;

  useEffect(() => {
    if (!tutorial || partIndex === -1) return;
    setContent(null);
    tutorial.loadPart(part.order)
      .then((mod) => setContent(mod.default))
      .catch(() => setContent(null));
  }, [tutorialSlug, partSlug]);

  // After the content renders, honor any URL hash by scrolling to the matching
  // heading. React Router's default scroll behavior fires before the dynamic
  // import resolves, so the target element does not yet exist in the DOM.
  useEffect(() => {
    if (!content) return;
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (!hash) return;
    requestAnimationFrame(() => {
      const el = document.getElementById(hash);
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY - 72;
      window.scrollTo({ top, behavior: "auto" });
    });
  }, [content]);

  if (!tutorial) {
    return (
      <div className="not-found">
        <h2>{t.tutorialNotFound}</h2>
        <Link to="/" className="home-btn">{t.backHome}</Link>
      </div>
    );
  }

  if (partIndex === -1) {
    return (
      <div className="not-found">
        <h2>{t.partNotFound}</h2>
        <Link to={`/tutorial/${tutorial.slug}`} className="home-btn">
          {t.backToTutorial}
        </Link>
      </div>
    );
  }

  const prev = tutorial.parts[partIndex - 1] ?? null;
  const next = tutorial.parts[partIndex + 1] ?? null;

  const { html: contentHtml, headings } = useMemo(
    () => (content ? buildToc(content[lang] || "") : { html: "", headings: [] }),
    [content, lang],
  );

  return (
    <>
      <Header>
        <Link to="/" className="home-btn">← {t.home}</Link>
        <Link to={`/tutorial/${tutorial.slug}`} className="home-btn">
          ↑ {tutorial.title[lang]}
        </Link>
        <Link to="/" className="site-logo">Kubernauta</Link>
      </Header>

      <main className="post-page post-page--with-toc">
        <div className="container">
          <div className="post-header">
            <div className="part-meta">
              <span className="part-series-label">
                <Link to={`/tutorial/${tutorial.slug}`}>
                  {tutorial.title[lang]}
                </Link>
              </span>
              <span className="part-progress">
                {t.part(part.order, tutorial.parts.length)}
              </span>
            </div>
            <h1>{part.title[lang]}</h1>
          </div>

          <div className="post-layout">
            {content && headings.length > 0 && (
              <TableOfContents headings={headings} label={t.onThisPage} />
            )}
            {content ? (
              <div
                className="post-content"
                dangerouslySetInnerHTML={{ __html: contentHtml }}
              />
            ) : (
              <div className="post-content" />
            )}
          </div>

          <nav className="post-nav">
            {prev ? (
              <Link
                to={`/tutorial/${tutorial.slug}/${prev.slug}`}
                className="nav-btn prev"
              >
                <span className="nav-label">{t.prevPart(prev.order)}</span>
                <span className="nav-title">{prev.title[lang]}</span>
              </Link>
            ) : (
              <Link to={`/tutorial/${tutorial.slug}`} className="nav-btn prev">
                <span className="nav-label">{t.index}</span>
                <span className="nav-title">{tutorial.title[lang]}</span>
              </Link>
            )}

            {next && (
              <Link
                to={`/tutorial/${tutorial.slug}/${next.slug}`}
                className="nav-btn next"
              >
                <span className="nav-label">{t.nextPart(next.order)}</span>
                <span className="nav-title">{next.title[lang]}</span>
              </Link>
            )}
          </nav>
        </div>
      </main>
    </>
  );
}
