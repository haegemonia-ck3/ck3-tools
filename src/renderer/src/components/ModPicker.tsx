import { useApp } from '../AppContext'

export default function ModPicker(): React.JSX.Element {
  const { settings, mods, updateSettings, refreshMods } = useApp()

  if (!settings) return <></>

  return (
    <section className="card">
      <div className="card-header">
        <h2>Active mod</h2>
        <button className="btn btn-small" onClick={refreshMods}>
          Refresh
        </button>
      </div>
      <p className="hint">
        The tools will read from the game directory and read/write to the selected mod.
      </p>
      {mods.length === 0 && <p className="hint">No mods found in the mod directory.</p>}
      <div className="mod-list">
        {mods.map((mod) => (
          <label
            key={mod.file}
            className={`mod-item ${settings.selectedModFile === mod.file ? 'selected' : ''} ${mod.pathExists ? '' : 'missing'}`}
          >
            <input
              type="radio"
              name="selectedMod"
              checked={settings.selectedModFile === mod.file}
              onChange={() => updateSettings({ selectedModFile: mod.file })}
            />
            <div className="mod-info">
              <div className="mod-name">
                {mod.name}
                {!mod.pathExists && <span className="tag tag-error">folder missing</span>}
              </div>
              <div className="mod-meta">
                {mod.version && <span>v{mod.version}</span>}
                {mod.supportedVersion && <span>CK3 {mod.supportedVersion}</span>}
                {mod.tags.length > 0 && <span>{mod.tags.join(', ')}</span>}
              </div>
            </div>
          </label>
        ))}
      </div>
    </section>
  )
}
