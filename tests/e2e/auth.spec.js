import { test, expect } from '@playwright/test'

test.describe('Auth flows', () => {
  test('unauthenticated user visiting app.html is redirected to auth.html', async ({ page }) => {
    await page.goto('/app.html')
    await expect(page).toHaveURL(/auth\.html/)
  })

  test('auth.html shows sign up panel by default', async ({ page }) => {
    await page.goto('/auth.html')
    await expect(page.locator('#panel-signup')).toBeVisible()
    await expect(page.locator('#panel-login')).not.toBeVisible()
  })

  test('toggle to login panel works', async ({ page }) => {
    await page.goto('/auth.html')
    await page.click('text=Log in')
    await expect(page.locator('#panel-login')).toBeVisible()
    await expect(page.locator('#panel-signup')).not.toBeVisible()
  })

  test('sign up with short password shows error', async ({ page }) => {
    await page.goto('/auth.html')
    await page.fill('#signup-email', 'test@example.com')
    await page.fill('#signup-password', '123')
    await page.click('#signup-btn')
    await expect(page.locator('#alert-error')).toBeVisible()
  })

  test('login with wrong password shows error', async ({ page }) => {
    await page.goto('/auth.html')
    await page.click('text=Log in')
    await page.fill('#login-email', 'nonexistent@example.com')
    await page.fill('#login-password', 'wrongpassword')
    await page.click('#login-btn')
    await expect(page.locator('#alert-error')).toBeVisible()
  })

  test('forgot password panel shows when clicked', async ({ page }) => {
    await page.goto('/auth.html')
    await page.click('text=Log in')
    await page.click('text=Forgot password?')
    await expect(page.locator('#panel-reset')).toBeVisible()
  })
})
