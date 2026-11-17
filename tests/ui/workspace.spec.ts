import { test, expect } from '@playwright/test'

test('workspace navigation and theme preferences are usable', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Assessment workspace' })).toBeVisible()
  await page.getByRole('button', { name: /Preferences/ }).click()
  await expect(page.getByRole('heading', { name: 'Preferences' })).toBeVisible()
  await page.getByRole('button', { name: 'Black' }).click()
  await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'black')
  await page.getByRole('button', { name: 'Team' }).click()
  await expect(page.getByRole('heading', { name: 'Team', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /joseph.adogeri/ })).toHaveAttribute('href', /^mailto:/)
})

test('command palette opens and filters keyboard actions', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Control+k')
  await expect(page.getByRole('dialog', { name: 'Quick actions' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Search quick actions' }).fill('preferences')
  await expect(page.getByRole('option', { name: 'Open preferences' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Validate batch' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Quick actions' })).toHaveCount(0)
})

test('history screen explains local clearing before any records exist', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Recent & activity' }).click()
  await expect(page.getByText('No recent files yet.')).toBeVisible()
  await expect(page.getByText('No activity recorded yet.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Clear history' })).toBeDisabled()
})
