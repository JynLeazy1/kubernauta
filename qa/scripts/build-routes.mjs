// Generates qa/fixtures/routes.json from the current content in src/data.
// The output is committed and stays frozen during the migration, so a route
// that disappears after a refactor makes the tests fail instead of silently
// shrinking the list. Regenerate only when content is added or removed on
// purpose: node qa/scripts/build-routes.mjs
import { existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import posts from '../../src/data/posts/index.js'
import tutorials from '../../src/data/tutorials/index.js'
import courses from '../../src/data/courses/index.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const tutorialDirs = {
  'que-es-realmente-un-contenedor': 'queEsRealmenteUnContenedor',
  'que-es-un-pod': 'queEsUnPod',
  'que-es-un-servicio': 'queEsUnServicio',
}

const routes = [{ path: '/', kind: 'home' }]

for (const post of posts) routes.push({ path: `/post/${post.slug}`, kind: 'post' })

for (const tutorial of tutorials) {
  routes.push({ path: `/tutorial/${tutorial.slug}`, kind: 'tutorial-series' })
  const dir = tutorialDirs[tutorial.slug]
  if (!dir) throw new Error(`Unknown folder for tutorial ${tutorial.slug}`)
  for (const part of tutorial.parts) {
    const file = join(root, 'src/data/tutorials', dir, `part${part.order}.js`)
    routes.push({
      path: `/tutorial/${tutorial.slug}/${part.slug}`,
      kind: 'tutorial-part',
      hasContent: existsSync(file),
    })
  }
}

for (const course of courses) {
  routes.push({ path: `/course/${course.slug}`, kind: 'course' })
  for (const chapter of course.parts) {
    routes.push({ path: `/course/${course.slug}/${chapter.slug}`, kind: 'course-chapter' })
    for (const sub of chapter.subparts ?? []) {
      const file = join(
        root,
        'src/data/courses',
        course.slug,
        `ch${chapter.order}`,
        `part${sub.order}.js`,
      )
      routes.push({
        path: `/course/${course.slug}/${chapter.slug}/${sub.slug}`,
        kind: 'course-part',
        hasContent: existsSync(file),
      })
    }
  }
}

const out = join(root, 'qa/fixtures/routes.json')
writeFileSync(out, JSON.stringify(routes, null, 2) + '\n')
const count = (k) => routes.filter((r) => r.kind === k).length
const missing = routes.filter((r) => r.hasContent === false)
console.log(
  `${routes.length} routes:`,
  Object.fromEntries([...new Set(routes.map((r) => r.kind))].map((k) => [k, count(k)])),
)
console.log(`${missing.length} listed parts without a content file`)
