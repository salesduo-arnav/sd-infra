import { useLocation, Link } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Receipt,
  Plug,
  Shield,
  Package,
  LogOut,
  User,
  Settings,
  ChevronsUpDown,
  Check,
  Plus,
  Activity,
  Globe,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useTranslation } from 'react-i18next';
import { supportedLanguages } from '@/i18n';
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";

const mainNavItems = [
  { titleKey: "nav.apps", url: "/apps", icon: LayoutDashboard },
  { titleKey: "nav.organisation", url: "/organisation", icon: Building2 },
  { titleKey: "nav.integrations", url: "/integrations", icon: Plug },
  { titleKey: "nav.plans", url: "/plans", icon: CreditCard, permission: "plans.view" },
  { titleKey: "nav.billing", url: "/billing", icon: Receipt, permission: "billing.view" },
];



export function AppSidebar() {
  const location = useLocation();
  const { user, logout, isAdmin, activeOrganization, switchOrganization } = useAuth();
  const { hasPermission } = usePermissions();
  const { t, i18n } = useTranslation();
  const currentPath = location.pathname;

  const isActive = (path: string) => {
    if (path === "/admin") {
      return currentPath === "/admin";
    }
    if (path.startsWith("/admin/")) {
      return currentPath === path;
    }
    return currentPath === path;
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const items = Array.from(
        document.querySelectorAll<HTMLElement>('[data-sidebar="menu-button"]')
      );
      const activeElement = document.activeElement as HTMLElement;
      const currentIndex = items.indexOf(activeElement);

      if (currentIndex !== -1) {
        e.preventDefault();
        const nextIndex =
          e.key === "ArrowDown"
            ? (currentIndex + 1) % items.length
            : (currentIndex - 1 + items.length) % items.length;
        items[nextIndex]?.focus();
      }
    }
  };

  return (
    <Sidebar className="border-r border-border/50 bg-sidebar-background">
      <SidebarHeader className="border-b border-border/50 p-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="group flex items-center gap-3 w-full p-2 rounded-lg hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-200 outline-none ring-sidebar-ring focus-visible:ring-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 border border-primary/20 shadow-sm transition-transform group-hover:scale-105">
                {activeOrganization?.slug ? (
                  <img src={`https://avatar.vercel.sh/${activeOrganization.slug}.svg?text=${activeOrganization.name.slice(0, 2).toUpperCase()}`} className="h-6 w-6 rounded-sm" alt={activeOrganization.name} />
                ) : (
                  <img src="/logo-dark.webp" className="h-6 w-6" alt="SalesDuo" />
                )}
              </div>
              <div className="flex-1 text-left truncate">
                <span className="block text-sm font-semibold truncate tracking-tight">
                  {activeOrganization?.name || t('nav.selectOrganization')}
                </span>
                <span className="block text-xs text-muted-foreground truncate font-medium">
                  {t('nav.organizations', { count: user?.memberships?.length || 0 })}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64 shadow-xl border-border/50" align="start" sideOffset={8}>
            <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2">{t('nav.teams')}</DropdownMenuLabel>
            {user?.memberships?.map((membership) => (
              <DropdownMenuItem
                key={membership.organization.id}
                onClick={() => switchOrganization(membership.organization.id)}
                className="gap-3 p-2.5 cursor-pointer focus:bg-accent focus:text-accent-foreground"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-md border bg-background shadow-sm">
                  <img src={`https://avatar.vercel.sh/${membership.organization.slug}.svg?text=${membership.organization.name.slice(0, 2).toUpperCase()}`} className="h-5 w-5 rounded-sm" alt={membership.organization.name} />
                </div>
                <div className="flex-1 truncate font-medium">
                  {membership.organization.name}
                </div>
                {activeOrganization?.id === membership.organization.id && (
                  <Check className="ml-auto h-4 w-4 text-primary" />
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator className="bg-border/50" />
            <DropdownMenuItem asChild>
              <Link to="/create-organisation" className="gap-3 p-2.5 cursor-pointer text-muted-foreground hover:text-foreground focus:text-foreground">
                <div className="flex h-8 w-8 items-center justify-center rounded-md border border-dashed bg-transparent shadow-none">
                  <Plus className="h-4 w-4" />
                </div>
                <div className="font-medium">{t('nav.addOrganization')}</div>
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>

      <SidebarContent className="p-2" onKeyDown={handleKeyDown}>
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 text-xs font-semibold text-muted-foreground/70 uppercase tracking-widest mt-2 mb-1">{t('nav.navigation')}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => {
                // Hide items that require a permission the user doesn't have
                if (item.permission && !hasPermission(item.permission)) {
                  return null;
                }
                return (
                  <SidebarMenuItem key={item.titleKey}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      className="gap-3 px-3 py-2 transition-all"
                    >
                      <Link to={item.url}>
                        <item.icon className="h-4 w-4 opacity-70" />
                        <span>{t(item.titleKey)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <>
            <SidebarSeparator className="mx-2 my-2 bg-border/50" />
            <SidebarGroup>
              <SidebarGroupLabel className="px-3 text-xs font-semibold text-muted-foreground/70 uppercase tracking-widest mt-2 mb-1">{t('nav.administration')}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive("/admin")}
                      className="gap-3 px-3 py-2"
                    >
                      <Link to="/admin">
                        <Shield className="h-4 w-4 opacity-70" />
                        <span>{t('nav.overview')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive("/admin/apps")}
                      className="gap-3 px-3 py-2"
                    >
                      <Link to="/admin/apps">
                        <Package className="h-4 w-4 opacity-70" />
                        <span>{t('nav.manageApps')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive("/admin/plans")}
                      className="gap-3 px-3 py-2"
                    >
                      <Link to="/admin/plans">
                        <CreditCard className="h-4 w-4 opacity-70" />
                        <span>{t('nav.managePlans')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive("/admin/users")}
                      className="gap-3 px-3 py-2"
                    >
                      <Link to="/admin/users">
                        <User className="h-4 w-4 opacity-70" />
                        <span>{t('nav.manageUsers')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive("/admin/organizations")}
                      className="gap-3 px-3 py-2"
                    >
                      <Link to="/admin/organizations">
                        <Building2 className="h-4 w-4 opacity-70" />
                        <span>{t('nav.manageOrgs')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive("/admin/audit-logs")}
                      className="gap-3 px-3 py-2"
                    >
                      <Link to="/admin/audit-logs">
                        <Activity className="h-4 w-4 opacity-70" />
                        <span>{t('nav.auditLogs')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive("/admin/configs")}
                      className="gap-3 px-3 py-2"
                    >
                      <Link to="/admin/configs">
                        <Settings className="h-4 w-4 opacity-70" />
                        <span>{t('nav.configs')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive("/admin/rbac")}
                      className="gap-3 px-3 py-2"
                    >
                      <Link to="/admin/rbac">
                        <Shield className="h-4 w-4 opacity-70" />
                        <span>{t('nav.rolePermissions')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-border/50 p-4 bg-sidebar-footer">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-200 outline-none ring-sidebar-ring focus-visible:ring-2">
              <Avatar className="h-9 w-9 rounded-lg border shadow-sm">
                <AvatarFallback className="rounded-lg bg-orange-100 text-orange-600 font-semibold text-sm">
                  {user?.full_name ? getInitials(user.full_name) : "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 truncate">
                <p className="text-sm font-semibold truncate">{user?.full_name || "User"}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
              <ChevronsUpDown className="ml-auto h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60 shadow-xl border-border/50" sideOffset={12}>
            <div className="flex items-center gap-2 px-2 py-2 border-b border-border/50 mb-1">
              <Avatar className="h-8 w-8 rounded-md">
                <AvatarFallback className="rounded-md bg-muted text-xs">
                  {user?.full_name ? getInitials(user.full_name) : "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-medium truncate">{user?.full_name}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
            </div>
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link to="/profile" className="flex items-center gap-2 p-2.5">
                <User className="h-4 w-4 text-muted-foreground" />
                {t('nav.profile')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2 p-2.5 cursor-pointer">
                <Globe className="h-4 w-4 text-muted-foreground" />
                {t('language.switchLanguage')}
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="w-48 shadow-xl border-border/50 overflow-y-auto">
                  {supportedLanguages.map((lang) => (
                    <DropdownMenuItem
                      key={lang.code}
                      onClick={() => i18n.changeLanguage(lang.code)}
                      className="gap-3 p-1 cursor-pointer"
                    >
                      <span className="text-base">{lang.flag}</span>
                      <span className="flex-1 font-normal">{lang.label}</span>
                      {i18n.language === lang.code && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            <DropdownMenuSeparator className="bg-border/50" />
            <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive focus:bg-destructive/10 p-2.5 cursor-pointer">
              <LogOut className="h-4 w-4 mr-2" />
              {t('auth.signOut')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
