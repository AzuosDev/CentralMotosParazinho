import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bug, CalendarClock, Gift, Lightbulb, Loader2, Mail, Search, Users } from "lucide-react";
import { api } from "../lib/api";
import { cn } from "../lib/utils";
import { formatDisplayDate } from "../lib/finance";
import { useToast } from "../components/ui/Toast";
import { SupportThreadDrawer } from "../components/support/SupportThreadDrawer";

type SupportMessageTipo = "bug" | "sugestao";
type SupportMessageStatus = "aberto" | "lido";

type SupportMessage = {
  _id: string;
  titulo: string;
  tipo: SupportMessageTipo;
  mensagem: string;
  status: SupportMessageStatus;
  userEmail: string;
  createdAt: string;
};

type AdminUserStatus =
  | "gratis_liberado"
  | "ativo"
  | "assinatura_expirada"
  | "em_teste"
  | "teste_expirado"
  | "cancelado"
  | "sem_assinatura";

type AdminUser = {
  _id: string;
  email: string;
  name: string | null;
  createdAt: string;
  emailVerified: boolean;
  isLegacyFree: boolean;
  subscriptionStatus: string | null;
  plan: string | null;
  billingCycle: string | null;
  trialEndsAt: string | null;
  subscriptionExpiresAt: string | null;
  status: AdminUserStatus;
  hasAccess: boolean;
};

const tipoConfig: Record<SupportMessageTipo, { label: string; icon: typeof Bug; color: string }> = {
  bug: { label: "Erro", icon: Bug, color: "text-accent-red" },
  sugestao: { label: "Sugestão", icon: Lightbulb, color: "text-accent-yellow" },
};

const statusConfig: Record<AdminUserStatus, { label: string; className: string }> = {
  gratis_liberado: { label: "Grátis liberado", className: "bg-accent-lime/15 text-accent-lime" },
  ativo: { label: "Ativo", className: "bg-accent-lime/15 text-accent-lime" },
  em_teste: { label: "Em teste", className: "bg-accent-yellow/15 text-accent-yellow" },
  assinatura_expirada: { label: "Expirado", className: "bg-accent-red/15 text-accent-red" },
  teste_expirado: { label: "Teste expirado", className: "bg-accent-red/15 text-accent-red" },
  cancelado: { label: "Cancelado", className: "bg-bg-muted text-text-secondary" },
  sem_assinatura: { label: "Sem assinatura", className: "bg-bg-muted text-text-secondary" },
};

export function SupportAdminPage() {
  const [tab, setTab] = useState<"mensagens" | "usuarios">("mensagens");

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm text-text-secondary">Admin</p>
        <h1 className="font-sans text-2xl font-bold">Painel Admin</h1>
        <p className="mt-1 max-w-2xl text-sm text-text-secondary">
          Mensagens de suporte enviadas pelo FAQ e gestão de usuários, planos e acesso gratuito.
        </p>
      </div>

      <div className="flex w-fit gap-1 rounded-xl bg-bg-muted p-1">
        {(
          [
            { key: "mensagens" as const, label: "Mensagens" },
            { key: "usuarios" as const, label: "Usuários" },
          ]
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold transition",
              tab === t.key ? "bg-accent-lime text-black" : "text-white hover:bg-bg-overlay",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "mensagens" ? <SupportMessagesTab /> : <AdminUsersTab />}
    </section>
  );
}

function SupportMessagesTab() {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"todas" | SupportMessageStatus>("aberto");
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);

  const messagesQuery = useQuery<SupportMessage[]>({
    queryKey: ["support-messages"],
    queryFn: async () => {
      const { data } = await api.get<SupportMessage[]>("/api/support/messages");
      return Array.isArray(data) ? data : [];
    },
    staleTime: 0,
    refetchInterval: 20000,
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: SupportMessageStatus }) => {
      await api.patch(`/api/support/messages/${id}/status`, { status });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["support-messages"] }),
    onError: () => addToast("Não foi possível atualizar. Tente novamente.", "error"),
  });

  const messages = messagesQuery.data ?? [];
  const visible = filter === "todas" ? messages : messages.filter((m) => m.status === filter);
  const abertasCount = messages.filter((m) => m.status === "aberto").length;
  const openTicket = messages.find((m) => m._id === openTicketId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex w-fit gap-1 rounded-xl bg-bg-muted p-1">
        {(
          [
            { key: "aberto" as const, label: `Abertas${abertasCount > 0 ? ` (${abertasCount})` : ""}` },
            { key: "lido" as const, label: "Lidas" },
            { key: "todas" as const, label: "Todas" },
          ]
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setFilter(t.key)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold transition",
              filter === t.key ? "bg-accent-lime text-black" : "text-white hover:bg-bg-overlay",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {messagesQuery.isLoading ? (
        <div className="flex items-center justify-center rounded-2xl bg-bg-card p-10 text-text-secondary">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl bg-bg-card p-10 text-center text-text-secondary">
          Nenhuma mensagem por aqui.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((m) => {
            const cfg = tipoConfig[m.tipo];
            const Icon = cfg.icon;
            const isLido = m.status === "lido";
            return (
              <button
                key={m._id}
                type="button"
                onClick={() => setOpenTicketId(m._id)}
                className="flex w-full items-center gap-3 rounded-2xl border border-bg-muted bg-bg-card p-4 text-left transition hover:border-accent-lime/40"
              >
                <Icon className={cn("h-4 w-4 shrink-0", cfg.color)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{m.titulo}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                    <span className={cn("font-semibold", cfg.color)}>{cfg.label}</span>
                    <span className="text-text-muted">{formatDisplayDate(m.createdAt)}</span>
                    <span className="text-text-muted">· {m.userEmail}</span>
                  </div>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1 text-xs font-semibold",
                    isLido ? "bg-bg-muted text-text-secondary" : "bg-accent-lime/15 text-accent-lime",
                  )}
                >
                  {isLido ? "Lida" : "Aberta"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {openTicket && (
        <SupportThreadDrawer
          open
          onClose={() => setOpenTicketId(null)}
          messageId={openTicket._id}
          viewerRole="admin"
          invalidateListKey={["support-messages"]}
          titulo={openTicket.titulo}
          tipoLabel={tipoConfig[openTicket.tipo].label}
          tipoIcon={tipoConfig[openTicket.tipo].icon}
          tipoColor={tipoConfig[openTicket.tipo].color}
          createdAt={openTicket.createdAt}
          mensagem={openTicket.mensagem}
          userEmail={openTicket.userEmail}
          headerActions={
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  statusMutation.mutate({ id: openTicket._id, status: openTicket.status === "lido" ? "aberto" : "lido" })
                }
                disabled={statusMutation.isPending}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold transition",
                  openTicket.status === "lido"
                    ? "bg-bg-muted text-text-secondary hover:bg-bg-overlay"
                    : "bg-accent-lime/15 text-accent-lime hover:bg-accent-lime/25",
                )}
              >
                {openTicket.status === "lido" ? "Reabrir" : "Marcar como lida"}
              </button>
              <a
                href={`mailto:${openTicket.userEmail}?subject=${encodeURIComponent("Re: sua mensagem no MeuGasto")}`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-lime hover:opacity-80"
              >
                <Mail className="h-3.5 w-3.5" /> Responder por email
              </a>
            </div>
          }
        />
      )}
    </div>
  );
}

function planLabel(u: AdminUser): string | null {
  if (u.isLegacyFree) return "Acesso gratuito liberado";
  if (!u.plan) return null;
  const nomePlano = u.plan === "basico" ? "Plano Básico" : u.plan;
  const ciclo = u.billingCycle === "annual" ? "Anual" : u.billingCycle === "monthly" ? "Mensal" : null;
  return ciclo ? `${nomePlano} · ${ciclo}` : nomePlano;
}

function expiryLine(u: AdminUser): string | null {
  if (u.status === "ativo" && u.subscriptionExpiresAt) return `Renova em ${formatDisplayDate(u.subscriptionExpiresAt)}`;
  if (u.status === "assinatura_expirada" && u.subscriptionExpiresAt) return `Expirou em ${formatDisplayDate(u.subscriptionExpiresAt)}`;
  if (u.status === "em_teste" && u.trialEndsAt) return `Teste até ${formatDisplayDate(u.trialEndsAt)}`;
  if (u.status === "teste_expirado" && u.trialEndsAt) return `Teste expirou em ${formatDisplayDate(u.trialEndsAt)}`;
  return null;
}

function AdminUsersTab() {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"todos" | "com_acesso" | "sem_acesso">("todos");

  const usersQuery = useQuery<AdminUser[]>({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data } = await api.get<AdminUser[]>("/api/admin/users");
      return Array.isArray(data) ? data : [];
    },
  });

  const freeAccessMutation = useMutation({
    mutationFn: async ({ id, isLegacyFree }: { id: string; isLegacyFree: boolean }) => {
      await api.patch(`/api/admin/users/${id}/free-access`, { isLegacyFree });
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      addToast(vars.isLegacyFree ? "Acesso gratuito liberado." : "Acesso gratuito revogado.", "success");
    },
    onError: () => addToast("Não foi possível atualizar o usuário. Tente novamente.", "error"),
  });

  const trialMutation = useMutation({
    mutationFn: async ({ id, days }: { id: string; days: number }) => {
      await api.patch(`/api/admin/users/${id}/trial`, { days });
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      addToast(`Período de teste de ${vars.days} dias definido.`, "success");
    },
    onError: () => addToast("Não foi possível definir o período de teste. Tente novamente.", "error"),
  });

  const users = usersQuery.data ?? [];

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((u) => {
      if (filter === "com_acesso" && !u.hasAccess) return false;
      if (filter === "sem_acesso" && u.hasAccess) return false;
      if (term && !u.email.toLowerCase().includes(term) && !(u.name ?? "").toLowerCase().includes(term)) return false;
      return true;
    });
  }, [users, search, filter]);

  const comAcessoCount = users.filter((u) => u.hasAccess).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex w-fit gap-1 rounded-xl bg-bg-muted p-1">
          {(
            [
              { key: "todos" as const, label: `Todos (${users.length})` },
              { key: "com_acesso" as const, label: `Com acesso (${comAcessoCount})` },
              { key: "sem_acesso" as const, label: `Sem acesso (${users.length - comAcessoCount})` },
            ]
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilter(t.key)}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-semibold transition",
                filter === t.key ? "bg-accent-lime text-black" : "text-white hover:bg-bg-overlay",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por email ou nome"
            className="w-full rounded-xl border border-bg-muted bg-bg-card py-2 pl-9 pr-3 text-sm text-white placeholder:text-text-muted focus:border-accent-lime focus:outline-none"
          />
        </div>
      </div>

      {usersQuery.isLoading ? (
        <div className="flex items-center justify-center rounded-2xl bg-bg-card p-10 text-text-secondary">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl bg-bg-card p-10 text-center text-text-secondary">
          <Users className="mx-auto mb-2 h-6 w-6 text-text-muted" />
          Nenhum usuário encontrado.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((u) => (
            <AdminUserCard
              key={u._id}
              user={u}
              onToggleFreeAccess={() => freeAccessMutation.mutate({ id: u._id, isLegacyFree: !u.isLegacyFree })}
              freeAccessPending={freeAccessMutation.isPending}
              onSetTrial={(days) => trialMutation.mutate({ id: u._id, days })}
              trialPending={trialMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AdminUserCard({
  user: u,
  onToggleFreeAccess,
  freeAccessPending,
  onSetTrial,
  trialPending,
}: {
  user: AdminUser;
  onToggleFreeAccess: () => void;
  freeAccessPending: boolean;
  onSetTrial: (days: number) => void;
  trialPending: boolean;
}) {
  const [days, setDays] = useState(15);
  const cfg = statusConfig[u.status];
  const plano = planLabel(u);
  const expiry = expiryLine(u);

  return (
    <div className="rounded-2xl border border-bg-muted bg-bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{u.name || u.email}</p>
          {u.name && <p className="text-xs text-text-muted">{u.email}</p>}
        </div>
        <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", cfg.className)}>
          {cfg.label}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
        <span>Cadastro em {formatDisplayDate(u.createdAt)}</span>
        {plano && <span>{plano}</span>}
        {expiry && <span>{expiry}</span>}
        {!u.emailVerified && <span className="text-accent-yellow">Email não verificado</span>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggleFreeAccess}
          disabled={freeAccessPending}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition",
            u.isLegacyFree
              ? "bg-bg-muted text-text-secondary hover:bg-bg-overlay"
              : "bg-accent-lime/15 text-accent-lime hover:bg-accent-lime/25",
          )}
        >
          <Gift className="h-3.5 w-3.5" />
          {u.isLegacyFree ? "Revogar acesso gratuito" : "Liberar acesso gratuito"}
        </button>

        <div className="inline-flex items-center gap-1.5 rounded-full bg-bg-muted pl-3 pr-1 py-1">
          <CalendarClock className="h-3.5 w-3.5 text-text-secondary" />
          <input
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
            className="w-12 bg-transparent text-xs font-semibold text-white focus:outline-none"
            aria-label="Dias de teste"
          />
          <span className="text-xs text-text-secondary">dias</span>
          <button
            type="button"
            onClick={() => onSetTrial(days)}
            disabled={trialPending}
            className="rounded-full bg-bg-overlay px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-accent-lime hover:text-black"
          >
            Definir teste
          </button>
        </div>
      </div>
    </div>
  );
}
