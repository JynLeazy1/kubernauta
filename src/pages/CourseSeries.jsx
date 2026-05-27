import { Link, useParams } from "react-router-dom";
import Header from "../components/Header";
import { useLang } from "../contexts/LangContext";
import { strings } from "../i18n/strings";
import courses from "../data/courses/index.js";

export default function CourseSeries() {
  const { courseSlug } = useParams();
  const { lang } = useLang();
  const t = strings[lang];
  const course = courses.find((c) => c.slug === courseSlug);

  if (!course) {
    return (
      <div className="not-found">
        <h2>{t.courseNotFound}</h2>
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
              {t.course} · {t.chapters(course.parts.length)}
              {course.wip && (
                <span className="series-wip">{t.workInProgress}</span>
              )}
            </div>
            <h1>{course.title[lang]}</h1>
            <p className="series-subtitle">{course.subtitle[lang]}</p>
            <p className="series-description">{course.description[lang]}</p>
            <div className="tags">
              {course.tags.map((tag) => (
                <span key={tag} className="tag">{tag}</span>
              ))}
            </div>
          </div>

          <div className="series-parts">
            <h2 className="parts-heading">{t.contents}</h2>
            <ol className="parts-list">
              {course.parts.map((part) => (
                <li key={part.slug} className="part-item">
                  <Link
                    to={`/course/${course.slug}/${part.slug}`}
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
              to={`/course/${course.slug}/${course.parts[0].slug}/${course.parts[0].subparts[0].slug}`}
              className="start-btn"
            >
              {t.startCourse}
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
