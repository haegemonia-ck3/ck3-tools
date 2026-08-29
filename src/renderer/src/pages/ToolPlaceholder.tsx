import { useApp } from '../AppContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function ToolPlaceholder({ name }: { name: string }): React.JSX.Element {
  const { settings, selectedMod } = useApp()

  return (
    <div className="max-w-4xl space-y-5 p-7">
      <header>
        <h1 className="text-2xl font-semibold">{name}</h1>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Coming soon</CardTitle>
          <CardDescription>This tool is not implemented yet.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[160px_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">Game directory</dt>
            <dd className="select-text font-mono text-xs">{settings?.gameDir ?? 'not set'}</dd>
            <dt className="text-muted-foreground">Active mod</dt>
            <dd className="select-text font-mono text-xs">
              {selectedMod ? `${selectedMod.name} (${selectedMod.file})` : 'none selected'}
            </dd>
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}
