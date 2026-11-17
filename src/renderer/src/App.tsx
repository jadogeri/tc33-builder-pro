import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BatchGenerationResult, BatchValidationResult, Preferences, RecentFile, SourceFile, WorkspaceState } from '../../shared/types'
import './App.css'

type Section = 'workspace' | 'history' | 'settings' | 'team'
const defaultPreferences: Preferences = {
  theme: 'light', minimizeToTray: false, notifications: false, filename: 'tc33', dateFormat: 'none',
  defaultDistrict: '', defaultTaxYear: ''
}
const people = [
  { name: 'Jun Bause', role: 'IT Manager', phone: '504-754-8846', email: 'jbausa@orleansassessors.com' },
  { name: 'Joseph Adogeri', role: 'Software Developer', phone: '504-754-8862', email: 'joseph.adogeri@orleansassessors.com' },
  { name: 'Jason Lee', role: 'Computer Programmer', phone: '504-754-8851', email: 'jason.lee@orleansassessors.com' }
]
const printableDate = (format: Preferences['dateFormat']) => {
  if (format === 'none') return ''
  const date = new Date()
  const y = String(date.getFullYear()), m = String(date.getMonth() + 1).padStart(2, '0'), d = String(date.getDate()).padStart(2, '0')
  return format === 'YYYY-MM-DD' ? `${y}-${m}-${d}` : format === 'MM-DD-YYYY' ? `${m}-${d}-${y}` : `${y}${m}${d}`
}
const filenameFor = (preferences: Preferences) => {
  const date = printableDate(preferences.dateFormat)
  return `${preferences.filename.trim()}${date ? `-${date}` : ''}`
}

function App(): React.JSX.Element {
  const [section, setSection] = useState<Section>('workspace')
  const [sources, setSources] = useState<SourceFile[]>([])
  const [state, setState] = useState<WorkspaceState>({ preferences: defaultPreferences, recent: [], activity: [] })
  const [message, setMessage] = useState('Choose one or more Excel workbooks and an optional JSON comparison file.')
  const [busy, setBusy] = useState(false)
  const [palette, setPalette] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState('')
  const [paletteIndex, setPaletteIndex] = useState(0)
  const [showHistoryConfirm, setShowHistoryConfirm] = useState(false)
  const paletteInput = useRef<HTMLInputElement>(null)
  const commandActions = useRef<Record<string, () => void>>({})
  const api = window.api

  const setWorkspace = useCallback((next: WorkspaceState) => setState(next), [])
  useEffect(() => {
    void api?.getWorkspace().then(setWorkspace).catch((error) => setMessage(`Could not load preferences: ${String(error)}`))
    void api?.rendererReady()
    const stopCommands = api?.onCommand((command) => {
      commandActions.current[command]?.()
    })
    const stopToasts = api?.onToast((text) => setMessage(text))
    const onKeys = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPalette((open) => !open) }
      if (event.key === 'Escape') setPalette(false)
    }
    window.addEventListener('keydown', onKeys)
    return () => { stopCommands?.(); stopToasts?.(); window.removeEventListener('keydown', onKeys) }
  }, [api])
  useEffect(() => { if (palette) paletteInput.current?.focus() }, [palette])
  const updatePreferences = async (update: Partial<Preferences>) => {
    const preferences = { ...state.preferences, ...update }
    if (api) {
      try { preferences.theme = (await api.setPreferences(preferences)).theme; setWorkspace(await api.getWorkspace()) }
      catch (error) { setMessage(`Could not save preferences: ${String(error)}`); return }
    } else setState((prev) => ({ ...prev, preferences }))
  }

  async function importSources() {
    setBusy(true)
    try {
      if (!api) { setMessage('Run the desktop app to import files.'); return }
      const picked = await api.openSources()
      if (!picked.length) return
      setSources((prev) => {
        const next = [...prev]
        for (const source of picked) {
          const existing = next.findIndex((item) => item.path === source.path)
          if (existing >= 0) next.splice(existing, 1)
          next.push(source)
        }
        return next
      })
      setWorkspace(await api.getWorkspace())
      setMessage(`Imported ${picked.length} source file${picked.length === 1 ? '' : 's'}.`)
      setSection('workspace')
    } catch (error) { setMessage(`Import failed: ${String(error)}`) }
    finally { setBusy(false) }
  }

  async function reopenRecent(file: RecentFile) {
    if (!api) return
    try {
      const source = await api.reopenSource(file.path)
      const next = source
      setSources((prev) => [...prev.filter((item) => item.path !== next.path), next])
      setSection('workspace')
      setMessage(`Reopened ${file.name}.`)
    } catch (error) { setMessage(`Could not reopen file: ${String(error)}`) }
  }

  const excelSources = useMemo(() => sources.filter((source) => /\.xlsx$/i.test(source.name)), [sources])
  const jsonSources = useMemo(() => sources.filter((source) => /\.json$/i.test(source.name)), [sources])
  async function record(action: string, file: string, detail: string) {
    if (api) setWorkspace(await api.recordActivity({ action, file, detail }))
    else setState((prev) => ({ ...prev, activity: [{ id: String(Date.now()), at: new Date().toISOString(), action, file, detail }, ...prev.activity] }))
  }
  async function validateAll() {
    if (!excelSources.length || !jsonSources.length) { setMessage('Import at least one Excel workbook and one JSON comparison file.'); return }
    if (!api) { setMessage('Run the desktop app to validate your files.'); return }
    setBusy(true)
    try {
      const results: BatchValidationResult[] = await api.validateSources(sources)
      const passed = results.filter((result) => result.isValid).length
      for (const result of results) {
        await record(result.isValid ? 'Validation passed' : 'Validation found mismatches', result.file, `${result.comparedTo}; ${result.errors.length} issue(s)`)
      }
      setMessage(`Batch validation: ${passed}/${results.length} workbooks passed.\n\n${results.map((result) =>
        `${result.isValid ? 'PASS' : 'MISMATCH'}  ${result.file}  ↔  ${result.comparedTo}\n${result.summaryLog}`
      ).join('\n\n────────────────────────────────\n\n')}`)
    } catch (error) { setMessage(`Batch validation failed: ${String(error)}`) }
    finally { setBusy(false) }
  }
  async function buildAll() {
    if (!excelSources.length) { setMessage('Import at least one Excel workbook first.'); return }
    if (!api) { setMessage('Run the desktop app to generate your workbooks.'); return }
    setBusy(true)
    try {
      const results: BatchGenerationResult[] = await api.generateSources(sources)
      for (const result of results.filter((item) => item.saved)) await record('TC33 workbook exported', result.file, result.message)
      setMessage(results.map((result) => `${result.file}: ${result.message}`).join('\n'))
    } catch (error) { setMessage(`Workbook generation failed: ${String(error)}`) }
    finally { setBusy(false) }
  }
  const mismatches = useMemo(() => {
    const lines = message.split(/\r?\n/)
    const issues = lines.filter((line) => /mismatch|missing group|class .* missing|validation failed|^\s*ERROR\b/i.test(line))
    return issues.length ? issues : ['No mismatch details in the latest validation output. Run batch validation first.']
  }, [message])
  async function exportMismatches(format: 'pdf' | 'docx') {
    const stem = filenameFor(state.preferences) + '-validation-mismatches'
    try {
      const filename = `${stem}.${format}`
      if (!api) { setMessage('Run the desktop app to export a PDF or Word report.'); return }
      if (await api.exportMismatches(format, filename, mismatches)) { setMessage(`Saved ${filename}.`); await record('Mismatch report exported', filename, `${mismatches.length} mismatch details`) }
    } catch (error) { setMessage(`Could not export mismatch report: ${String(error)}`) }
  }

  commandActions.current = {
    open: () => void importSources(),
    palette: () => setPalette(true),
    preferences: () => setSection('settings'),
    validate: () => void validateAll(),
    generate: () => void buildAll()
  }
  const commands = [
    { label: 'Import Excel and JSON files', action: () => void importSources() },
    { label: 'Validate batch', action: () => void validateAll() },
    { label: 'Generate TC33 workbooks', action: () => void buildAll() },
    { label: 'Open recent files and activity', action: () => setSection('history') },
    { label: 'Open preferences', action: () => setSection('settings') }
  ].filter((command) => command.label.toLowerCase().includes(paletteQuery.toLowerCase()))
  const activeCommandIndex = Math.min(paletteIndex, Math.max(0, commands.length - 1))

  return <div className="app-shell" data-theme={state.preferences.theme}>
    <header className="titlebar">
      <div className="brand"><img src={new URL('../../../resources/icon.png', import.meta.url).href} alt="" /><span>TC33 Builder <b>Pro</b></span></div>
      <span className="titlebar-caption">Orleans Parish Assessor’s Office</span>
      <div className="window-actions" aria-label="Window controls">
        <button aria-label="Minimize window" onClick={() => void api?.windowControl('minimize')}>−</button>
        <button aria-label="Maximize or restore window" onClick={() => void api?.windowControl('maximize')}>□</button>
        <button aria-label="Close window" className="close-window" onClick={() => void api?.windowControl('close')}>×</button>
      </div>
    </header>
    <div className="app-body">
      <aside className="sidebar" aria-label="Main navigation">
        <div className="sidebar-label">WORKSPACE</div>
        {([['workspace','◫','Overview'],['history','◷','Recent & activity'],['settings','⚙','Preferences'],['team','♙','Team']] as const).map(([id,icon,label]) =>
          <button key={id} className={`nav-item ${section === id ? 'selected' : ''}`} onClick={() => setSection(id)} aria-current={section === id ? 'page' : undefined}><span>{icon}</span>{label}</button>)}
        <div className="sidebar-foot"><span className="status-dot" /> Files stay on this device</div>
      </aside>
      <main className="main-content">
        {section === 'workspace' && <div className="page">
          <div className="page-heading"><div><p className="eyebrow">TC-33 ACTIVE RECAP</p><h1>Assessment workspace</h1><p>Build clean recap workbooks and compare source data to your PSR JSON.</p></div><button className="button quiet" onClick={() => setPalette(true)}>⌘K <span>Quick actions</span></button></div>
          <section className="hero-card"><div className="hero-copy"><span className="eyebrow">YOUR LOCAL WORKSPACE</span><h2>Move from source data to a finished recap.</h2><p>Import spreadsheets in batches, validate against your JSON, and export print-ready TC-33 workbooks.</p><button className="button primary" disabled={busy} onClick={() => void importSources()}>＋ &nbsp;Import files</button></div><div className="hero-mark" aria-hidden="true">33</div></section>
          <div className="stats-row"><div className="stat-card"><span>Excel workbooks</span><strong>{excelSources.length}</strong></div><div className="stat-card"><span>JSON comparisons</span><strong>{jsonSources.length}</strong></div><div className="stat-card"><span>Recent files</span><strong>{state.recent.length}</strong></div></div>
          <div className="section-heading"><div><h2>Batch workflow</h2><p>Each workbook uses a same-name JSON file when available; otherwise, the first imported JSON is used.</p></div></div>
          <section className="card workflow">
            <div className="workflow-step"><span className="step-number">01</span><div><h3>Import source files</h3><p>Choose up to 50 Excel and JSON files. District and tax year are read from the SQL tab when present.</p></div><button className="button outline" disabled={busy} onClick={() => void importSources()}>Choose files</button></div>
            <div className="workflow-step"><span className="step-number">02</span><div><h3>Validate your batch</h3><p>Find differences between spreadsheet rows and the matching PSR data.</p></div><button className="button outline" disabled={busy || !excelSources.length || !jsonSources.length} onClick={() => void validateAll()}>Validate batch</button></div>
            <div className="workflow-step"><span className="step-number">03</span><div><h3>Generate TC-33 workbooks</h3><p>Export one print-ready workbook per source Excel file.</p></div><button className="button primary" disabled={busy || !excelSources.length} onClick={() => void buildAll()}>Generate workbooks</button></div>
          </section>
          {sources.length > 0 && <section className="card source-card"><div className="card-heading"><div><h2>Imported sources</h2><p>Sources are processed locally and are not uploaded.</p></div><button className="button quiet" onClick={() => setSources([])}>Clear list</button></div><ul className="source-list">{sources.map((source) => <li key={source.path}><span className="file-icon">{source.name.toLowerCase().endsWith('.json') ? '{ }' : 'XLS'}</span><div><strong>{source.name}</strong><small>{source.path}</small></div><span className="file-type">{source.name.split('.').pop()?.toUpperCase()}</span></li>)}</ul></section>}
          <section className="card result-card" aria-live="polite"><div className="card-heading"><div><h2>Workspace activity</h2><p>Validation summaries and export results</p></div>{busy && <span className="running"><i />Working</span>}</div><pre className="result-output">{message}</pre></section>
          {jsonSources.length > 0 && <section className="card source-card"><div className="card-heading"><div><h2>Export mismatch details</h2><p>Create a shareable PDF or Word report from the latest validation output.</p></div><div className="inline-actions"><button className="button outline" onClick={() => void exportMismatches('pdf')}>Export PDF</button><button className="button outline" onClick={() => void exportMismatches('docx')}>Export Word</button></div></div></section>}
        </div>}
        {section === 'history' && <div className="page"><div className="page-heading"><div><p className="eyebrow">LOCAL HISTORY</p><h1>Recent files & activity</h1><p>Reopen recent sources and review saved validation and export actions.</p></div><button className="button outline" disabled={!state.recent.length && !state.activity.length} onClick={() => setShowHistoryConfirm(true)}>Clear history</button></div>
          <section className="card source-card"><div className="card-heading"><div><h2>Recent source files</h2><p>Up to 30 file paths are kept on this device.</p></div></div><ul className="source-list">{state.recent.map((file) => <li key={file.path}><span className="file-icon">{file.name.toLowerCase().endsWith('.json') ? '{ }' : 'XLS'}</span><div><strong>{file.name}</strong><small>{file.openedAt ? new Date(file.openedAt).toLocaleString() : file.path}</small></div><button className="button quiet" onClick={() => void reopenRecent(file)}>Reopen</button></li>)}{!state.recent.length && <li className="empty-row">No recent files yet.</li>}</ul></section>
          <section className="card source-card"><div className="card-heading"><div><h2>Activity log</h2><p>Most recent actions appear first.</p></div></div><ul className="source-list">{state.activity.map((item) => <li key={item.id}><span className="activity-check">✓</span><div><strong>{item.action} · {item.file}</strong><small>{item.detail} · {new Date(item.at).toLocaleString()}</small></div></li>)}{!state.activity.length && <li className="empty-row">No activity recorded yet.</li>}</ul></section>
        </div>}
        {section === 'settings' && <div className="page"><div className="page-heading"><div><p className="eyebrow">WORKSPACE</p><h1>Preferences</h1><p>Choose how TC-33 Builder Pro looks and names your exports.</p></div></div>
          <section className="card settings-card"><div className="settings-row"><div><h2>Appearance</h2><p>Pick a contrast level for your workspace.</p></div><div className="theme-options" role="group" aria-label="Color theme">{(['light','dark','black','system'] as const).map((theme) => <button key={theme} aria-pressed={state.preferences.theme === theme} className={`theme-option ${state.preferences.theme === theme ? 'chosen' : ''}`} onClick={() => void updatePreferences({ theme })}><i className={`theme-swatch ${theme}`} />{theme === 'black' ? 'Black' : theme[0].toUpperCase() + theme.slice(1)}</button>)}</div></div>
            <div className="settings-row"><div><h2>Report defaults</h2><p>Used when District and Tax Year are missing from an imported workbook’s SQL metadata.</p></div><div className="preference-inputs"><label className="input-control"><span>Default district</span><input inputMode="numeric" pattern="[0-9]" maxLength={1} placeholder="e.g. 1" value={state.preferences.defaultDistrict} onChange={(event) => void updatePreferences({ defaultDistrict: event.target.value.replace(/\D/g, '').slice(0, 1) })} /></label><label className="input-control"><span>Default tax year</span><input inputMode="numeric" pattern="[0-9]{4}" maxLength={4} placeholder="e.g. 2027" value={state.preferences.defaultTaxYear} onChange={(event) => void updatePreferences({ defaultTaxYear: event.target.value.replace(/\D/g, '').slice(0, 4) })} /></label></div></div>
            <div className="settings-row"><div><h2>Export filename</h2><p>Base name used for generated TC-33 and mismatch reports.</p></div><label className="input-control"><span>File name</span><input value={state.preferences.filename} maxLength={100} onChange={(event) => void updatePreferences({ filename: event.target.value.replace(/[\\/:*?"<>|\0]/g, '').trim() || 'tc33' })} /></label></div>
            <div className="settings-row"><div><h2>Date suffix</h2><p>Optionally append today’s date to export filenames.</p></div><label className="input-control"><span>Date format</span><select value={state.preferences.dateFormat} onChange={(event) => void updatePreferences({ dateFormat: event.target.value as Preferences['dateFormat'] })}><option value="none">No date</option><option value="YYYY-MM-DD">YYYY-MM-DD</option><option value="MM-DD-YYYY">MM-DD-YYYY</option><option value="YYYYMMDD">YYYYMMDD</option></select></label></div>
            <div className="settings-row"><div><h2>Desktop notifications</h2><p>Show system notifications for completed actions; an in-app message is also kept.</p></div><label className="switch"><input type="checkbox" checked={state.preferences.notifications} onChange={(event) => void updatePreferences({ notifications: event.target.checked })}/><span /></label></div>
            <div className="settings-row"><div><h2>Minimize to tray</h2><p>Hide the window when minimized or closed. A tray icon provides a way to restore it; turn this off to quit normally.</p></div><label className="switch"><input type="checkbox" checked={state.preferences.minimizeToTray} onChange={(event) => void updatePreferences({ minimizeToTray: event.target.checked })}/><span /></label></div>
          </section></div>}
        {section === 'team' && <div className="page"><div className="page-heading"><div><p className="eyebrow">ABOUT YOUR TEAM</p><h1>Team</h1><p>Contact your parish assessment software support team.</p></div></div><section className="team-grid">{people.map((person) => <article className="card person-card" key={person.email}><div className="person-avatar">{person.name.split(' ').map((part) => part[0]).join('')}</div><h2>{person.name}</h2><p className="person-role">{person.role}</p><a href={`tel:${person.phone}`}>☎ &nbsp;{person.phone}</a><a href={`mailto:${person.email}`}>✉ &nbsp;{person.email}</a></article>)}</section></div>}
      </main>
    </div>
    {palette && <div className="modal-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPalette(false) }}><section className="command-dialog" role="dialog" aria-modal="true" aria-label="Quick actions"><input ref={paletteInput} role="combobox" aria-expanded="true" aria-controls="quick-action-list" aria-activedescendant={commands.length ? `quick-action-${activeCommandIndex}` : undefined} value={paletteQuery} onChange={(event) => { setPaletteQuery(event.target.value); setPaletteIndex(0) }} placeholder="Search actions…" aria-label="Search quick actions" onKeyDown={(event) => { if (event.key === 'Escape') setPalette(false); if (event.key === 'ArrowDown') { event.preventDefault(); setPaletteIndex((index) => Math.min(commands.length - 1, index + 1)) } if (event.key === 'ArrowUp') { event.preventDefault(); setPaletteIndex((index) => Math.max(0, index - 1)) } if (event.key === 'Enter' && commands[activeCommandIndex]) { commands[activeCommandIndex].action(); setPalette(false) } }} /><div className="command-list" id="quick-action-list" role="listbox">{commands.map((command, index) => <button id={`quick-action-${index}`} key={command.label} role="option" aria-selected={index === activeCommandIndex} onMouseEnter={() => setPaletteIndex(index)} onClick={() => { command.action(); setPalette(false) }}>{command.label}<span>↵</span></button>)}{!commands.length && <p>No matching actions.</p>}</div><footer><span>↑↓ Navigate</span><span>Enter Select</span><span>Esc Close</span></footer></section></div>}
    {showHistoryConfirm && <div className="modal-scrim"><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="clear-title"><h2 id="clear-title">Clear saved history?</h2><p>This removes recent file paths and activity from this device. Source workbooks are not deleted.</p><div><button className="button outline" onClick={() => setShowHistoryConfirm(false)}>Cancel</button><button className="button danger" onClick={async () => { const next = api ? await api.clearHistory() : { ...state, recent: [], activity: [] }; setWorkspace(next); setShowHistoryConfirm(false) }}>Clear history</button></div></section></div>}
  </div>
}
export default App
