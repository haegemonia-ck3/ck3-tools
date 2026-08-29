import { useEffect, useState } from 'react'
import { useApp } from '../AppContext'
import ModPicker from '../components/ModPicker'
import type { DirValidation } from '@shared/types'

function PathRow({
  label,
  value,
  validation,
  onBrowse
}: {
  label: string
  value: string | null
  validation: DirValidation | null
  onBrowse: () => void
}): React.JSX.Element {
  return (
    <div className="path-row">
      <div className="path-label">{label}</div>
      <div className="path-controls">
        <div className={`path-value ${validation && !validation.valid ? 'invalid' : ''}`}>
          {value ?? <em>not set</em>}
          {validation?.valid && <span className="check">✓</span>}
        </div>
        <button className="btn" onClick={onBrowse}>
          Browse…
        </button>
      </div>
      {validation && !validation.valid && <div className="path-error">{validation.reason}</div>}
    </div>
  )
}

export default function SettingsPage(): React.JSX.Element {
  const { settings, updateSettings } = useApp()
  const [gameValidation, setGameValidation] = useState<DirValidation | null>(null)
  const [modValidation, setModValidation] = useState<DirValidation | null>(null)
  const [detecting, setDetecting] = useState(false)

  useEffect(() => {
    if (settings?.gameDir) {
      window.ck3tools.validateGameDir(settings.gameDir).then(setGameValidation)
    } else {
      setGameValidation(null)
    }
  }, [settings?.gameDir])

  useEffect(() => {
    if (settings?.modDir) {
      window.ck3tools.validateModDir(settings.modDir).then(setModValidation)
    } else {
      setModValidation(null)
    }
  }, [settings?.modDir])

  if (!settings) return <></>

  const browseGame = async (): Promise<void> => {
    const dir = await window.ck3tools.pickDirectory('Select the CK3 game directory', 'game')
    if (dir) await updateSettings({ gameDir: dir })
  }

  const browseMod = async (): Promise<void> => {
    const dir = await window.ck3tools.pickDirectory('Select your CK3 mod directory', 'mod')
    if (dir) await updateSettings({ modDir: dir })
  }

  const redetect = async (): Promise<void> => {
    setDetecting(true)
    try {
      const detected = await window.ck3tools.detectPaths()
      await updateSettings({
        gameDir: detected.gameDir ?? settings.gameDir,
        modDir: detected.modDir ?? settings.modDir
      })
    } finally {
      setDetecting(false)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Settings</h1>
        <button className="btn" onClick={redetect} disabled={detecting}>
          {detecting ? 'Detecting…' : 'Auto-detect paths'}
        </button>
      </header>

      <section className="card">
        <h2>Directories</h2>
        <PathRow
          label="CK3 game directory"
          value={settings.gameDir}
          validation={gameValidation}
          onBrowse={browseGame}
        />
        <PathRow
          label="Mod directory"
          value={settings.modDir}
          validation={modValidation}
          onBrowse={browseMod}
        />
      </section>

      <ModPicker />
    </div>
  )
}
