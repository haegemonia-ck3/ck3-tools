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
import ToolPlaceholder from './pages/ToolPlaceholder'

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
  component: CharacterEditorPage
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
