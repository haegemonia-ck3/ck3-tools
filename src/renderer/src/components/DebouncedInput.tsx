import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'

/** Long enough to swallow a burst of typing, short enough to feel immediate. */
const DEBOUNCE_MS = 200

interface Props extends Omit<React.ComponentProps<'input'>, 'value' | 'onChange'> {
  value: string
  onChange: (value: string) => void
  delay?: number
}

/**
 * Text input that echoes keystrokes immediately but reports them on a trailing
 * debounce, so filtering (and the full table re-render behind it) runs once per
 * pause instead of once per character.
 */
export default function DebouncedInput({
  value,
  onChange,
  delay = DEBOUNCE_MS,
  ...props
}: Props): React.JSX.Element {
  const [draft, setDraft] = useState(value)

  // Kept in a ref so a new inline callback on the parent's next render doesn't
  // restart a pending timer.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Adopt resets pushed from outside (the Clear button, a mod switch).
  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    if (draft === value) return
    const timer = setTimeout(() => onChangeRef.current(draft), delay)
    return () => clearTimeout(timer)
  }, [draft, value, delay])

  return <Input {...props} value={draft} onChange={(e) => setDraft(e.target.value)} />
}
