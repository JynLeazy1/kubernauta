import { Link } from 'react-router-dom'
import { useLang } from '../contexts/LangContext'

function formatDate(iso, lang) {
  return new Date(iso).toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function PostCard({ post }) {
  const { lang } = useLang()

  return (
    <Link to={`/post/${post.slug}`} className="post-card">
      <div className="post-card-date">{formatDate(post.date, lang)}</div>
      <h2>{post.title[lang]}</h2>
      <p>{post.excerpt[lang]}</p>
      <div className="tags">
        {post.tags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
          </span>
        ))}
      </div>
    </Link>
  )
}
