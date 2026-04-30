import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Package, Users, MessageSquare, LogOut, FileStack } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import logoMark from "@/assets/logo-mark.png";

const nav = [
  { to: "/app", label: "Resumen", icon: LayoutDashboard },
  { to: "/app/products", label: "Productos", icon: Package },
  { to: "/app/competitors", label: "Competidores", icon: Users },
  { to: "/app/uploads", label: "Archivos", icon: FileStack },
  { to: "/app/chat", label: "Chat IA", icon: MessageSquare },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const nav2 = useNavigate();

  const logout = async () => {
    await supabase.auth.signOut();
    nav2({ to: "/auth" });
  };

  return (
    <div className="relative min-h-screen">
      <div className="glass-aura bg-primary/20 w-[520px] h-[520px] -top-40 -left-40" />
      <div className="glass-aura bg-secondary/18 w-[520px] h-[520px] top-1/2 -right-44" />
      <div className="glass-aura bg-chart-4/18 w-[460px] h-[460px] bottom-0 left-1/3" />

      <div className="relative z-10 flex min-h-screen">
        {/* Sidebar */}
        <aside className="hidden md:flex flex-col w-64 p-4 gap-2">
          <Link to="/app" className="flex items-center gap-2 px-3 py-4">
            <img src={logoMark} alt="" width={36} height={36} className="size-9 drop-shadow-sm" />
            <span className="font-semibold tracking-tight text-base">PAMPAS MARKET</span>
          </Link>
          <nav className="glass rounded-2xl p-2 flex flex-col gap-1">
            {nav.map((n) => {
              const active = loc.pathname === n.to || (n.to !== "/app" && loc.pathname.startsWith(n.to));
              const Icon = n.icon;
              return (
                <Link key={n.to} to={n.to} className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all",
                  active ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-card/60 text-foreground/80"
                )}>
                  <Icon className="size-4" />
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <button onClick={logout} className="mt-auto glass rounded-2xl p-3 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <LogOut className="size-4" /> Cerrar sesión
          </button>
        </aside>

        {/* Mobile top nav */}
        <div className="md:hidden fixed bottom-4 left-4 right-4 z-50 glass-strong rounded-2xl p-2 flex justify-around">
          {nav.map((n) => {
            const active = loc.pathname === n.to || (n.to !== "/app" && loc.pathname.startsWith(n.to));
            const Icon = n.icon;
            return (
              <Link key={n.to} to={n.to} className={cn("p-2 rounded-xl", active ? "bg-primary text-primary-foreground" : "text-foreground/70")}>
                <Icon className="size-5" />
              </Link>
            );
          })}
        </div>

        <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
