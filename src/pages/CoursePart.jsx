import { useReducer, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import Header from '../components/Header'
import Loading from '../components/Loading'
import { useLang } from '../contexts/LangContext'
import { strings } from '../i18n/strings'
import courses from '../data/courses/index.js'

const LOADING = { state: 'loading', content: null }
const MISSING = { state: 'missing', content: null }
function ready(content) {
  return { state: 'ready', content }
}

function loadReducer(_, action) {
  switch (action.type) {
    case 'loading':
      return LOADING
    case 'ready':
      return ready(action.content)
    case 'missing':
      return MISSING
    default:
      return { state: 'idle', content: null }
  }
}

export default function CoursePart() {
  const { courseSlug, chapterSlug, partSlug } = useParams()
  const { lang } = useLang()
  const t = strings[lang]
  const course = courses.find((c) => c.slug === courseSlug)
  const [{ content, state: loadState }, dispatch] = useReducer(loadReducer, {
    state: 'idle',
    content: null,
  })

  const chapterIndex = course ? course.parts.findIndex((p) => p.slug === chapterSlug) : -1
  const chapter = chapterIndex !== -1 ? course.parts[chapterIndex] : null
  const subparts = chapter?.subparts ?? []
  const subIndex = chapter ? subparts.findIndex((s) => s.slug === partSlug) : -1
  const subpart = subIndex !== -1 ? subparts[subIndex] : null

  useEffect(() => {
    if (!course || !chapter || !subpart) return
    let cancelled = false
    dispatch({ type: 'loading' })
    course
      .loadSubpart(chapter.order, subpart.order)
      .then((mod) => {
        if (cancelled) return
        dispatch({ type: 'ready', content: mod.default })
      })
      .catch(() => {
        if (cancelled) return
        dispatch({ type: 'missing' })
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseSlug, chapterSlug, partSlug])

  // After the content renders, honor any URL hash by scrolling to the matching
  // heading. React Router's default scroll fires before the dynamic import
  // resolves, so the target element does not yet exist in the DOM.
  useEffect(() => {
    if (!content) return
    const hash = decodeURIComponent(window.location.hash.slice(1))
    if (!hash) return
    requestAnimationFrame(() => {
      const el = document.getElementById(hash)
      if (!el) return
      const top = el.getBoundingClientRect().top + window.scrollY - 72
      window.scrollTo({ top, behavior: 'auto' })
    })
  }, [content])

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

  if (!subpart) {
    return (
      <div className="not-found">
        <h2>{t.partNotFound}</h2>
        <Link to={`/course/${course.slug}/${chapter.slug}`} className="home-btn">
          {t.backToChapter}
        </Link>
      </div>
    )
  }

  const prevSubpart = subparts[subIndex - 1] ?? null
  const nextSubpart = subparts[subIndex + 1] ?? null
  const prevChapter = chapterIndex > 0 ? course.parts[chapterIndex - 1] : null
  const nextChapter = chapterIndex < course.parts.length - 1 ? course.parts[chapterIndex + 1] : null

  const prevChapterLastSub =
    prevChapter && prevChapter.subparts?.length
      ? prevChapter.subparts[prevChapter.subparts.length - 1]
      : null
  const nextChapterFirstSub =
    nextChapter && nextChapter.subparts?.length ? nextChapter.subparts[0] : null

  return (
    <>
      <main className="post-page">
        <div className="container">
          <div className="post-header">
            <div className="part-meta">
              <span className="part-series-label">
                <Link to={`/course/${course.slug}`}>{course.title[lang]}</Link>
              </span>
              <span className="part-progress">
                {t.chapter(chapter.order, course.parts.length)}
                {subparts.length > 1 && ` · ${t.subpart(subpart.order, subparts.length)}`}
              </span>
            </div>
            <h1>{subpart.title[lang]}</h1>
          </div>

          {loadState === 'ready' && content ? (
            <div className="post-content" dangerouslySetInnerHTML={{ __html: content[lang] }} />
          ) : loadState === 'missing' ? (
            <div className="post-content coming-soon">
              <h2>{t.comingSoonTitle}</h2>
              <p>{t.comingSoonBody}</p>
            </div>
          ) : (
            <Loading fullPage />
          )}

          <nav className="post-nav">
            {prevSubpart ? (
              <Link
                to={`/course/${course.slug}/${chapter.slug}/${prevSubpart.slug}`}
                className="nav-btn prev"
              >
                <span className="nav-label">{t.prevSubpart(prevSubpart.order)}</span>
                <span className="nav-title">{prevSubpart.title[lang]}</span>
              </Link>
            ) : prevChapterLastSub ? (
              <Link
                to={`/course/${course.slug}/${prevChapter.slug}/${prevChapterLastSub.slug}`}
                className="nav-btn prev"
              >
                <span className="nav-label">{t.prevChapter(prevChapter.order)}</span>
                <span className="nav-title">{prevChapter.title[lang]}</span>
              </Link>
            ) : (
              <Link to={`/course/${course.slug}`} className="nav-btn prev">
                <span className="nav-label">{t.index}</span>
                <span className="nav-title">{course.title[lang]}</span>
              </Link>
            )}

            {nextSubpart ? (
              <Link
                to={`/course/${course.slug}/${chapter.slug}/${nextSubpart.slug}`}
                className="nav-btn next"
              >
                <span className="nav-label">{t.nextSubpart(nextSubpart.order)}</span>
                <span className="nav-title">{nextSubpart.title[lang]}</span>
              </Link>
            ) : nextChapterFirstSub ? (
              <Link
                to={`/course/${course.slug}/${nextChapter.slug}/${nextChapterFirstSub.slug}`}
                className="nav-btn next"
              >
                <span className="nav-label">{t.nextChapter(nextChapter.order)}</span>
                <span className="nav-title">{nextChapter.title[lang]}</span>
              </Link>
            ) : null}
          </nav>
        </div>
      </main>
    </>
  )
}
