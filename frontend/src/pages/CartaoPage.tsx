import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Archive, ArrowLeft, Loader2, RotateCcw, Wallet as WalletIcon } from "lucide-react";

import { api } from "../lib/api";
import { cn } from "../lib/utils";
import { formatCurrency, formatDisplayDate } from "../lib/finance";
import { getApiErrorMessages } from "../lib/errors";
import { BankLogo } from "../components/ui/BankLogo";
import { CurrencyInput } from "../components/ui/CurrencyInput";
import { ModalShell } from "../components/modals/ModalShell";
import { ArchiveCartaoModal } from "../components/modals/ArchiveCartaoModal";
import { useToast } from "../components/ui/Toast";
import type { Cartao, Fatura, FaturaStatus, Parcelamento, Transaction, Wallet } from "../types/api";

const statusConfig: Record<FaturaStatus, { label: string; cls: string }> = {
  aberta: { label: "Aberta", cls: "bg-blue-500/15 text-blue-400" },
  fechada: { label: "Fechada", cls: "bg-accent-yellow/15 text-accent-yellow" },
  parcial: { label: "Parcial", cls: "bg-accent-orange/15 text-accent-orange" },
  paga: { label: "Paga", cls: "bg-accent-lime/15 text-accent-lime" },
};

function mesReferenciaLabel(mesReferencia: string) {
  const [ano, mes] = mesReferencia.split("-").map(Number);
  const date = new Date(Date.UTC(ano, mes - 1, 1));
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function PagarFaturaModal({
  open,
  onClose,
  cartao,
  fatura,
}: {
  open: boolean;
  onClose: () => void;
  cartao: Cartao;
  fatura: Fatura;
}) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const totalDevido = Number((fatura.valorTotal + fatura.saldoRotativoAnterior).toFixed(2));
  const restante = Number((totalDevido - fatura.valorPago).toFixed(2));
  const [carteiraPagadoraId, setCarteiraPagadoraId] = useState(cartao.carteiraPagamentoId ?? "");
  const [modoParcial, setModoParcial] = useState(false);
  const [valor, setValor] = useState(restante);

  useEffect(() => {
    if (open) {
      setCarteiraPagadoraId(cartao.carteiraPagamentoId ?? "");
      setModoParcial(false);
      setValor(restante);
    }
  }, [open, cartao.carteiraPagamentoId, restante]);

  const walletsQuery = useQuery<Wallet[]>({
    queryKey: ["wallets"],
    queryFn: async () => {
      const { data } = await api.get<Wallet[]>("/api/wallets");
      return Array.isArray(data) ? data : [];
    },
    enabled: open,
  });

  const valorEfetivo = modoParcial ? valor : restante;
  const faltaAposPagamento = Number((restante - valorEfetivo).toFixed(2));
  const viraRotativo = modoParcial && faltaAposPagamento > 0.005;

  const payMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/api/cartoes/${cartao._id}/faturas/${fatura._id}/pagar`, {
        carteiraPagadoraId: carteiraPagadoraId || undefined,
        valor: valorEfetivo,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cartoes"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      addToast("Fatura paga com sucesso.", "success");
      onClose();
    },
    onError: (error) => {
      addToast(getApiErrorMessages(error, "Não foi possível pagar a fatura.")[0], "error");
    },
  });

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Pagar Fatura"
      icon={<WalletIcon className="h-6 w-6 text-accent-lime" />}
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={payMutation.isPending}
            className="flex-1 rounded-xl border border-bg-muted bg-transparent px-5 py-3 text-sm font-bold text-white transition hover:bg-bg-overlay disabled:opacity-70"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => payMutation.mutate()}
            disabled={payMutation.isPending || !carteiraPagadoraId || valorEfetivo <= 0}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-lime px-5 py-3 text-sm font-bold text-black transition hover:brightness-110 disabled:opacity-70"
          >
            {payMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirmar Pagamento
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="text-sm text-text-secondary">Total devido</p>
          <p className="mt-1 font-sans text-3xl font-extrabold text-accent-lime">{formatCurrency(restante)}</p>
        </div>

        <div>
          <span className="mb-2 block text-sm text-text-secondary">Carteira pagadora <span className="text-accent-red">*</span></span>
          {walletsQuery.isLoading ? (
            <div className="h-12 animate-pulse rounded-xl bg-bg-muted" />
          ) : (
            <div className="flex flex-wrap gap-2">
              {(walletsQuery.data ?? []).map((w) => (
                <button
                  key={w._id}
                  type="button"
                  onClick={() => setCarteiraPagadoraId(w._id)}
                  className={cn(
                    "rounded-xl border px-4 py-2 text-sm font-medium transition",
                    carteiraPagadoraId === w._id
                      ? "border-accent-lime bg-accent-lime/10 text-white"
                      : "border-bg-muted text-text-secondary hover:border-bg-overlay hover:text-white",
                  )}
                >
                  {w.nome}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <span className="mb-2 block text-sm text-text-secondary">Valor a pagar</span>
          <div className="mb-2 flex gap-1 rounded-xl bg-bg-muted p-1">
            <button
              type="button"
              onClick={() => setModoParcial(false)}
              className={cn(
                "flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition",
                !modoParcial ? "bg-accent-lime text-black" : "text-white hover:bg-bg-overlay",
              )}
            >
              Valor integral
            </button>
            <button
              type="button"
              onClick={() => setModoParcial(true)}
              className={cn(
                "flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition",
                modoParcial ? "bg-accent-lime text-black" : "text-white hover:bg-bg-overlay",
              )}
            >
              Valor parcial
            </button>
          </div>
          {modoParcial && (
            <div className="flex items-center rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 focus-within:border-accent-lime">
              <CurrencyInput
                value={valor}
                onChange={setValor}
                className="w-full bg-transparent text-center font-sans text-2xl font-bold text-accent-lime outline-none"
              />
            </div>
          )}
        </div>

        {viraRotativo && (
          <div className="flex gap-3 rounded-xl border border-accent-yellow/40 bg-accent-yellow/10 p-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-accent-yellow" />
            <div className="text-sm text-yellow-200">
              <p className="font-semibold">
                O restante de {formatCurrency(faltaAposPagamento)} vai virar rotativo.
              </p>
              <p className="mt-1 text-yellow-200/80">
                Esse valor será cobrado{cartao.taxaJurosRotativo ? ` com juros de ${cartao.taxaJurosRotativo}% ao mês` : ""} na
                próxima fatura, junto com as novas compras do ciclo seguinte.
              </p>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

export function CartaoPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [tab, setTab] = useState<"faturas" | "parcelas">("faturas");
  const [selectedFaturaId, setSelectedFaturaId] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [estornoTarget, setEstornoTarget] = useState<Transaction | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const cartaoQuery = useQuery<Cartao>({
    queryKey: ["cartoes", id],
    queryFn: async () => {
      const { data } = await api.get<Cartao>(`/api/cartoes/${id}`);
      return data;
    },
    enabled: !!id,
  });
  const cartao = cartaoQuery.data;
  const faturasData = cartao?.faturas;
  const faturas = useMemo(() => faturasData ?? [], [faturasData]);
  // O backend devolve as faturas da mais recente pra mais antiga (útil pra achar a aberta
  // por padrão, mais abaixo) — mas numa tira horizontal de abas isso lê "ao contrário" da
  // esquerda pra direita. Só a exibição é invertida; qual fatura abre por padrão continua
  // baseado na ordem original.
  const faturasCronologicas = useMemo(() => [...faturas].reverse(), [faturas]);

  useEffect(() => {
    if (!selectedFaturaId && faturas.length > 0) {
      const aberta = faturas.find((f) => f.status === "aberta");
      setSelectedFaturaId((aberta ?? faturas[0])._id);
    }
  }, [faturas, selectedFaturaId]);

  const faturaQuery = useQuery<Fatura>({
    queryKey: ["cartoes", id, "faturas", selectedFaturaId],
    queryFn: async () => {
      const { data } = await api.get<Fatura>(`/api/cartoes/${id}/faturas/${selectedFaturaId}`);
      return data;
    },
    enabled: !!id && !!selectedFaturaId,
  });
  const fatura = faturaQuery.data;
  const transacoesData = fatura?.transacoes;
  const transacoes = useMemo(() => transacoesData ?? [], [transacoesData]);
  // Compras já revertidas não podem ser estornadas de novo — o backend recusa (400), mas
  // esconder o botão evita o usuário nem tentar. A própria fatura já traz as duas pontas
  // (compra original + estorno), então dá pra calcular isso sem outra chamada.
  const estornadasIds = useMemo(
    () => new Set(transacoes.filter((t) => t.isEstorno && t.estornoDeTransacaoId).map((t) => t.estornoDeTransacaoId as string)),
    [transacoes],
  );

  const parcelamentosQuery = useQuery<Parcelamento[]>({
    queryKey: ["cartoes", id, "parcelamentos"],
    queryFn: async () => {
      const { data } = await api.get<Parcelamento[]>(`/api/cartoes/${id}/parcelamentos`);
      return Array.isArray(data) ? data : [];
    },
    enabled: !!id && tab === "parcelas",
  });

  const estornoMutation = useMutation({
    mutationFn: async (txId: string) => {
      await api.post(`/api/cartoes/transacoes/${txId}/estorno`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cartoes"] });
      addToast("Estorno registrado com sucesso.", "success");
      setEstornoTarget(null);
    },
    onError: (error) => {
      addToast(getApiErrorMessages(error, "Não foi possível estornar esta transação.")[0], "error");
      setEstornoTarget(null);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/api/wallets/${id}/arquivar`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cartoes"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      addToast("Cartão arquivado. O histórico continua disponível nos relatórios.", "success");
      navigate("/cartoes");
    },
    onError: (error) => {
      addToast(getApiErrorMessages(error, "Não foi possível arquivar este cartão.")[0], "error");
      setArchiveOpen(false);
    },
  });

  if (cartaoQuery.isLoading) {
    return (
      <section className="space-y-6">
        <div className="h-32 animate-pulse rounded-2xl bg-bg-muted" />
        <div className="h-64 animate-pulse rounded-2xl bg-bg-muted" />
      </section>
    );
  }

  if (!cartao) {
    return (
      <div className="rounded-2xl bg-bg-card p-8 text-center text-text-secondary">
        Cartão não encontrado.{" "}
        <Link to="/cartoes" className="text-accent-lime underline">Voltar</Link>
      </div>
    );
  }

  const usadoPct = cartao.limite ? Math.min(100, (cartao.limiteUsado / cartao.limite) * 100) : 0;

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="rounded-xl p-2 transition hover:bg-bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="text-sm text-text-secondary">Cartão</p>
          <h1 className="font-sans text-2xl font-bold">{cartao.nome}</h1>
        </div>
      </div>

      <div className="rounded-2xl bg-bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <BankLogo nome={cartao.nome} icone={cartao.icone} className="h-12 w-12" />
            <p className="mt-3 text-sm uppercase tracking-widest text-text-secondary">Limite usado</p>
            <p className="mt-1 font-sans text-2xl font-extrabold text-white">
              {formatCurrency(cartao.limiteUsado)} <span className="text-sm font-normal text-text-secondary">/ {formatCurrency(cartao.limite ?? 0)}</span>
            </p>
            <div className="mt-2 h-2 w-full max-w-xs overflow-hidden rounded-full bg-bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  usadoPct >= 100 ? "bg-accent-red" : usadoPct >= 80 ? "bg-accent-yellow" : "bg-accent-lime",
                )}
                style={{ width: `${usadoPct}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-text-secondary">{formatCurrency(cartao.limiteDisponivel ?? 0)} disponível</p>
          </div>
          <button
            type="button"
            onClick={() => setArchiveOpen(true)}
            className="rounded-xl border border-bg-muted p-2 text-text-secondary transition hover:bg-bg-muted hover:text-white"
            title="Arquivar cartão"
          >
            <Archive className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex w-fit gap-1 rounded-xl bg-bg-muted p-1">
        {(["faturas", "parcelas"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold transition",
              tab === t ? "bg-accent-lime text-black" : "text-white hover:bg-bg-overlay",
            )}
          >
            {t === "faturas" ? "Faturas" : "Compras parceladas"}
          </button>
        ))}
      </div>

      {tab === "faturas" && (
        <div className="space-y-4">
          {faturas.length === 0 ? (
            <div className="rounded-2xl bg-bg-card p-8 text-center text-text-secondary">
              Nenhuma fatura ainda. Ela é criada automaticamente na primeira compra do ciclo.
            </div>
          ) : (
            <>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {faturasCronologicas.map((f) => {
                  const cfg = statusConfig[f.status];
                  const active = f._id === selectedFaturaId;
                  return (
                    <button
                      key={f._id}
                      type="button"
                      onClick={() => setSelectedFaturaId(f._id)}
                      className={cn(
                        "flex shrink-0 flex-col items-start gap-1 rounded-xl border px-4 py-2 text-left transition",
                        active ? "border-accent-lime bg-accent-lime/10" : "border-bg-muted bg-bg-card hover:border-bg-overlay",
                      )}
                    >
                      <span className="text-sm font-semibold capitalize text-white">{mesReferenciaLabel(f.mesReferencia)}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", cfg.cls)}>{cfg.label}</span>
                    </button>
                  );
                })}
              </div>

              {fatura && (
                <div className="rounded-2xl bg-bg-card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-sans text-xl font-bold capitalize">{mesReferenciaLabel(fatura.mesReferencia)}</h2>
                        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", statusConfig[fatura.status].cls)}>
                          {statusConfig[fatura.status].label}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-text-secondary">
                        Fecha em {formatDisplayDate(fatura.dataFechamento)} · Vence em {formatDisplayDate(fatura.dataVencimento)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-text-secondary">
                        {fatura.valorTotal + fatura.saldoRotativoAnterior < 0 ? "Crédito nesta fatura" : "Total da fatura"}
                      </p>
                      <p className={cn(
                        "font-sans text-2xl font-extrabold",
                        fatura.valorTotal + fatura.saldoRotativoAnterior < 0 ? "text-accent-lime" : "text-white",
                      )}>
                        {formatCurrency(Math.abs(Number((fatura.valorTotal + fatura.saldoRotativoAnterior).toFixed(2))))}
                      </p>
                      {fatura.valorPago > 0 && (
                        <p className="text-xs text-accent-lime">{formatCurrency(fatura.valorPago)} já pago</p>
                      )}
                    </div>
                  </div>

                  {fatura.saldoRotativoAnterior !== 0 && (
                    <div className="mt-4 rounded-xl bg-bg-muted p-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-text-secondary">
                          {fatura.saldoRotativoAnterior > 0 ? "Saldo rotativo do mês anterior" : "Crédito do mês anterior"}
                        </span>
                        <span className={cn("font-semibold", fatura.saldoRotativoAnterior > 0 ? "text-white" : "text-accent-lime")}>
                          {fatura.saldoRotativoAnterior > 0 ? "" : "− "}{formatCurrency(Math.abs(fatura.saldoRotativoAnterior))}
                        </span>
                      </div>
                      {fatura.saldoRotativoAnterior < 0 && (
                        <p className="mt-1 text-xs text-text-secondary">
                          A fatura anterior ficou paga a mais (ex: um estorno chegou depois do pagamento) — o crédito abate esta fatura.
                        </p>
                      )}
                      {fatura.jurosAplicados > 0 && (
                        <div className="mt-1 flex justify-between text-accent-yellow">
                          <span>Juros do rotativo aplicados</span>
                          <span className="font-semibold">{formatCurrency(fatura.jurosAplicados)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {fatura.status !== "paga" && fatura.valorTotal + fatura.saldoRotativoAnterior - fatura.valorPago > 0.005 && (
                    <button
                      type="button"
                      onClick={() => setPayOpen(true)}
                      className="mt-4 w-full rounded-xl bg-accent-lime py-3 text-sm font-bold text-black transition hover:brightness-110 sm:w-auto sm:px-6"
                    >
                      Pagar Fatura
                    </button>
                  )}

                  <div className="mt-5 divide-y divide-bg-muted">
                    {transacoes.length === 0 ? (
                      <p className="py-6 text-center text-sm text-text-secondary">Nenhuma transação nesta fatura.</p>
                    ) : (
                      transacoes.map((tx) => {
                        const isJuros = tx.description === "Juros rotativo do cartão";
                        return (
                          <div key={tx._id} className="flex items-center justify-between gap-3 py-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className={cn("truncate text-sm font-semibold", isJuros ? "text-accent-yellow" : "text-white")}>
                                  {tx.description || "Compra"}
                                </p>
                                {tx.numeroParcela && tx.totalParcelas && (
                                  <span className="shrink-0 rounded-full bg-blue-500/15 px-2 py-0.5 text-[11px] font-semibold text-blue-400">
                                    {tx.numeroParcela}/{tx.totalParcelas}
                                  </span>
                                )}
                                {tx.isEstorno && (
                                  <span className="shrink-0 rounded-full bg-accent-lime/15 px-2 py-0.5 text-[11px] font-semibold text-accent-lime">
                                    Estorno
                                  </span>
                                )}
                                {!tx.isEstorno && estornadasIds.has(tx._id) && (
                                  <span className="shrink-0 rounded-full bg-bg-muted px-2 py-0.5 text-[11px] font-semibold text-text-secondary">
                                    Já estornada
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-text-secondary">{formatDisplayDate(tx.date)}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-3">
                              <span className={cn("font-bold tabular-nums", tx.isEstorno ? "text-accent-lime" : "text-white")}>
                                {tx.isEstorno ? "+" : ""}{formatCurrency(tx.value)}
                              </span>
                              {!tx.isEstorno && !isJuros && !estornadasIds.has(tx._id) && (
                                <button
                                  type="button"
                                  onClick={() => setEstornoTarget(tx)}
                                  className="rounded-lg p-1.5 text-text-muted transition hover:bg-accent-red/10 hover:text-accent-red"
                                  title="Estornar"
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === "parcelas" && (
        <div className="space-y-4">
          {parcelamentosQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl bg-bg-muted" />
              ))}
            </div>
          ) : (parcelamentosQuery.data ?? []).length === 0 ? (
            <div className="rounded-2xl bg-bg-card p-8 text-center text-text-secondary">
              Nenhuma compra parcelada neste cartão.
            </div>
          ) : (
            (parcelamentosQuery.data ?? []).map((p) => (
              <div key={p._id} className="rounded-2xl bg-bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{p.descricao}</p>
                    <p className="text-xs text-text-secondary">
                      Comprado em {formatDisplayDate(p.dataCompra)} · {formatCurrency(p.valorTotal)} em {p.totalParcelas}x
                    </p>
                  </div>
                  <span className="rounded-full bg-blue-500/15 px-2.5 py-1 text-[11px] font-semibold text-blue-400">
                    {p.parcelasPagas}/{p.totalParcelas} pagas
                  </span>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-bg-muted">
                  <div
                    className="h-full rounded-full bg-accent-lime transition-all"
                    style={{ width: `${p.totalParcelas > 0 ? (p.parcelasPagas / p.totalParcelas) * 100 : 0}%` }}
                  />
                </div>
                <p className="mt-2 text-sm text-text-secondary">
                  Falta pagar <span className="font-semibold text-accent-red">{formatCurrency(p.valorRestante)}</span> — já comprometido nos próximos meses.
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {fatura && (
        <PagarFaturaModal open={payOpen} onClose={() => setPayOpen(false)} cartao={cartao} fatura={fatura} />
      )}

      {estornoTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm space-y-4 rounded-2xl border border-bg-muted bg-bg-card p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-accent-red/10 p-2.5">
                <RotateCcw className="h-5 w-5 text-accent-red" />
              </div>
              <h2 className="text-base font-bold text-white">Estornar esta compra?</h2>
            </div>
            <p className="text-sm text-text-secondary">
              Vai lançar um estorno de <span className="font-semibold text-white">{formatCurrency(estornoTarget.value)}</span> na fatura, reduzindo o valor devido. A transação original continua no histórico.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setEstornoTarget(null)}
                disabled={estornoMutation.isPending}
                className="flex-1 rounded-xl border border-bg-muted bg-transparent px-4 py-2.5 text-sm font-bold text-white transition hover:bg-bg-overlay disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => estornoMutation.mutate(estornoTarget._id)}
                disabled={estornoMutation.isPending}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-red px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
              >
                {estornoMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirmar Estorno
              </button>
            </div>
          </div>
        </div>
      )}

      <ArchiveCartaoModal
        isOpen={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={() => archiveMutation.mutate()}
        cartaoNome={cartao.nome}
        isLoading={archiveMutation.isPending}
      />
    </section>
  );
}
