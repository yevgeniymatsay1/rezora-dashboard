import { useState } from "react";
import {
  House as Home,
  Robot as Bot,
  Users,
  Phone,
  Headset as Headphones,
  Calendar,
  Gear as Settings,
  CreditCard,
  Flask,
  Sliders
} from "@phosphor-icons/react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useAuth } from "@/contexts/AuthContext";
import { isDeveloperEmail } from "@/lib/developerAccess";

const baseNavigation = [
  { title: "Dashboard", url: "/", icon: Home },
  { title: "AI Agents", url: "/agents", icon: Bot },
  { title: "Contacts", url: "/contacts", icon: Users },
  { title: "Campaigns", url: "/campaigns", icon: Phone },
  { title: "Call History", url: "/recordings", icon: Headphones },
  { title: "Appointments", url: "/appointments", icon: Calendar },
  { title: "Settings", url: "/settings", icon: Settings },
  { title: "Billing", url: "/billing", icon: CreditCard },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const currentPath = location.pathname;
  const isCollapsed = state === "collapsed";
  const { isAdmin } = useIsAdmin();
  const { user } = useAuth();
  const showPromptFactory = isAdmin && isDeveloperEmail(user?.email);

  const navigation = showPromptFactory
    ? [
        ...baseNavigation,
        { title: "Prompt Factory", url: "/admin/prompt-generator", icon: Flask },
        { title: "Prompt Factory Settings", url: "/admin/prompt-factory-settings", icon: Sliders }
      ]
    : baseNavigation;

  const isActive = (path: string) => {
    if (path === "/") {
      return currentPath === "/";
    }
    return currentPath.startsWith(path);
  };

  const getNavCls = (path: string) =>
    isActive(path) 
      ? "bg-sidebar-accent text-sidebar-primary font-medium border-r-2 border-sidebar-primary" 
      : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-primary";

  return (
    <Sidebar className={isCollapsed ? "w-14" : "w-52"} collapsible="icon">
      <SidebarContent className="bg-sidebar border-r border-sidebar-border">
        <nav aria-label="Main navigation">
        {/* Logo */}
        <div className="p-6 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 gradient-primary rounded-lg flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">R</span>
            </div>
            {!isCollapsed && (
              <span className="text-xl font-bold text-sidebar-foreground">Rezora</span>
            )}
          </div>
        </div>

          <SidebarGroup>
            {!isCollapsed && (
              <SidebarGroupLabel className="text-sidebar-foreground/70 px-6 py-2">
                Main Navigation
              </SidebarGroupLabel>
            )}
          
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1 px-3">
              {navigation.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink 
                      to={item.url} 
                      end={item.url === "/"}
                      className={`${getNavCls(item.url)} flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200`}
                    >
                      <item.icon 
                        weight="bold"
                        className="h-5 w-5" 
                        aria-hidden={!isCollapsed ? "true" : undefined}
                        aria-label={isCollapsed ? item.title : undefined}
                      />
                      {!isCollapsed && <span className="font-medium">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>
    </Sidebar>
  );
}
