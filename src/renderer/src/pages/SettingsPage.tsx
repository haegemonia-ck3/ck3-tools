import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { useApp } from '../AppContext'
import ModPicker from '../components/ModPicker'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
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
  const invalid = validation !== null && !validation.valid
  return (
    <div className="space-y-1.5">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="flex gap-2">
        <div
          className={cn(
            'flex min-w-0 flex-1 select-text items-center gap-2 overflow-hidden rounded-md border bg-background px-2.5 py-1.5 font-mono text-xs whitespace-nowrap',
            invalid && 'border-destructive'
          )}
        >
          <span className="truncate">
            {value ?? <em className="text-muted-foreground">not set</em>}
          </span>
          {validation?.valid && <Check className="ml-auto size-3.5 shrink-0 text-green-600 dark:text-green-500" />}
        </div>
        <Button variant="outline" onClick={onBrowse}>
          Browse…
        </Button>
      </div>
      {invalid && <p className="text-xs text-destructive">{validation.reason}</p>}
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
    <div className="max-w-4xl space-y-5 p-7">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <Button variant="outline" onClick={redetect} disabled={detecting}>
          {detecting ? 'Detecting…' : 'Auto-detect paths'}
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Directories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>

      <ModPicker />
    </div>
  )
}
