import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/products")({ component: ProductsPage });

type Product = { id: string; name: string; category: string | null; price: number | null; stock: number | null; is_mine: boolean; competitor_id: string | null; sku: string | null };
type Competitor = { id: string; name: string };

function ProductsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState<"all" | "mine" | "rivals">("all");
  const [addOpen, setAddOpen] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ["products", "all"],
    queryFn: async () => (await supabase.from("products").select("*").order("created_at", { ascending: false }).limit(10000)).data as Product[] || [],
  });
  const { data: competitors = [] } = useQuery({
    queryKey: ["competitors"],
    queryFn: async () => (await supabase.from("competitors").select("id,name")).data as Competitor[] || [],
  });

  const compMap = useMemo(() => Object.fromEntries(competitors.map((c) => [c.id, c.name])), [competitors]);

  const filtered = useMemo(() => products.filter((p) => {
    if (owner === "mine" && !p.is_mine) return false;
    if (owner === "rivals" && p.is_mine) return false;
    if (q && !p.name.toLowerCase().includes(q.toLowerCase()) && !(p.sku || "").toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [products, q, owner]);

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("products").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); toast.success("Eliminado"); },
  });

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Productos</h1>
          <p className="text-muted-foreground mt-1">{filtered.length} de {products.length}</p>
        </div>
        <Button onClick={() => setAddOpen(!addOpen)} className="rounded-full"><Plus className="size-4 mr-1" /> Añadir manual</Button>
      </div>

      {addOpen && <AddManual onClose={() => { setAddOpen(false); qc.invalidateQueries({ queryKey: ["products"] }); }} />}

      <div className="glass rounded-2xl p-3 flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9 rounded-xl border-0 bg-card/60" />
        </div>
        <Select value={owner} onValueChange={(v) => setOwner(v as typeof owner)}>
          <SelectTrigger className="w-[180px] rounded-xl border-0 bg-card/60"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="mine">Mi tienda</SelectItem>
            <SelectItem value="rivals">Competidores</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="grid grid-cols-12 gap-3 px-4 py-3 text-xs text-muted-foreground border-b border-white/40">
          <div className="col-span-5">Producto</div>
          <div className="col-span-2">Categoría</div>
          <div className="col-span-2">Dueño</div>
          <div className="col-span-2 text-right">Precio</div>
          <div className="col-span-1"></div>
        </div>
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Sin productos</div>
        ) : filtered.slice(0, 500).map((p) => (
          <div key={p.id} className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-glass-border text-sm items-center hover:bg-card/50 transition-colors">
            <div className="col-span-5">
              <div className="font-medium truncate">{p.name}</div>
              {p.sku && <div className="text-xs text-muted-foreground">{p.sku}</div>}
            </div>
            <div className="col-span-2 text-muted-foreground truncate">{p.category || "—"}</div>
            <div className="col-span-2">
              <span className={`text-xs px-2 py-0.5 rounded-full ${p.is_mine ? "bg-primary/15 text-primary" : "bg-accent text-accent-foreground"}`}>
                {p.is_mine ? "Mi tienda" : compMap[p.competitor_id || ""] || "Competidor"}
              </span>
            </div>
            <div className="col-span-2 text-right font-medium">{p.price != null ? `${p.price}€` : "—"}</div>
            <div className="col-span-1 text-right">
              <button onClick={() => del.mutate(p.id)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="size-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AddManual({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState(""); const [price, setPrice] = useState(""); const [category, setCategory] = useState("");
  const save = async () => {
    if (!name) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("products").insert({ user_id: u.user!.id, is_mine: true, name, price: price ? Number(price) : null, category: category || null });
    if (error) return toast.error(error.message);
    toast.success("Añadido"); onClose();
  };
  return (
    <div className="glass-strong rounded-2xl p-4 grid md:grid-cols-4 gap-3">
      <Input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl" />
      <Input placeholder="Categoría" value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-xl" />
      <Input placeholder="Precio (€)" type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="rounded-xl" />
      <Button onClick={save} className="rounded-full">Guardar</Button>
    </div>
  );
}
