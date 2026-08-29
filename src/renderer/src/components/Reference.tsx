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

interface Props {
  value: string | null
  onChange: (value: string | null) => void
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
}

/** Cap the dropdown; mod lists (dynasties especially) can run to thousands of ids. */
const LIMIT = 100

export default function Reference({
  value,
  onChange,
  options,
  placeholder,
  onNavigate,
  locate
}: Props): React.JSX.Element {
  const [opening, setOpening] = useState(false)

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
      const loc = await locate(value)
      if (!loc) {
        toast.error(`Couldn't find where "${value}" is defined`)
        return
      }
      const result = await window.ck3tools.openInEditor(loc.path, loc.line)
      if (!result.ok) toast.error(result.error)
    } finally {
      setOpening(false)
    }
  }

  const canFollow = Boolean(value) && Boolean(onNavigate ?? locate)

  return (
    <ButtonGroup className="w-full">
      <Combobox items={items} limit={LIMIT} value={value} onValueChange={onChange}>
        <ComboboxInput className="flex-1" placeholder={placeholder} showClear />
        <ComboboxContent>
          <ComboboxEmpty>No matches.</ComboboxEmpty>
          <ComboboxList>
            {(item: string) => (
              <ComboboxItem key={item} value={item}>
                {item}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <Button
        variant="outline"
        size="icon"
        disabled={!canFollow || opening}
        title={onNavigate ? 'Go to this entry' : 'Open definition in text editor'}
        onClick={follow}
      >
        {onNavigate ? <ArrowRight /> : <ExternalLink />}
      </Button>
    </ButtonGroup>
  )
}
