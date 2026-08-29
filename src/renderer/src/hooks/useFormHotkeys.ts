import { useHotkeys } from 'react-hotkeys-hook'

/**
 * Whatever overlay is on top owns the key first: Radix (select, dialog) claims
 * Escape from a capture-phase document listener, Base UI (combobox) from its
 * React handler, and both call `preventDefault` when they consume it — all
 * before this hook's bubble-phase document listener runs. So an event that
 * already carries a default-prevented flag isn't ours to act on; dismissing a
 * dropdown must not also close the form behind it.
 */
const claimedByOverlay = (e: KeyboardEvent): boolean => e.defaultPrevented

export interface FormHotkeys {
  /** Ctrl+S (Cmd+S on macOS). Only fires while `canSave` is true. */
  onSave: () => void
  /**
   * The same condition that enables the Save button — the shortcut must never
   * be able to do what the button can't.
   */
  canSave: boolean
  /** Escape, unless an open overlay claimed it first. */
  onClose: () => void
}

/**
 * Ctrl/Cmd+S to save and Escape to close, for an editor form.
 *
 * Bound on the document rather than scoped to the form's element: only one
 * editor panel is open at a time, and both shortcuts should work whichever
 * field — or nothing at all — currently holds focus. `enabled` and the ignore
 * predicate are read per event, so the handlers always see the current render's
 * state without re-registering the listeners.
 */
export function useFormHotkeys({ onSave, canSave, onClose }: FormHotkeys): void {
  useHotkeys('mod+s', () => onSave(), {
    enabled: () => canSave,
    // Otherwise the shortcut is dead the moment the caret is in a field, which
    // is exactly when you reach for it
    enableOnFormTags: true,
    // Chromium's "save page" dialog is still in there under Electron
    preventDefault: true,
    ignoreEventWhen: claimedByOverlay
  })

  useHotkeys('escape', () => onClose(), {
    enableOnFormTags: true,
    ignoreEventWhen: claimedByOverlay
  })
}

/** How to spell the save shortcut in a tooltip on this platform. */
export const SAVE_HOTKEY_LABEL = navigator.userAgent.includes('Mac') ? '⌘S' : 'Ctrl+S'
