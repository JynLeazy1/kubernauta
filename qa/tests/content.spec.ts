import { test, expect } from '@playwright/test'
import {
  langs,
  openInLang,
  readContentText,
  routes,
  snapshotName,
  waitForContent,
} from '../helpers'

// Layer 2 of the migration test plan: the visible text of every page with
// content must not change during a refactor. Update snapshots only in
// content: PRs (npx playwright test content --update-snapshots).
const withContent = routes.filter((r) => r.hasContent !== false)

for (const lang of langs) {
  test.describe(`content (${lang})`, () => {
    for (const route of withContent) {
      test(`${route.path}`, async ({ page }) => {
        await openInLang(page, route.path, lang)
        await waitForContent(page, route)
        const text = await readContentText(page)
        expect(text).toMatchSnapshot([lang, `${snapshotName(route.path)}.txt`])
      })
    }
  })
}
