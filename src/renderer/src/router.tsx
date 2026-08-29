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
import ToolPlaceholder from './pages/ToolPlaceholder'

/** Deep-link target for the character editor (e.g. from a family-tree node) */
export interface CharacterSearch {
  file?: string
  id?: string
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
  validateSearch: (search: Record<string, unknown>): CharacterSearch => ({
    file: typeof search.file === 'string' ? search.file : undefined,
    id: typeof search.id === 'string' ? search.id : undefined
  })
})

const dynastiesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dynasties',
  component: DynastyEditorPage
})

const faithsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/faiths',
  component: () => <ToolPlaceholder name="Faith Editor" />
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
