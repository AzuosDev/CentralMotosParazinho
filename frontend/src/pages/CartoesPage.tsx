import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, CreditCard, Loader2, Plus } from "lucide-react";

import { api } from "../lib/api";
import { cn } from "../lib/utils";
import { formatCurrency, formatDisplayDate } from "../lib/finance";
import { detectBankIcon } from "../lib/bankIcons";
import { getApiErrorMessages } from "../lib/errors";
import { BankLogo } from "../components/ui/BankLogo";
import { CurrencyInput } from "../components/ui/CurrencyInput";
import { ArchiveCartaoModal } from "../components/modals/ArchiveCartaoModal";
import { useToast } from "../components/ui/Toast";
import type { Cartao, Wallet } from "../types/api";

const BANKS = [
  "Nubank", "Banco Inter", "Itaú", "Bradesco", "Santander",
  "Caixa Econômica Federal", "Banco do Brasil", "C6 Bank",
  "XP Investimentos", "PicPay", "Mercado Pago", "PagBank",
  "BTG Pactual", "Sicredi", "Sicoob", "Neon", "Next",
  "Wise", "Revolut", "Stone", "Original", "Warren", "Rico",
  "Clear", "Nomad", "Avenue",
];

const BANDEIRAS = ["Visa", "Mastercard", "Elo", "American Express", "Hipercard", "Outra"];

type CardFormState = {
  id?: string;
  nome: string;
  icone: string;
  bandeira: string;
  ultimosDigitos: string;
  limite: number;
  diaFechamento: string;
  diaVencimento: string;
  carteiraPagamentoId: string;
  taxaJurosRotativo: string;
};

const emptyForm: CardFormState = {
  nome: "",
  icone: "💳",
  bandeira: "",
  ultimosDigitos: "",
  limite: 0,
  diaFechamento: "",
  diaVencimento: "",
  carteiraPagamentoId: "",
  taxaJurosRotativo: "",
};

export function CartoesPage() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [isCustomBank, setIsCustomBank] = useState(false);
  const [form, setForm] = useState<CardFormState>(emptyForm);
  const [cartaoToArchive, setCartaoToArchive] = useState<Cartao | null>(null);

  useEffect(() => {
    if (searchParams.get("action") === "create") {
      setShowForm(true);
      setForm(emptyForm);
      setSearchParams((prev) => { const next = new URLSearchParams(prev); next.delete("action"); return next; }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const { data: cartoes = [], isLoading } = useQuery<Cartao[]>({
    queryKey: ["cartoes"],
    queryFn: async () => {
      const { data } = await api.get<Cartao[]>("/api/cartoes");
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: carteirasPagadoras = [] } = useQuery<Wallet[]>({
    queryKey: ["wallets"],
    queryFn: async () => {
      const { data } = await api.get<Wallet[]>("/api/wallets");
      return Array.isArray(data) ? data : [];
    },
  });

  function openCreate() {
    setForm(emptyForm);
    setIsCustomBank(false);
    setShowForm(true);
  }

  function openEdit(cartao: Cartao) {
    setForm({
      id: cartao._id,
      nome: cartao.nome,
      icone: cartao.icone ?? "💳",
      bandeira: cartao.bandeira ?? "",
      ultimosDigitos: cartao.ultimosDigitos ?? "",
      limite: cartao.limite ?? 0,
      diaFechamento: cartao.diaFechamento?.toString() ?? "",
      diaVencimento: cartao.diaVencimento?.toString() ?? "",
      carteiraPagamentoId: cartao.carteiraPagamentoId ?? "",
      taxaJurosRotativo: cartao.taxaJurosRotativo?.toString() ?? "",
    });
    setIsCustomBank(!BANKS.includes(cartao.nome));
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setIsCustomBank(false);
    setForm(emptyForm);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        nome: form.nome.trim(),
        icone: form.icone || "💳",
        tipo: "credito" as const,
        bandeira: form.bandeira || undefined,
        ultimosDigitos: form.ultimosDigitos || undefined,
        limite: form.limite,
        diaFechamento: Number(form.diaFechamento),
        diaVencimento: Number(form.diaVencimento),
        carteiraPagamentoId: form.carteiraPagamentoId || undefined,
        taxaJurosRotativo: form.taxaJurosRotativo ? Number(form.taxaJurosRotativo) : undefined,
      };
      if (form.id) {
        await api.patch(`/api/wallets/${form.id}`, payload);
      } else {
        await api.post("/api/wallets", payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cartoes"] });
      closeForm();
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/api/wallets/${id}/arquivar`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cartoes"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      addToast("Cartão arquivado. O histórico continua disponível nos relatórios.", "success");
      setCartaoToArchive(null);
    },
    onError: (error) => {
      addToast(getApiErrorMessages(error, "Não foi possível arquivar este cartão.")[0], "error");
      setCartaoToArchive(null);
    },
  });

  const canSave =
    form.nome.trim().length > 0 &&
    form.limite > 0 &&
    Number(form.diaFechamento) >= 1 && Number(form.diaFechamento) <= 31 &&
    Number(form.diaVencimento) >= 1 && Number(form.diaVencimento) <= 31;

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-text-secondary">Seus cartões</p>
          <h1 className="font-sans text-3xl font-bold">Cartões</h1>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-xl bg-accent-lime px-4 py-3 text-sm font-bold text-black transition hover:brightness-110"
        >
          <Plus className="h-4 w-4" />
          Novo Cartão
        </button>
      </div>

      {showForm && (
        <div className="space-y-4 rounded-2xl bg-bg-card p-5">
          <h2 className="font-bold">{form.id ? "Editar Cartão" : "Novo Cartão"}</h2>
          <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
            <div className="flex h-[50px] w-[50px] items-center justify-center self-end rounded-xl bg-bg-muted text-3xl">
              <BankLogo nome={form.nome} icone={form.icone} className="h-8 w-8" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="block">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm text-text-secondary">
                    {isCustomBank ? "Nome do cartão *" : "Banco *"}
                  </span>
                  {isCustomBank && (
                    <button
                      type="button"
                      onClick={() => { setIsCustomBank(false); setForm((f) => ({ ...f, nome: "", icone: "💳" })); }}
                      className="text-xs text-accent-lime hover:underline"
                    >
                      ← Voltar para a lista
                    </button>
                  )}
                </div>
                {isCustomBank ? (
                  <input
                    autoFocus
                    value={form.nome}
                    onChange={(e) => {
                      const nome = e.target.value;
                      const auto = detectBankIcon(nome);
                      setForm((f) => ({ ...f, nome, icone: auto || f.icone }));
                    }}
                    placeholder="Ex: Cartão Safra Black…"
                    className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-white outline-none focus:border-accent-lime"
                  />
                ) : (
                  <select
                    value={form.nome}
                    onChange={(e) => {
                      if (e.target.value === "__outro__") {
                        setIsCustomBank(true);
                        setForm((f) => ({ ...f, nome: "", icone: "💳" }));
                      } else {
                        const nome = e.target.value;
                        const auto = detectBankIcon(nome);
                        setForm((f) => ({ ...f, nome, icone: auto || "💳" }));
                      }
                    }}
                    className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-white outline-none focus:border-accent-lime"
                  >
                    <option value="">Selecione um banco…</option>
                    {BANKS.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                    <option value="__outro__">Outro (Digitar nome)</option>
                  </select>
                )}
              </div>

              <label className="block">
                <span className="mb-1 block text-sm text-text-secondary">Bandeira</span>
                <select
                  value={form.bandeira}
                  onChange={(e) => setForm((f) => ({ ...f, bandeira: e.target.value }))}
                  className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-white outline-none focus:border-accent-lime"
                >
                  <option value="">Selecione…</option>
                  {BANDEIRAS.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm text-text-secondary">Últimos 4 dígitos</span>
                <input
                  value={form.ultimosDigitos}
                  onChange={(e) => setForm((f) => ({ ...f, ultimosDigitos: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                  placeholder="1234"
                  maxLength={4}
                  className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-white outline-none focus:border-accent-lime"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm text-text-secondary">Limite *</span>
                <CurrencyInput
                  value={form.limite}
                  onChange={(v) => setForm((f) => ({ ...f, limite: v }))}
                  className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-white outline-none focus:border-accent-lime"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm text-text-secondary">Dia de fechamento *</span>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={form.diaFechamento}
                  onChange={(e) => setForm((f) => ({ ...f, diaFechamento: e.target.value }))}
                  placeholder="Ex: 20"
                  className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-white outline-none focus:border-accent-lime"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm text-text-secondary">Dia de vencimento *</span>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={form.diaVencimento}
                  onChange={(e) => setForm((f) => ({ ...f, diaVencimento: e.target.value }))}
                  placeholder="Ex: 27"
                  className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-white outline-none focus:border-accent-lime"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm text-text-secondary">Carteira pagadora padrão</span>
                <select
                  value={form.carteiraPagamentoId}
                  onChange={(e) => setForm((f) => ({ ...f, carteiraPagamentoId: e.target.value }))}
                  className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-white outline-none focus:border-accent-lime"
                >
                  <option value="">Nenhuma</option>
                  {carteirasPagadoras.map((w) => (
                    <option key={w._id} value={w._id}>{w.nome}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm text-text-secondary">Juros do rotativo (% a.m.)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.taxaJurosRotativo}
                  onChange={(e) => setForm((f) => ({ ...f, taxaJurosRotativo: e.target.value }))}
                  placeholder="Ex: 12.5"
                  className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-white outline-none focus:border-accent-lime"
                />
              </label>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={closeForm}
              className="flex-1 rounded-xl border border-bg-muted py-3 text-sm font-bold transition hover:bg-bg-muted"
            >
              Cancelar
            </button>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !canSave}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-lime py-3 text-sm font-bold text-black transition hover:brightness-110 disabled:opacity-60"
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {form.id ? "Salvar Alterações" : "Criar Cartão"}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl bg-bg-muted" />
          ))}
        </div>
      ) : cartoes.length === 0 ? (
        <div className="rounded-2xl bg-bg-card p-10 text-center text-text-secondary">
          <CreditCard className="mx-auto mb-3 h-10 w-10 text-text-muted" />
          <p className="font-semibold">Nenhum cartão cadastrado ainda.</p>
          <p className="mt-1 text-sm">Clique em "Novo Cartão" para começar.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cartoes.map((cartao) => {
            const usadoPct = cartao.limite ? Math.min(100, (cartao.limiteUsado / cartao.limite) * 100) : 0;
            return (
              <div key={cartao._id} className="flex flex-col gap-4 rounded-2xl bg-bg-card p-5">
                <Link to={`/cartoes/${cartao._id}`} className="flex items-center gap-3">
                  <BankLogo nome={cartao.nome} icone={cartao.icone} className="h-10 w-10" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">{cartao.nome}</p>
                    <p className="text-xs text-text-secondary">
                      {cartao.bandeira ?? "Cartão de crédito"}
                      {cartao.ultimosDigitos ? ` •••• ${cartao.ultimosDigitos}` : ""}
                    </p>
                  </div>
                </Link>

                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-text-secondary">Limite usado</span>
                    <span className="font-semibold text-white">{formatCurrency(cartao.limiteUsado)} / {formatCurrency(cartao.limite ?? 0)}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        usadoPct >= 100 ? "bg-accent-red" : usadoPct >= 80 ? "bg-accent-yellow" : "bg-accent-lime",
                      )}
                      style={{ width: `${usadoPct}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-text-secondary">
                    {formatCurrency(cartao.limiteDisponivel ?? 0)} disponível
                  </p>
                </div>

                {cartao.faturaAberta ? (
                  <div className="rounded-xl bg-bg-muted p-3">
                    <p className="text-xs text-text-secondary">Fatura aberta</p>
                    <p className="font-sans text-lg font-bold text-white">{formatCurrency(cartao.faturaAberta.valorTotal)}</p>
                    <p className="text-xs text-text-muted">Vence em {formatDisplayDate(cartao.faturaAberta.dataVencimento)}</p>
                  </div>
                ) : (
                  <p className="text-xs text-text-muted">Nenhuma fatura em aberto.</p>
                )}

                <div className="flex gap-2">
                  <Link
                    to={`/cartoes/${cartao._id}`}
                    className="flex-1 rounded-xl border border-bg-muted py-2 text-center text-sm font-semibold text-white transition hover:bg-bg-muted"
                  >
                    Ver detalhes
                  </Link>
                  <button
                    type="button"
                    onClick={() => openEdit(cartao)}
                    className="rounded-xl border border-bg-muted px-3 py-2 text-sm font-semibold text-text-secondary transition hover:bg-bg-muted hover:text-white"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => setCartaoToArchive(cartao)}
                    className="rounded-xl border border-bg-muted px-3 py-2 text-sm font-semibold text-text-secondary transition hover:bg-bg-muted hover:text-white"
                    title="Arquivar cartão"
                  >
                    <Archive className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ArchiveCartaoModal
        isOpen={!!cartaoToArchive}
        onClose={() => setCartaoToArchive(null)}
        onConfirm={() => cartaoToArchive && archiveMutation.mutate(cartaoToArchive._id)}
        cartaoNome={cartaoToArchive?.nome ?? ""}
        isLoading={archiveMutation.isPending}
      />
    </section>
  );
}
