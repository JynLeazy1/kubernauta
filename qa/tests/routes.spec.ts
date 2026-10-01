import { test, expect } from '@playwright/test'
import {
  comingSoon,
  langs,
  listInternalLinks,
  openInLang,
  routes,
  waitForContent,
} from '../helpers'

// Layers 1 and 3 of the migration test plan: every route in the frozen
// inventory renders, and every internal link points to a known route or to a
// static file that the server returns.
const known = new Set(routes.map((r) => r.path))
const isFile = (href: string) => /\.[a-z0-9]+$/i.test(href)

for (const lang of langs) {
  test.describe(`routes (${lang})`, () => {
    for (const route of routes) {
      test(`${route.path}`, async ({ page }) => {
        await openInLang(page, route.path, lang)
        await waitForContent(page, route)

        if (route.hasContent === false) {
          await expect(page.getByText(comingSoon[lang], { exact: true })).toBeVisible()
        }

        const links = await listInternalLinks(page)
        const brokenRoutes = links.filter((href) => !isFile(href) && !known.has(href))
        expect(brokenRoutes, 'internal links without a matching route').toEqual([])

        for (const href of links.filter(isFile)) {
          // The preview server answers missing files with index.html and a 200,
          // so a real file is one that is not served as HTML.
          const res = await page.request.get(href)
          expect(res.status(), `static file ${href}`).toBe(200)
          expect(res.headers()['content-type'] ?? '', `static file ${href}`).not.toContain(
            'text/html',
          )
        }
      })
    }
  })
}
