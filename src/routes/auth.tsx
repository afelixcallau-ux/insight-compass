import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { BrandMark } from "@/components/BrandMark";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Entrar — PAMPAS MARKET" }] }),
  component: AuthPage,
});

function AuthPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (user) nav({ to: "/app" }); }, [user, nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/app` },
        });
        if (error) throw error;
        toast.success("Cuenta creada. Revisa tu correo si pide confirmación.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4">
      <div className="blob bg-primary/30 w-[400px] h-[400px] -top-20 -left-10" />
      <div className="blob bg-chart-3/25 w-[420px] h-[420px] bottom-0 right-0" />

      <div className="relative z-10 w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2 mb-8">
          <div className="size-9 rounded-xl bg-gradient-to-br from-primary to-chart-3 flex items-center justify-center text-primary-foreground">
            <BrandMark className="size-7" />
          </div>
          <span className="font-semibold text-lg">PAMPAS MARKET</span>
        </Link>

        <div className="glass-strong rounded-3xl p-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            {mode === "signin" ? "Bienvenido de nuevo" : "Crea tu cuenta"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "signin" ? "Entra para ver tu análisis" : "Empieza a analizar competencia"}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-xl" />
            </div>
            <Button type="submit" disabled={loading} className="w-full rounded-full">
              {loading ? "..." : mode === "signin" ? "Entrar" : "Crear cuenta"}
            </Button>
          </form>

          <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="mt-4 w-full text-sm text-muted-foreground hover:text-foreground">
            {mode === "signin" ? "¿No tienes cuenta? Crea una" : "¿Ya tienes cuenta? Entra"}
          </button>
        </div>
      </div>
    </div>
  );
}
