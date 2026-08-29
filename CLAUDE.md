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

- `src/main/` — main process. `ck3.ts` has install/mod detection (Steam via registry + libraryfolders.vdf, `.mod` descriptor parsing). `pdx.ts` is the shared Paradox-script scanner: `scanBlocks` returns exact byte spans over RAW text (comment/quote-aware) so edits can splice blocks while leaving the rest of a file byte-identical — `saveCharacter` in `characters.ts` relies on this; a no-op save must round-trip byte-for-byte. `refdata.ts` collects culture/faith/trait ids by layering mod files over game files (mod file with same relative path wins; `replace_path` folders exclude game files entirely). `settings.ts` persists JSON to `%APPDATA%/ck3-tools/settings.json`.
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
- Real mod files contain tolerated typos (dates like `3220.1.1.` or `3212.1`, quoted and unquoted values mixed); parsers must be lenient and edits must preserve each line's existing quote style. Character history keys: `faith`/`religion` and `dynasty`/`dynasty_house` are interchangeable pairs — edit whichever exists, write the former when inserting.
- Backend smoke tests: copy mod files to the scratchpad and run the compiled parser against the copy — never write to the user's real mod directory in tests.
