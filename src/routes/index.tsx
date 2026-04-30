import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { BarChart3, Upload, MessageSquare, Sparkles, Layers, ShieldCheck } from "lucide-react";
import logoMark from "@/assets/logo-mark.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PAMPAS MARKET — Pricing competitivo con IA" },
      { name: "description", content: "Sube tus Excel y deja que la IA extraiga, clasifique y compare productos frente a tu competencia. Insights y gráficos en segundos." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  useEffect(() => { if (!loading && user) nav({ to: "/app" }); }, [user, loading, nav]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="glass-aura bg-primary/30 w-[560px] h-[560px] -top-24 -left-24" />
      <div className="glass-aura bg-secondary/25 w-[560px] h-[560px] top-40 -right-24" />
      <div className="glass-aura bg-chart-4/20 w-[420px] h-[420px] bottom-0 left-1/2" />

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-12 md:py-24">
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-2">
            <img src={logoMark} alt="" width={40} height={40} className="size-10 drop-shadow-sm" />
            <span className="font-semibold text-lg tracking-tight">PAMPAS MARKET</span>
          </div>
          <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">Iniciar sesión</Link>
        </div>

        <div className="inline-flex items-center gap-2 glass-subtle rounded-full px-3 py-1.5 text-xs text-muted-foreground mb-6">
          <Sparkles className="size-3.5 text-primary" /> Pricing intelligence con IA
        </div>

        <h1 className="text-5xl md:text-7xl font-semibold tracking-tight leading-[1.02]">
          Tu competencia,<br />
          <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">clara como el cristal.</span>
        </h1>
        <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl">
          Sube un Excel o pega un texto y la IA extrae, clasifica y compara productos.
          Gráficos, brechas de precio y recomendaciones automáticas.
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link to="/auth" className="rounded-full bg-primary text-primary-foreground px-6 py-3 text-sm font-medium shadow-lg shadow-primary/20 hover:opacity-90 transition">
            Empezar
          </Link>
          <Link to="/auth" className="glass rounded-full px-6 py-3 text-sm font-medium hover:bg-card/70 transition">
            Iniciar sesión
          </Link>
        </div>

        <div className="mt-20 grid md:grid-cols-3 gap-4">
          {[
            { icon: Upload, title: "Sube cualquier Excel", desc: "Multi-hoja, miles de filas. La IA detecta columnas aunque varíen." },
            { icon: BarChart3, title: "Gráficos automáticos", desc: "Precios por tienda, distribución por categoría y tu posición." },
            { icon: MessageSquare, title: "Chat con tus datos", desc: "Pregunta a la IA y obtén recomendaciones accionables." },
            { icon: Layers, title: "Histórico de archivos", desc: "Cada subida queda registrada y se puede revertir." },
            { icon: ShieldCheck, title: "Tus datos, tuyos", desc: "RLS estricta. Sólo tú ves tus productos." },
            { icon: Sparkles, title: "Match producto-rival", desc: "La IA empareja tus SKU con los del rival más parecido." },
          ].map((f) => (
            <div key={f.title} className="glass rounded-2xl p-6">
              <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <f.icon className="size-5 text-primary" />
              </div>
              <h3 className="font-medium">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
