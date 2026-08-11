import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, History, Loader2, Pencil, RotateCcw, Trash2 } from "lucide-react";

import { api } from "../lib/api";
import { cn } from "../lib/utils";
import { detectBankIcon } from "../lib/bankIcons";
import { getApiErrorMessages } from "../lib/errors";
import { brlFormatter, normalizeTransaction } from "../lib/finance";
import { BankLogo } from "../components/ui/BankLogo";
import { CurrencyInput } from "../components/ui/CurrencyInput";
import { TxRow } from "../components/TxRow";
import { TransactionModal } from "../components/modals/TransactionModal";
import { DeleteWalletModal } from "../components/modals/DeleteWalletModal";
import { useToast } from "../components/ui/Toast";
import type { TransactionsResponse, Wallet } from "../types/api";
import type { Transaction, TransactionType } from "../types/finance";

type ImportBatch = {
  _id: string;
  carteiraId: string;
  fileName?: string;
  transactionCount: number;
  createdAt: string;
};

const fmt = (v: number) => brlFormatter.format(v);

export function WalletPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [nome, setNome] = useState("");
  const [icone, setIcone] = useState("");
  const [saldoInicial, setSaldoInicial] = useState(0);
  const [txOpen, setTxOpen] = useState(false);
  const [txTab, setTxTab] = useState<TransactionType>("EXPENSE");
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [undoBatchTarget, setUndoBatchTarget] = useState<ImportBatch | null>(null);

  const handleEditTx = (tx: Transaction) => {
    setSelectedTx(tx);
    setTxTab(tx.type);
    setTxOpen(true);
  };

  const walletQuery = useQuery<Wallet>({
    queryKey: ["wallets", id],
    queryFn: async () => {
      const { data } = await api.get<Wallet>(`/api/wallets/${id}`);
      return data;
    },
    enabled: !!id,
  });
  const wallet = walletQuery.data;

  const txQuery = useInfiniteQuery({
    queryKey: ["transactions", "wallet", id],
    enabled: !!id,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get<TransactionsResponse>("/api/transactions", {
        params: { carteiraId: id, page: pageParam, limit: 20 },
      });
      return data;
    },
    getNextPageParam: (last) =>
      last.page * last.limit < last.total ? last.page + 1 : undefined,
  });

  const transactions = txQuery.data?.pages.flatMap((p) => p.data.map(normalizeTransaction)) ?? [];

  const updateMutation = useMutation({
    mutationFn: async () => {
      await api.patch(`/api/wallets/${id}`, {
        nome: nome || wallet?.nome,
        icone: icone || wallet?.icone,
        saldo: saldoInicial,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      setEditing(false);
    },
  });

  const batchesQuery = useQuery<ImportBatch[]>({
    queryKey: ["import-batches", id],
    queryFn: async () => {
      const { data } = await api.get<ImportBatch[]>("/api/import/batches", {
        params: { carteiraId: id },
      });
      return data;
    },
    enabled: !!id,
  });

  const undoBatchMutation = useMutation({
    mutationFn: async (batchId: string) => {
      await api.delete(`/api/import/batches/${batchId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["import-batches", id] });
      queryClient.invalidateQueries({ queryKey: ["wallets", id] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["transactions", "wallet", id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      addToast("Importação desfeita com sucesso.", "success");
      setUndoBatchTarget(null);
    },
    onError: () => addToast("Não foi possível desfazer a importação.", "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/api/wallets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      navigate("/carteiras");
    },
    onError: (error) => {
      addToast(
        getApiErrorMessages(error, "Não foi possível excluir a carteira.")[0] ??
          "Não foi possível excluir a carteira.",
        "error",
      );
    },
  });

  if (walletQuery.isLoading) {
    return (
      <section className="space-y-6">
        <div className="h-32 animate-pulse rounded-2xl bg-bg-muted" />
        <div className="h-64 animate-pulse rounded-2xl bg-bg-muted" />
      </section>
    );
  }

  if (!wallet) {
    return (
      <div className="rounded-2xl bg-bg-card p-8 text-center text-text-secondary">
        Carteira não encontrada.{" "}
        <Link to="/carteiras" className="text-accent-lime underline">
          Voltar
        </Link>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="rounded-xl p-2 transition hover:bg-bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="text-sm text-text-secondary">Carteira</p>
          <h1 className="font-sans text-2xl font-bold">{wallet.nome}</h1>
        </div>
      </div>

      {/* Card de saldo */}
      <div className="rounded-2xl bg-bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <BankLogo nome={wallet.nome} icone={wallet.icone} className="h-12 w-12" />
            <p className="mt-3 text-sm uppercase tracking-widest text-text-secondary">Saldo</p>
            <strong
              className={cn(
                "mt-1 block font-sans text-3xl font-extrabold",
                wallet.saldo < 0 ? "text-accent-red" : "text-accent-lime",
              )}
            >
              {fmt(wallet.saldo)}
            </strong>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setNome(wallet.nome);
                setIcone(wallet.icone ?? "");
                setSaldoInicial(wallet.saldoInicial ?? 0);
                setEditing(true);
              }}
              className="rounded-xl border border-bg-muted p-2 transition hover:bg-bg-muted"
              title="Editar"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => setDeleteOpen(true)}
              disabled={deleteMutation.isPending}
              className="rounded-xl border border-accent-red/30 p-2 text-accent-red transition hover:bg-accent-red/10 disabled:opacity-50"
              title="Excluir"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Formulário de edição */}
      {editing && (
        <div className="space-y-4 rounded-2xl bg-bg-card p-5">
          <h2 className="font-bold">Editar Carteira</h2>
          <label className="block">
            <span className="mb-1 block text-sm text-text-secondary">Nome</span>
            <input
              value={nome}
              onChange={(e) => {
                setNome(e.target.value);
                const auto = detectBankIcon(e.target.value);
                if (auto) setIcone(auto);
              }}
              className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-white outline-none focus:border-accent-lime"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-text-secondary">Ícone (emoji)</span>
            <input
              value={icone}
              onChange={(e) => setIcone(e.target.value)}
              placeholder="🏦"
              className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-white outline-none focus:border-accent-lime"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-text-secondary">Saldo inicial</span>
            <p className="mb-2 text-xs text-text-secondary">
              Valor que você já tinha antes do primeiro lançamento. Use para corrigir o saldo se ele estiver errado.
            </p>
            <CurrencyInput
              value={saldoInicial}
              onChange={setSaldoInicial}
              className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-white outline-none focus:border-accent-lime"
            />
          </label>
          <div className="flex gap-3">
            <button
              onClick={() => setEditing(false)}
              className="flex-1 rounded-xl border border-bg-muted py-3 text-sm font-bold transition hover:bg-bg-muted"
            >
              Cancelar
            </button>
            <button
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending}
              className="flex-1 rounded-xl bg-accent-lime py-3 text-sm font-bold text-black transition hover:brightness-110 disabled:opacity-60"
            >
              Salvar
            </button>
          </div>
        </div>
      )}

      {/* Extrato */}
      <div className="rounded-2xl bg-bg-card p-5">
        <h2 className="mb-4 font-sans text-xl font-bold">Extrato</h2>

        {txQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-bg-muted" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-secondary">
            Nenhuma movimentação vinculada a esta carteira.
          </p>
        ) : (
          <div className="divide-y divide-bg-muted">
            {transactions.map((tx) => (
              <TxRow key={tx.id} tx={tx} onEdit={handleEditTx} walletId={id} />
            ))}
          </div>
        )}

        {txQuery.hasNextPage && (
          <button
            type="button"
            onClick={() => txQuery.fetchNextPage()}
            disabled={txQuery.isFetchingNextPage}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-bg-muted px-4 py-3 text-sm font-semibold text-white hover:bg-bg-muted disabled:opacity-60"
          >
            {txQuery.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" />}
            Carregar mais
          </button>
        )}
      </div>
      {/* Histórico de Importações */}
      {(batchesQuery.data?.length ?? 0) > 0 && (
        <div className="rounded-2xl bg-bg-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <History className="h-5 w-5 text-text-secondary" />
            <h2 className="font-sans text-xl font-bold">Histórico de Importações</h2>
          </div>
          <div className="divide-y divide-bg-muted">
            {batchesQuery.data!.map((batch) => (
              <div key={batch._id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {batch.fileName ?? "extrato.ofx"}
                  </p>
                  <p className="text-xs text-text-secondary">
                    {new Date(batch.createdAt).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {batch.transactionCount} transaç{batch.transactionCount === 1 ? "ão" : "ões"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setUndoBatchTarget(batch)}
                  disabled={undoBatchMutation.isPending}
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-accent-red/30 px-3 py-2 text-sm font-semibold text-accent-red transition hover:bg-accent-red/10 disabled:opacity-50"
                >
                  <RotateCcw className="h-4 w-4" />
                  Desfazer
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <TransactionModal
        open={txOpen}
        onClose={() => { setTxOpen(false); setSelectedTx(null); }}
        defaultTab={txTab}
        transaction={selectedTx}
      />
      <DeleteWalletModal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        walletName={wallet.nome}
        isLoading={deleteMutation.isPending}
      />

      {undoBatchTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-bg-muted bg-bg-card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-accent-red/10 p-2.5">
                <RotateCcw className="h-5 w-5 text-accent-red" />
              </div>
              <h2 className="text-base font-bold text-white">Desfazer importação?</h2>
            </div>
            <p className="text-sm text-text-secondary">
              Isso vai remover{" "}
              <span className="font-semibold text-white">
                {undoBatchTarget.transactionCount} transaç{undoBatchTarget.transactionCount === 1 ? "ão" : "ões"}
              </span>{" "}
              importadas de{" "}
              <span className="font-semibold text-white">
                {undoBatchTarget.fileName ?? "extrato.ofx"}
              </span>{" "}
              e reverter os saldos correspondentes. Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setUndoBatchTarget(null)}
                disabled={undoBatchMutation.isPending}
                className="flex-1 rounded-xl border border-bg-muted bg-transparent px-4 py-2.5 text-sm font-bold text-white hover:bg-bg-overlay transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => undoBatchMutation.mutate(undoBatchTarget._id)}
                disabled={undoBatchMutation.isPending}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-accent-red px-4 py-2.5 text-sm font-bold text-white hover:brightness-110 transition disabled:opacity-50"
              >
                {undoBatchMutation.isPending ? (
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
