import { useApp } from '../AppContext'

export default function ToolPlaceholder({ name }: { name: string }): React.JSX.Element {
  const { settings, selectedMod } = useApp()

  return (
    <div className="page">
      <header className="page-header">
        <h1>{name}</h1>
      </header>
      <section className="card">
        <p className="hint">This tool is coming soon.</p>
        <dl className="context-list">
          <dt>Game directory</dt>
          <dd>{settings?.gameDir ?? 'not set'}</dd>
          <dt>Active mod</dt>
          <dd>{selectedMod ? `${selectedMod.name} (${selectedMod.file})` : 'none selected'}</dd>
        </dl>
      </section>
    </div>
  )
}
