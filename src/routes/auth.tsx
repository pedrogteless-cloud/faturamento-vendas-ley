import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const searchSchema = z.object({
  mode: z.enum(["signin", "reset"]).optional(),
  next: z.string().optional(),
});

function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

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

export function AuthPage() {
  const { mode = "signin", next } = useSearch({ from: "/auth" });
  const navigate = useNavigate();
  const nextPath = safeNext(next);

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
            {effectiveMode === "signin" &&
              "Acesso restrito · usuários são criados pela administração"}
            {effectiveMode === "reset" && "Defina sua nova senha de acesso"}
          </p>
        </div>

        {effectiveMode === "signin" && <SignInForm nextPath={nextPath} />}
        {effectiveMode === "reset" && <ResetForm onDone={() => navigate({ to: "/" })} />}
      </div>
    </div>
  );
}

function SignInForm({ nextPath }: { nextPath: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      const invalidCredentials = /invalid login credentials/i.test(error.message);
      toast.error(
        invalidCredentials ? "E-mail ou senha incorretos. Tente novamente." : error.message,
      );
      return;
    }
    window.location.href = nextPath;
  }

  async function handleForgotPassword() {
    if (!email) {
      toast.error("Informe seu e-mail para receber o link de redefinição.");
      return;
    }
    setResetLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth`,
    });
    setResetLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Se o e-mail existir, enviamos um link para redefinir a senha.");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-2xl border border-border-subtle bg-surface p-5"
    >
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
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field pr-14"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute inset-y-0 right-0 px-3 text-[11px] text-muted-foreground hover:text-foreground"
          >
            {showPassword ? "Ocultar" : "Mostrar"}
          </button>
        </div>
      </Field>
      <div className="text-right">
        <button
          type="button"
          onClick={handleForgotPassword}
          disabled={resetLoading}
          className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {resetLoading ? "Enviando…" : "Esqueci minha senha"}
        </button>
      </div>
      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Entrando…" : "Entrar"}
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
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-2xl border border-border-subtle bg-surface p-5"
    >
      <Field label="Nova senha">
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input-field"
        />
      </Field>
      <Field label="Confirme a senha">
        <input
          type="password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="input-field"
        />
      </Field>
      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Salvando…" : "Definir senha"}
      </button>
    </form>
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
