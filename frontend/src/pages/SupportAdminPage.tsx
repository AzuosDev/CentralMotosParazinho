import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Bug, CalendarClock, CheckCircle2, Gift, KeyRound, Lightbulb, Loader2, Mail, Search, Shield, UserPlus, Users, XCircle } from "lucide-react";
import { api } from "../lib/api";
import { cn } from "../lib/utils";
import { formatDisplayDate } from "../lib/finance";
import { PLANO_NOME } from "../lib/plano";
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
  isAdmin: boolean;
  isRootAdmin: boolean;
  bloqueado: boolean;
};

type AcessoInicial = "teste" | "gratis" | "pagante";

function apiErrorMessage(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(msg) ? msg[0] : msg ?? fallback;
}

const tipoConfig: Record<SupportMessageTipo, { label: string; icon: typeof Bug; color: string }> = {
  bug: { label: "Erro", icon: Bug, color: "text-accent-red" },
  sugestao: { label: "Sugestão", icon: Lightbulb, color: "text-accent-yellow" },
};

const statusConfig: Record<AdminUserStatus, { label: string; className: string }> = {
  gratis_liberado: { label: "Grátis liberado", className: "bg-accent-brand/15 text-accent-brand" },
  ativo: { label: "Ativo", className: "bg-accent-brand/15 text-accent-brand" },
  em_teste: { label: "Em teste", className: "bg-accent-yellow/15 text-accent-yellow" },
  assinatura_expirada: { label: "Expirado", className: "bg-accent-red/15 text-accent-red" },
  teste_expirado: { label: "Teste expirado", className: "bg-accent-red/15 text-accent-red" },
  cancelado: { label: "Cancelado", className: "bg-bg-muted text-text-secondary" },
  sem_assinatura: { label: "Sem assinatura", className: "bg-bg-muted text-text-secondary" },
};

export function SupportAdminPage() {
  const [tab, setTab] = useState<"mensagens" | "usuarios" | "pagamentos">("mensagens");

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm text-text-secondary">Admin</p>
        <h1 className="font-sans text-2xl font-bold">Painel Admin</h1>
        <p className="mt-1 max-w-2xl text-sm text-text-secondary">
          Mensagens de suporte enviadas pelo FAQ, gestão de usuários (o cadastro é feito só por aqui) e pagamentos.
        </p>
      </div>

      <div className="flex w-fit gap-1 rounded-xl bg-bg-muted p-1">
        {(
          [
            { key: "mensagens" as const, label: "Mensagens" },
            { key: "usuarios" as const, label: "Usuários" },
            { key: "pagamentos" as const, label: "Pagamentos" },
          ]
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold transition",
              tab === t.key ? "bg-accent-brand text-white" : "text-text-primary hover:bg-bg-overlay",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "mensagens" ? <SupportMessagesTab /> : tab === "usuarios" ? <AdminUsersTab /> : <PagamentosDiagnosticoTab />}
    </section>
  );
}

type DiagnosticoItem = { chave: string; ok: boolean; detalhe: string };

// Testa as chaves do Asaas/Stripe configuradas no servidor contra as APIs reais
// (GET /api/billing/diagnostico) — não mostra os valores das chaves, só se funcionam.
function PagamentosDiagnosticoTab() {
  const diagQuery = useQuery<DiagnosticoItem[]>({
    queryKey: ["billing-diagnostico"],
    queryFn: async () => (await api.get<DiagnosticoItem[]>("/api/billing/diagnostico")).data,
    staleTime: 0,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">Verificação das chaves de pagamento configuradas no servidor.</p>
        <button
          type="button"
          onClick={() => void diagQuery.refetch()}
          disabled={diagQuery.isFetching}
          className="rounded-lg border border-border-default px-3 py-1.5 text-xs font-semibold text-text-primary transition hover:bg-bg-overlay disabled:opacity-50"
        >
          {diagQuery.isFetching ? "Testando..." : "Testar de novo"}
        </button>
      </div>

      {diagQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" /> Testando chaves...
        </div>
      ) : diagQuery.isError ? (
        <p className="text-sm text-accent-red">Não foi possível rodar o diagnóstico.</p>
      ) : (
        <div className="space-y-2">
          {(diagQuery.data ?? []).map((item) => (
            <div key={item.chave} className="flex items-start gap-3 rounded-xl bg-bg-card px-4 py-3">
              {item.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent-brand" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent-red" />
              )}
              <div className="min-w-0">
                <p className="font-mono text-xs font-semibold text-text-primary">{item.chave}</p>
                <p className="break-words text-xs text-text-secondary">{item.detalhe}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
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
              filter === t.key ? "bg-accent-brand text-white" : "text-text-primary hover:bg-bg-overlay",
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
                className="flex w-full items-center gap-3 rounded-2xl border border-bg-muted bg-bg-card p-4 text-left transition hover:border-accent-brand/40"
              >
                <Icon className={cn("h-4 w-4 shrink-0", cfg.color)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text-primary">{m.titulo}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                    <span className={cn("font-semibold", cfg.color)}>{cfg.label}</span>
                    <span className="text-text-muted">{formatDisplayDate(m.createdAt)}</span>
                    <span className="text-text-muted">· {m.userEmail}</span>
                  </div>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1 text-xs font-semibold",
                    isLido ? "bg-bg-muted text-text-secondary" : "bg-accent-brand/15 text-accent-brand",
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
                    : "bg-accent-brand/15 text-accent-brand hover:bg-accent-brand/25",
                )}
              >
                {openTicket.status === "lido" ? "Reabrir" : "Marcar como lida"}
              </button>
              <a
                href={`mailto:${openTicket.userEmail}?subject=${encodeURIComponent("Re: sua mensagem no sistema da Central Motos")}`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-brand hover:opacity-80"
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
  // "basico" é o nome antigo do mesmo plano, antes de virar Plano Empresarial.
  const nomePlano = u.plan === "empresarial" || u.plan === "basico" ? PLANO_NOME : u.plan;
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

  const [criando, setCriando] = useState(false);

  const invalidateWithToast = (msg: string) => {
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    addToast(msg, "success");
  };

  const bloqueioMutation = useMutation({
    mutationFn: async ({ id, bloqueado }: { id: string; bloqueado: boolean }) => {
      await api.patch(`/api/admin/users/${id}/bloqueio`, { bloqueado });
    },
    onSuccess: (_d, vars) => invalidateWithToast(vars.bloqueado ? "Usuário bloqueado." : "Usuário desbloqueado."),
    onError: (err) => addToast(apiErrorMessage(err, "Não foi possível atualizar o usuário."), "error"),
  });

  const adminMutation = useMutation({
    mutationFn: async ({ id, isAdmin }: { id: string; isAdmin: boolean }) => {
      await api.patch(`/api/admin/users/${id}/admin`, { isAdmin });
    },
    onSuccess: (_d, vars) => invalidateWithToast(vars.isAdmin ? "Usuário agora é admin." : "Permissão de admin removida."),
    onError: (err) => addToast(apiErrorMessage(err, "Não foi possível atualizar o usuário."), "error"),
  });

  const senhaMutation = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => {
      await api.patch(`/api/admin/users/${id}/senha`, { password });
    },
    onSuccess: () => addToast("Senha redefinida. Repasse a nova senha ao usuário.", "success"),
    onError: (err) => addToast(apiErrorMessage(err, "Não foi possível redefinir a senha."), "error"),
  });

  const acaoPending = bloqueioMutation.isPending || adminMutation.isPending || senhaMutation.isPending;

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
      {criando ? (
        <NovoUsuarioForm
          onClose={() => setCriando(false)}
          onCreated={(email) => {
            setCriando(false);
            invalidateWithToast(`Conta ${email} criada. Repasse o email e a senha ao usuário.`);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setCriando(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-accent-brand px-4 py-2.5 text-sm font-bold text-white transition hover:bg-accent-brand-hover"
        >
          <UserPlus className="h-4 w-4" /> Novo usuário
        </button>
      )}

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
                filter === t.key ? "bg-accent-brand text-white" : "text-text-primary hover:bg-bg-overlay",
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
            className="w-full rounded-xl border border-bg-muted bg-bg-card py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-brand focus:outline-none"
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
              onToggleBloqueio={() => bloqueioMutation.mutate({ id: u._id, bloqueado: !u.bloqueado })}
              onToggleAdmin={() => adminMutation.mutate({ id: u._id, isAdmin: !u.isAdmin })}
              onResetSenha={(password) => senhaMutation.mutate({ id: u._id, password })}
              acaoPending={acaoPending}
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
  onToggleBloqueio,
  onToggleAdmin,
  onResetSenha,
  acaoPending,
}: {
  user: AdminUser;
  onToggleFreeAccess: () => void;
  freeAccessPending: boolean;
  onSetTrial: (days: number) => void;
  trialPending: boolean;
  onToggleBloqueio: () => void;
  onToggleAdmin: () => void;
  onResetSenha: (password: string) => void;
  acaoPending: boolean;
}) {
  const [days, setDays] = useState(15);
  const [novaSenha, setNovaSenha] = useState<string | null>(null);
  const cfg = statusConfig[u.status];
  const plano = planLabel(u);
  const expiry = expiryLine(u);

  return (
    <div className="rounded-2xl border border-bg-muted bg-bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text-primary">{u.name || u.email}</p>
          {u.name && <p className="text-xs text-text-muted">{u.email}</p>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {u.isAdmin && (
            <span className="rounded-full bg-accent-brand/15 px-3 py-1 text-xs font-semibold text-accent-brand">
              {u.isRootAdmin ? "Admin principal" : "Admin"}
            </span>
          )}
          {u.bloqueado && (
            <span className="rounded-full bg-accent-red/15 px-3 py-1 text-xs font-semibold text-accent-red">Bloqueado</span>
          )}
          <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", cfg.className)}>
            {cfg.label}
          </span>
        </div>
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
              : "bg-accent-brand/15 text-accent-brand hover:bg-accent-brand/25",
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
            className="w-12 bg-transparent text-xs font-semibold text-text-primary focus:outline-none"
            aria-label="Dias de teste"
          />
          <span className="text-xs text-text-secondary">dias</span>
          <button
            type="button"
            onClick={() => onSetTrial(days)}
            disabled={trialPending}
            className="rounded-full bg-bg-overlay px-2.5 py-1 text-xs font-semibold text-text-primary transition hover:bg-accent-brand hover:text-white"
          >
            Definir teste
          </button>
        </div>
      </div>

      {!u.isRootAdmin && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleBloqueio}
            disabled={acaoPending}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition disabled:opacity-50",
              u.bloqueado
                ? "bg-accent-brand/15 text-accent-brand hover:bg-accent-brand/25"
                : "bg-accent-red/15 text-accent-red hover:bg-accent-red/25",
            )}
          >
            <Ban className="h-3.5 w-3.5" />
            {u.bloqueado ? "Desbloquear" : "Bloquear"}
          </button>
          <button
            type="button"
            onClick={onToggleAdmin}
            disabled={acaoPending}
            className="inline-flex items-center gap-1.5 rounded-full bg-bg-muted px-3 py-1 text-xs font-semibold text-text-secondary transition hover:bg-bg-overlay disabled:opacity-50"
          >
            <Shield className="h-3.5 w-3.5" />
            {u.isAdmin ? "Remover admin" : "Tornar admin"}
          </button>
          {novaSenha === null ? (
            <button
              type="button"
              onClick={() => setNovaSenha("")}
              className="inline-flex items-center gap-1.5 rounded-full bg-bg-muted px-3 py-1 text-xs font-semibold text-text-secondary transition hover:bg-bg-overlay"
            >
              <KeyRound className="h-3.5 w-3.5" /> Redefinir senha
            </button>
          ) : (
            <form
              className="inline-flex items-center gap-1.5 rounded-full bg-bg-muted py-1 pl-3 pr-1"
              onSubmit={(e) => {
                e.preventDefault();
                onResetSenha(novaSenha);
                setNovaSenha(null);
              }}
            >
              <KeyRound className="h-3.5 w-3.5 text-text-secondary" />
              <input
                type="text"
                autoFocus
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                placeholder="Nova senha"
                aria-label="Nova senha"
                className="w-28 bg-transparent text-xs text-text-primary placeholder:text-text-muted focus:outline-none"
              />
              <button
                type="submit"
                disabled={acaoPending || novaSenha.length < 8}
                className="rounded-full bg-bg-overlay px-2.5 py-1 text-xs font-semibold text-text-primary transition hover:bg-accent-brand hover:text-white disabled:opacity-50"
              >
                Salvar
              </button>
              <button
                type="button"
                onClick={() => setNovaSenha(null)}
                className="px-1.5 text-xs text-text-muted hover:text-text-primary"
              >
                ✕
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

// Formulário de criação de conta — único jeito de entrar no sistema (sem cadastro público).
// O admin define a senha inicial e repassa ao usuário, que pode trocá-la no perfil.
function NovoUsuarioForm({ onClose, onCreated }: { onClose: () => void; onCreated: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [acesso, setAcesso] = useState<AcessoInicial>("teste");
  const [diasTeste, setDiasTeste] = useState(15);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async () => {
      await api.post("/api/admin/users", {
        email: email.trim(),
        ...(name.trim() ? { name: name.trim() } : {}),
        password,
        acesso,
        ...(acesso === "teste" ? { diasTeste } : {}),
        isAdmin,
      });
    },
    onSuccess: () => onCreated(email.trim().toLowerCase()),
    onError: (err) => setError(apiErrorMessage(err, "Não foi possível criar a conta.")),
  });

  const inputClass =
    "w-full rounded-xl border border-bg-muted bg-bg-muted px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-brand focus:outline-none";

  const acessoOpcoes: { key: AcessoInicial; label: string; hint: string }[] = [
    { key: "teste", label: "Período de teste", hint: "Acesso por alguns dias, depois paga." },
    { key: "gratis", label: "Gratuito", hint: "Acesso liberado sem pagamento." },
    { key: "pagante", label: "Pagante", hint: "Só entra depois de pagar." },
  ];

  return (
    <form
      className="space-y-4 rounded-2xl border border-bg-muted bg-bg-card p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        createMutation.mutate();
      }}
    >
      <div className="flex items-center gap-2">
        <UserPlus className="h-5 w-5 text-accent-brand" />
        <h2 className="font-semibold text-text-primary">Novo usuário</h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <input className={inputClass} type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={inputClass} type="text" placeholder="Nome (opcional)" value={name} onChange={(e) => setName(e.target.value)} />
        <input
          className={cn(inputClass, "sm:col-span-2")}
          type="text"
          required
          minLength={8}
          placeholder="Senha inicial (8+ caracteres, 1 maiúscula e 1 número)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {acessoOpcoes.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => setAcesso(o.key)}
            className={cn(
              "rounded-xl border p-3 text-left transition-colors",
              acesso === o.key ? "border-accent-brand bg-accent-brand/10" : "border-bg-muted bg-bg-muted hover:bg-bg-overlay",
            )}
          >
            <p className="text-sm font-semibold text-text-primary">{o.label}</p>
            <p className="text-xs text-text-secondary">{o.hint}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {acesso === "teste" && (
          <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
            <CalendarClock className="h-4 w-4" />
            <input
              type="number"
              min={1}
              max={365}
              value={diasTeste}
              onChange={(e) => setDiasTeste(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
              className="w-16 rounded-lg border border-bg-muted bg-bg-muted px-2 py-1 text-sm text-text-primary focus:outline-none"
            />
            dias de teste
          </label>
        )}
        <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
          Administrador
        </label>
      </div>

      {error && <p className="text-sm text-accent-red">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-accent-brand px-4 py-2.5 text-sm font-bold text-white transition hover:bg-accent-brand-hover disabled:opacity-50"
        >
          {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Criar conta
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-text-secondary transition hover:bg-bg-overlay"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
