import { Link, useParams } from 'react-router-dom'
import { useLang } from '../contexts/LangContext'
import { strings } from '../i18n/strings'
import posts from '../data/posts/index.js'
import { usePageTitle } from '../hooks/usePageTitle.js'

function formatDate(iso, lang) {
  return new Date(iso).toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function Post() {
  const { slug } = useParams()
  const { lang } = useLang()
  const t = strings[lang]
  const index = posts.findIndex((p) => p.slug === slug)
  /* const post = posts.find((p) => p.slug === slug); */

  if (index === -1) {
    return (
      <div className="not-found">
        <h2>{t.notFound}</h2>
        <p>{t.notFoundDesc}</p>
        <Link to="/" className="home-btn">
          {t.backHome}
        </Link>
      </div>
    )
  }

  const post = posts[index]
  const prev = posts[index + 1] ?? null
  const next = posts[index - 1] ?? null

  usePageTitle(post ? `${post.title[lang]}` : 'Kubernauta')

  return (
    <>
      <main className="post-page">
        <div className="container">
          <div className="post-header">
            <div className="post-date">{formatDate(post.date, lang)}</div>
            <h1>{post.title[lang]}</h1>
            <div className="tags">
              {post.tags.map((tag) => (
                <span key={tag} className="tag">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="post-content" dangerouslySetInnerHTML={{ __html: post.content[lang] }} />

          <nav className="post-nav">
            {prev && (
              <Link to={`/post/${prev.slug}`} className="nav-btn prev">
                <span className="nav-label">{t.prevPost}</span>
                <span className="nav-title">{prev.title[lang]}</span>
              </Link>
            )}
            {next && (
              <Link to={`/post/${next.slug}`} className="nav-btn next">
                <span className="nav-label">{t.nextPost}</span>
                <span className="nav-title">{next.title[lang]}</span>
              </Link>
            )}
          </nav>
        </div>
      </main>
    </>
  )
}
