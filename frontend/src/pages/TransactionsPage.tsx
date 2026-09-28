import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, ChevronDown, Filter, Loader2, Plus, TrendingDown, TrendingUp, Wallet, X } from "lucide-react";

import { TxRow } from "../components/TxRow";
import { TransactionModal } from "../components/modals/TransactionModal";
import { useCategories } from "../components/modals/TransactionFormFields";
import { useToast } from "../components/ui/Toast";
import { api } from "../lib/api";
import { normalizeTransactionsResponse, readString } from "../lib/finance";
import { cn } from "../lib/utils";
import type { TransactionsResponse, Wallet as WalletAccount } from "../types/api";
import type { Transaction, TransactionType } from "../types/finance";

const tabs: Array<{ label: string; value: "ALL" | TransactionType }> = [
  { label: "Todos", value: "ALL" },
  { label: "Gastos", value: "EXPENSE" },
  { label: "Ganhos", value: "INCOME" },
];

const months = [
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

function groupDateLabel(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Sem data";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    timeZone: "UTC",
  }).format(date);
}

function dateKey(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }

  return date.toISOString().slice(0, 10);
}

export function TransactionsPage() {
  const today = new Date();
  const currentYear = today.getFullYear();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const [txTab, setTxTab] = useState<TransactionType>("EXPENSE");
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const [selectedTxIds, setSelectedTxIds] = useState<string[]>([]);
  const { addToast } = useToast();

  const handleEdit = (tx: Transaction) => {
    setSelectedTx(tx);
    setTxTab(tx.type);
    setTxOpen(true);
  };

  const queryClient = useQueryClient();

  const type = readString(searchParams.get("type")).toUpperCase();
  const selectedType: "ALL" | TransactionType =
    type === "EXPENSE" || type === "INCOME" ? type : "ALL";
  const categoryId = searchParams.get("categoryId") ?? "";
  const semCategoria = searchParams.get("semCategoria") === "true";
  const month = Number(searchParams.get("month") ?? today.getMonth() + 1);
  const year = Number(searchParams.get("year") ?? currentYear);
  const years = useMemo(
    () => Array.from({ length: 4 }, (_, index) => currentYear - index),
    [currentYear],
  );

  const categoriesQuery = useCategories();

  const transactionsQuery = useInfiniteQuery({
    queryKey: ["transactions", selectedType, categoryId, semCategoria, month, year],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get<TransactionsResponse>("/api/transactions", {
        params: {
          page: pageParam,
          limit: 20,
          type: selectedType === "ALL" ? undefined : selectedType,
          categoryId: semCategoria ? undefined : (categoryId || undefined),
          semCategoria: semCategoria || undefined,
          month,
          year,
        },
      });

      return normalizeTransactionsResponse(data);
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasMore ? allPages.length + 1 : undefined,
  });

  const transactions =
    transactionsQuery.data?.pages
      .flatMap((page) => page.transactions)
      .filter((transaction) => {
        const date = new Date(transaction.date);
        const matchesCategory = semCategoria
          ? !transaction.categoryId
          : (!categoryId || transaction.categoryId === categoryId);
        // Usar UTC para evitar deslocamento de ±1 dia em fusos UTC-N (datas ISO são UTC midnight).
        const matchesPeriod =
          !Number.isNaN(date.getTime()) &&
          date.getUTCMonth() + 1 === month &&
          date.getUTCFullYear() === year;

        return matchesCategory && matchesPeriod;
      }) ?? [];

  const groupedTransactions = useMemo(() => {
    const groups = new Map<string, Transaction[]>();

    transactions.forEach((transaction) => {
      const key = dateKey(transaction.date);
      groups.set(key, [...(groups.get(key) ?? []), transaction]);
    });

    return Array.from(groups.entries()).map(([key, items]) => ({
      key,
      label: groupDateLabel(items[0]?.date ?? key),
      items,
    }));
  }, [transactions]);

  const deleteMutation = useMutation({
    mutationFn: async (transactionId: string) => {
      await api.delete(`/api/transactions/${transactionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      setDeleting(null);
    },
  });

  const walletsQuery = useQuery<WalletAccount[]>({
    queryKey: ["wallets"],
    queryFn: async () => {
      const { data } = await api.get<WalletAccount[]>("/api/wallets");
      return Array.isArray(data) ? data : [];
    },
  });
  const realWallets = (walletsQuery.data ?? []).filter((w) => w.tipo !== "VIRTUAL");

  const toggleTxSelection = (tx: Transaction) => {
    setSelectedTxIds((prev) =>
      prev.includes(tx.id) ? prev.filter((id) => id !== tx.id) : [...prev, tx.id],
    );
  };

  const bulkWalletMutation = useMutation({
    mutationFn: async (targetWalletId: string) => {
      await api.patch("/api/transactions/bulk-wallet", {
        transactionIds: selectedTxIds,
        targetWalletId,
      });
    },
    onSuccess: () => {
      setSelectedTxIds([]);
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      addToast("Transações organizadas com sucesso!", "success");
    },
    onError: (error: unknown) => {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      addToast(msg || "Não foi possível associar as transações selecionadas.", "error");
    },
  });

  const patchParams = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams);

    Object.entries(patch).forEach(([key, value]) => {
      if (!value) {
        next.delete(key);
        return;
      }

      next.set(key, value);
    });

    setSearchParams(next);
  };

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-text-secondary">Histórico financeiro</p>
          <h1 className="font-sans text-3xl font-bold">Transações</h1>
        </div>
        <button
          type="button"
          onClick={() => {
            setSelectedTx(null);
            if (selectedType === "ALL") {
              setChoiceOpen(true);
            } else {
              setTxTab(selectedType);
              setTxOpen(true);
            }
          }}
          className="flex items-center gap-2 rounded-xl bg-accent-lime px-4 py-3 text-sm font-bold text-black transition hover:brightness-110"
        >
          <Plus className="h-4 w-4" />
          Nova
        </button>
      </header>

      <div className="flex gap-2 overflow-x-auto rounded-2xl bg-bg-card p-2">
        {tabs.map((tab) => {
          const active = selectedType === tab.value;

          return (
            <button
              key={tab.value}
              type="button"
              onClick={() =>
                patchParams({
                  type: tab.value === "ALL" ? undefined : tab.value,
                  categoryId: tab.value === "INCOME" ? undefined : categoryId,
                  action: undefined,
                })
              }
              className={cn(
                "rounded-xl px-4 py-2.5 text-sm font-semibold transition",
                active
                  ? "bg-bg-muted text-text-primary"
                  : "text-text-secondary hover:bg-bg-overlay hover:text-text-primary",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl bg-bg-card p-4">
        <button
          type="button"
          onClick={() => setFiltersOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-3 text-sm font-semibold text-text-primary"
        >
          <span className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-accent-lime" />
            Filtros
          </span>
          <ChevronDown className={cn("h-4 w-4 transition", filtersOpen && "rotate-180")} />
        </button>

        {filtersOpen && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            <select
              value={categoryId}
              disabled={selectedType === "INCOME"}
              onChange={(event) => patchParams({ categoryId: event.target.value || undefined })}
              className="rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-sm text-text-primary outline-none focus:border-accent-lime disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">Todas as categorias</option>
              {(categoriesQuery.data ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>

            <select
              value={month}
              onChange={(event) => patchParams({ month: event.target.value })}
              className="rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-sm text-text-primary outline-none focus:border-accent-lime"
            >
              {months.map((label, index) => (
                <option key={label} value={index + 1}>
                  {label}
                </option>
              ))}
            </select>

            <select
              value={year}
              onChange={(event) => patchParams({ year: event.target.value })}
              className="rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-sm text-text-primary outline-none focus:border-accent-lime"
            >
              {years.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-bg-card p-5 pb-32 lg:pb-5">
        {transactionsQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-16 animate-pulse rounded-xl bg-bg-muted" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-16 text-center">
            <Wallet className="mx-auto mb-3 h-10 w-10 text-text-muted" />
            <p className="text-sm text-text-secondary">Nenhuma transação encontrada</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedTransactions.map((group) => (
              <div key={group.key}>
                <p className="mb-2 text-xs font-bold uppercase tracking-widest text-text-muted">
                  {group.label}
                </p>
                {group.items.map((transaction) => (
                  <TxRow
                    key={transaction.id}
                    tx={transaction}
                    onEdit={handleEdit}
                    onDelete={setDeleting}
                    selected={selectedTxIds.includes(transaction.id)}
                    onToggleSelect={toggleTxSelection}
                  />
                ))}
              </div>
            ))}
          </div>
        )}

        {transactionsQuery.hasNextPage && (
          <button
            type="button"
            onClick={() => transactionsQuery.fetchNextPage()}
            disabled={transactionsQuery.isFetchingNextPage}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-bg-muted px-4 py-3 text-sm font-semibold text-text-primary hover:bg-bg-muted disabled:opacity-60"
          >
            {transactionsQuery.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" />}
            Carregar mais
          </button>
        )}
      </div>

      {selectedTxIds.length > 0 && (
        // bottom-24 no mobile: limpa a navbar fixa inferior (pb-24 do <main>, ~96px) +
        // o botão "+" flutuante que poka acima dela. A partir de lg: a navbar mobile
        // some (lg:hidden em AppLayout), então a barra volta a ficar perto do rodapé.
        // Conteúdo interno em coluna no mobile (texto em cima, controles embaixo) para
        // não estourar a largura da tela; volta a ser uma linha só a partir de sm:.
        <div className="fixed bottom-24 left-1/2 z-30 flex w-[min(92vw,32rem)] -translate-x-1/2 flex-col gap-3 rounded-2xl border border-bg-muted light:bg-bg-card/95 p-4 shadow-2xl shadow-black/40 backdrop-blur sm:flex-row sm:items-center sm:gap-3 lg:bottom-6">
          <p className="shrink-0 text-sm font-semibold text-text-primary">
            {selectedTxIds.length} transaç{selectedTxIds.length === 1 ? "ão" : "ões"} selecionada{selectedTxIds.length === 1 ? "" : "s"}
          </p>

          <div className="flex items-center gap-2 sm:ml-auto sm:shrink-0">
            <select
              value=""
              disabled={bulkWalletMutation.isPending || realWallets.length === 0}
              onChange={(event) => {
                const targetWalletId = event.target.value;
                if (targetWalletId) bulkWalletMutation.mutate(targetWalletId);
              }}
              className="flex-1 rounded-xl border border-bg-muted bg-bg-muted px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-lime disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
            >
              <option value="" disabled>
                {realWallets.length === 0 ? "Nenhuma carteira disponível" : "Mover para…"}
              </option>
              {realWallets.map((wallet) => (
                <option key={wallet._id} value={wallet._id}>
                  {wallet.nome}
                </option>
              ))}
            </select>

            {bulkWalletMutation.isPending && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent-lime" />}

            <button
              type="button"
              onClick={() => setSelectedTxIds([])}
              disabled={bulkWalletMutation.isPending}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-text-secondary hover:bg-bg-overlay hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Cancelar seleção"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {choiceOpen && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/60 p-4 backdrop-blur-sm sm:place-items-center">
          <div className="w-full max-w-sm rounded-2xl border border-bg-muted bg-bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-sans text-lg font-bold">Nova movimentação</h2>
              <button
                type="button"
                onClick={() => setChoiceOpen(false)}
                className="rounded-lg px-2 py-1 text-text-secondary hover:bg-bg-overlay hover:text-text-primary"
              >
                Fechar
              </button>
            </div>
            <div className="grid gap-3">
              <button
                type="button"
                onClick={() => { setChoiceOpen(false); setSelectedTx(null); setTxTab("EXPENSE"); setTxOpen(true); }}
                className="flex items-center gap-3 rounded-xl bg-bg-muted p-4 text-left hover:bg-bg-overlay"
              >
                <TrendingDown className="h-5 w-5 text-accent-red" />
                <span className="font-semibold">Adicionar Gasto</span>
              </button>
              <button
                type="button"
                onClick={() => { setChoiceOpen(false); setSelectedTx(null); setTxTab("INCOME"); setTxOpen(true); }}
                className="flex items-center gap-3 rounded-xl bg-bg-muted p-4 text-left hover:bg-bg-overlay"
              >
                <TrendingUp className="h-5 w-5 text-accent-lime" />
                <span className="font-semibold">Adicionar Ganho</span>
              </button>
              <button
                type="button"
                onClick={() => { setChoiceOpen(false); setSelectedTx(null); setTxTab("TRANSFER"); setTxOpen(true); }}
                className="flex items-center gap-3 rounded-xl bg-bg-muted p-4 text-left hover:bg-bg-overlay"
              >
                <ArrowLeftRight className="h-5 w-5 text-status-info" />
                <span className="font-semibold">Nova Transferência</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <TransactionModal
        open={txOpen}
        onClose={() => { setTxOpen(false); setSelectedTx(null); }}
        defaultTab={txTab}
        transaction={selectedTx}
      />

      {deleting && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-bg-muted bg-bg-card p-5">
            <h2 className="font-sans text-lg font-bold">Tem certeza?</h2>
            <p className="mt-2 text-sm text-text-secondary">
              Esta ação não pode ser desfeita.
            </p>
            {deleteMutation.isError && (
              <p className="mt-3 rounded-xl bg-accent-red/10 p-3 text-sm text-accent-red">
                Não foi possível excluir a transação.
              </p>
            )}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDeleting(null)}
                className="rounded-xl border border-bg-muted px-4 py-3 text-sm font-semibold text-text-primary hover:bg-bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(deleting.id)}
                disabled={deleteMutation.isPending}
                className="flex items-center justify-center gap-2 rounded-xl bg-accent-red px-4 py-3 text-sm font-bold text-white hover:brightness-110 disabled:opacity-60"
              >
                {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

