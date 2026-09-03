import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, CreditCard, Inbox, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";

import { api } from "../lib/api";

import { formatCurrency, formatDisplayDate, localDateString, utcDateStr } from "../lib/finance";
import { cn } from "../lib/utils";
import { useToast } from "../components/ui/Toast";
import { ConfirmDeleteModal } from "../components/modals/ConfirmDeleteModal";
import { PayBillModal } from "../components/modals/PayBillModal";
import { AccountModal } from "../components/modals/AccountModal";
import { VincularCartaoModal } from "../components/modals/VincularCartaoModal";
import { VincularRecorrenteModal } from "../components/modals/VincularRecorrenteModal";
import type { PendingAccount } from "../types/api";

type AccountType = "PAGAR" | "RECEBER";

type PendingItem = {
  isParcelada?: boolean;
  isRecorrente?: boolean;
  categoria?: string;
  formatoPagamento?: string;
  carteiraId?: string;
  tipo?: AccountType;
  parcelas?: { totalParcelas?: number; valorParcela?: number; parcelasPagas?: number[]; dataInicio?: string; dataFim?: string; };
  numeroParcela?: number;
  grupoParceladoId?: string;
  recorrencia?: { periodoRecorrencia?: string; dataProxima?: string; };
  recorrenciaTemplateId?: string;
  isVirtual?: boolean;
  templateId?: string;
  id: string;
  title: string;
  value: number;
  dueDate: string;
  paid: boolean;
  description?: string;
  // Presente quando esta conta É a fatura de um cartão — backend bloqueia o fluxo
  // genérico de pagar/editar/excluir para esses itens, então a UI leva direto ao
  // detalhe do cartão em vez de tentar as ações normais.
  faturaId?: string;
};



function normalizeAccounts(data: unknown): PendingItem[] {
  if (Array.isArray(data)) {
    return data.map((item) => ({
      id: item.isVirtual ? (item.templateId ?? item._id ?? item.id) : (item._id ?? item.id),
      title: item.title,
      value: item.value,
      dueDate: item.dueDate,
      paid: item.paid,
      description: item.description,
      isParcelada: item.isParcelada,
      isRecorrente: item.isRecorrente,
      categoria: item.categoria,
      formatoPagamento: item.formatoPagamento,
      carteiraId: item.carteiraId,
      tipo: item.tipo,
      parcelas: item.parcelas ? {
        totalParcelas: item.parcelas.totalParcelas,
        valorParcela: item.parcelas.valorParcela,
        parcelasPagas: item.parcelas.parcelasPagas,
        dataInicio: item.parcelas.dataInicio,
        dataFim: item.parcelas.dataFim,
      } : undefined,
      numeroParcela: item.numeroParcela,
      grupoParceladoId: item.grupoParceladoId,
      recorrencia: item.recorrencia ? {
        periodoRecorrencia: item.recorrencia.periodoRecorrencia,
        dataProxima: item.recorrencia.dataProxima,
      } : undefined,
      recorrenciaTemplateId: item.recorrenciaTemplateId,
      isVirtual: item.isVirtual,
      templateId: item.templateId,
      faturaId: item.faturaId,
    }));
  }

  if (
    data &&
    typeof data === "object" &&
    "items" in data &&
    Array.isArray((data as { items?: unknown }).items)
  ) {
    return normalizeAccounts((data as { items: unknown[] }).items);
  }

  return [];
}

function statusLabel(item: PendingItem) {
  const due = utcDateStr(item.dueDate);
  const today = localDateString();
  const paidLabel = item.tipo === "RECEBER" ? "Recebido" : "Pago";

  if (item.paid)
    return { label: paidLabel, className: "bg-accent-lime/10 text-accent-lime" };
  if (due < today)
    return { label: "Vencida", className: "bg-accent-red/10 text-accent-red" };
  if (due === today)
    return { label: "Vence hoje", className: "bg-accent-yellow/10 text-accent-yellow" };

  return { label: "Pendente", className: "bg-bg-muted text-text-secondary" };
}

type PendingDisplayItem = PendingItem & {
  installmentLabel?: string;
};

const monthOptions = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

export function ContasPage() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [creating, setCreating] = useState(false);
  const [activeTab, setActiveTab] = useState<AccountType>("PAGAR");
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get("action") === "create") {
      setCreating(true);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("action");
        return next;
      }, { replace: true });
    }
  }, []);

  const [payBillItem, setPayBillItem] = useState<PendingDisplayItem | null>(null);
  const [vincularCartaoItem, setVincularCartaoItem] = useState<PendingDisplayItem | null>(null);
  const [vincularRecorrenteItem, setVincularRecorrenteItem] = useState<PendingDisplayItem | null>(null);
  const [unmarkTarget, setUnmarkTarget] = useState<PendingDisplayItem | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [parcelStatusOpen, setParcelStatusOpen] = useState(false);
  const [selectedParcelItem, setSelectedParcelItem] = useState<PendingDisplayItem | null>(null);
  const [selectedDelete, setSelectedDelete] = useState<{
    id: string;
    title: string;
    isParcel?: boolean;
    parcelLabel?: string;
    grupoParceladoId?: string;
    isVirtual?: boolean;
    isRecorrente?: boolean;
    templateId?: string;
    month?: number;
    year?: number;
  } | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<PendingItem | null>(
    null,
  );

  const currentYear = new Date().getFullYear();
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const years = useMemo(() => {
    const now = new Date().getFullYear();
    return Array.from({ length: 11 }, (_, i) => now + 5 - i);
  }, []);

  const groupQuery = useQuery<PendingItem[]>({
    queryKey: ["accounts-group", selectedParcelItem?.grupoParceladoId],
    queryFn: async () => {
      const { data } = await api.get<unknown[]>(`/api/accounts/group/${selectedParcelItem!.grupoParceladoId}`);
      return normalizeAccounts(data);
    },
    enabled: parcelStatusOpen && !!selectedParcelItem?.grupoParceladoId,
  });

  const pagarQuery = useQuery<PendingItem[]>({
    queryKey: ["accounts", "PAGAR", selectedMonth, selectedYear],
    queryFn: async () => {
      const { data } = await api.get<PendingAccount[]>(
        `/api/accounts?tipo=PAGAR&month=${selectedMonth}&year=${selectedYear}`,
      );
      return normalizeAccounts(data);
    },
  });

  const receberQuery = useQuery<PendingItem[]>({
    queryKey: ["accounts", "RECEBER", selectedMonth, selectedYear],
    queryFn: async () => {
      const { data } = await api.get<PendingAccount[]>(
        `/api/accounts?tipo=RECEBER&month=${selectedMonth}&year=${selectedYear}`,
      );
      return normalizeAccounts(data);
    },
  });

  const activeQuery = activeTab === "PAGAR" ? pagarQuery : receberQuery;
  const items = useMemo(() => activeQuery.data ?? [], [activeQuery.data]);

  const pendentes = useMemo(
    () => items.filter((item) => !item.paid).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [items],
  );
  const pagas = useMemo(
    () => items.filter((item) => item.paid).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [items],
  );

  function breakdown(list: PendingItem[]) {
    const total = list.reduce((sum, item) => sum + item.value, 0);
    const pago = list.filter((item) => item.paid).reduce((sum, item) => sum + item.value, 0);
    return { total, pago, pendente: total - pago };
  }

  const pagarBreakdown = useMemo(() => breakdown(pagarQuery.data ?? []), [pagarQuery.data]);
  const receberBreakdown = useMemo(() => breakdown(receberQuery.data ?? []), [receberQuery.data]);

  const markPaid = useMutation({
    mutationFn: async ({
      id,
      isVirtual,
      numeroParcela,
      month,
      year,
      carteiraId,
    }: {
      id: string;
      isVirtual?: boolean;
      numeroParcela?: number;
      month: number;
      year: number;
      carteiraId?: string;
    }) => {
      if (isVirtual) {
        return api.post(`/api/accounts/${id}/pay-month`, { month, year, carteiraId });
      }
      return api.patch<PendingAccount>(`/api/accounts/${id}`, { paid: true, numeroParcela, carteiraId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["accounts-group"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      addToast(
        activeTab === "RECEBER" ? "Conta marcada como recebida com sucesso." : "Conta marcada como paga com sucesso.",
        "success",
      );
      setParcelStatusOpen(false);
      setSelectedParcelItem(null);
      setPayBillItem(null);
    },
    onError: () => addToast("Não foi possível atualizar a conta.", "error"),
  });

  const unmarkPaid = useMutation({
    mutationFn: async (id: string) =>
      api.patch(`/api/accounts/${id}`, { paid: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["accounts-group"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      addToast(
        activeTab === "RECEBER" ? "Recebimento desmarcado com sucesso." : "Pagamento desmarcado com sucesso.",
        "success",
      );
      setUnmarkTarget(null);
    },
    onError: () => addToast("Não foi possível desmarcar a conta.", "error"),
  });

  const deletePending = useMutation({
    mutationFn: async (id: string) => api.delete(`/api/accounts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      addToast("Conta apagada com sucesso.", "success");
    },
    onError: () => addToast("Não foi possível apagar a conta.", "error"),
  });

  const deleteRecurringMonth = useMutation({
    mutationFn: async ({ templateId, month, year }: { templateId: string; month: number; year: number }) =>
      api.delete(`/api/accounts/${templateId}/month`, { params: { month, year } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      addToast("Mês excluído com sucesso.", "success");
    },
    onError: () => addToast("Não foi possível excluir.", "error"),
  });

  const deleteGroupPending = useMutation({
    mutationFn: async (grupoParceladoId: string) => api.delete(`/api/accounts/group/${grupoParceladoId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      addToast("Conta apagada com sucesso.", "success");
    },
    onError: () => addToast("Não foi possível apagar a conta.", "error"),
  });
  function abrirModalEdicao(item: PendingItem) {
    setSelectedAccount(item);
    setIsEditModalOpen(true);
  }

  function fecharModal() {
    setIsEditModalOpen(false);
    setSelectedAccount(null);
  }


  function abrirParcelStatus(item: PendingDisplayItem) {
    setSelectedParcelItem(item);
    setParcelStatusOpen(true);
  }

  function confirmarDeletar(item: PendingItem) {
    const isParcel = !!item.grupoParceladoId && !!item.numeroParcela;
    const isRecorrente = !!(item.isRecorrente || item.isVirtual || item.recorrenciaTemplateId);
    const templateId = item.templateId ?? item.recorrenciaTemplateId ?? (item.isRecorrente ? item.id : undefined);
    setSelectedDelete({
      id: isRecorrente ? (templateId ?? item.id) : item.id,
      title: item.title,
      isParcel: isRecorrente ? false : isParcel,
      parcelLabel: isParcel && item.numeroParcela && item.parcelas?.totalParcelas ? `Parcela ${item.numeroParcela}/${item.parcelas.totalParcelas}` : undefined,
      grupoParceladoId: item.grupoParceladoId,
      isVirtual: item.isVirtual,
      isRecorrente,
      templateId,
      month: selectedMonth,
      year: selectedYear,
    });
    setDeleteModalOpen(true);
  }

  function renderAccountCard(item: PendingDisplayItem) {
    const status = statusLabel(item);
    const dueDateStr = utcDateStr(item.dueDate);
    const todayStr = localDateString();
    const installmentLabel = item.installmentLabel ?? (item.numeroParcela && item.parcelas?.totalParcelas ? `parcela ${item.numeroParcela}/${item.parcelas.totalParcelas}` : undefined);

    return (
      <article
        key={`${item.id}-${item.dueDate}`}
        className={cn(
          "rounded-2xl border bg-bg-card p-4 transition",
          item.paid && "opacity-60",
          dueDateStr < todayStr && !item.paid ? "border-accent-red/50" : "border-bg-muted",
          dueDateStr === todayStr && !item.paid ? "border-accent-yellow/50" : "",
        )}
      >
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-bg-muted p-3">
            <Clock className="h-5 w-5 text-accent-lime" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-white">{item.title}</h2>
              {installmentLabel && (
                <span className="rounded-full bg-accent-lime/10 px-2.5 py-1 text-[11px] font-semibold text-accent-lime">{installmentLabel}</span>
              )}
              {(item.isRecorrente || item.isVirtual || item.recorrenciaTemplateId) && (
                <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-[11px] font-semibold text-blue-400">Recorrente</span>
              )}
              {item.faturaId && (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent-lime/10 px-2.5 py-1 text-[11px] font-semibold text-accent-lime">
                  <CreditCard className="h-3 w-3" />
                  Fatura de cartão
                </span>
              )}
              <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", status.className)}>{status.label}</span>
            </div>
            <p className="mt-1 text-sm text-text-secondary">{item.description ?? "Conta"}</p>
            <p className="mt-2 text-xs text-text-muted">Vence em {formatDisplayDate(item.dueDate)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-white">{formatCurrency(item.value)}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {item.faturaId ? (
            <Link
              to={`/cartoes/fatura/${item.faturaId}`}
              className="inline-flex items-center gap-2 rounded-xl bg-accent-lime/10 px-3 py-2 text-sm font-semibold text-accent-lime hover:bg-accent-lime/20"
            >
              <CreditCard className="h-4 w-4" />
              Ver fatura do cartão
            </Link>
          ) : (
            <>
              {!item.paid && (
                <button
                  type="button"
                  onClick={() => setPayBillItem(item)}
                  className="inline-flex items-center gap-2 rounded-xl bg-accent-lime/10 px-3 py-2 text-sm font-semibold text-accent-lime hover:bg-accent-lime/20"
                >
                  <Check className="h-4 w-4" />
                  {activeTab === "RECEBER" ? "Marcar como recebido" : "Marcar como pago"}
                </button>
              )}
              {item.paid && (
                <button
                  type="button"
                  onClick={() => setUnmarkTarget(item)}
                  disabled={unmarkPaid.isPending}
                  className="inline-flex items-center gap-2 rounded-xl bg-bg-muted px-3 py-2 text-sm font-semibold text-text-secondary hover:text-white transition"
                >
                  <RotateCcw className="h-4 w-4" />
                  Desmarcar
                </button>
              )}
              {item.isParcelada && (
                <button
                  type="button"
                  onClick={() => abrirParcelStatus(item)}
                  className="rounded-xl bg-bg-muted px-3 py-2 text-sm text-white"
                >
                  Parcelas
                </button>
              )}
              {activeTab === "PAGAR" && !item.paid && !item.isRecorrente && !item.isVirtual && (
                <button
                  type="button"
                  onClick={() => setVincularCartaoItem(item)}
                  className="inline-flex items-center gap-2 rounded-xl bg-bg-muted px-3 py-2 text-sm text-white"
                  title="Converter esta conta em parcelamento de um cartão"
                >
                  <CreditCard className="h-4 w-4" />
                  Vincular a um cartão
                </button>
              )}
              {activeTab === "PAGAR" && !item.paid && (item.isRecorrente || item.isVirtual || item.recorrenciaTemplateId) && (
                <button
                  type="button"
                  onClick={() => setVincularRecorrenteItem(item)}
                  className="inline-flex items-center gap-2 rounded-xl bg-bg-muted px-3 py-2 text-sm text-white"
                  title="Cobrar esta assinatura automaticamente num cartão, todo mês"
                >
                  <CreditCard className="h-4 w-4" />
                  Vincular a um cartão
                </button>
              )}
              <button
                type="button"
                onClick={() => abrirModalEdicao(item)}
                className="rounded-xl bg-bg-muted px-3 py-2 text-sm text-white"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => confirmarDeletar(item)}
                disabled={deletePending.isPending}
                className="rounded-xl bg-bg-muted px-3 py-2 text-sm text-accent-red"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </article>
    );
  }

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-text-secondary">Pagamentos e recebimentos</p>
          <h1 className="text-3xl font-bold">Contas</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 rounded-xl bg-accent-lime px-4 py-3 text-sm font-bold text-black"
          >
            <Plus className="h-4 w-4" />
            Nova
          </button>
          <select
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(Number(event.target.value))}
            className="rounded-xl border border-bg-muted bg-bg-card px-4 py-3 text-sm text-white outline-none transition focus:border-accent-lime"
          >
            {monthOptions.map((label, index) => (
              <option key={label} value={index + 1}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(event) => setSelectedYear(Number(event.target.value))}
            className="rounded-xl border border-bg-muted bg-bg-card px-4 py-3 text-sm text-white outline-none transition focus:border-accent-lime"
          >
            {years.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="flex w-fit gap-1 rounded-xl bg-bg-muted p-1">
        {(["PAGAR", "RECEBER"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold transition",
              activeTab === tab ? "bg-accent-lime text-black" : "text-white hover:bg-bg-overlay",
            )}
          >
            {tab === "PAGAR" ? "Contas a Pagar" : "Contas a Receber"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <article
          className={cn(
            "rounded-2xl border bg-bg-card p-5 transition",
            activeTab === "PAGAR" ? "border-accent-orange/40 ring-1 ring-accent-orange/20" : "border-accent-orange/10 opacity-70",
          )}
        >
          <p className="text-xs uppercase tracking-[0.25em] text-text-muted">
            Total Mês a Pagar
          </p>
          <p className="mt-3 text-3xl font-bold text-accent-orange">
            {formatCurrency(pagarBreakdown.total)}
          </p>
          <div className="mt-4 flex gap-4 text-sm">
            <p>
              <span className="text-text-muted">Pago </span>
              <span className="font-semibold text-accent-lime">{formatCurrency(pagarBreakdown.pago)}</span>
            </p>
            <p>
              <span className="text-text-muted">Pendente </span>
              <span className="font-semibold text-accent-red">{formatCurrency(pagarBreakdown.pendente)}</span>
            </p>
          </div>
        </article>
        <article
          className={cn(
            "rounded-2xl border bg-bg-card p-5 transition",
            activeTab === "RECEBER" ? "border-accent-lime/40 ring-1 ring-accent-lime/20" : "border-accent-lime/10 opacity-70",
          )}
        >
          <p className="text-xs uppercase tracking-[0.25em] text-text-muted">
            Total Mês a Receber
          </p>
          <p className="mt-3 text-3xl font-bold text-accent-lime">
            {formatCurrency(receberBreakdown.total)}
          </p>
          <div className="mt-4 flex gap-4 text-sm">
            <p>
              <span className="text-text-muted">Recebido </span>
              <span className="font-semibold text-accent-lime">{formatCurrency(receberBreakdown.pago)}</span>
            </p>
            <p>
              <span className="text-text-muted">Pendente </span>
              <span className="font-semibold text-accent-red">{formatCurrency(receberBreakdown.pendente)}</span>
            </p>
          </div>
        </article>
      </div>

      {activeQuery.isLoading ? (
        <div className="rounded-2xl bg-bg-card p-5 text-sm text-text-secondary">
          Carregando contas...
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-bg-card p-12 text-center">
          <Inbox className="h-10 w-10 text-text-muted" />
          <p className="text-sm text-text-secondary">
            Nenhum agendamento ou conta cadastrada para este mês.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {pendentes.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Pendentes</h2>
                <span className="text-sm text-text-secondary">{pendentes.length} item(ns)</span>
              </div>
              <div className="space-y-3">{pendentes.map((item) => renderAccountCard(item))}</div>
            </section>
          )}

          {pagas.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">
                  {activeTab === "RECEBER" ? "Recebidas" : "Pagas"}
                </h2>
                <span className="text-sm text-text-secondary">{pagas.length} item(ns)</span>
              </div>
              <div className="space-y-3">{pagas.map((item) => renderAccountCard(item))}</div>
            </section>
          )}
        </div>
      )}

      <AccountModal
        open={creating}
        onClose={() => setCreating(false)}
        defaultType={activeTab}
        onSuccess={() => addToast("Conta adicionada com sucesso.", "success")}
      />

      <AccountModal
        open={isEditModalOpen}
        onClose={fecharModal}
        editAccount={selectedAccount ?? undefined}
        onSuccess={() => addToast("Conta atualizada com sucesso.", "success")}
      />
      {parcelStatusOpen && selectedParcelItem && (() => {
        const liveItem = items.find((i) => i.id === selectedParcelItem.id) ?? selectedParcelItem;
        const grupoItems = groupQuery.data && groupQuery.data.length > 0
          ? groupQuery.data
          : (liveItem.grupoParceladoId
              ? items.filter((i) => i.grupoParceladoId === liveItem.grupoParceladoId)
              : [liveItem]
            ).sort((a, b) => (a.numeroParcela ?? 0) - (b.numeroParcela ?? 0));
        const totalParcelas = liveItem.parcelas?.totalParcelas ?? grupoItems.length;
        const paidCount = grupoItems.filter((i) => i.paid).length;
        const progressPercent = totalParcelas > 0 ? Math.round((paidCount / totalParcelas) * 100) : 0;

        return (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-bg-muted bg-bg-card p-6 space-y-5">
              <div>
                <h2 className="text-lg font-bold text-white">Status das parcelas</h2>
                <p className="mt-1 text-sm text-text-secondary">{liveItem.title}</p>
              </div>
              {groupQuery.isLoading && (
                <div className="flex items-center justify-center gap-2 py-2 text-sm text-text-secondary">
                  <Loader2 className="h-4 w-4 animate-spin text-accent-lime" />
                  Carregando parcelas...
                </div>
              )}

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">Progresso</span>
                  <span className="font-semibold text-accent-lime">{paidCount}/{totalParcelas} pagas</span>
                </div>
                <div className="h-2 w-full rounded-full bg-bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent-lime transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-xs text-text-muted text-right">{progressPercent}% concluído</p>
              </div>

              {grupoItems.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {grupoItems.map((parcel) => (
                    <div
                      key={parcel.id}
                      title={`Parcela ${parcel.numeroParcela} — ${parcel.paid ? "Paga" : "Pendente"}`}
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-semibold",
                        parcel.paid ? "bg-accent-lime/20 text-accent-lime" : "bg-bg-muted text-text-secondary",
                        parcel.id === liveItem.id && "ring-2 ring-accent-lime",
                      )}
                    >
                      {parcel.numeroParcela}
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-xl bg-bg-muted p-4 space-y-3 text-sm">
                {liveItem.numeroParcela && (
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Parcela atual</span>
                    <span className="text-white font-medium">{liveItem.numeroParcela}/{totalParcelas}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-text-secondary">Valor da parcela</span>
                  <span className="text-white font-medium">{formatCurrency(liveItem.value)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Total pago</span>
                  <span className="font-medium text-accent-lime">{formatCurrency(paidCount * liveItem.value)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Falta pagar</span>
                  <span className="font-medium text-accent-red">{formatCurrency((totalParcelas - paidCount) * liveItem.value)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Vencimento</span>
                  <span className="text-white font-medium">{formatDisplayDate(liveItem.dueDate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Status</span>
                  <span className={cn("font-medium", liveItem.paid ? "text-accent-lime" : "text-accent-red")}>
                    {liveItem.paid ? "Paga" : "Pendente"}
                  </span>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setParcelStatusOpen(false)}
                  className="rounded-xl border border-bg-muted px-4 py-2 text-sm text-white hover:bg-bg-muted transition"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      <PayBillModal
        open={!!payBillItem}
        onClose={() => setPayBillItem(null)}
        title={payBillItem?.title ?? ""}
        value={payBillItem?.value ?? 0}
        defaultCarteiraId={payBillItem?.carteiraId}
        isPending={markPaid.isPending}
        tipo={activeTab}
        onConfirm={(carteiraId) => {
          if (!payBillItem || !carteiraId) return;
          markPaid.mutate({
            id: payBillItem.id,
            isVirtual: payBillItem.isVirtual,
            numeroParcela: payBillItem.numeroParcela,
            month: selectedMonth,
            year: selectedYear,
            carteiraId,
          });
        }}
      />
      <VincularRecorrenteModal
        open={!!vincularRecorrenteItem}
        onClose={() => setVincularRecorrenteItem(null)}
        template={
          vincularRecorrenteItem
            ? { id: vincularRecorrenteItem.recorrenciaTemplateId ?? vincularRecorrenteItem.id, title: vincularRecorrenteItem.title }
            : null
        }
      />
      <VincularCartaoModal
        open={!!vincularCartaoItem}
        onClose={() => setVincularCartaoItem(null)}
        pending={vincularCartaoItem}
      />
      <ConfirmDeleteModal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onDeleteOne={() => {
          if (selectedDelete) deletePending.mutate(selectedDelete.id);
          setDeleteModalOpen(false);
        }}
        onDeleteGroup={() => {
          if (selectedDelete?.grupoParceladoId) deleteGroupPending.mutate(selectedDelete.grupoParceladoId);
          setDeleteModalOpen(false);
        }}
        onDeleteMonth={() => {
          if (selectedDelete?.templateId && selectedDelete.month && selectedDelete.year) {
            deleteRecurringMonth.mutate({
              templateId: selectedDelete.templateId,
              month: selectedDelete.month,
              year: selectedDelete.year,
            });
          }
          setDeleteModalOpen(false);
        }}
        onDeletePermanent={() => {
          if (selectedDelete?.templateId) deletePending.mutate(selectedDelete.templateId);
          setDeleteModalOpen(false);
        }}
        accountName={selectedDelete?.title ?? ""}
        isParcel={selectedDelete?.isParcel}
        parcelLabel={selectedDelete?.parcelLabel}
        isRecorrente={selectedDelete?.isRecorrente}
      />
      {unmarkTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-bg-muted bg-bg-card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-accent-yellow/10 p-2.5">
                <RotateCcw className="h-5 w-5 text-accent-yellow" />
              </div>
              <h2 className="text-base font-bold text-white">Desmarcar como {activeTab === "RECEBER" ? "recebida" : "paga"}?</h2>
            </div>
            <p className="text-sm text-text-secondary">
              A transação de {activeTab === "RECEBER" ? "recebimento" : "pagamento"} gerada para{" "}
              <span className="font-semibold text-white">"{unmarkTarget.title}"</span> será removida.
              Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setUnmarkTarget(null)}
                disabled={unmarkPaid.isPending}
                className="flex-1 rounded-xl border border-bg-muted bg-transparent px-4 py-2.5 text-sm font-bold text-white hover:bg-bg-overlay transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => unmarkPaid.mutate(unmarkTarget.id)}
                disabled={unmarkPaid.isPending}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-accent-yellow px-4 py-2.5 text-sm font-bold text-black hover:brightness-110 transition disabled:opacity-50"
              >
                {unmarkPaid.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
      </section>
  );
}
