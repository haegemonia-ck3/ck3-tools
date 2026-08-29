# CK3 Tools

Electron-based suite of editing tools for Crusader Kings III. Planned tools: Character Editor, Faith Editor, Culture Editor (placeholders exist; not yet implemented).

## Stack

- Electron + electron-vite + React 19 + TypeScript (strict)
- No router/state library yet — navigation is a `useState<PageId>` in `App.tsx`, shared state via `AppContext.tsx`

## Commands

- `npm run dev` — launch in dev mode with HMR
- `npm run build` — production build to `out/`
- `npm run typecheck` — tsc over both node (main/preload) and web (renderer) configs

## Layout

- `src/main/` — main process. `ck3.ts` has all CK3 domain logic (Steam/game-dir detection via registry + libraryfolders.vdf, mod-dir detection, `.mod` descriptor parsing). `settings.ts` persists JSON to `%APPDATA%/ck3-tools/settings.json`.
- `src/preload/index.ts` — contextBridge API exposed as `window.ck3tools`; types in `index.d.ts` (kept self-contained so the web tsconfig can include it).
- `src/renderer/src/` — React app. `AppContext.tsx` loads settings, auto-detects missing paths on first run, and holds the mod list. Pages live in `pages/`.
- `src/shared/types.ts` — types shared across processes (aliased as `@shared`).

## Conventions

- All filesystem/CK3 access happens in the main process; the renderer is sandboxed and talks only through `window.ck3tools`. New capabilities need: handler in `src/main/index.ts` `registerIpc()`, method in preload `index.ts`, matching signature in preload `index.d.ts`.
- Settings: `gameDir` points at the game *data* dir (`…\Crusader Kings III\game`), not the install root — `normalizeGameDir` corrects a root pick. `selectedModFile` stores the `.mod` file name (stable id), not the mod name.
- The `.mod` descriptor format is line-based `key="value"` (with `replace_path` repeating and a `tags={ … }` block); parser is `parseModDescriptor` in `ck3.ts`. Workshop subscriptions (descriptors with `remote_file_id`) are out of scope and filtered out of the mod list — only local mods are supported.
- Vite pinned to v7 and `@vitejs/plugin-react` to v5 for electron-vite 5 peer-compat — don't blindly bump to latest.
