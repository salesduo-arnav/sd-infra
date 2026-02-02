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
  Plus
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
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
} from "@/components/ui/dropdown-menu";

const mainNavItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Organisation", url: "/organisation", icon: Building2 },
  { title: "Integrations", url: "/integrations", icon: Plug },
  { title: "Plans", url: "/plans", icon: CreditCard },
  { title: "Billing", url: "/billing", icon: Receipt },
];



export function AppSidebar() {
  const location = useLocation();
  const { user, logout, isAdmin, activeOrganization, switchOrganization } = useAuth();
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

  return (
    <Sidebar className="border-r">
      <SidebarHeader className="border-b px-2 py-2">
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 w-full p-2 rounded-md hover:bg-muted transition-colors">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                         {activeOrganization?.slug ? (
                             <img src={`https://avatar.vercel.sh/${activeOrganization.slug}.svg?text=${activeOrganization.name.slice(0,2).toUpperCase()}`} className="h-8 w-8 rounded" alt={activeOrganization.name} />
                         ) : (
                             <img src="/logo-dark.webp" className="h-8 w-8" alt="SalesDuo" />
                         )}
                    </div>
                    <div className="flex-1 text-left truncate">
                        <span className="block text-sm font-semibold truncate">
                             {activeOrganization?.name || "Select Organization"}
                        </span>
                        <span className="block text-xs text-muted-foreground truncate">
                             {user?.memberships?.length || 0} Organizations
                        </span>
                    </div>
                    <ChevronsUpDown className="ml-auto h-4 w-4 opacity-50" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64" align="start">
                 <DropdownMenuLabel className="text-xs text-muted-foreground">Teams</DropdownMenuLabel>
                 {user?.memberships?.map((membership) => (
                      <DropdownMenuItem 
                        key={membership.organization.id} 
                        onClick={() => switchOrganization(membership.organization.id)}
                        className="gap-2 p-2"
                      >
                         <div className="flex h-6 w-6 items-center justify-center rounded-sm border">
                             <img src={`https://avatar.vercel.sh/${membership.organization.slug}.svg?text=${membership.organization.name.slice(0,2).toUpperCase()}`} className="h-4 w-4 rounded-sm" alt={membership.organization.name} />
                         </div>
                         <div className="flex-1 truncate">
                             {membership.organization.name}
                         </div>
                         {activeOrganization?.id === membership.organization.id && (
                             <Check className="ml-auto h-4 w-4" />
                         )}
                      </DropdownMenuItem>
                 ))}
                 <DropdownMenuSeparator />
                 <DropdownMenuItem asChild>
                     <Link to="/create-organisation" className="gap-2 p-2 cursor-pointer">
                         <div className="flex h-6 w-6 items-center justify-center rounded-md border border-dashed">
                             <Plus className="h-4 w-4" />
                         </div>
                         <div className="font-medium text-muted-foreground">Add Organization</div>
                     </Link>
                 </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                  >
                    <Link to={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel>Administration</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive("/admin")}
                    >
                      <Link to="/admin">
                        <Shield className="h-4 w-4" />
                        <span>Overview</span>
                      </Link>
                    </SidebarMenuButton>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isActive("/admin/apps")}
                        >
                          <Link to="/admin/apps">
                            <Package className="h-4 w-4" />
                            <span>Manage Apps</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isActive("/admin/plans")}
                        >
                          <Link to="/admin/plans">
                            <CreditCard className="h-4 w-4" />
                            <span>Manage Plans</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isActive("/admin/users")}
                        >
                          <Link to="/admin/users">
                            <User className="h-4 w-4" />
                            <span>Manage Users</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isActive("/admin/organizations")}
                        >
                          <Link to="/admin/organizations">
                            <Building2 className="h-4 w-4" />
                            <span>Manage Orgs</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t p-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-muted transition-colors">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  {user?.full_name ? getInitials(user.full_name) : "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 truncate">
                <p className="text-sm font-medium truncate">{user?.full_name || "User"}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem asChild>
              <Link to="/profile" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/organisation" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
