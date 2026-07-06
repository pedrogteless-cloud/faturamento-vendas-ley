import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  createUser,
  listUsers,
  sendPasswordReset,
  setUserActive,
  setUserPassword,
  updateUserAccess,
} from "@/lib/admin-users.functions";
import { listFactories } from "@/lib/factories.functions";
import { getSessionContext } from "@/lib/session.functions";
import { canAccessAdmin, ROLE_LABEL, type AppPermission, type AppRole } from "@/lib/permissions";
import { formatDateTimeBR, getErrorMessage } from "@/lib/format";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Usuários — Ley Colchões" }] }),
  component: AdminPage,
});

const ALL_ROLES: AppRole[] = [
  "admin",
  "diretoria",
  "gerente_comercial",
  "assistente_vendas",
  "responsavel_faturamento",
];
const ALL_PERMS: { value: AppPermission; label: string }[] = [
  { value: "manage_goals", label: "Editar metas" },
  { value: "manage_work_calendar", label: "Editar calendário" },
  { value: "manage_notifications", label: "Configurar notificações" },
  { value: "view_audit", label: "Ver auditoria" },
];

function AdminPage() {
  const fetchSession = useServerFn(getSessionContext);
  const fetchUsers = useServerFn(listUsers);
  const fetchFactories = useServerFn(listFactories);
  const submitCreate = useServerFn(createUser);
  const submitAccess = useServerFn(updateUserAccess);
  const submitActive = useServerFn(setUserActive);
  const submitReset = useServerFn(sendPasswordReset);
  const submitSetPassword = useServerFn(setUserPassword);
  const qc = useQueryClient();

  const sessionQuery = useQuery({ queryKey: ["session-context"], queryFn: () => fetchSession() });
  const factoriesQuery = useQuery({ queryKey: ["factories"], queryFn: () => fetchFactories() });
  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => fetchUsers(),
    enabled: canAccessAdmin(sessionQuery.data ?? null),
  });

  if (sessionQuery.data && !canAccessAdmin(sessionQuery.data)) {
    return (
      <div className="p-8 text-sm text-muted-foreground">Acesso restrito a administradores.</div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Administração de usuários</h1>
          <p className="text-xs text-muted-foreground">
            Crie usuários, defina funções, permissões e fábricas autorizadas.
          </p>
        </div>
      </header>

      <CreateUserCard
        factories={factoriesQuery.data ?? []}
        onCreate={async (payload) => {
          try {
            const res = await submitCreate({ data: payload });
            toast.success(
              res?.passwordSet
                ? "Usuário criado com a senha definida."
                : "Usuário criado. Link de definição de senha enviado.",
            );
            qc.invalidateQueries({ queryKey: ["admin-users"] });
          } catch (e) {
            toast.error(getErrorMessage(e));
          }
        }}
      />

      <section className="mt-6 overflow-x-auto rounded-2xl border border-border-subtle bg-surface">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-5 py-2 text-left">Usuário</th>
              <th className="px-5 py-2 text-left">Funções</th>
              <th className="px-5 py-2 text-left">Permissões</th>
              <th className="px-5 py-2 text-left">Fábricas</th>
              <th className="px-5 py-2 text-left">Status</th>
              <th className="px-5 py-2 text-left">Último acesso</th>
              <th className="px-5 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(usersQuery.data ?? []).map((u) => (
              <UserRow
                key={u.id}
                user={u}
                factories={factoriesQuery.data ?? []}
                onSaveAccess={async (payload) => {
                  try {
                    await submitAccess({ data: payload });
                    toast.success("Acesso atualizado.");
                    qc.invalidateQueries({ queryKey: ["admin-users"] });
                  } catch (e) {
                    toast.error(getErrorMessage(e));
                  }
                }}
                onToggleActive={async (active) => {
                  try {
                    await submitActive({ data: { userId: u.id, active } });
                    toast.success(active ? "Usuário ativado." : "Usuário desativado.");
                    qc.invalidateQueries({ queryKey: ["admin-users"] });
                  } catch (e) {
                    toast.error(getErrorMessage(e));
                  }
                }}
                onResetPassword={async () => {
                  try {
                    await submitReset({ data: { email: u.email } });
                    toast.success("Link enviado.");
                  } catch (e) {
                    toast.error(getErrorMessage(e));
                  }
                }}
                onSetPassword={async (password) => {
                  try {
                    await submitSetPassword({ data: { userId: u.id, password } });
                    toast.success("Senha atualizada.");
                  } catch (e) {
                    toast.error(getErrorMessage(e));
                  }
                }}
              />
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

type Factory = { id: string; name: string; state: string };

function CreateUserCard({
  factories,
  onCreate,
}: {
  factories: Factory[];
  onCreate: (payload: {
    email: string;
    fullName: string;
    password?: string;
    roles: AppRole[];
    permissions: AppPermission[];
    factoryIds: string[];
  }) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [perms, setPerms] = useState<AppPermission[]>([]);
  const [factoryIds, setFactoryIds] = useState<string[]>([]);

  function genPassword() {
    const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    const arr = new Uint32Array(12);
    crypto.getRandomValues(arr);
    for (const n of arr) out += chars[n % chars.length];
    setPassword(out);
    setShowPassword(true);
  }

  return (
    <section className="rounded-2xl border border-border-subtle bg-surface p-5">
      <h2 className="mb-4 text-sm font-semibold">Criar novo usuário</h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (roles.length === 0) return toast.error("Selecione ao menos uma função.");
          if (password && password.length < 8)
            return toast.error("Senha deve ter ao menos 8 caracteres.");
          await onCreate({
            email,
            fullName,
            password: password || undefined,
            roles,
            permissions: perms,
            factoryIds,
          });
          setEmail("");
          setFullName("");
          setPassword("");
          setShowPassword(false);
          setRoles([]);
          setPerms([]);
          setFactoryIds([]);
        }}
        className="grid gap-3 md:grid-cols-2"
      >
        <Field label="Nome completo">
          <input
            className="input-field"
            required
            minLength={2}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </Field>
        <Field label="E-mail">
          <input
            className="input-field"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Senha (opcional — deixe vazio para enviar link por e-mail)">
          <div className="relative">
            <input
              className="input-field pr-24"
              type={showPassword ? "text" : "password"}
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
            />
            <div className="absolute inset-y-0 right-0 flex items-center gap-1 pr-1">
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="px-2 text-[11px] text-muted-foreground hover:text-foreground"
              >
                {showPassword ? "Ocultar" : "Mostrar"}
              </button>
              <button
                type="button"
                onClick={genPassword}
                className="px-2 text-[11px] text-muted-foreground hover:text-foreground"
              >
                Gerar
              </button>
            </div>
          </div>
        </Field>
        <Field label="Funções">
          <ChipSelect
            options={ALL_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
            value={roles}
            onChange={(v) => setRoles(v as AppRole[])}
          />
        </Field>
        <Field label="Permissões adicionais">
          <ChipSelect
            options={ALL_PERMS}
            value={perms}
            onChange={(v) => setPerms(v as AppPermission[])}
          />
        </Field>
        <Field label="Fábricas autorizadas">
          <ChipSelect
            options={factories.map((f) => ({ value: f.id, label: `${f.name} · ${f.state}` }))}
            value={factoryIds}
            onChange={setFactoryIds}
          />
        </Field>
        <div className="md:col-span-2">
          <button type="submit" className="btn-primary">
            {password ? "Criar usuário" : "Criar e enviar link"}
          </button>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {password
              ? "O usuário fará login com essa senha. Anote e compartilhe por canal seguro."
              : "O usuário receberá um e-mail para definir a própria senha de acesso."}
          </p>
        </div>
      </form>
    </section>
  );
}


function UserRow({
  user,
  factories,
  onSaveAccess,
  onToggleActive,
  onResetPassword,
  onSetPassword,
}: {
  user: Awaited<ReturnType<typeof listUsers>>[number];
  factories: Factory[];
  onSaveAccess: (payload: {
    userId: string;
    roles: AppRole[];
    permissions: AppPermission[];
    factoryIds: string[];
  }) => Promise<void>;
  onToggleActive: (active: boolean) => Promise<void>;
  onResetPassword: () => Promise<void>;
  onSetPassword: (password: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [roles, setRoles] = useState<AppRole[]>(user.roles);
  const [perms, setPerms] = useState<AppPermission[]>(user.permissions);
  const [factoryIds, setFactoryIds] = useState<string[]>(user.factoryIds);
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);

  return (
    <>
      <tr className="border-t border-border-subtle/40 align-top">
        <td className="px-5 py-3">
          <div className="font-medium">{user.full_name}</div>
          <div className="text-xs text-muted-foreground">{user.email}</div>
        </td>
        <td className="px-5 py-3 text-xs">
          {user.roles.map((r) => ROLE_LABEL[r]).join(", ") || "—"}
        </td>
        <td className="px-5 py-3 text-xs">
          {user.roles.includes("admin") ? "Todas (admin)" : user.permissions.join(", ") || "—"}
        </td>
        <td className="px-5 py-3 text-xs">
          {user.factoryIds
            .map((id) => factories.find((f) => f.id === id)?.name)
            .filter(Boolean)
            .join(", ") || "—"}
        </td>
        <td className="px-5 py-3">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] ${user.is_active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}
          >
            {user.is_active ? "Ativo" : "Inativo"}
          </span>
        </td>
        <td className="px-5 py-3 text-xs text-muted-foreground tabular">
          {formatDateTimeBR(user.last_sign_in_at)}
        </td>
        <td className="px-5 py-3 text-right">
          <div className="inline-flex flex-wrap gap-1 justify-end">
            <button className="btn-ghost" onClick={() => setEditing((v) => !v)}>
              {editing ? "Cancelar" : "Editar"}
            </button>
            <button className="btn-ghost" onClick={onResetPassword}>
              Reenviar senha
            </button>
            {user.is_active ? (
              <AlertDialog>
                <AlertDialogTrigger className="btn-ghost">Desativar</AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Desativar {user.full_name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      O usuário perderá acesso imediato ao sistema. Você pode reativá-lo depois, se
                      necessário.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onToggleActive(false)}>
                      Desativar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <button className="btn-ghost" onClick={() => onToggleActive(true)}>
                Ativar
              </button>
            )}
          </div>
        </td>
      </tr>
      {editing && (
        <tr className="bg-background/40">
          <td colSpan={7} className="px-5 py-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Funções">
                <ChipSelect
                  options={ALL_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
                  value={roles}
                  onChange={(v) => setRoles(v as AppRole[])}
                />
              </Field>
              <Field label="Permissões">
                <ChipSelect
                  options={ALL_PERMS}
                  value={perms}
                  onChange={(v) => setPerms(v as AppPermission[])}
                />
              </Field>
              <Field label="Fábricas">
                <ChipSelect
                  options={factories.map((f) => ({ value: f.id, label: `${f.name} · ${f.state}` }))}
                  value={factoryIds}
                  onChange={setFactoryIds}
                />
              </Field>
            </div>
            <div className="mt-3">
              <button
                className="btn-primary"
                onClick={async () => {
                  await onSaveAccess({ userId: user.id, roles, permissions: perms, factoryIds });
                  setEditing(false);
                }}
              >
                Salvar
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ChipSelect<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T[];
  onChange: (next: T[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = value.includes(opt.value);
        return (
          <button
            type="button"
            key={opt.value}
            onClick={() => {
              if (active) onChange(value.filter((v) => v !== opt.value));
              else onChange([...value, opt.value]);
            }}
            className={`rounded-full px-2.5 py-1 text-xs transition ${active ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted/60"}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
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
