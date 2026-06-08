import PostCard from "../components/PostCard";
import TutorialCard from "../components/TutorialCard";
import CourseCard from "../components/CourseCard";
import Header from "../components/Header";
import { useLang } from "../contexts/LangContext";
import { strings } from "../i18n/strings";
import posts from "../data/posts/index.js";
import tutorials from "../data/tutorials/index.js";
import courses from "../data/courses/index.js";
import { usePageTitle } from "../hooks/usePageTitle.js";

export default function Home() {
  const { lang } = useLang();
  const t = strings[lang];

  usePageTitle("Kubernauta");

  return (
    <>
      <Header>
        <span className="site-logo">Kubernauta</span>
      </Header>

      <main>
        <div className="container">
          <div className="home-hero">
            <h1>{t.heroTitle}</h1>
            <p>{t.heroDesc}</p>
          </div>

          <section className="home-section">
            <h2 className="section-heading">
              <span>{t.courses}</span>
            </h2>
            <div className="tutorials-list">
              {courses.map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
          </section>

          <section className="home-section">
            <h2 className="section-heading">
              <span>{t.tutorials}</span>
            </h2>
            <div className="tutorials-list">
              {tutorials.map((tutorial) => (
                <TutorialCard key={tutorial.id} tutorial={tutorial} />
              ))}
            </div>
          </section>

          <section className="home-section">
            <h2 className="section-heading">
              <span>{t.blog}</span>
            </h2>
            <div className="posts-grid">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
