import { test, expect } from '@playwright/test'
import { createSubscribedUser, cleanupUser } from './helpers.js'

test.describe('App flows (requires active subscription)', () => {
  let user

  test.beforeAll(async () => {
    user = await createSubscribedUser()
  })

  test.afterAll(async () => {
    if (user) await cleanupUser(user.userId)
  })

  async function loginAndGoToApp(page) {
    await page.goto('/auth.html')
    await page.click('text=Log in')
    await page.fill('#login-email', user.email)
    await page.fill('#login-password', user.password)
    await page.click('#login-btn')
    await page.waitForURL('**/app.html')
  }

  test('subscribed user lands on app after login', async ({ page }) => {
    await loginAndGoToApp(page)
    await expect(page.locator('#bottom-nav')).toBeVisible()
    await expect(page.locator('#paywall')).not.toBeVisible()
  })

  test('completing profile updates readiness bar', async ({ page }) => {
    await loginAndGoToApp(page)
    await page.click('#home-avatar')
    await page.fill('#p-name', 'Jake Smith')
    await page.selectOption('#p-pos', 'RHP')
    await page.click('text=Save Profile')
    const pct = await page.locator('#readiness-pct').textContent()
    expect(parseInt(pct)).toBeGreaterThan(0)
  })

  test('coach search filters by division', async ({ page }) => {
    await loginAndGoToApp(page)
    await page.click('#nav-coaches')
    await page.click('[data-div="JUCO"]')
    await page.waitForTimeout(300)
    const count = await page.locator('#coach-count-label').textContent()
    expect(count).toContain('JUCO')
  })

  test('search input filters coach list', async ({ page }) => {
    await loginAndGoToApp(page)
    await page.click('#nav-coaches')
    await page.fill('#coach-search', 'florida state')
    await page.waitForTimeout(400)
    const cards = page.locator('.coach-card')
    await expect(cards.first()).toContainText('Florida State')
  })

  test('clicking coach card opens detail sheet', async ({ page }) => {
    await loginAndGoToApp(page)
    await page.click('#nav-coaches')
    await page.locator('.coach-card').first().click()
    await expect(page.locator('#coach-sheet.open')).toBeVisible()
  })

  test('"Write Email to This School" prefills the email writer', async ({ page }) => {
    await loginAndGoToApp(page)
    await page.click('#nav-coaches')
    await page.fill('#coach-search', 'Florida State')
    await page.waitForTimeout(400)
    await page.locator('.coach-card').first().click()
    await page.click('text=Write Email to This School')
    await expect(page.locator('#school-search-input')).toHaveValue(/Florida State/i)
  })

  test('copy button copies email to clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await loginAndGoToApp(page)
    await page.click('#nav-emails')
    // Manually set a generated email to test copy without calling AI
    await page.evaluate(() => {
      window.generatedSubject = 'Test Subject'
      window.generatedBody = 'Test Body'
      document.getElementById('email-result').style.display = 'block'
      document.getElementById('email-subject').textContent = 'Test Subject'
      document.getElementById('email-body').textContent = 'Test Body'
    })
    await page.click('text=Copy')
    const clip = await page.evaluate(() => navigator.clipboard.readText())
    expect(clip).toContain('Test Subject')
    expect(clip).toContain('Test Body')
  })

  test('log out redirects to index.html', async ({ page }) => {
    await loginAndGoToApp(page)
    await page.click('#home-avatar')
    await page.click('text=Log Out')
    await expect(page).toHaveURL(/index\.html|^\/$/)
  })
})
