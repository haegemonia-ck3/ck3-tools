import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { basename, join } from 'path'
import type { EditorInfo } from '@shared/types'

function notepadPath(): string {
  return join(process.env['WINDIR'] ?? 'C:\\Windows', 'notepad.exe')
}

/** Well-known install locations for the editors this community actually uses. */
export function detectEditors(): EditorInfo[] {
  const local = process.env['LOCALAPPDATA']
  const candidates: { name: string; paths: (string | undefined)[] }[] = [
    { name: 'Notepad', paths: [notepadPath()] },
    {
      name: 'VS Code',
      paths: [
        local && join(local, 'Programs', 'Microsoft VS Code', 'Code.exe'),
        'C:\\Program Files\\Microsoft VS Code\\Code.exe'
      ]
    },
    { name: 'Cursor', paths: [local && join(local, 'Programs', 'cursor', 'Cursor.exe')] }
  ]
  const found: EditorInfo[] = []
  for (const { name, paths } of candidates) {
    const path = paths.find((p): p is string => !!p && existsSync(p))
    if (path) found.push({ name, path })
  }
  return found
}

/** Editors that accept `-g file:line` to open at a specific line */
const GOTO_CAPABLE = /^(code|cursor|vscodium)/i

export function openInEditor(
  editorPath: string | null,
  file: string,
  line?: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const exe = editorPath ?? notepadPath()
  const args =
    line !== undefined && GOTO_CAPABLE.test(basename(exe))
      ? ['-g', `${file}:${line}`]
      : [file]
  return new Promise((resolve) => {
    const child = spawn(exe, args, { detached: true, stdio: 'ignore' })
    child.once('spawn', () => {
      child.unref()
      resolve({ ok: true })
    })
    child.once('error', (err) => {
      resolve({ ok: false, error: `Couldn't launch ${exe}: ${err.message}` })
    })
  })
}
