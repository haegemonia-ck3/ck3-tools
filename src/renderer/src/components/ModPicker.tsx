import { useApp } from '../AppContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'

export default function ModPicker(): React.JSX.Element {
  const { settings, mods, updateSettings, refreshMods } = useApp()

  if (!settings) return <></>

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active mod</CardTitle>
        <CardDescription>
          The tools will read from the game directory and read/write to the selected mod.
        </CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={refreshMods}>
            Refresh
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {mods.length === 0 && (
          <p className="text-sm text-muted-foreground">No mods found in the mod directory.</p>
        )}
        <RadioGroup
          className="max-h-96 gap-1.5 overflow-y-auto"
          value={settings.selectedModFile ?? ''}
          onValueChange={(file) => updateSettings({ selectedModFile: file })}
        >
          {mods.map((mod) => (
            <label
              key={mod.file}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 hover:bg-muted/50',
                settings.selectedModFile === mod.file && 'border-primary/50 bg-muted/50',
                !mod.pathExists && 'opacity-60'
              )}
            >
              <RadioGroupItem value={mod.file} />
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {mod.name}
                  {!mod.pathExists && <Badge variant="destructive">folder missing</Badge>}
                </div>
                <div className="mt-0.5 flex gap-3 truncate text-xs text-muted-foreground">
                  {mod.version && <span>v{mod.version}</span>}
                  {mod.supportedVersion && <span>CK3 {mod.supportedVersion}</span>}
                  {mod.tags.length > 0 && <span>{mod.tags.join(', ')}</span>}
                </div>
              </div>
            </label>
          ))}
        </RadioGroup>
      </CardContent>
    </Card>
  )
}
