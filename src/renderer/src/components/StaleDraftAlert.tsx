import { Alert, AlertDescription } from '@/components/ui/alert'

/**
 * What a resumed draft says when the file moved under it — an edit in a text
 * editor, or another window's save. The draft still stands; Revert is what
 * takes the file's version instead.
 */
export default function StaleDraftAlert({ what }: { what: string }): React.JSX.Element {
  return (
    <Alert>
      <AlertDescription>
        This {what} changed on disk while your draft was unsaved. Revert discards the draft and
        loads the file&apos;s version.
      </AlertDescription>
    </Alert>
  )
}
