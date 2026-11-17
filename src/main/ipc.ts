import { app, BrowserWindow, dialog, nativeTheme } from 'electron'
import { basename } from 'node:path'
import { readFile, writeFile, stat } from 'node:fs/promises'
import { channels } from '../shared/channels'
import { getSettings, setTheme, getWorkspace, setPreferences, rememberFile, recordActivity, clearHistory } from './settings'
import { notify, registerTray, unregisterTray } from './desktop'
import { z } from 'zod'
import { assertTrustedSender } from './trust'
import { saveFileSchema, themeSchema } from '../shared/validation'
import { handle } from './handle'
import { generateSources, validateSources } from './tasks'

export function registerIPC(): void {
  async function readSource(filePath: string) {
    if (!/\.(xlsx|json)$/i.test(filePath)) throw new Error('Select .xlsx or .json files')
    const info = await stat(filePath)
    if (!info.isFile() || info.size > 25 * 1024 * 1024) throw new Error('Each source must be smaller than 25 MB')
    const bytes = await readFile(filePath)
    rememberFile({ name: basename(filePath), path: filePath, openedAt: new Date().toISOString() })
    return { name: basename(filePath), path: filePath, bytes: new Uint8Array(bytes) }
  }
  handle('getWorkspace', () => getWorkspace())
  handle('setPreferences', (event, input) => {
    const preferences = setPreferences(input)
    const window = BrowserWindow.fromWebContents(event.sender)
    if (preferences.minimizeToTray && window) registerTray(window)
    else unregisterTray()
    return preferences
  })
  handle('windowControl', (event, action) => {
    z.enum(['minimize', 'maximize', 'close']).parse(action)
    const window = BrowserWindow.fromWebContents(event.sender)!
    if (action === 'minimize') window.minimize()
    if (action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize()
    if (action === 'close') window.close()
  })
  handle('rendererReady', () => {})
  handle('validateSources', (_event, sources) => validateSources(sources))
  handle('generateSources', (event, sources) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) throw new Error('The app window is unavailable.')
    return generateSources(window, sources)
  })
  handle('openSources', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)!
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'TC33 sources', extensions: ['xlsx', 'json'] }]
    })
    if (result.canceled) return []
    if (result.filePaths.length > 50) throw new Error('Import at most 50 files at once')
    const filesInfo = await Promise.all(result.filePaths.map((path) => stat(path)))
    if (filesInfo.reduce((total, file) => total + file.size, 0) > 100 * 1024 * 1024) {
      throw new Error('Select files with a combined size under 100 MB')
    }
    const files = []
    for (const path of result.filePaths) files.push(await readSource(path))
    return files
  })
  handle('reopenSource', (_event, filePath) => {
    z.string().max(4096).parse(filePath)
    if (!getWorkspace().recent.some((file) => file.path === filePath)) throw new Error('File is not in recent history. Import it again.')
    return readSource(filePath)
  })
  handle('recordActivity', (event, input) => {
    const state = recordActivity(input)
    notify(BrowserWindow.fromWebContents(event.sender)!, `${input.action}: ${input.file}`)
    return state
  })
  handle('clearHistory', () => clearHistory())
  handle('saveExport', async (event, name, bytes) => {
    z.string().min(1).max(180).regex(/^[^\\/:*?"<>|\0]+\.(xlsx|pdf|docx)$/i).parse(name)
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > 100 * 1024 * 1024) throw new Error('Invalid export data')
    const result = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender)!, { defaultPath: name })
    if (result.canceled || !result.filePath) return false
    await writeFile(result.filePath, bytes)
    return true
  })
  handle('exportMismatches', async (event, format, name, issues) => {
    z.enum(['pdf', 'docx']).parse(format)
    z.string().min(1).max(180).regex(/^[^\\/:*?"<>|\0]+\.(pdf|docx)$/i).parse(name)
    z.array(z.string().max(2000)).max(1000).parse(issues)
    const window = BrowserWindow.fromWebContents(event.sender)!
    let bytes: Buffer
    if (format === 'docx') {
      const { Document, Packer, Paragraph, TextRun } = await import('docx')
      const doc = new Document({ sections: [{ children: [
        new Paragraph({ children: [new TextRun({ text: 'TC33 Validation Mismatches', bold: true, size: 30 })] }),
        ...issues.map((line) => new Paragraph({ text: line }))
      ] }] })
      bytes = await Packer.toBuffer(doc)
    } else {
      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF()
      pdf.setFontSize(16); pdf.text('TC33 Validation Mismatches', 14, 18)
      pdf.setFontSize(10)
      const text = pdf.splitTextToSize(issues.join('\n'), 180)
      const linesPerPage = Math.max(1, Math.floor((pdf.internal.pageSize.getHeight() - 36) / 5))
      for (let index = 0; index < text.length; index += linesPerPage) {
        if (index > 0) pdf.addPage()
        pdf.text(text.slice(index, index + linesPerPage), 14, 28)
      }
      bytes = Buffer.from(pdf.output('arraybuffer'))
    }
    const result = await dialog.showSaveDialog(window, { defaultPath: name })
    if (result.canceled || !result.filePath) return false
    await writeFile(result.filePath, bytes)
    return true
  })

  handle('getVersion', (event) => { assertTrustedSender(event); return app.getVersion() })
  handle('getSettings', (event) => { assertTrustedSender(event); return getSettings() })
  handle('setTheme', (event, theme: unknown) => {
    assertTrustedSender(event)
    return setTheme(themeSchema.parse(theme))
  })
  nativeTheme.on('updated', () => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(channels.themeChanged, nativeTheme.shouldUseDarkColors)
    }
  })

  handle('openFile', async (event) => {
    assertTrustedSender(event)
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return null

    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const filePath = result.filePaths[0]
    const info = await stat(filePath)
    if (!info.isFile() || info.size > 10 * 1024 * 1024) throw new Error('Select a text file smaller than 10 MB')
    event.sender.send(channels.toast, 'File opened successfully')
    return {
      path: filePath,
      name: basename(filePath),
      text: await readFile(filePath, 'utf8')
    }
  })

  handle('saveFile', async (event, defaultName: string, content: string) => {
    assertTrustedSender(event)
    saveFileSchema.parse([defaultName, content])
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return false

    const result = await dialog.showSaveDialog(window, { defaultPath: defaultName })
    if (result.canceled || !result.filePath) return false

    await writeFile(result.filePath, content, 'utf8')
    return true
  })
}