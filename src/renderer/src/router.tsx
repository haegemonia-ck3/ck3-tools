import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect
} from '@tanstack/react-router'
import RootLayout from './RootLayout'
import SettingsPage from './pages/SettingsPage'
import CharacterEditorPage from './pages/CharacterEditorPage'
import DynastyEditorPage from './pages/DynastyEditorPage'
import FaithEditorPage from './pages/FaithEditorPage'
import ToolPlaceholder from './pages/ToolPlaceholder'

/**
 * Deep-link target for the character editor (e.g. from a family-tree node).
 * With `create` set, the page opens the new-character panel instead of a
 * character, and the remaining fields act as prefills — so "Add child" can
 * pass the parent, or "Add member" the dynasty. `file` doubles as the
 * pre-selected target file in create mode.
 */
export interface CharacterSearch {
  file?: string
  id?: string
  create?: boolean
  name?: string
  birth?: string
  culture?: string
  faith?: string
  father?: string
  mother?: string
  dynasty?: string
  house?: string
}

/**
 * Deep-link target for the dynasty editor (e.g. a character's Dynasty or
 * House field). `kind` says which list to open the id in; the page falls back
 * to the other list when the id isn't found there, so a file that puts a house
 * id under `dynasty =` still lands somewhere useful.
 */
export interface DynastySearch {
  id?: string
  kind?: 'dynasty' | 'house'
}

/**
 * Deep-link target for the faith editor (e.g. a character's Faith field, or a
 * religion's faith list). `kind` says which list to open the id in; the page
 * falls back to the other list when the id isn't found there.
 */
export interface FaithSearch {
  id?: string
  kind?: 'religion' | 'faith'
}

/**
 * Deep-link target for the faith editor (e.g. a character's Faith field, or a
 * religion's faith list). `kind` says which list to open the id in; the page
 * falls back to the other list when the id isn't found there.
 */
export interface FaithSearch {
  id?: string
  kind?: 'religion' | 'faith'
}

const rootRoute = createRootRoute({
  component: RootLayout
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/settings' })
  }
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage
})

const charactersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/characters',
  component: CharacterEditorPage,
  validateSearch: (search: Record<string, unknown>): CharacterSearch => {
    const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
    return {
      file: str(search.file),
      id: str(search.id),
      create: search.create === true || search.create === 'true' ? true : undefined,
      name: str(search.name),
      birth: str(search.birth),
      culture: str(search.culture),
      faith: str(search.faith),
      father: str(search.father),
      mother: str(search.mother),
      dynasty: str(search.dynasty),
      house: str(search.house)
    }
  }
})

const dynastiesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dynasties',
  component: DynastyEditorPage,
  validateSearch: (search: Record<string, unknown>): DynastySearch => ({
    id: typeof search.id === 'string' ? search.id : undefined,
    kind: search.kind === 'dynasty' || search.kind === 'house' ? search.kind : undefined
  })
})

const faithsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/faiths',
  component: FaithEditorPage,
  validateSearch: (search: Record<string, unknown>): FaithSearch => ({
    id: typeof search.id === 'string' ? search.id : undefined,
    kind: search.kind === 'religion' || search.kind === 'faith' ? search.kind : undefined
  })
})

const culturesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/cultures',
  component: () => <ToolPlaceholder name="Culture Editor" />
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  settingsRoute,
  charactersRoute,
  dynastiesRoute,
  faithsRoute,
  culturesRoute
])

// Hash history keeps routing working when the packaged app loads index.html from file://
export const router = createRouter({
  routeTree,
  history: createHashHistory()
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
