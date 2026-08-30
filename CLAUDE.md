# CK3 Tools

Electron-based suite of editing tools for Crusader Kings III. Planned tools: Character Editor, Faith Editor, Culture Editor (placeholders exist; not yet implemented).

## Stack

- Electron + electron-vite + React 19 + TypeScript (strict)
- TanStack Router (code-based routes in `src/renderer/src/router.tsx`, hash history for `file://` compat); shared state via `AppContext.tsx`
- Tailwind CSS v4 + shadcn/ui (all components installed under `src/renderer/src/components/ui/`, themed via a shadcn preset in `styles.css`)

## Commands

- `npm run dev` — launch in dev mode with HMR
- `npm run build` — production build to `out/`
- `npm run typecheck` — tsc over both node (main/preload) and web (renderer) configs

## Layout

- `src/main/` — main process. `ck3.ts` has install/mod detection (Steam via registry + libraryfolders.vdf, `.mod` descriptor parsing). `pdx.ts` is the shared Paradox-script scanner: `scanBlocks` returns exact byte spans over RAW text (comment/quote-aware) so edits can splice blocks while leaving the rest of a file byte-identical — `saveCharacter` in `characters.ts` relies on this; a no-op save must round-trip byte-for-byte. `scriptFile.ts` is the counterpart for *adding* a top-level block (`appendBlock`, key/file-name validation), shared by `createCharacter` and `createDynasty`/`createHouse`. `refdata.ts` collects culture/faith/trait ids by layering mod files over game files (mod file with same relative path wins; `replace_path` folders exclude game files entirely). `settings.ts` persists JSON to `%APPDATA%/ck3-tools/settings.json`.
- `src/preload/index.ts` — contextBridge API exposed as `window.ck3tools`; types in `index.d.ts` (kept self-contained so the web tsconfig can include it).
- `src/renderer/src/` — React app. `AppContext.tsx` loads settings, auto-detects missing paths on first run, and holds the mod list. Routes in `router.tsx`, layout in `RootLayout.tsx`, pages in `pages/`, shadcn primitives in `components/ui/`.
- `vite.config.ts` at the root is a stub so tooling (shadcn CLI) detects a Vite project — the real config is `electron.vite.config.ts`; make build changes there.
- `src/shared/types.ts` — types shared across processes (aliased as `@shared`).

## UI components (IMPORTANT)

- ALWAYS build UI from the existing shadcn/ui components in `src/renderer/src/components/ui/` (composed with Tailwind utility classes) rather than hand-rolling your own markup, CSS, or lookalike components. Check what's there first — every shadcn component is already installed (button, input, card, table, dialog, popover, command, sidebar, field, …).
- Do NOT create a new UI primitive or edit any file in `components/ui/` without asking the user for permission first. These files are managed by the shadcn CLI and themed by a preset; local edits can be clobbered and one-off primitives fragment the design system. App-specific composites (like `TraitPicker`) belong in `components/`, built on top of the `ui/` primitives.
- Theme tokens (colors, radius, fonts) live in `src/renderer/src/styles.css` as CSS variables applied by the shadcn preset — use the semantic Tailwind classes (`bg-background`, `text-muted-foreground`, `border-input`, …), never hard-coded colors.

## Conventions

- All filesystem/CK3 access happens in the main process; the renderer is sandboxed and talks only through `window.ck3tools`. New capabilities need: handler in `src/main/index.ts` `registerIpc()`, method in preload `index.ts`, matching signature in preload `index.d.ts`.
- Settings: `gameDir` points at the game *data* dir (`…\Crusader Kings III\game`), not the install root — `normalizeGameDir` corrects a root pick. `selectedModFile` stores the `.mod` file name (stable id), not the mod name.
- The `.mod` descriptor format is line-based `key="value"` (with `replace_path` repeating and a `tags={ … }` block); parser is `parseModDescriptor` in `ck3.ts`. Workshop subscriptions (descriptors with `remote_file_id`) are out of scope and filtered out of the mod list — only local mods are supported.
- Vite pinned to v7 and `@vitejs/plugin-react` to v5 for electron-vite 5 peer-compat — don't blindly bump to latest.
- Creating content only ever appends: a new character/dynasty/house block goes at the end of the chosen `.txt` (created if missing) after a blank line, in the file's own line-ending style, leaving existing bytes untouched. Ids are checked for clashes against the mod's own files only — shadowing a base-game id is a legal override, so the UI warns rather than blocks. Dynasties and houses are separate game databases but this editor resolves an id against both, so a cross-kind clash is rejected too.
- Real mod files contain tolerated typos (dates like `3220.1.1.` or `3212.1`, quoted and unquoted values mixed); parsers must be lenient and edits must preserve each line's existing quote style. Character history keys: `faith`/`religion` are an interchangeable pair — edit whichever exists, write the former when inserting. `dynasty` and `dynasty_house` are NOT: they are separate fields on `CharacterDetail` (a house implies its parent dynasty, so a character usually sets one or the other), each written to its own key.
- Mod profile: a mod may ship a declarative `ck3-tools.json` at its content root (read by `readModProfile` in `src/main/modProfile.ts`, carried on `ModInfo.profile`). Currently holds `calendar` — an offset-calendar display convention (`epochYear`, `beforeLabel`, `afterLabel`) for total conversions like Hegemonia where file year 3220 displays as "780 BC" (no year zero; `formatCalendarDate` in `ck3Date.ts`). Display-only: converted values are never written to mod files. Grow this schema for future mod-specific needs before considering executable plugins.
- Backend smoke tests: copy mod files to the scratchpad and run the compiled parser against the copy — never write to the user's real mod directory in tests.

## Landing changes (IMPORTANT)

- This is a solo project with no code review. Do NOT open pull requests. When a session's work is done and verified, land it on `master` yourself — this is standing authorization, so don't ask each time:
  1. `git fetch origin`
  2. `git merge origin/master` into the session branch, resolving any conflicts
  3. re-run `npm run typecheck` and `npm test`
  4. `git push origin HEAD:master`
- Push to `master` only with typecheck and tests green. If either fails and you can't fix it, leave the work on the branch, push the branch, and say so.
- Worktree sessions stay: several run at once, so keep working on the session's own `claude/…` branch and land it at the end rather than committing on `master` directly.
- This does not update the main checkout at `C:\kevin\js\ck3-tools` — it's a separate worktree with its own state. Never touch it; the user pulls there when they want it current.

## Running the app (IMPORTANT)

- Before starting it, write a short label for what you're working on to `.claude/dev-label.txt` (gitignored, first line only, e.g. `Mother and Father in character editor`). In dev the main process reads and watches that file and titles the window `CK3 Tools — <label>`, so concurrent sessions' windows are tellable apart. Rewriting the file retitles a running window within a second.
- When you do start it: stop it (`preview_stop` with the serverId) as soon as you're done, in the same session. Never leave it running at the end of a turn. If the Electron window survives the stop, kill the stray process — `Get-Process electron -ErrorAction SilentlyContinue | Stop-Process`.
