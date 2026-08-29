import { useMemo, useRef, useState } from 'react'
import { useTraitIcons } from '../useTraitIcons'
import type { IconContext } from '../useTraitIcons'
import { Input } from '@/components/ui/input'

interface Props {
  available: string[]
  exclude: string[]
  iconCtx: IconContext
  onAdd: (trait: string) => void
}

const MAX_SHOWN = 40

export default function TraitPicker({ available, exclude, iconCtx, onAdd }: Props): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return available
      .filter((t) => !exclude.includes(t) && (q === '' || t.toLowerCase().includes(q)))
      .slice(0, MAX_SHOWN)
  }, [available, exclude, query])

  const iconFor = useTraitIcons(iconCtx, open ? filtered : [])

  const add = (trait: string): void => {
    onAdd(trait)
    setQuery('')
    inputRef.current?.focus()
  }

  return (
    <div className="relative mt-1.5">
      <Input
        ref={inputRef}
        type="text"
        placeholder="Add trait…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const exact = filtered.find((t) => t === query.trim())
            add(exact ?? (filtered[0] ?? query.trim()))
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {open && filtered.length > 0 && (
        <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-75 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md">
          {filtered.map((t) => {
            const icon = iconFor(t)
            return (
              <button
                key={t}
                className="flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left text-sm hover:bg-muted hover:text-primary"
                // mousedown fires before the input's blur closes the dropdown
                onMouseDown={(e) => {
                  e.preventDefault()
                  add(t)
                }}
              >
                {icon ? (
                  <img className="size-6 shrink-0 object-contain" src={icon} alt="" />
                ) : (
                  <span className="inline-block size-6 shrink-0" />
                )}
                {t}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
