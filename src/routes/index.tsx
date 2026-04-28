import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Sparkles, BarChart3, Upload, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Prisma — Análisis de competencia con IA" },
      { name: "description", content: "Sube Excel, la IA extrae productos y te muestra análisis claros de competencia." },
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
      <div className="blob bg-primary/30 w-[500px] h-[500px] top-0 -left-20" />
      <div className="blob bg-chart-3/25 w-[520px] h-[520px] top-40 -right-20" />
      <div className="blob bg-chart-4/20 w-[400px] h-[400px] bottom-0 left-1/2" />

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-16 md:py-28">
        <div className="flex items-center gap-2 mb-12">
          <div className="size-9 rounded-xl bg-gradient-to-br from-primary to-chart-3 flex items-center justify-center">
            <Sparkles className="size-5 text-primary-foreground" />
          </div>
          <span className="font-semibold text-lg tracking-tight">Prisma</span>
        </div>

        <h1 className="text-5xl md:text-7xl font-semibold tracking-tight leading-[1.05]">
          Tu competencia,<br />
          <span className="bg-gradient-to-r from-primary to-chart-3 bg-clip-text text-transparent">clara como el cristal.</span>
        </h1>
        <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl">
          Sube un Excel y la IA extrae, clasifica y compara productos. Insights, gráficos y recomendaciones en segundos.
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link to="/auth" className="rounded-full bg-primary text-primary-foreground px-6 py-3 text-sm font-medium shadow-lg shadow-primary/20 hover:opacity-90 transition">
            Empezar gratis
          </Link>
          <Link to="/auth" className="glass rounded-full px-6 py-3 text-sm font-medium hover:bg-white/70 transition">
            Iniciar sesión
          </Link>
        </div>

        <div className="mt-20 grid md:grid-cols-3 gap-4">
          {[
            { icon: Upload, title: "Sube cualquier Excel", desc: "La IA detecta columnas aunque varíen entre archivos." },
            { icon: BarChart3, title: "Gráficos automáticos", desc: "Precios, categorías y posición frente a competidores." },
            { icon: MessageSquare, title: "Pregúntale a la IA", desc: "Chatea con tus datos y obtén recomendaciones." },
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
