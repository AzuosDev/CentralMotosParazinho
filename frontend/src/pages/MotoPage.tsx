import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  HandCoins,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Undo2,
  Wallet,
} from "lucide-react";

import { api } from "../lib/api";
import { cn } from "../lib/utils";
import { getApiErrorMessages } from "../lib/errors";
import { formatCurrency, formatDisplayDate, normalizeTransaction } from "../lib/finance";
import { BarList, ReportCard, StatTile } from "../components/insights/ReportPrimitives";
import { MotoStatusBadge } from "../components/motos/MotoStatusBadge";
import { ModalShell } from "../components/modals/ModalShell";
import { MotoModal } from "../components/modals/MotoModal";
import { VenderMotoModal } from "../components/modals/VenderMotoModal";
import type { ModoVenda } from "../components/modals/VenderMotoModal";
import { TransactionModal } from "../components/modals/TransactionModal";
import { useToast } from "../components/ui/Toast";
import { TxRow } from "../components/TxRow";
import type { Moto, MotoResumo, TransactionsResponse } from "../types/api";
import type { Transaction } from "../types/finance";

function Dado({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-text-primary">{value}</dd>
    </div>
  );
}

/**
 * Desconto máximo em destaque: é a pergunta que a loja faz na hora de negociar — quanto
 * posso abater antes de a venda virar prejuízo. O piso é o próprio custo total, já que
 * desconto máximo = preço de referência − custo total (MotosService#resumo).
 */
function DescontoMaximoCard({ resumo }: { resumo: MotoResumo }) {
  const { descontoMaximo, custoTotal, precoSugerido } = resumo;
  const precoReferencia = resumo.moto.precoAnunciado ?? precoSugerido;
  const baseLabel = resumo.moto.precoAnunciado !== null ? "preço anunciado" : "preço sugerido";
  const abaixoDoCusto = descontoMaximo < 0;

  return (
    <div
      className={cn(
        "rounded-2xl border p-6",
        abaixoDoCusto
          ? "border-accent-red/40 bg-accent-red/10"
          : "border-accent-brand/40 bg-accent-brand/10",
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary">
        {abaixoDoCusto ? "Preço abaixo do custo" : "Desconto máximo"}
      </p>
      <p
        className={cn(
          "mt-2 font-sans text-4xl font-extrabold",
          abaixoDoCusto ? "text-accent-red" : "text-accent-brand",
        )}
      >
        {formatCurrency(Math.abs(descontoMaximo))}
      </p>
      {abaixoDoCusto ? (
        <p className="mt-3 text-sm text-text-secondary">
          O {baseLabel} de{" "}
          <span className="font-semibold text-text-primary">
            {formatCurrency(precoReferencia)}
          </span>{" "}
          está esse valor abaixo do custo total de{" "}
          <span className="font-semibold text-text-primary">{formatCurrency(custoTotal)}</span> —
          vender por ele já dá prejuízo.
        </p>
      ) : (
        <p className="mt-3 text-sm text-text-secondary">
          É quanto cabe de abatimento sobre o {baseLabel} de{" "}
          <span className="font-semibold text-text-primary">
            {formatCurrency(precoReferencia)}
          </span>
          . Abaixo de{" "}
          <span className="font-semibold text-text-primary">{formatCurrency(custoTotal)}</span>{" "}
          (o custo total) a venda dá prejuízo.
        </p>
      )}
    </div>
  );
}

/**
 * Numa moto vendida o desconto máximo não tem mais uso (não há o que negociar), e a
 * pergunta passa a ser quanto a loja ganhou — então o lucro assume o lugar de destaque.
 */
function LucroCard({ resumo }: { resumo: MotoResumo }) {
  const { lucro, lucroPercentual, custoTotal } = resumo;
  const valorVenda = resumo.moto.valorVenda ?? 0;
  const prejuizo = (lucro ?? 0) < 0;

  return (
    <div
      className={cn(
        "rounded-2xl border p-6",
        prejuizo
          ? "border-accent-red/40 bg-accent-red/10"
          : "border-semantic-income/40 bg-semantic-income/10",
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary">
        {prejuizo ? "Prejuízo na venda" : "Lucro na venda"}
      </p>
      <p
        className={cn(
          "mt-2 font-sans text-4xl font-extrabold",
          prejuizo ? "text-accent-red" : "text-semantic-income",
        )}
      >
        {formatCurrency(Math.abs(lucro ?? 0))}
      </p>
      <p className="mt-3 text-sm text-text-secondary">
        <span className="font-semibold text-text-primary">{formatCurrency(valorVenda)}</span> de
        venda −{" "}
        <span className="font-semibold text-text-primary">{formatCurrency(custoTotal)}</span> de
        custo total
        {lucroPercentual !== null && (
          <>
            {" "}
            ·{" "}
            <span className="font-semibold text-text-primary">
              {lucroPercentual.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
            </span>{" "}
            sobre o custo
          </>
        )}
        .
      </p>
    </div>
  );
}

export function MotoPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const [editOpen, setEditOpen] = useState(false);
  const [venderOpen, setVenderOpen] = useState(false);
  // "registrar" vende a moto; "editar" corrige a venda ou lança na carteira a venda que
  // ficou sem receita (moto marcada como vendida antes desta feature).
  const [venderModo, setVenderModo] = useState<ModoVenda>("registrar");
  const [desfazerOpen, setDesfazerOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const [txSelecionada, setTxSelecionada] = useState<Transaction | null>(null);

  const motoQuery = useQuery<Moto>({
    queryKey: ["motos", id],
    queryFn: async () => {
      const { data } = await api.get<Moto>(`/api/motos/${id}`);
      return data;
    },
    enabled: !!id,
  });

  // A ficha financeira vem do /resumo: é lá que o backend calcula desconto máximo, lucro
  // percentual e o detalhamento por categoria, tudo com o mesmo arredondamento.
  const resumoQuery = useQuery<MotoResumo>({
    queryKey: ["motos", id, "resumo"],
    queryFn: async () => {
      const { data } = await api.get<MotoResumo>(`/api/motos/${id}/resumo`);
      return data;
    },
    enabled: !!id,
  });

  const txQuery = useInfiniteQuery({
    queryKey: ["transactions", "moto", id],
    enabled: !!id,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get<TransactionsResponse>("/api/transactions", {
        params: { motoId: id, page: pageParam, limit: 20 },
      });
      return data;
    },
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
  });

  const transacoes = txQuery.data?.pages.flatMap((p) => p.data.map(normalizeTransaction)) ?? [];

  // Excluir a moto também apaga os lançamentos que a ficha gerou (compra e venda), com o
  // saldo da carteira sendo devolvido — por isso invalida carteiras e extrato também.
  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/api/motos/${id}`);
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["motos", id] });
      queryClient.invalidateQueries({ queryKey: ["motos"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      addToast("Moto excluída.", "success");
      navigate("/motos");
    },
    onError: (error) => {
      addToast(getApiErrorMessages(error, "Não foi possível excluir a moto.")[0], "error");
      setDeleteOpen(false);
    },
  });

  const desfazerVendaMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/api/motos/${id}/venda`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["motos"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      addToast("Venda desfeita. A moto voltou para o estoque.", "success");
      setDesfazerOpen(false);
    },
    onError: (error) => {
      addToast(getApiErrorMessages(error, "Não foi possível desfazer a venda.")[0], "error");
      setDesfazerOpen(false);
    },
  });

  function abrirVenda(modo: ModoVenda) {
    setVenderModo(modo);
    setVenderOpen(true);
  }

  function abrirNovoGasto() {
    setTxSelecionada(null);
    setTxOpen(true);
  }

  function editarTransacao(tx: Transaction) {
    setTxSelecionada(tx);
    setTxOpen(true);
  }

  if (motoQuery.isLoading) {
    return (
      <section className="space-y-6">
        <div className="h-24 animate-pulse rounded-2xl bg-bg-muted" />
        <div className="h-44 animate-pulse rounded-2xl bg-bg-muted" />
        <div className="h-64 animate-pulse rounded-2xl bg-bg-muted" />
      </section>
    );
  }

  const moto = motoQuery.data;

  if (!moto) {
    return (
      <div className="rounded-2xl bg-bg-card p-8 text-center text-text-secondary">
        Moto não encontrada.{" "}
        <Link to="/motos" className="text-accent-brand underline">
          Voltar para o estoque
        </Link>
      </div>
    );
  }

  const resumo = resumoQuery.data;
  const vendida = moto.status === "vendida";

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-xl p-2 transition hover:bg-bg-muted"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <p className="text-sm text-text-secondary">Moto · {moto.placa}</p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-sans text-2xl font-bold">{moto.modelo}</h1>
              <MotoStatusBadge status={moto.status} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!vendida ? (
            <button
              type="button"
              onClick={() => abrirVenda("registrar")}
              className="flex items-center gap-2 rounded-xl bg-accent-brand px-4 py-2.5 text-sm font-bold text-white transition hover:bg-accent-brand-hover"
            >
              <HandCoins className="h-4 w-4" />
              Registrar venda
            </button>
          ) : (
            <>
              {resumo?.lancamentoVenda && (
                <button
                  type="button"
                  onClick={() => abrirVenda("editar")}
                  className="flex items-center gap-2 rounded-xl border border-bg-muted px-4 py-2.5 text-sm font-semibold text-text-primary transition hover:bg-bg-muted"
                >
                  <HandCoins className="h-4 w-4" />
                  Editar venda
                </button>
              )}
              <button
                type="button"
                onClick={() => setDesfazerOpen(true)}
                className="flex items-center gap-2 rounded-xl border border-bg-muted px-4 py-2.5 text-sm font-semibold text-text-primary transition hover:bg-bg-muted"
              >
                <Undo2 className="h-4 w-4" />
                Desfazer venda
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="rounded-xl border border-bg-muted p-2.5 text-text-secondary transition hover:bg-bg-muted hover:text-text-primary"
            title="Editar moto"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="rounded-xl border border-accent-red/30 p-2.5 text-accent-red transition hover:bg-accent-red/10"
            title="Excluir moto"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {vendida && resumo && !resumo.lancamentoVenda && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-status-warning/40 bg-status-warning/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-status-warning" />
            <div>
              <p className="text-sm font-semibold text-text-primary">
                Esta venda não está lançada em nenhuma carteira
              </p>
              <p className="text-xs text-text-secondary">
                A moto está marcada como vendida, mas o dinheiro não entrou em nenhum saldo. O
                lucro acima já considera a venda; o caixa, não.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => abrirVenda("editar")}
            className="flex items-center gap-2 rounded-xl bg-accent-brand px-4 py-2.5 text-sm font-bold text-white transition hover:bg-accent-brand-hover"
          >
            <Wallet className="h-4 w-4" />
            Lançar venda na carteira
          </button>
        </div>
      )}

      {/* Destaques */}
      {resumoQuery.isLoading || !resumo ? (
        <div className="h-44 animate-pulse rounded-2xl bg-bg-muted" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          {/* Vendida: o desconto máximo não serve mais (não há negociação em aberto) e o
              lucro assume o destaque. */}
          {vendida ? <LucroCard resumo={resumo} /> : <DescontoMaximoCard resumo={resumo} />}

          <div className="grid gap-4 sm:grid-cols-2">
            <StatTile
              label="Custo total"
              value={formatCurrency(resumo.custoTotal)}
              footer={
                <span className="text-xs text-text-secondary">
                  {formatCurrency(moto.valorCompra)} de compra +{" "}
                  {formatCurrency(resumo.custoGastos)} de gastos
                </span>
              }
            />
            {vendida ? (
              <StatTile
                label="Valor da venda"
                value={formatCurrency(resumo.moto.valorVenda ?? 0)}
                footer={
                  <span className="text-xs text-text-secondary">
                    {resumo.moto.dataVenda
                      ? `Vendida em ${formatDisplayDate(resumo.moto.dataVenda)}`
                      : "Sem data de venda"}
                  </span>
                }
              />
            ) : (
              <StatTile
                label="Preço sugerido"
                value={formatCurrency(resumo.precoSugerido)}
                footer={
                  <span className="text-xs text-text-secondary">
                    Margem de {moto.margemDesejada.toLocaleString("pt-BR")}% sobre o custo total
                  </span>
                }
              />
            )}
            <StatTile
              label="Gastos vinculados"
              value={formatCurrency(resumo.custoGastos)}
              footer={
                <span className="text-xs text-text-secondary">
                  {resumo.custoGastos > 0
                    ? "Soma das despesas lançadas nesta moto"
                    : "Nenhum gasto lançado nesta moto ainda"}
                </span>
              }
            />
          </div>
        </div>
      )}

      {/* Dados da moto */}
      <ReportCard
        title="Dados da moto"
        action={
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="text-sm font-semibold text-accent-brand hover:underline"
          >
            Editar
          </button>
        }
      >
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Dado label="Modelo" value={moto.modelo} />
          <Dado label="Ano" value={String(moto.ano)} />
          <Dado label="Cor" value={moto.cor} />
          <Dado label="Placa" value={moto.placa} />
          <Dado label="Chassi" value={moto.chassi} />
          <Dado label="Quilometragem" value={`${moto.km.toLocaleString("pt-BR")} km`} />
          <Dado label="Valor da compra" value={formatCurrency(moto.valorCompra)} />
          <Dado label="Data da compra" value={formatDisplayDate(moto.dataCompra)} />
          <Dado
            label="Margem desejada"
            value={`${moto.margemDesejada.toLocaleString("pt-BR")}%`}
          />
          <Dado
            label="Preço anunciado"
            value={
              typeof moto.precoAnunciado === "number"
                ? formatCurrency(moto.precoAnunciado)
                : "Não anunciada"
            }
          />
          {vendida && (
            <>
              <Dado
                label="Valor da venda"
                value={typeof moto.valorVenda === "number" ? formatCurrency(moto.valorVenda) : "—"}
              />
              <Dado
                label="Data da venda"
                value={moto.dataVenda ? formatDisplayDate(moto.dataVenda) : "—"}
              />
            </>
          )}
        </dl>
      </ReportCard>

      {/* Gastos por categoria */}
      <ReportCard
        title="Gastos por categoria"
        hint="Despesas vinculadas a esta moto, já descontados os estornos. Gasto agendado só entra quando a data chega."
      >
        {resumoQuery.isLoading || !resumo ? (
          <div className="h-24 animate-pulse rounded-xl bg-bg-muted" />
        ) : (
          <BarList
            items={resumo.gastosPorCategoria.map((linha) => ({
              key: linha.categoryId ?? "sem-categoria",
              name: linha.categoria,
              total: linha.total,
              caption:
                resumo.custoGastos > 0
                  ? `${((linha.total / resumo.custoGastos) * 100).toLocaleString("pt-BR", {
                      maximumFractionDigits: 1,
                    })}% dos gastos da moto`
                  : undefined,
            }))}
            emptyMessage="Nenhum gasto vinculado a esta moto ainda."
          />
        )}
      </ReportCard>

      {/* Transações vinculadas */}
      <div className="rounded-card bg-bg-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-sans text-base font-bold text-text-primary">
              Transações vinculadas
            </h2>
            <p className="mt-0.5 text-xs text-text-muted">
              Todo lançamento com esta moto marcada, na ordem da data.
            </p>
          </div>
          <button
            type="button"
            onClick={abrirNovoGasto}
            className="flex items-center gap-2 rounded-xl bg-accent-brand px-4 py-2.5 text-sm font-bold text-white transition hover:bg-accent-brand-hover"
          >
            <Plus className="h-4 w-4" />
            Adicionar gasto
          </button>
        </div>

        {txQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-bg-muted" />
            ))}
          </div>
        ) : transacoes.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-secondary">
            Nenhuma transação vinculada a esta moto.
          </p>
        ) : (
          <div className="divide-y divide-bg-muted">
            {transacoes.map((tx) => (
              <TxRow key={tx.id} tx={tx} onEdit={editarTransacao} showMotoBadge={false} />
            ))}
          </div>
        )}

        {txQuery.hasNextPage && (
          <button
            type="button"
            onClick={() => txQuery.fetchNextPage()}
            disabled={txQuery.isFetchingNextPage}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-bg-muted px-4 py-3 text-sm font-semibold text-text-primary transition hover:bg-bg-muted disabled:opacity-60"
          >
            {txQuery.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" />}
            Carregar mais
          </button>
        )}
      </div>

      <MotoModal open={editOpen} onClose={() => setEditOpen(false)} moto={moto} />
      <VenderMotoModal
        open={venderOpen}
        onClose={() => setVenderOpen(false)}
        moto={moto}
        modo={venderModo}
        lancamentoVenda={resumo?.lancamentoVenda ?? null}
      />
      <TransactionModal
        open={txOpen}
        onClose={() => {
          setTxOpen(false);
          setTxSelecionada(null);
        }}
        defaultTab="EXPENSE"
        defaultMotoId={moto._id}
        transaction={txSelecionada}
      />

      <ModalShell
        open={desfazerOpen}
        onClose={() => setDesfazerOpen(false)}
        title="Desfazer venda"
        icon={<Undo2 className="h-6 w-6 text-accent-brand" />}
        containerClassName="max-w-sm"
        footer={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setDesfazerOpen(false)}
              disabled={desfazerVendaMutation.isPending}
              className="flex-1 rounded-xl border border-bg-muted bg-transparent px-5 py-3 text-sm font-bold text-text-primary transition hover:bg-bg-overlay disabled:opacity-70"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => desfazerVendaMutation.mutate()}
              disabled={desfazerVendaMutation.isPending}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-brand px-5 py-3 text-sm font-bold text-white transition hover:bg-accent-brand-hover disabled:opacity-70"
            >
              {desfazerVendaMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Desfazer venda
            </button>
          </div>
        }
      >
        <p className="text-sm text-text-secondary">
          A moto volta para o estoque e o valor e a data da venda são apagados.
          {resumo?.lancamentoVenda
            ? " A receita da venda é excluída e o saldo da carteira volta ao que era."
            : " Não há receita lançada para excluir."}{" "}
          Os gastos lançados nela continuam vinculados.
        </p>
      </ModalShell>

      <ModalShell
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Excluir moto"
        icon={<AlertTriangle className="h-6 w-6 text-accent-red" />}
        containerClassName="max-w-sm"
        footer={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setDeleteOpen(false)}
              disabled={deleteMutation.isPending}
              className="flex-1 rounded-xl border border-bg-muted bg-transparent px-5 py-3 text-sm font-bold text-text-primary transition hover:bg-bg-overlay disabled:opacity-70"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-red px-5 py-3 text-sm font-bold text-white transition hover:bg-accent-red-hover disabled:opacity-70"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar exclusão
            </button>
          </div>
        }
      >
        <p className="text-sm text-text-secondary">
          Excluir{" "}
          <span className="font-semibold text-text-primary">
            {moto.modelo} ({moto.placa})
          </span>
          ? Esta ação não pode ser desfeita. Os lançamentos de compra e venda gerados por esta
          ficha são excluídos junto (o saldo das carteiras volta ao que era), mas uma moto com
          gasto lançado à mão não pode ser excluída — desvincule ou apague esses gastos antes.
        </p>
      </ModalShell>
    </section>
  );
}
