import { useMemo, useState } from 'react'
import { ArrowRight, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import type { RefLocation } from '@shared/types'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList
} from '@/components/ui/combobox'
import { cn } from '@/lib/utils'

/** Locate a reference's definition and open it in the user's text editor. */
export async function openReferenceTarget(
  locate: () => Promise<RefLocation | null>,
  label: string
): Promise<void> {
  const loc = await locate()
  if (!loc) {
    toast.error(`Couldn't find where "${label}" is defined`)
    return
  }
  const result = await window.ck3tools.openInEditor(loc.path, loc.line)
  if (!result.ok) toast.error(result.error)
}

interface Props {
  /** Single-value mode: the current selection. Omit when using onAdd. */
  value?: string | null
  onChange?: (value: string | null) => void
  /**
   * Add mode (multi-value fields like traits): selecting an option calls this
   * and resets the input, so several entries can be added in a row. The follow
   * button is omitted — a committed value never lingers in the input; put a
   * ReferenceBadge on the added entries instead.
   */
  onAdd?: (value: string) => void
  options: string[]
  placeholder?: string
  /**
   * Managed data: the button switches to the referenced item inside the app
   * (e.g. a father/mother field jumping to that character).
   */
  onNavigate?: (value: string) => void
  /**
   * Unmanaged data: the button locates the defining file and opens it in the
   * user's text editor. Ignored when onNavigate is provided.
   */
  locate?: (value: string) => Promise<RefLocation | null>
  /** Custom option rendering (e.g. trait icons); defaults to the plain id */
  renderItem?: (item: string) => React.ReactNode
  /** Cap on dropdown entries; mod lists (dynasties especially) can run to thousands */
  limit?: number
  /** Tooltip for the follow button; defaults to wording for a definition site. */
  followTitle?: string
  className?: string
}

export default function ReferenceInput({
  value = null,
  onChange,
  onAdd,
  options,
  placeholder,
  onNavigate,
  locate,
  renderItem,
  limit = 100,
  followTitle,
  className
}: Props): React.JSX.Element {
  const [opening, setOpening] = useState(false)
  const [inputText, setInputText] = useState('')

  // Keep a value that isn't in the reference lists (typo, unscanned file) visible
  const items = useMemo(
    () => (value && !options.includes(value) ? [value, ...options] : options),
    [options, value]
  )

  const follow = async (): Promise<void> => {
    if (!value) return
    if (onNavigate) {
      onNavigate(value)
      return
    }
    if (!locate) return
    setOpening(true)
    try {
      await openReferenceTarget(() => locate(value), value)
    } finally {
      setOpening(false)
    }
  }

  const select = (v: string | null): void => {
    if (onAdd) {
      if (v) onAdd(v)
      setInputText('')
      return
    }
    onChange?.(v)
  }

  const showFollow = !onAdd && Boolean(onNavigate ?? locate)

  return (
    <ButtonGroup className={cn('w-full', className)}>
      <Combobox
        items={items}
        limit={limit}
        value={onAdd ? null : value}
        onValueChange={select}
        inputValue={onAdd ? inputText : undefined}
        onInputValueChange={(text, details) => {
          // In add mode, selecting an item syncs the label back into the input;
          // ignore that so the reset in select() sticks and only typing counts
          if (onAdd && details.reason !== 'input-change') return
          setInputText(text)
        }}
      >
        <ComboboxInput className="flex-1" placeholder={placeholder} showClear={!onAdd} />
        <ComboboxContent>
          <ComboboxEmpty>No matches.</ComboboxEmpty>
          <ComboboxList>
            {(item: string) => (
              <ComboboxItem key={item} value={item}>
                {renderItem ? renderItem(item) : item}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {showFollow && (
        <Button
          variant="outline"
          size="icon"
          disabled={!value || opening}
          title={followTitle ?? (onNavigate ? 'Go to this entry' : 'Open definition in text editor')}
          onClick={follow}
        >
          {onNavigate ? <ArrowRight /> : <ExternalLink />}
        </Button>
      )}
    </ButtonGroup>
  )
}
