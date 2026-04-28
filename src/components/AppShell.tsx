import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Package, Users, MessageSquare, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/BrandMark";
import type { ReactNode } from "react";

const nav = [
  { to: "/app", label: "Resumen", icon: LayoutDashboard },
  { to: "/app/products", label: "Productos", icon: Package },
  { to: "/app/competitors", label: "Competidores", icon: Users },
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
      <div className="blob bg-primary/30 w-[480px] h-[480px] -top-32 -left-32" />
      <div className="blob bg-chart-3/25 w-[500px] h-[500px] top-1/2 -right-40" />
      <div className="blob bg-chart-4/30 w-[420px] h-[420px] bottom-0 left-1/3" />

      <div className="relative z-10 flex min-h-screen">
        {/* Sidebar */}
        <aside className="hidden md:flex flex-col w-64 p-4 gap-2">
          <Link to="/app" className="flex items-center gap-2 px-3 py-4">
            <div className="size-9 rounded-xl bg-gradient-to-br from-primary to-chart-3 flex items-center justify-center text-primary-foreground">
              <BrandMark className="size-7" />
            </div>
            <span className="font-semibold tracking-tight text-lg">PAMPAS MARKET</span>
          </Link>
          <nav className="glass rounded-2xl p-2 flex flex-col gap-1">
            {nav.map((n) => {
              const active = loc.pathname === n.to || (n.to !== "/app" && loc.pathname.startsWith(n.to));
              const Icon = n.icon;
              return (
                <Link key={n.to} to={n.to} className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all",
                  active ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-accent text-foreground/80"
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
