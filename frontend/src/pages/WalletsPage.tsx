import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Loader2, Eye, EyeOff, Trash2, FileUp } from "lucide-react";
import { useShowValues } from "../hooks/useShowValues";

import { api } from "../lib/api";
import { cn } from "../lib/utils";
import { detectBankIcon } from "../lib/bankIcons";
import { BankLogo } from "../components/ui/BankLogo";
import { DeleteWalletModal } from "../components/modals/DeleteWalletModal";
import { CurrencyInput } from "../components/ui/CurrencyInput";
import { OFXImportModal } from "../components/modals/OFXImportModal";
import { useToast } from "../components/ui/Toast";
import type { Wallet } from "../types/api";

const brlFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const BANKS = [
  "Nubank", "Banco Inter", "Itaú", "Bradesco", "Santander",
  "Caixa Econômica Federal", "Banco do Brasil", "C6 Bank",
  "XP Investimentos", "PicPay", "Mercado Pago", "PagBank",
  "BTG Pactual", "Sicredi", "Sicoob", "Neon", "Next",
  "Wise", "Revolut", "Stone", "Original", "Warren", "Rico",
  "Clear", "Nomad", "Avenue",
];

export function WalletsPage() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const { show, toggle } = useShowValues();
  const [walletToDelete, setWalletToDelete] = useState<Wallet | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const fmt = (v: number) => (show ? brlFormatter.format(v) : "R$ ••••");
  const [searchParams, setSearchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [isCustomBank, setIsCustomBank] = useState(false);

  useEffect(() => {
    if (searchParams.get("action") === "create") {
      setShowForm(true);
      setSearchParams((prev) => { const next = new URLSearchParams(prev); next.delete("action"); return next; }, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const [nome, setNome] = useState("");
  const [saldo, setSaldo] = useState(0);
  const [icone, setIcone] = useState("🏦");

  const { data: wallets = [], isLoading } = useQuery<Wallet[]>({
    queryKey: ["wallets"],
    queryFn: async () => {
      const { data } = await api.get<Wallet[]>("/api/wallets");
      return Array.isArray(data) ? data : [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await api.post("/api/wallets", {
        nome: nome.trim(),
        saldo,
        icone: icone || "🏦",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setShowForm(false);
      setIsCustomBank(false);
      setNome("");
      setSaldo(0);
      setIcone("🏦");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/wallets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      addToast("Carteira excluída com sucesso.", "success");
      setWalletToDelete(null);
    },
    onError: (error: unknown) => {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      addToast(msg || "Erro ao excluir carteira.", "error");
      setWalletToDelete(null);
    },
  });

  const totalSaldo = wallets.reduce((sum, w) => sum + w.saldo, 0);

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-text-secondary">Suas contas</p>
          <h1 className="font-sans text-3xl font-bold">Carteiras</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 rounded-xl border border-bg-muted px-4 py-3 text-sm font-semibold text-text-primary transition hover:bg-bg-muted"
          >
            <FileUp className="h-4 w-4" />
            Importar OFX
          </button>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-2 rounded-xl bg-accent-lime px-4 py-3 text-sm font-bold text-black transition hover:brightness-110"
          >
            <Plus className="h-4 w-4" />
            Nova Carteira
          </button>
        </div>
      </div>

      {/* Saldo total */}
      <div className="rounded-2xl bg-bg-card p-6">
        <p className="text-sm uppercase tracking-widest text-text-secondary">Saldo Total</p>
        <div className="mt-2 flex items-center gap-3">
          <strong className={cn("font-sans text-4xl font-extrabold", totalSaldo < 0 ? "text-accent-red" : "text-accent-lime")}>
            {fmt(totalSaldo)}
          </strong>
          <button
            onClick={toggle}
            className="rounded-lg p-1 text-text-secondary transition hover:text-text-primary"
            aria-label={show ? "Ocultar valores" : "Mostrar valores"}
          >
            {show ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
          </button>
        </div>
        <p className="mt-1 text-sm text-text-secondary">{wallets.length} carteira{wallets.length !== 1 ? "s" : ""}</p>
      </div>

      {/* Formulário de nova carteira */}
      {showForm && (
        <div className="rounded-2xl bg-bg-card p-5 space-y-4">
          <h2 className="font-bold">Nova Carteira</h2>
          <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
            {/* Logo/ícone auto-detectado, apenas visualização */}
            <div className="flex h-[50px] w-[50px] items-center justify-center self-end rounded-xl bg-bg-muted text-3xl">
              <BankLogo nome={nome} icone={icone} className="h-8 w-8" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Banco: select ou input livre */}
              <div className="block">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm text-text-secondary">
                    {isCustomBank ? "Nome do banco *" : "Banco *"}
                  </span>
                  {isCustomBank && (
                    <button
                      type="button"
                      onClick={() => { setIsCustomBank(false); setNome(""); setIcone("🏦"); }}
                      className="text-xs text-accent-lime hover:underline"
                    >
                      ← Voltar para a lista
                    </button>
                  )}
                </div>
                {isCustomBank ? (
                  <input
                    autoFocus
                    value={nome}
                    onChange={(e) => {
                      setNome(e.target.value);
                      const auto = detectBankIcon(e.target.value);
                      if (auto) setIcone(auto);
                    }}
                    placeholder="Ex: Banco Safra, Sicoob…"
                    className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-text-primary outline-none focus:border-accent-lime"
                  />
                ) : (
                  <select
                    value={nome}
                    onChange={(e) => {
                      if (e.target.value === "__outro__") {
                        setIsCustomBank(true);
                        setNome("");
                        setIcone("🏦");
                      } else {
                        setNome(e.target.value);
                        const auto = detectBankIcon(e.target.value);
                        if (auto) setIcone(auto); else setIcone("🏦");
                      }
                    }}
                    className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-text-primary outline-none focus:border-accent-lime"
                  >
                    <option value="">Selecione um banco…</option>
                    {BANKS.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                    <option value="__outro__">Outro (Digitar nome)</option>
                  </select>
                )}
              </div>

              {/* Saldo inicial */}
              <label className="block">
                <span className="mb-1 block text-sm text-text-secondary">Saldo inicial</span>
                <CurrencyInput
                  value={saldo}
                  onChange={setSaldo}
                  className="w-full rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 text-text-primary outline-none focus:border-accent-lime"
                />
              </label>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => { setShowForm(false); setIsCustomBank(false); setNome(""); setSaldo(0); setIcone("🏦"); }}
              className="flex-1 rounded-xl border border-bg-muted py-3 text-sm font-bold transition hover:bg-bg-muted"
            >
              Cancelar
            </button>
            <button
              onClick={() => { if (nome.trim()) createMutation.mutate(); }}
              disabled={createMutation.isPending || !nome.trim()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-lime py-3 text-sm font-bold text-black transition hover:brightness-110 disabled:opacity-60"
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar Carteira
            </button>
          </div>
        </div>
      )}

      {/* Lista de carteiras */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-bg-muted" />
          ))}
        </div>
      ) : wallets.length === 0 ? (
        <div className="rounded-2xl bg-bg-card p-10 text-center text-text-secondary">
          <p className="text-4xl mb-3">🏦</p>
          <p className="font-semibold">Nenhuma carteira cadastrada ainda.</p>
          <p className="mt-1 text-sm">Clique em "Nova Carteira" para começar.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {wallets.map((wallet) =>
            wallet.tipo === "VIRTUAL" ? (
              // Carteira virtual: não existe na coleção real, então não navega para
              // detalhe nem pode ser excluída, só informa o saldo de dados legados.
              <div
                key={wallet._id}
                title="Transações antigas ainda não associadas a uma carteira. Use a tela de transações para migrá-las."
                className="flex cursor-default flex-col gap-3 rounded-2xl border border-dashed border-bg-muted light:bg-bg-card/60 p-5"
              >
                <BankLogo nome={wallet.nome} icone={wallet.icone} className="h-10 w-10 opacity-70" />
                <div>
                  <p className="text-sm text-text-secondary">{wallet.nome}</p>
                  <strong className={cn("font-sans text-2xl font-bold", wallet.saldo < 0 ? "text-accent-red" : "text-accent-lime")}>
                    {fmt(wallet.saldo)}
                  </strong>
                </div>
              </div>
            ) : (
              <div key={wallet._id} className="relative group">
                <Link
                  to={`/carteiras/${wallet._id}`}
                  className="flex flex-col gap-3 rounded-2xl bg-bg-card p-5 transition hover:bg-bg-muted"
                >
                  <BankLogo nome={wallet.nome} icone={wallet.icone} className="h-10 w-10" />
                  <div>
                    <p className="text-sm text-text-secondary">{wallet.nome}</p>
                    <strong className={cn("font-sans text-2xl font-bold", wallet.saldo < 0 ? "text-accent-red" : "text-accent-lime")}>
                      {fmt(wallet.saldo)}
                    </strong>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); setWalletToDelete(wallet); }}
                  className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-text-muted opacity-0 transition hover:bg-accent-red/10 hover:text-accent-red group-hover:opacity-100"
                  title="Excluir carteira"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ),
          )}
        </div>
      )}
      <DeleteWalletModal
        isOpen={!!walletToDelete}
        onClose={() => setWalletToDelete(null)}
        onConfirm={() => walletToDelete && deleteMutation.mutate(walletToDelete._id)}
        walletName={walletToDelete?.nome ?? ""}
        isLoading={deleteMutation.isPending}
      />
      <OFXImportModal open={showImportModal} onClose={() => setShowImportModal(false)} />
    </section>
  );
}
