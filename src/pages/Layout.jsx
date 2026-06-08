import { useState } from 'react'
import Header from '../components/Header'
import Sidebar from '../components/Sidebar'
import { Link } from 'react-router-dom'

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <>
      <Header>
        <button className="sidebar-toggle" onClick={() => setSidebarOpen((o) => !o)}>
          ☰
        </button>
        <Link to="/" className="site-logo">
          Kubernauta
        </Link>
      </Header>

      <div className="app-layout">
        {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
        <div className={`sidebar-wrapper ${sidebarOpen ? 'sidebar-wrapper--open' : ''}`}>
          <Sidebar />
        </div>
        <main className="app-main">{children}</main>
      </div>
    </>
  )
}
