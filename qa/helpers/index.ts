import { expect, type Page } from '@playwright/test'
import routesJson from '../fixtures/routes.json' with { type: 'json' }

export type Lang = 'es' | 'en'
export type RouteKind =
  | 'home'
  | 'post'
  | 'tutorial-series'
  | 'tutorial-part'
  | 'course'
  | 'course-chapter'
  | 'course-part'
export type Route = { path: string; kind: RouteKind; hasContent?: boolean }

export const routes = routesJson as Route[]
export const langs: Lang[] = ['es', 'en']

// Strings rendered for parts that are listed but not written yet.
export const comingSoon: Record<Lang, string> = { es: 'Próximamente', en: 'Coming soon' }

// Opens a path in the given language. Today the language lives in
// localStorage; after the MDX phase it moves to the URL (/en/...), and only
// this helper has to change.
export async function openInLang(page: Page, path: string, lang: Lang) {
  await page.addInitScript((l) => window.localStorage.setItem('lang', l), lang)
  await page.goto(path)
}

// Waits until the page shows its final content: an h1, no loading spinner and,
// for parts with content, the body of the article.
export async function waitForContent(page: Page, route: Route) {
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  if (route.hasContent === false) return
  if (route.kind === 'tutorial-part' || route.kind === 'course-part') {
    await expect(page.getByRole('article').getByRole('paragraph').first()).toBeVisible()
  }
  await expect(page.getByRole('status', { name: 'Loading' })).toHaveCount(0)
}

// Makes text comparable across refactors: the MDX conversion may change
// whitespace, Unicode composition or quote characters without changing what
// the reader sees.
export function normalizeText(text: string) {
  return text
    .normalize('NFC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

// Text of the page content for the baseline. Navigation (TOC, prev/next) is
// left out because it is redesigned during the migration, and CSS
// text-transform is neutralized so a style change does not alter the text.
export async function readContentText(page: Page) {
  await page.addStyleTag({
    content: `main nav, main aside { display: none !important; }
      main * { text-transform: none !important; }`,
  })
  return normalizeText(await page.getByRole('main').innerText())
}

// "/tutorial/que-es-un-pod/resumen" -> "tutorial--que-es-un-pod--resumen"
export function snapshotName(path: string) {
  return path === '/' ? 'home' : path.slice(1).replaceAll('/', '--')
}

// Internal links on the page, without hash or query, deduplicated.
export async function listInternalLinks(page: Page) {
  const hrefs = await page
    .locator('a[href^="/"]')
    .evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''))
  return [...new Set(hrefs.map((h) => h.split(/[?#]/)[0].replace(/(.)\/$/, '$1')))]
}
