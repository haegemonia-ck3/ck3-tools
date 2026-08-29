import { useState } from 'react'
import { AppProvider, useApp } from './AppContext'
import SettingsPage from './pages/SettingsPage'
import ToolPlaceholder from './pages/ToolPlaceholder'
import CharacterEditorPage from './pages/CharacterEditorPage'

export type PageId = 'characters' | 'faiths' | 'cultures' | 'settings'

const TOOLS: { id: PageId; label: string; icon: string }[] = [
  { id: 'characters', label: 'Character Editor', icon: '\u{1F451}' },
  { id: 'faiths', label: 'Faith Editor', icon: '\u{271D}' },
  { id: 'cultures', label: 'Culture Editor', icon: '\u{1F3DB}' }
]

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem('sidebarCollapsed') === '1'
  } catch {
    return false
  }
}

function Shell(): React.JSX.Element {
  const { settings, selectedMod } = useApp()
  const [page, setPage] = useState<PageId>('settings')
  const [collapsed, setCollapsed] = useState(loadCollapsed)

  if (!settings) {
    return <div className="loading">Loading…</div>
  }

  const configured = Boolean(settings.gameDir && settings.modDir)

  const toggleCollapsed = (): void => {
    setCollapsed((c) => {
      try {
        localStorage.setItem('sidebarCollapsed', c ? '0' : '1')
      } catch {
        // localStorage unavailable — collapse state just won't persist
      }
      return !c
    })
  }

  return (
    <div className="shell">
      <nav className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="brand">
          <span className="brand-title">{collapsed ? 'CK3' : 'CK3 Tools'}</span>
          {!collapsed && selectedMod && (
            <span className="brand-mod" title={selectedMod.file}>
              {selectedMod.name}
            </span>
          )}
        </div>
        <div className="nav-group">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              className={`nav-item ${page === t.id ? 'active' : ''}`}
              disabled={!configured}
              title={configured ? (collapsed ? t.label : undefined) : 'Configure directories in Settings first'}
              onClick={() => setPage(t.id)}
            >
              <span className="nav-icon">{t.icon}</span>
              {!collapsed && t.label}
            </button>
          ))}
        </div>
        <div className="nav-footer">
          <button
            className={`nav-item ${page === 'settings' ? 'active' : ''}`}
            title={collapsed ? 'Settings' : undefined}
            onClick={() => setPage('settings')}
          >
            <span className="nav-icon">{'⚙'}</span>
            {!collapsed && 'Settings'}
            {!configured && <span className="badge-warn">!</span>}
          </button>
          <button
            className="nav-item"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={toggleCollapsed}
          >
            <span className="nav-icon">{collapsed ? '»' : '«'}</span>
            {!collapsed && 'Collapse'}
          </button>
        </div>
      </nav>
      <main className="content">
        {page === 'settings' && <SettingsPage />}
        {page === 'characters' && <CharacterEditorPage />}
        {(page === 'faiths' || page === 'cultures') && (
          <ToolPlaceholder name={TOOLS.find((t) => t.id === page)!.label} />
        )}
      </main>
    </div>
  )
}

export default function App(): React.JSX.Element {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}
