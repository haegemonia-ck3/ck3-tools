import { Link, Outlet, useLocation } from '@tanstack/react-router'
import { Church, Crown, Landmark, PanelLeft, Settings } from 'lucide-react'
import { useApp } from './AppContext'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  useSidebar
} from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'

const TOOLS = [
  { to: '/characters', label: 'Character Editor', icon: Crown },
  { to: '/faiths', label: 'Faith Editor', icon: Church },
  { to: '/cultures', label: 'Culture Editor', icon: Landmark }
] as const

function CollapseButton(): React.JSX.Element {
  const { state, toggleSidebar } = useSidebar()
  return (
    <SidebarMenuButton
      onClick={toggleSidebar}
      tooltip={state === 'collapsed' ? 'Expand sidebar' : 'Collapse sidebar'}
    >
      <PanelLeft />
      <span>Collapse</span>
    </SidebarMenuButton>
  )
}

export default function RootLayout(): React.JSX.Element {
  const { settings, selectedMod } = useApp()
  const { pathname } = useLocation()

  if (!settings) {
    return <div className="flex h-full items-center justify-center text-muted-foreground">Loading…</div>
  }

  const configured = Boolean(settings.gameDir && settings.modDir)

  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <div className="px-2 py-1 group-data-[collapsible=icon]:hidden">
              <span className="block text-lg font-semibold tracking-wide text-sidebar-primary">
                CK3 Tools
              </span>
              {selectedMod && (
                <span className="block truncate text-xs text-muted-foreground" title={selectedMod.file}>
                  {selectedMod.name}
                </span>
              )}
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {TOOLS.map((tool) => (
                    <SidebarMenuItem key={tool.to}>
                      {configured ? (
                        <SidebarMenuButton asChild isActive={pathname === tool.to} tooltip={tool.label}>
                          <Link to={tool.to}>
                            <tool.icon />
                            <span>{tool.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      ) : (
                        <SidebarMenuButton disabled tooltip="Configure directories in Settings first">
                          <tool.icon />
                          <span>{tool.label}</span>
                        </SidebarMenuButton>
                      )}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === '/settings'} tooltip="Settings">
                  <Link to="/settings">
                    <Settings />
                    <span>Settings</span>
                  </Link>
                </SidebarMenuButton>
                {!configured && (
                  <SidebarMenuBadge className="rounded-full bg-destructive font-bold text-white">
                    !
                  </SidebarMenuBadge>
                )}
              </SidebarMenuItem>
              <SidebarMenuItem>
                <CollapseButton />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <SidebarInset className="h-svh overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
