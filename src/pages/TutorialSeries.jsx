import { Link, useParams } from "react-router-dom";
import Header from "../components/Header";
import { useLang } from "../contexts/LangContext";
import { strings } from "../i18n/strings";
import tutorials from "../data/tutorials/index.js";

export default function TutorialSeries() {
  const { tutorialSlug } = useParams();
  const { lang } = useLang();
  const t = strings[lang];
  const tutorial = tutorials.find((tr) => tr.slug === tutorialSlug);

  if (!tutorial) {
    return (
      <div className="not-found">
        <h2>{t.tutorialNotFound}</h2>
        <Link to="/" className="home-btn">{t.backHome}</Link>
      </div>
    );
  }

  return (
    <>
      <Header>
        <Link to="/" className="home-btn">← {t.home}</Link>
        <Link to="/" className="site-logo">Kubernauta</Link>
      </Header>

      <main className="series-page">
        <div className="container">
          <div className="series-hero">
            <div className="series-label">
              {t.tutorial} · {t.parts(tutorial.parts.length)}
            </div>
            <h1>{tutorial.title[lang]}</h1>
            <p className="series-subtitle">{tutorial.subtitle[lang]}</p>
            <p className="series-description">{tutorial.description[lang]}</p>
            <div className="tags">
              {tutorial.tags.map((tag) => (
                <span key={tag} className="tag">{tag}</span>
              ))}
            </div>
          </div>

          <div className="series-parts">
            <h2 className="parts-heading">{t.contents}</h2>
            <ol className="parts-list">
              {tutorial.parts.map((part) => (
                <li key={part.slug} className="part-item">
                  <Link
                    to={`/tutorial/${tutorial.slug}/${part.slug}`}
                    className="part-link"
                  >
                    <span className="part-number">
                      {String(part.order).padStart(2, "0")}
                    </span>
                    <span className="part-title">{part.title[lang]}</span>
                    <span className="part-arrow">→</span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>

          <div className="series-start">
            <Link
              to={`/tutorial/${tutorial.slug}/${tutorial.parts[0].slug}`}
              className="start-btn"
            >
              {t.startReading}
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
