import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { LangProvider } from './contexts/LangContext'
import Home from './pages/Home'
import Post from './pages/Post'
import TutorialSeries from './pages/TutorialSeries'
import TutorialPart from './pages/TutorialPart'
import CourseSeries from './pages/CourseSeries'
import CourseChapter from './pages/CourseChapter'
import CoursePart from './pages/CoursePart'
import Layout from './pages/Layout'

export default function App() {
  return (
    <LangProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/post/:slug" element={<Post />} />
            <Route path="/tutorial/:tutorialSlug" element={<TutorialSeries />} />
            <Route path="/tutorial/:tutorialSlug/:partSlug" element={<TutorialPart />} />
            <Route path="/course/:courseSlug" element={<CourseSeries />} />
            <Route path="/course/:courseSlug/:chapterSlug" element={<CourseChapter />} />
            <Route path="/course/:courseSlug/:chapterSlug/:partSlug" element={<CoursePart />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </LangProvider>
  )
}
