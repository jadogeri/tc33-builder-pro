import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { preferencesSchema, saveFileSchema, safeExternalURL, updatePercent } from '../src/shared/validation'
import { extractXlsxFile } from '../src/etl/extract'
import { buildTc33Workbook } from '../src/etl/load'
import { transform } from '../src/etl/transform'

test('preferences preserve valid appearance and export defaults', () => {
  assert.deepEqual(preferencesSchema.parse({ theme: 'black', defaultDistrict: '3', defaultTaxYear: '2027' }), {
    theme: 'black', minimizeToTray: false, notifications: false, filename: 'tc33',
    dateFormat: 'none', defaultDistrict: '3', defaultTaxYear: '2027'
  })
  assert.equal(preferencesSchema.safeParse({ theme: 'black', filename: '../report' }).success, false)
  assert.equal(preferencesSchema.safeParse({ theme: 'light', defaultTaxYear: '27' }).success, false)
})

test('save dialog filename cannot contain a path', () => {
  assert.equal(saveFileSchema.safeParse(['report.txt', 'ok']).success, true)
  assert.equal(saveFileSchema.safeParse(['../report.txt', 'ok']).success, false)
})

test('external links accept safe web URLs only', () => {
  assert.equal(safeExternalURL('https://example.com/help'), 'https://example.com/help')
  assert.equal(safeExternalURL('javascript:alert(1)'), null)
  assert.equal(safeExternalURL('https://user:pass@example.com'), null)
})

test('download progress is finite and bounded', () => {
  assert.equal(updatePercent(45.2), 45)
  assert.equal(updatePercent(120), 100)
  assert.equal(updatePercent(-2), 0)
  assert.equal(updatePercent(Number.NaN), 0)
})

test('ExcelJS extracts rows and SQL metadata from workbook sheets', async () => {
  const workbook = new ExcelJS.Workbook()
  const recap = workbook.addWorksheet('Recap')
  recap.addRow(['GROUP', 'DESCRIPTION', 'UNITS', 'HOMESTEAD', 'VETERAN', 'FIRST', 'ASSESSED', 'TAXABLE'])
  recap.addRow(['1REAL ESTATE', '30 Residential', 1, 0, 0, 0, 1000, 800])
  const sql = workbook.addWorksheet('SQL')
  sql.addRow(["WHERE TAX_YEAR = '2027' AND FIPS_CODE = '22171'"])
  const buffer = await workbook.xlsx.writeBuffer()
  const source = new File([new Uint8Array(buffer).slice().buffer as ArrayBuffer], 'source.xlsx')
  const extracted = await extractXlsxFile(source)
  assert.equal(extracted.sheetName, 'Recap')
  assert.equal(extracted.rows[1][6], 1000)
  assert.match(extracted.sqlScript ?? '', /TAX_YEAR/)
  const result = transform(extracted.rows, extracted.sqlScript)
  assert.equal(result.report.district, '1')
  assert.equal(result.report.taxYear, '2027')
  assert.equal(result.report.groups.get('1')?.items[0].classCode, '30')
})

test('workbook export requires report metadata and produces an Excel file', async () => {
  const report = { groups: new Map(), summaryRows: {}, district: '1', taxYear: '2027' }
  await assert.rejects(() => buildTc33Workbook({ ...report, district: undefined }, 'test.xlsx'), /Missing required report metadata: District/)
  const bytes = await buildTc33Workbook(report, 'test.xlsx')
  assert.equal(bytes[0], 0x50)
  assert.equal(bytes[1], 0x4b)
})
