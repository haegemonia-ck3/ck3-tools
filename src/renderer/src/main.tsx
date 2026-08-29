import React from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { AppProvider } from './AppContext'
import { router } from './router'
import './styles.css'

if (import.meta.env.DEV && !window.ck3tools) {
  const { installDevMock } = await import('./devMock')
  installDevMock()
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>
  </React.StrictMode>
)
