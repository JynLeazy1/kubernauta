import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useLang } from '../contexts/LangContext.jsx'
import courses from '../data/courses/index.js'
import tutorials from '../data/tutorials/index.js'
import posts from '../data/posts/index.js'

function SidebarGroup({ defaultOpen, label, icon, children }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={`sidebar-group ${open ? 'sidebar-group--open' : ''}`}>
      <button className="sidebar-group-label" onClick={() => setOpen(!open)}>
        <span>
          {icon} {label}
        </span>
        <span className="sidebar-group-arrow">▾</span>
      </button>
      <div className="sidebar-group-body">{children}</div>
    </div>
  )
}

export default function Sidebar() {
  const { lang } = useLang()
  const location = useLocation()
  const path = location.pathname

  return (
    <aside className="sidebar">
      <nav>
        <SidebarGroup label="Cursos" icon="" defaultOpen={path.startsWith('/course/')}>
          {courses.map((course) => (
            <div key={course.id} className="sidebar-item-group">
              <Link
                to={`/course/${course.slug}`}
                className={`sidebar-link ${
                  path === `/course/${course.slug}` ? 'sidebar-link--active' : ''
                } ${course.wip ? 'sidebar-link--wip' : ''}`}
              >
                {course.title[lang]}
                {course.wip && <span className="sidebar-badge">WIP</span>}
              </Link>
              {course.parts.map((chapter) => (
                <Link
                  key={chapter.slug}
                  to={`/course/${course.slug}/${chapter.slug}`}
                  className={`sidebar-link sidebar-link--nested ${
                    path === `/course/${course.slug}/${chapter.slug}` ||
                    path.startsWith(`/course/${course.slug}/${chapter.slug}/`)
                      ? 'sidebar-link--active'
                      : ''
                  }`}
                >
                  {chapter.title[lang]}
                </Link>
              ))}
            </div>
          ))}
        </SidebarGroup>

        <SidebarGroup label="Tutoriales" icon="" defaultOpen={path.startsWith('/tutorial/')}>
          {tutorials.map((tutorial) => (
            <div key={tutorial.id} className="sidebar-item-group">
              <Link
                to={`/tutorial/${tutorial.slug}`}
                className={`sidebar-link ${
                  path === `/tutorial/${tutorial.slug}` ? 'sidebar-link--active' : ''
                }`}
              >
                {tutorial.title[lang]}
              </Link>
              {tutorial.parts.map((part) => (
                <Link
                  key={part.slug}
                  to={`/tutorial/${tutorial.slug}/${part.slug}`}
                  className={`sidebar-link sidebar-link--nested ${
                    path === `/tutorial/${tutorial.slug}/${part.slug}` ? 'sidebar-link--active' : ''
                  }`}
                >
                  {part.title[lang]}
                </Link>
              ))}
            </div>
          ))}
        </SidebarGroup>

        <SidebarGroup label="Blog" icon="" defaultOpen={path.startsWith('/post/')}>
          {posts.map((post) => (
            <Link
              key={post.id}
              to={`/post/${post.slug}`}
              className={`sidebar-link ${
                path === `/post/${post.slug}` ? 'sidebar-link--active' : ''
              }`}
            >
              {post.title[lang]}
            </Link>
          ))}
        </SidebarGroup>
      </nav>
    </aside>
  )
}
