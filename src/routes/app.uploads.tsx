import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { UploadExcel } from "@/components/UploadExcel";
import { FileStack, Trash2, AlertTriangle, Loader2, Package, Users, FileText, Store, Building2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/uploads")({ component: UploadsPage });

type Upload = {
  id: string;
  filename: string;
  is_mine: boolean;
  competitor_id: string | null;
  rows_imported: number | null;
  status: string;
  created_at: string;
};
type Competitor = { id: string; name: string };

function UploadsPage() {
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState<null | "all" | "mine" | "rivals">(null);
  const [target, setTarget] = useState<"mine" | "rival">("rival");

  const refetch = () => {
    qc.invalidateQueries({ queryKey: ["uploads"] });
    qc.invalidateQueries({ queryKey: ["competitors"] });
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["counts"] });
  };

  const { data: uploads = [], isLoading } = useQuery({
    queryKey: ["uploads"],
    queryFn: async () => (await supabase.from("uploads").select("*").order("created_at", { ascending: false }).limit(500)).data as Upload[] || [],
  });
  const { data: competitors = [] } = useQuery({
    queryKey: ["competitors"],
    queryFn: async () => (await supabase.from("competitors").select("id,name")).data as Competitor[] || [],
  });
  const { data: counts } = useQuery({
    queryKey: ["counts"],
    queryFn: async () => {
      const all = await supabase.from("products").select("id", { count: "exact", head: true });
      const mine = await supabase.from("products").select("id", { count: "exact", head: true }).eq("is_mine", true);
      return { all: all.count ?? 0, mine: mine.count ?? 0, rivals: (all.count ?? 0) - (mine.count ?? 0) };
    },
  });

  const compMap = Object.fromEntries(competitors.map((c) => [c.id, c.name]));

  const deleteUpload = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("uploads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["uploads"] }); toast.success("Registro eliminado"); },
  });

  const wipe = useMutation({
    mutationFn: async (scope: "all" | "mine" | "rivals") => {
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user!.id;

      let prodQ = supabase.from("products").delete().eq("user_id", userId);
      let upQ = supabase.from("uploads").delete().eq("user_id", userId);
      if (scope === "mine") {
        prodQ = prodQ.eq("is_mine", true);
        upQ = upQ.eq("is_mine", true);
      } else if (scope === "rivals") {
        prodQ = prodQ.eq("is_mine", false);
        upQ = upQ.eq("is_mine", false);
      }

      const { error: pe } = await prodQ;
      if (pe) throw pe;
      const { error: ue } = await upQ;
      if (ue) throw ue;

      if (scope === "all" || scope === "rivals") {
        const { error: ce } = await supabase.from("competitors").delete().eq("user_id", userId);
        if (ce) throw ce;
        const { error: ie } = await supabase.from("ai_insights").delete().eq("user_id", userId);
        if (ie) throw ie;
      }
    },
    onSuccess: () => { qc.invalidateQueries(); setConfirmOpen(null); toast.success("Datos borrados. La app está a cero."); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Archivos y subidas</h1>
        <p className="text-muted-foreground mt-1">Sube PDF, Excel, CSV, TXT o pega texto largo. La IA lo extrae y lo organiza.</p>
      </div>

      {/* Uploader (centralized here) */}
      <div className="glass-strong rounded-3xl p-5 space-y-4">
        <div className="glass-subtle rounded-full p-1 grid grid-cols-2 gap-1 max-w-sm">
          <Button type="button" variant={target === "rival" ? "default" : "ghost"} size="sm" className="rounded-full" onClick={() => setTarget("rival")}>
            <Building2 className="size-4 mr-1" /> Competidor
          </Button>
          <Button type="button" variant={target === "mine" ? "default" : "ghost"} size="sm" className="rounded-full" onClick={() => setTarget("mine")}>
            <Store className="size-4 mr-1" /> Mi tienda
          </Button>
        </div>
        <UploadExcel isMine={target === "mine"} onDone={refetch} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Archivos totales", value: uploads.length, icon: FileText },
          { label: "Productos totales", value: counts?.all ?? 0, icon: Package },
          { label: "Mis productos", value: counts?.mine ?? 0, icon: Store },
          { label: "De competencia", value: counts?.rivals ?? 0, icon: Users },
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

      {/* Danger zone */}
      <div className="glass-strong rounded-3xl p-5 border border-destructive/20">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="size-5 text-destructive mt-0.5" />
          <div>
            <h3 className="font-medium">Borrar datos</h3>
            <p className="text-sm text-muted-foreground mt-1">Resetea la app a cero. Esta acción no se puede deshacer.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-full" onClick={() => setConfirmOpen("mine")}>Borrar mis productos</Button>
          <Button variant="outline" className="rounded-full" onClick={() => setConfirmOpen("rivals")}>Borrar competidores</Button>
          <Button variant="destructive" className="rounded-full" onClick={() => setConfirmOpen("all")}>
            <Trash2 className="size-4 mr-1" /> Borrar todo
          </Button>
        </div>

        {confirmOpen && (
          <div className="mt-4 glass-subtle rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm">
              ¿Confirmas borrar {confirmOpen === "all" ? "TODOS los datos" : confirmOpen === "mine" ? "tus productos" : "todos los competidores"}?
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setConfirmOpen(null)} disabled={wipe.isPending}>Cancelar</Button>
              <Button variant="destructive" size="sm" className="rounded-full" onClick={() => wipe.mutate(confirmOpen)} disabled={wipe.isPending}>
                {wipe.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : <Trash2 className="size-4 mr-1" />}
                Confirmar
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* List */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="grid grid-cols-12 gap-3 px-4 py-3 text-xs text-muted-foreground border-b border-glass-border">
          <div className="col-span-5">Archivo</div>
          <div className="col-span-3">Origen</div>
          <div className="col-span-1 text-right">Filas</div>
          <div className="col-span-2">Fecha</div>
          <div className="col-span-1"></div>
        </div>
        {isLoading ? (
          <div className="p-10 flex justify-center"><Loader2 className="size-5 animate-spin text-primary" /></div>
        ) : uploads.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <FileStack className="size-8 mx-auto mb-2 opacity-50" />
            Aún no hay archivos subidos
          </div>
        ) : uploads.map((u) => (
          <div key={u.id} className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-glass-border text-sm items-center hover:bg-card/50 transition-colors">
            <div className="col-span-5 truncate font-medium">{u.filename}</div>
            <div className="col-span-3">
              <span className={`text-xs px-2 py-0.5 rounded-full ${u.is_mine ? "bg-primary/15 text-primary" : "bg-accent text-accent-foreground"}`}>
                {u.is_mine ? "Mi tienda" : compMap[u.competitor_id || ""] || "Competidor"}
              </span>
            </div>
            <div className="col-span-1 text-right">{u.rows_imported ?? 0}</div>
            <div className="col-span-2 text-muted-foreground text-xs">{new Date(u.created_at).toLocaleString()}</div>
            <div className="col-span-1 text-right">
              <button onClick={() => deleteUpload.mutate(u.id)} className="text-muted-foreground hover:text-destructive p-1">
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
