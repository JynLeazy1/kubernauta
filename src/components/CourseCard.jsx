import { Link } from 'react-router-dom'
import { useLang } from '../contexts/LangContext'
import { strings } from '../i18n/strings'

export default function CourseCard({ course }) {
  const { lang } = useLang()
  const t = strings[lang]

  return (
    <Link to={`/course/${course.slug}`} className="tutorial-card">
      {course.wip && <span className="tutorial-card-wip">{t.workInProgress}</span>}
      <div className="tutorial-card-parts">
        {t.course} · {t.chapters(course.parts.length)}
      </div>
      <h2>{course.title[lang]}</h2>
      <p className="tutorial-card-subtitle">{course.subtitle[lang]}</p>
      <p>{course.description[lang]}</p>
      <div className="tags">
        {course.tags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
          </span>
        ))}
      </div>
      <span className="tutorial-card-cta">{t.startCourse}</span>
    </Link>
  )
}
