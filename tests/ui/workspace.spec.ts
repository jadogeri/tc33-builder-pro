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

test('imports JSON metadata, shows validation issues, and offers all report formats', async ({ page }) => {
  await page.addInitScript(() => {
    const preferences = {
      theme: 'light', minimizeToTray: false, notifications: false, filename: 'tc33',
      dateFormat: 'none', defaultDistrict: '', defaultTaxYear: '', jsonFilename: ''
    }
    const workspace = { preferences, recent: [], activity: [] }
    const xlsx = { name: 'source.xlsx', path: '/mock/source.xlsx', bytes: new Uint8Array([1]) }
    const json = {
      name: 'psr.json', path: '/mock/psr.json', bytes: new Uint8Array([2]),
      metadata: { parishName: 'ORLEANS', fipsCode: '22171', district: '1', taxYear: '2027' }
    }
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        getWorkspace: async () => workspace,
        rendererReady: async () => undefined,
        onCommand: () => () => undefined,
        onToast: () => () => undefined,
        openSources: async (kind: string) => kind === 'json' ? [json] : [xlsx, json],
        importDroppedSources: async () => [],
        setPreferences: async (next: typeof preferences) => ({ ...next }),
        recordActivity: async () => workspace,
        validateSources: async () => [{
          file: 'source.xlsx', comparedTo: 'psr.json', isValid: false,
          summaryLog: 'Validation Failed (1 issue found).',
          sourceLog: 'Loaded: source.xlsx | Sheet: Export Worksheet (33 rows)',
          errors: ['Class 30 (totalAssessed): Excel=1000 vs JSON=950']
        }],
        generateSources: async () => [],
        exportMismatches: async () => true,
        windowControl: async () => undefined,
        clearHistory: async () => workspace,
        reopenSource: async () => xlsx
      }
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Select JSON schema' }).first().click()
  await expect(page.getByText(/FIPS 22171 · District 1 · Tax Year 2027/)).toBeVisible()
  await page.getByRole('button', { name: 'Choose files' }).click()
  await expect(page.getByRole('checkbox', { name: 'Select source.xlsx for TC-33 export' })).toBeChecked()
  await page.getByRole('button', { name: 'Validate batch' }).click()
  await expect(page.locator('.result-output')).toContainText('Loaded: source.xlsx | Sheet: Export Worksheet (33 rows)')
  await page.getByRole('tab', { name: /Validation issues/ }).click()
  await expect(page.locator('.issue-list')).toContainText('totalAssessed')
  await page.getByRole('tab', { name: /Validation issues/ }).press('ArrowLeft')
  await expect(page.getByRole('tab', { name: 'Run log' })).toBeFocused()
  for (const label of ['PDF', 'Excel', 'CSV', 'JSON', 'Text', 'Word']) {
    await expect(page.getByRole('button', { name: `Export ${label}` })).toBeVisible()
  }
  await page.getByRole('button', { name: 'Export JSON' }).click()
  await expect(page.locator('.result-output')).toContainText('Saved tc33-validation-mismatches.json.')
  await page.getByRole('button', { name: 'Remove psr.json' }).click()
  await expect(page.locator('.result-output')).toContainText('Source removed from this batch')
})
