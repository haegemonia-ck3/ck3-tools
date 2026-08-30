import { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import { toast } from 'sonner'
import type { DnaPasteInfo } from '@shared/types'
import { FieldLabel } from './CharacterForm'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

/** Sentinel Select value for "type a new file name" (no real file ends in `…`) */
const NEW_FILE = '__new-file__'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  modPath: string
  gameDir: string | null
  replacePaths: string[]
  /** History file and id of the character being edited (as they are on disk) */
  characterFile: string
  characterId: string
  /** Called after a successful apply so the caller can reload the character */
  onApplied: () => void
}

/**
 * Converts a DNA block copied from the Ruler Designer's save file into this
 * character's scripted appearance: a `common/dna_data` block, a hair/beard
 * portrait modifier, and the history wiring. The two file pickers choose where
 * the DNA and modifier land; each locks to the file the mod already uses for
 * this character, if there is one.
 */
export default function RulerDesignerDnaDialog({
  open,
  onOpenChange,
  modPath,
  gameDir,
  replacePaths,
  characterFile,
  characterId,
  onApplied
}: Props): React.JSX.Element {
  const [info, setInfo] = useState<DnaPasteInfo | null>(null)
  const [paste, setPaste] = useState('')
  const [dnaChoice, setDnaChoice] = useState('')
  const [newDnaFile, setNewDnaFile] = useState('')
  const [modifierChoice, setModifierChoice] = useState('')
  const [newModifierFile, setNewModifierFile] = useState('')
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setInfo(null)
    setPaste('')
    setNewDnaFile('')
    setNewModifierFile('')
    setError(null)
    window.ck3tools
      .getDnaPasteInfo(modPath, characterFile, characterId)
      .then((i) => {
        setInfo(i)
        setDnaChoice(i.lockedDnaFile ?? (i.dnaFiles.length === 0 ? NEW_FILE : ''))
        setModifierChoice(i.lockedModifierFile ?? (i.modifierFiles.length === 0 ? NEW_FILE : ''))
      })
      .catch((err) => {
        console.error('[RulerDesignerDnaDialog] loading file info failed:', err)
        setError(
          `Couldn't read the mod's DNA/modifier files: ${err instanceof Error ? err.message : String(err)}`
        )
      })
  }, [open, modPath, characterFile, characterId])

  /** Resolve a picker to the file that will be written; typed names get .txt. */
  const targetFile = (choice: string, typed: string): string => {
    if (choice !== NEW_FILE) return choice
    const name = typed.trim()
    if (name === '') return ''
    return name.toLowerCase().endsWith('.txt') ? name : `${name}.txt`
  }
  const dnaFile = targetFile(dnaChoice, newDnaFile)
  const modifierFile = targetFile(modifierChoice, newModifierFile)

  const canApply = !applying && info !== null && paste.trim() !== '' && dnaFile !== '' && modifierFile !== ''

  const apply = async (): Promise<void> => {
    if (!canApply) return
    setApplying(true)
    setError(null)
    try {
      const result = await window.ck3tools.applyRulerDesignerDna(
        gameDir,
        modPath,
        replacePaths,
        characterFile,
        characterId,
        paste,
        dnaFile,
        modifierFile
      )
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success(`DNA ${info!.dnaKey} written to ${dnaFile}`)
      onOpenChange(false)
      onApplied()
    } catch (err) {
      // An invoke that REJECTS (handler crash, stale preload) rather than
      // returning { ok: false } would otherwise vanish without a trace
      console.error('[RulerDesignerDnaDialog] apply failed:', err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setApplying(false)
    }
  }

  const filePicker = (
    label: string,
    locked: string | null,
    files: string[],
    choice: string,
    setChoice: (v: string) => void,
    typed: string,
    setTyped: (v: string) => void,
    lockHint: string
  ): React.JSX.Element => (
    <div className="min-w-0 flex-1 space-y-1.5">
      <FieldLabel required>{label}</FieldLabel>
      {locked !== null ? (
        <>
          <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-muted/50 px-2 font-mono text-sm">
            <Lock className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{locked}</span>
          </div>
          <p className="text-xs text-muted-foreground">{lockHint}</p>
        </>
      ) : (
        <>
          <Select value={choice || undefined} onValueChange={setChoice}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a file…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NEW_FILE}>New file…</SelectItem>
              {files.map((f) => (
                <SelectItem key={f} value={f} className="font-mono">
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {choice === NEW_FILE && (
            <Input
              type="text"
              className="font-mono"
              value={typed}
              placeholder="my_file.txt"
              onChange={(e) => setTyped(e.target.value)}
            />
          )}
        </>
      )}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Paste from Ruler Designer</DialogTitle>
          <DialogDescription>
            Paste the whole <span className="font-mono">ruler_designer_… = {'{ }'}</span> block
            from a save. It becomes DNA <span className="font-mono">{info?.dnaKey ?? '…'}</span>{' '}
            plus a hair/beard portrait modifier, wired into this character&apos;s history.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <Textarea
            className="min-h-64 font-mono text-xs"
            value={paste}
            placeholder={'ruler_designer_1234={\n\ttype=male\n\tgenes={ … }\n\toverride={ … }\n}'}
            spellCheck={false}
            onChange={(e) => setPaste(e.target.value)}
          />

          <div className="flex flex-col gap-4 sm:flex-row">
            {filePicker(
              'DNAs file',
              info?.lockedDnaFile ?? null,
              info?.dnaFiles ?? [],
              dnaChoice,
              setDnaChoice,
              newDnaFile,
              setNewDnaFile,
              "Locked: this file already defines the character's DNA."
            )}
            {filePicker(
              'Portrait modifiers file',
              info?.lockedModifierFile ?? null,
              info?.modifierFiles ?? [],
              modifierChoice,
              setModifierChoice,
              newModifierFile,
              setNewModifierFile,
              'Locked: this file already has a portrait modifier for this character.'
            )}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canApply} onClick={apply}>
            {applying ? 'Applying…' : 'Apply'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
