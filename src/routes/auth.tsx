import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const searchSchema = z.object({ mode: z.enum(["signin", "recover", "reset"]).optional() });

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Painel Ley Colchões" },
      { name: "description", content: "Acesso restrito ao painel executivo Ley Colchões." },
    ],
  }),
  validateSearch: (s) => searchSchema.parse(s),
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const { mode = "signin" } = useSearch({ from: "/auth" });
  const navigate = useNavigate();

  // Detecta hash de recovery
  const isRecoveryHash =
    typeof window !== "undefined" && window.location.hash.includes("type=recovery");
  const effectiveMode = isRecoveryHash ? "reset" : mode;

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-primary text-primary-foreground text-xl font-bold">
            L
          </div>
          <h1 className="mt-4 text-xl font-semibold">Painel Ley Colchões</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {effectiveMode === "signin" && "Acesso restrito · use seu e-mail corporativo"}
            {effectiveMode === "recover" && "Informe seu e-mail para receber o link de redefinição"}
            {effectiveMode === "reset" && "Defina sua nova senha de acesso"}
          </p>
        </div>

        {effectiveMode === "signin" && <SignInForm onForgot={() => navigate({ to: "/auth", search: { mode: "recover" } })} />}
        {effectiveMode === "recover" && <RecoverForm onBack={() => navigate({ to: "/auth", search: { mode: "signin" } })} />}
        {effectiveMode === "reset" && <ResetForm onDone={() => navigate({ to: "/" })} />}

        <BootstrapButton />
      </div>
    </div>
  );
}

function SignInForm({ onForgot }: { onForgot: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    window.location.href = "/";
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-border-subtle bg-surface p-5">
      <Field label="E-mail">
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input-field"
        />
      </Field>
      <Field label="Senha">
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input-field"
        />
      </Field>
      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Entrando…" : "Entrar"}
      </button>
      <button type="button" onClick={onForgot} className="block w-full text-center text-xs text-muted-foreground hover:text-foreground">
        Esqueci minha senha
      </button>
    </form>
  );
}

function RecoverForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth?mode=reset`,
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success("Se o e-mail existir, enviaremos o link de redefinição.");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-border-subtle bg-surface p-5">
      <Field label="E-mail">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input-field" />
      </Field>
      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Enviando…" : "Enviar link"}
      </button>
      <button type="button" onClick={onBack} className="block w-full text-center text-xs text-muted-foreground hover:text-foreground">
        Voltar para o login
      </button>
    </form>
  );
}

function ResetForm({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return toast.error("Senha mínima de 8 caracteres.");
    if (password !== confirm) return toast.error("As senhas não coincidem.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Senha atualizada.");
    history.replaceState(null, "", "/auth");
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-border-subtle bg-surface p-5">
      <Field label="Nova senha"><input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="input-field" /></Field>
      <Field label="Confirme a senha"><input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="input-field" /></Field>
      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Salvando…" : "Definir senha"}
      </button>
    </form>
  );
}

function BootstrapButton() {
  const [loading, setLoading] = useState(false);
  async function bootstrap() {
    setLoading(true);
    try {
      const res = await fetch("/api/public/bootstrap-admin", { method: "POST" });
      const json = await res.json();
      if (!res.ok) toast.error(json.error ?? "Falha no bootstrap");
      else toast.success(json.message ?? "Administrador criado. Verifique o e-mail.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <button
      type="button"
      onClick={bootstrap}
      disabled={loading}
      className="block w-full text-center text-[11px] text-muted-foreground/70 hover:text-muted-foreground"
    >
      {loading ? "Inicializando…" : "Primeira vez? Inicializar administrador Pedro Teles"}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
