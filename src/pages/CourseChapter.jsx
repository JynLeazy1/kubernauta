import { Link, useParams } from 'react-router-dom'
import { useLang } from '../contexts/LangContext'
import { strings } from '../i18n/strings'
import courses from '../data/courses/index.js'

export default function CourseChapter() {
  const { courseSlug, chapterSlug } = useParams()
  const { lang } = useLang()
  const t = strings[lang]
  const course = courses.find((c) => c.slug === courseSlug)
  const chapter = course ? course.parts.find((p) => p.slug === chapterSlug) : null

  if (!course) {
    return (
      <div className="not-found">
        <h2>{t.courseNotFound}</h2>
        <Link to="/" className="home-btn">
          {t.backHome}
        </Link>
      </div>
    )
  }

  if (!chapter) {
    return (
      <div className="not-found">
        <h2>{t.chapterNotFound}</h2>
        <Link to={`/course/${course.slug}`} className="home-btn">
          {t.backToCourse}
        </Link>
      </div>
    )
  }

  const totalChapters = course.parts.length
  const subparts = chapter.subparts ?? []

  return (
    <>
      <main className="series-page">
        <div className="container">
          <div className="series-hero">
            <div className="series-label">
              <Link to={`/course/${course.slug}`}>{course.title[lang]}</Link>
              <span> · {t.chapter(chapter.order, totalChapters)}</span>
            </div>
            <h1>{chapter.title[lang]}</h1>
            {subparts.length > 0 && (
              <p className="series-subtitle">{t.subparts(subparts.length)}</p>
            )}
          </div>

          <div className="series-parts">
            <h2 className="parts-heading">{t.chapterContents}</h2>
            <ol className="parts-list">
              {subparts.map((sub) => (
                <li key={sub.slug} className="part-item">
                  <Link
                    to={`/course/${course.slug}/${chapter.slug}/${sub.slug}`}
                    className="part-link"
                  >
                    <span className="part-number">{String(sub.order).padStart(2, '0')}</span>
                    <span className="part-title">{sub.title[lang]}</span>
                    <span className="part-arrow">→</span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>

          {subparts.length > 0 && (
            <div className="series-start">
              <Link
                to={`/course/${course.slug}/${chapter.slug}/${subparts[0].slug}`}
                className="start-btn"
              >
                {t.startChapter}
              </Link>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
