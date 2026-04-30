import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sparkles, TrendingUp, TrendingDown, Package, Users, Loader2, AlertCircle, CheckCircle2, Info, Upload, ArrowRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

export const Route = createFileRoute("/app/")({
  component: Dashboard,
});

type Product = { id: string; name: string; category: string | null; price: number | null; is_mine: boolean; competitor_id: string | null };

function Dashboard() {
  const [analysis, setAnalysis] = useState<{ summary: string; insights: Array<{ title: string; detail: string; severity: string }>; recommendations: string[] } | null>(null);

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id,name,category,price,is_mine,competitor_id").limit(10000);
      if (error) throw error;
      return data as Product[];
    },
  });

  const { data: competitors = [] } = useQuery({
    queryKey: ["competitors"],
    queryFn: async () => (await supabase.from("competitors").select("id,name")).data || [],
  });

  const mine = useMemo(() => products.filter((p) => p.is_mine), [products]);
  const rivals = useMemo(() => products.filter((p) => !p.is_mine), [products]);

  const avgMine = useMemo(() => {
    const v = mine.map((p) => p.price).filter((p): p is number => p != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  }, [mine]);
  const avgRivals = useMemo(() => {
    const v = rivals.map((p) => p.price).filter((p): p is number => p != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  }, [rivals]);

  const positionPct = avgMine && avgRivals ? ((avgMine - avgRivals) / avgRivals) * 100 : 0;

  const catData = useMemo(() => {
    const m = new Map<string, number>();
    products.forEach((p) => { const k = p.category || "Sin categoría"; m.set(k, (m.get(k) || 0) + 1); });
    return Array.from(m.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);
  }, [products]);

  const priceByCompetitor = useMemo(() => {
    const m = new Map<string, number[]>();
    rivals.forEach((p) => {
      if (p.price == null || !p.competitor_id) return;
      if (!m.has(p.competitor_id)) m.set(p.competitor_id, []);
      m.get(p.competitor_id)!.push(p.price);
    });
    const out: Array<{ name: string; avg: number }> = [];
    m.forEach((vs, id) => {
      const c = competitors.find((x) => x.id === id);
      out.push({ name: (c?.name || "—").slice(0, 14), avg: Math.round((vs.reduce((a, b) => a + b, 0) / vs.length) * 100) / 100 });
    });
    if (mine.length) out.unshift({ name: "Mi tienda", avg: Math.round(avgMine * 100) / 100 });
    return out.slice(0, 8);
  }, [rivals, competitors, mine, avgMine]);

  // Top brechas — categorías con mayor diferencia frente a rivales
  const gaps = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => p.category && cats.add(p.category));
    return Array.from(cats).map((cat) => {
      const m = mine.filter((p) => p.category === cat && p.price != null).map((p) => p.price!);
      const r = rivals.filter((p) => p.category === cat && p.price != null).map((p) => p.price!);
      if (!m.length || !r.length) return null;
      const mAvg = m.reduce((a, b) => a + b, 0) / m.length;
      const rAvg = r.reduce((a, b) => a + b, 0) / r.length;
      return { cat, diffPct: ((mAvg - rAvg) / rAvg) * 100, mAvg, rAvg };
    }).filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct)).slice(0, 5);
  }, [products, mine, rivals]);

  const analyze = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("analyze-data", {
        body: { mine: mine.slice(0, 500), competitors: rivals.slice(0, 1200) },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (d) => { setAnalysis(d); toast.success("Análisis listo"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const COLORS = ["oklch(0.4 0.164 29.2)", "oklch(0.5 0.16 28)", "oklch(0.6 0.14 32)", "oklch(0.7 0.1 36)", "oklch(0.78 0.07 40)", "oklch(0.85 0.04 44)"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Resumen</h1>
        <p className="text-muted-foreground mt-1">Vista general de tus productos y competencia</p>
      </div>

      {products.length === 0 ? (
        <div className="glass-strong rounded-3xl p-12 text-center">
          <Sparkles className="size-10 text-primary mx-auto mb-3" />
          <h3 className="text-lg font-medium">Aún no hay datos</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-6">Sube tu primer Excel o pega un texto para empezar.</p>
          <Link to="/app/uploads" className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium">
            <Upload className="size-4" /> Ir a subir archivos <ArrowRight className="size-4" />
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Mis productos", value: mine.length, icon: Package },
              { label: "Competidores", value: competitors.length, icon: Users },
              { label: "Precio medio mío", value: avgMine ? `${avgMine.toFixed(2)}€` : "—", icon: TrendingUp },
              { label: avgMine && avgRivals ? (positionPct > 0 ? "Más caro que rivales" : "Más barato que rivales") : "Posición", value: avgMine && avgRivals ? `${positionPct > 0 ? "+" : ""}${positionPct.toFixed(1)}%` : "—", icon: positionPct > 0 ? TrendingUp : TrendingDown },
            ].map((k) => (
              <div key={k.label} className="glass rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{k.label}</span>
                  <k.icon className="size-4 text-primary" />
                </div>
                <div className="text-2xl font-semibold mt-2">{k.value}</div>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="glass rounded-2xl p-5">
              <h3 className="font-medium mb-4">Precio medio por tienda</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={priceByCompetitor}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.005 25)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid oklch(0.92 0.005 25)", backdropFilter: "blur(10px)" }} />
                  <Bar dataKey="avg" fill="oklch(0.4 0.164 29.2)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="glass rounded-2xl p-5">
              <h3 className="font-medium mb-4">Categorías</h3>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={catData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} innerRadius={50}>
                    {catData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid oklch(0.92 0.005 25)" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {gaps.length > 0 && (
            <div className="glass rounded-2xl p-5">
              <h3 className="font-medium mb-3">Mayores brechas de precio por categoría</h3>
              <div className="space-y-2">
                {gaps.map((g) => (
                  <div key={g.cat} className="flex items-center justify-between glass-subtle rounded-xl px-4 py-3 text-sm">
                    <div className="font-medium truncate pr-3">{g.cat}</div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Tú: <strong className="text-foreground">{g.mAvg.toFixed(2)}€</strong></span>
                      <span>Rival: <strong className="text-foreground">{g.rAvg.toFixed(2)}€</strong></span>
                      <span className={`px-2 py-0.5 rounded-full font-medium ${g.diffPct > 0 ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
                        {g.diffPct > 0 ? "+" : ""}{g.diffPct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="glass-strong rounded-3xl p-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="size-5 text-primary" />
                <h3 className="font-medium">Análisis con IA</h3>
              </div>
              <Button onClick={() => analyze.mutate()} disabled={analyze.isPending || products.length === 0} className="rounded-full">
                {analyze.isPending ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                Generar análisis
              </Button>
            </div>
            {analysis ? (
              <div className="space-y-4">
                <div className="prose prose-sm max-w-none text-foreground/90"><ReactMarkdown>{analysis.summary}</ReactMarkdown></div>
                <div className="grid md:grid-cols-2 gap-3">
                  {analysis.insights.map((i, idx) => {
                    const Icon = i.severity === "good" ? CheckCircle2 : i.severity === "warn" ? AlertCircle : Info;
                    const color = i.severity === "good" ? "text-chart-2" : i.severity === "warn" ? "text-destructive" : "text-primary";
                    return (
                      <div key={idx} className="glass-subtle rounded-xl p-4">
                        <div className="flex items-start gap-2">
                          <Icon className={`size-4 mt-0.5 ${color}`} />
                          <div>
                            <div className="font-medium text-sm">{i.title}</div>
                            <div className="text-xs text-muted-foreground mt-1">{i.detail}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div>
                  <h4 className="font-medium text-sm mb-2">Recomendaciones</h4>
                  <ul className="space-y-1.5">
                    {analysis.recommendations.map((r, i) => (
                      <li key={i} className="flex gap-2 text-sm"><span className="text-primary">→</span><span>{r}</span></li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Pulsa para que la IA genere insights y recomendaciones.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
