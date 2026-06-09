import { Link } from 'react-router-dom'
import { useLang } from '../contexts/LangContext'
import { strings } from '../i18n/strings'

export default function TutorialCard({ tutorial }) {
  const { lang } = useLang()
  const t = strings[lang]

  return (
    <Link to={`/tutorial/${tutorial.slug}`} className="tutorial-card">
      <div className="tutorial-card-parts">
        {t.tutorial} · {t.parts(tutorial.parts.length)}
      </div>
      <h2>{tutorial.title[lang]}</h2>
      <p className="tutorial-card-subtitle">{tutorial.subtitle[lang]}</p>
      <p>{tutorial.description[lang]}</p>
      <div className="tags">
        {tutorial.tags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
          </span>
        ))}
      </div>
      <span className="tutorial-card-cta">{t.startReading}</span>
    </Link>
  )
}
