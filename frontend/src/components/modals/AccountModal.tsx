import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Wallet } from "lucide-react";

import { api } from "../../lib/api";
import { getApiErrorMessages } from "../../lib/errors";
import { isPastMonth } from "../../lib/finance";
import { CurrencyInput } from "../ui/CurrencyInput";
import { ModalShell } from "./ModalShell";
import { useCategories, useIncomeCategories, useWallets } from "./TransactionFormFields";
import { DynamicIcon } from "../DynamicIcon";
import { cn } from "../../lib/utils";

const PAYMENT_FORMATS = ["Cartão de Crédito", "Pix", "Dinheiro", "Outro"] as const;

type PaymentFormat = (typeof PAYMENT_FORMATS)[number];

type AccountType = "PAGAR" | "RECEBER";

function isPaymentFormat(value: string): value is PaymentFormat {
  return (PAYMENT_FORMATS as readonly string[]).includes(value);
}

function toIsoDate(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function buildPendingPayload({
  title,
  value,
  dueDate,
  description,
  isParcelada,
  isRecorrente,
  categoria,
  categoryId,
  formatoPagamento,
  carteiraId,
  tipo,
  affectsBalance,
  parcelas,
  recorrencia,
}: {
  title: string;
  value: number;
  dueDate: string;
  description: string;
  isParcelada: boolean;
  isRecorrente: boolean;
  categoria: string;
  categoryId: string;
  formatoPagamento: string;
  carteiraId: string;
  tipo: AccountType;
  affectsBalance: boolean;
  parcelas: { totalParcelas?: string; dataInicio?: string; dataFim?: string };
  recorrencia: { periodoRecorrencia?: string; dataProxima?: string; dataTermino?: string };
}) {
  const normalizedValue = value;
  const baseDate = parcelas.dataInicio || dueDate ? new Date(parcelas.dataInicio || dueDate) : undefined;
  const totalParcelas = Number(parcelas.totalParcelas);

  return {
    title: title.trim(),
    value: Number.isFinite(normalizedValue) ? normalizedValue : undefined,
    dueDate: toIsoDate(isParcelada ? (parcelas.dataInicio || dueDate) : dueDate),
    description: description.trim() || undefined,
    isParcelada,
    isRecorrente,
    categoria: categoria || undefined,
    categoryId: categoryId || undefined,
    formatoPagamento: isPaymentFormat(formatoPagamento) ? formatoPagamento : undefined,
    carteiraId: carteiraId || undefined,
    tipo,
    affectsBalance,
    parcelas: isParcelada && baseDate && Number.isFinite(totalParcelas) && totalParcelas > 0
      ? {
          totalParcelas,
          valorParcela: Number((normalizedValue / totalParcelas).toFixed(2)),
          parcelasPagas: 0,
          dataInicio: toIsoDate(parcelas.dataInicio || dueDate) ?? baseDate.toISOString(),
          dataFim: toIsoDate(parcelas.dataFim || dueDate) ?? addMonths(baseDate, totalParcelas - 1).toISOString(),
        }
      : undefined,
    recorrencia: isRecorrente
      ? {
          periodoRecorrencia: recorrencia.periodoRecorrencia ?? "Mensal",
          dataProxima: recorrencia.dataProxima ? toIsoDate(recorrencia.dataProxima) : undefined,
          dataTermino: recorrencia.dataTermino ? toIsoDate(recorrencia.dataTermino) : undefined,
        }
      : undefined,
  };
}

type AccountModalProps = {
  open: boolean;
  onClose: () => void;
  defaultType?: AccountType;
  editAccount?: {
    id: string;
    title: string;
    value: number;
    dueDate: string;
    description?: string;
    isParcelada?: boolean;
    isRecorrente?: boolean;
    categoria?: string;
    categoryId?: string;
    formatoPagamento?: string;
    carteiraId?: string;
    tipo?: AccountType;
    affectsBalance?: boolean;
    parcelas?: { totalParcelas?: number; dataInicio?: string; dataFim?: string };
    recorrencia?: { periodoRecorrencia?: string; dataProxima?: string; dataTermino?: string };
  };
  onSuccess?: () => void;
};

export function AccountModal({
  open,
  onClose,
  defaultType,
  editAccount,
  onSuccess,
}: AccountModalProps) {
  const [formTipo, setFormTipo] = useState<AccountType>(defaultType ?? "PAGAR");
  const expenseCategoriesQuery = useCategories();
  const incomeCategoriesQuery = useIncomeCategories();
  const categoriesQuery = formTipo === "RECEBER" ? incomeCategoriesQuery : expenseCategoriesQuery;
  const walletsQuery = useWallets();
  const [formIsParcelada, setFormIsParcelada] = useState(false);
  const [formIsRecorrente, setFormIsRecorrente] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formValue, setFormValue] = useState(0);
  const [formDueDate, setFormDueDate] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formParcelas, setFormParcelas] = useState<{ totalParcelas?: string; dataInicio?: string; dataFim?: string }>({});
  const [formRecorrencia, setFormRecorrencia] = useState<{
    periodoRecorrencia?: string;
    dataProxima?: string;
    dataTermino?: string;
  }>({});
  const [formRecorrenciaDay, setFormRecorrenciaDay] = useState(""); // dia 1-31, só no cadastro
  const [formRecorrenciaTermino, setFormRecorrenciaTermino] = useState<"infinita" | "N_meses">("infinita");
  const [formRecorrenciaNMeses, setFormRecorrenciaNMeses] = useState("");
  const [formCategoria, setFormCategoria] = useState("");
  const [formCategoryId, setFormCategoryId] = useState("");
  const [categoriaCustom, setCategoriaCustom] = useState("");
  const [formForma, setFormForma] = useState("");
  const [formaCustom, setFormaCustom] = useState("");
  const [formCarteiraId, setFormCarteiraId] = useState("");
  const [formAffectsBalance, setFormAffectsBalance] = useState(true);

  const queryClient = useQueryClient();
  const skipTipoResetRef = useRef(true);

  // Ao alternar PAGAR/RECEBER manualmente, limpa a categoria selecionada
  // (categorias de despesa e receita são conjuntos distintos).
  // O ref evita que esse reset dispare quando formTipo muda por causa do
  // useEffect de população (abrir para criar/editar), que já define a
  // categoria correta logo em seguida.
  useEffect(() => {
    if (skipTipoResetRef.current) {
      skipTipoResetRef.current = false;
      return;
    }
    setFormCategoria("");
    setFormCategoryId("");
    setCategoriaCustom("");
  }, [formTipo]);

  useEffect(() => {
    const total = Number(formParcelas.totalParcelas);
    if (!formParcelas.dataInicio || !total || total <= 0) return;
    const start = new Date(`${formParcelas.dataInicio}T12:00:00`);
    if (Number.isNaN(start.getTime())) return;
    const end = new Date(start);
    end.setMonth(end.getMonth() + total - 1);
    setFormParcelas((prev) => ({ ...prev, dataFim: end.toISOString().slice(0, 10) }));
  }, [formParcelas.dataInicio, formParcelas.totalParcelas]);

  useEffect(() => {
    if (open) {
      skipTipoResetRef.current = true;
      if (editAccount) {
        setFormTipo(editAccount.tipo ?? "PAGAR");
        setFormIsParcelada(!!editAccount.isParcelada);
        setFormIsRecorrente(!!editAccount.isRecorrente);
        setFormTitle(editAccount.title ?? "");
        setFormValue(editAccount.value ?? 0);
        setFormDueDate(editAccount.dueDate?.slice(0, 10) ?? "");
        setFormDescription(editAccount.description ?? "");
        setFormParcelas({
          totalParcelas: editAccount.parcelas?.totalParcelas?.toString() ?? "",
          dataInicio: editAccount.parcelas?.dataInicio?.slice(0, 10) ?? "",
          dataFim: editAccount.parcelas?.dataFim?.slice(0, 10) ?? "",
        });
        setFormRecorrencia({
          periodoRecorrencia: editAccount.recorrencia?.periodoRecorrencia ?? "Mensal",
          dataProxima: editAccount.recorrencia?.dataProxima?.slice(0, 10) ?? editAccount.dueDate?.slice(0, 10) ?? "",
          dataTermino: editAccount.recorrencia?.dataTermino?.slice(0, 10) ?? "",
        });
        setFormRecorrenciaDay("");
        setFormRecorrenciaTermino(editAccount.recorrencia?.dataTermino ? "N_meses" : "infinita");
        setFormRecorrenciaNMeses("");
        setFormCategoria(editAccount.categoria ?? "");
        setFormCategoryId(editAccount.categoryId ?? "");
        setCategoriaCustom(editAccount.categoria ?? "");
        setFormForma(editAccount.formatoPagamento ?? "");
        setFormaCustom(editAccount.formatoPagamento ?? "");
        setFormCarteiraId(editAccount.carteiraId ?? "");
        setFormAffectsBalance(editAccount.affectsBalance ?? true);
      } else {
        setFormTipo(defaultType ?? "PAGAR");
        setFormIsParcelada(false);
        setFormIsRecorrente(false);
        setFormTitle("");
        setFormValue(0);
        setFormDueDate("");
        setFormDescription("");
        setFormParcelas({});
        setFormRecorrencia({ periodoRecorrencia: "Mensal" });
        setFormRecorrenciaDay("");
        setFormRecorrenciaTermino("infinita");
        setFormRecorrenciaNMeses("");
        setFormCategoria("");
        setFormCategoryId("");
        setCategoriaCustom("");
        setFormForma("");
        setFormaCustom("");
        setFormCarteiraId("");
        setFormAffectsBalance(true);
      }
    }
  }, [open, editAccount, defaultType]);

  const createMutation = useMutation({
    mutationFn: async () => {
      // Recorrente no cadastro: calcula dueDate a partir do dia informado no mês atual.
      let dueDateCreate = formDueDate;
      let recorrenciaCreate = { ...formRecorrencia };
      if (formIsRecorrente && formRecorrenciaDay) {
        const day = Math.max(1, Math.min(31, Number(formRecorrenciaDay)));
        const now = new Date();
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const dd = String(day).padStart(2, "0");
        dueDateCreate = `${now.getFullYear()}-${mm}-${dd}`;
        recorrenciaCreate = { ...recorrenciaCreate, dataProxima: dueDateCreate };
        if (formRecorrenciaTermino === "N_meses" && formRecorrenciaNMeses) {
          const n = Math.max(1, Number(formRecorrenciaNMeses));
          const start = new Date(`${dueDateCreate}T12:00:00`);
          start.setMonth(start.getMonth() + n - 1);
          recorrenciaCreate.dataTermino = start.toISOString().slice(0, 10);
        }
      }
      const payload = buildPendingPayload({
        title: formTitle,
        value: formValue,
        dueDate: dueDateCreate,
        description: formDescription,
        isParcelada: formIsParcelada,
        isRecorrente: formIsRecorrente,
        categoria: formCategoria && formCategoria !== "Outro" ? formCategoria : categoriaCustom,
        categoryId: formCategoryId,
        formatoPagamento: formForma && formForma !== "Outro" ? formForma : formaCustom,
        carteiraId: formCarteiraId,
        tipo: formTipo,
        affectsBalance: effectiveAffectsBalance,
        parcelas: formParcelas,
        recorrencia: recorrenciaCreate,
      });
      await api.post("/api/accounts", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
      onSuccess?.();
    },
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      await api.patch(`/api/accounts/${editAccount?.id}`, buildPendingPayload({
        title: formTitle,
        value: formValue,
        dueDate: formDueDate,
        description: formDescription,
        isParcelada: formIsParcelada,
        isRecorrente: formIsRecorrente,
        categoria: formCategoria && formCategoria !== "Outro" ? formCategoria : categoriaCustom,
        categoryId: formCategoryId,
        formatoPagamento: formForma && formForma !== "Outro" ? formForma : formaCustom,
        carteiraId: formCarteiraId,
        tipo: formTipo,
        affectsBalance: effectiveAffectsBalance,
        parcelas: formParcelas,
        recorrencia: formRecorrencia,
      }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
      onSuccess?.();
    },
  });

  // A data relevante muda conforme o modo: parcelada usa dataInicio, demais usam dueDate.
  // affectsBalance só vale se a data efetiva for realmente retroativa, evita drift de estado
  // ao trocar de modo (ex: marcar checkbox em parcelada e voltar para não parcelada).
  const effectiveDate = formIsParcelada ? (formParcelas.dataInicio ?? "") : formIsRecorrente ? "" : formDueDate;
  const effectiveAffectsBalance = isPastMonth(effectiveDate) ? formAffectsBalance : true;

  const isSaving = createMutation.isPending || editMutation.isPending;
  const tipoLabel = formTipo === "RECEBER" ? "a receber" : "a pagar";
  const modalTitle = editAccount ? `Editar conta ${tipoLabel}` : `Nova conta ${tipoLabel}`;

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={modalTitle}
      icon={<Wallet className="h-6 w-6 text-accent-lime" />}
      footer={
        <div className="flex items-center justify-end gap-4">
          <button
            type="button"
            disabled={isSaving}
            className="px-3 py-2 text-sm font-semibold text-text-secondary transition hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={isSaving}
            className="flex items-center justify-center gap-2 rounded-xl bg-accent-lime px-6 py-2.5 text-sm font-bold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
            onClick={() => (editAccount ? editMutation.mutate() : createMutation.mutate())}
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {editAccount ? "Salvar Alterações" : "Criar Conta"}
          </button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-text-secondary">
        {editAccount
          ? "Atualize as informações da conta."
          : "Cadastre uma conta para acompanhar o pagamento ou recebimento."}
      </p>

      <div className="mb-3 flex gap-1 rounded-xl bg-bg-muted p-1">
        {(["PAGAR", "RECEBER"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={cn(
              "flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition",
              formTipo === t ? "bg-accent-lime text-black" : "text-white hover:bg-bg-overlay",
            )}
            onClick={() => setFormTipo(t)}
          >
            {t === "PAGAR" ? "A Pagar" : "A Receber"}
          </button>
        ))}
      </div>

      <div className="mb-3 flex gap-1 rounded-xl bg-bg-muted p-1">
        {["Não parcelada", "Parcelada", "Recorrente"].map((type) => (
          <button
            key={type}
            type="button"
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              (formIsParcelada && type === "Parcelada") ||
              (formIsRecorrente && type === "Recorrente") ||
              (!formIsParcelada && !formIsRecorrente && type === "Não parcelada")
                ? "bg-accent-lime text-black"
                : "text-white hover:bg-bg-overlay"
            }`}
            onClick={() => {
              setFormIsParcelada(type === "Parcelada");
              setFormIsRecorrente(type === "Recorrente");
            }}
          >
            {type}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm text-text-secondary">Título</span>
          <input
            type="text"
            placeholder="Ex.: Conta de luz"
            className="w-full rounded-xl border border-bg-muted bg-bg-muted px-3 py-2 text-white outline-none transition focus:border-accent-lime"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
          />
        </label>

        <div>
          <label className="mb-2 block text-sm text-text-secondary">
            {formIsParcelada ? "Valor total" : "Valor"}
          </label>
          <div className="flex items-center rounded-xl border border-bg-muted bg-bg-muted px-4 py-3 focus-within:border-accent-lime">
            <CurrencyInput
              value={formValue}
              onChange={setFormValue}
              className="flex-1 bg-transparent text-center text-xl font-bold text-accent-lime outline-none"
            />
          </div>
        </div>

        {formIsParcelada && (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm text-text-secondary">Quantidade de parcelas</span>
              <input
                type="number"
                min={1}
                step={1}
                placeholder="Ex.: 2"
                value={formParcelas.totalParcelas ?? ""}
                onChange={(e) => setFormParcelas((prev) => ({ ...prev, totalParcelas: e.target.value }))}
                className="w-full rounded-xl border border-bg-muted bg-bg-muted px-3 py-2 text-white outline-none transition focus:border-accent-lime"
              />
              {formParcelas.totalParcelas && formValue > 0 && (
                <p className="mt-1 text-xs text-text-secondary">
                  Valor da parcela: R$ {(formValue / Number(formParcelas.totalParcelas)).toFixed(2)}
                </p>
              )}
            </label>
            <div>
              <label className="block">
                <span className="mb-1 block text-sm text-text-secondary">Data de início</span>
                <input
                  type="date"
                  value={formParcelas.dataInicio ?? ""}
                  onChange={(e) => {
                    setFormParcelas((prev) => ({ ...prev, dataInicio: e.target.value }));
                    if (!isPastMonth(e.target.value)) setFormAffectsBalance(true);
                  }}
                  className="w-full rounded-xl border border-bg-muted bg-bg-muted px-3 py-2 text-white outline-none transition focus:border-accent-lime"
                />
              </label>
              {isPastMonth(formParcelas.dataInicio ?? "") && (
                <label className="mt-2 flex cursor-pointer items-start gap-3 rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-3 transition hover:border-yellow-500/60">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 accent-accent-lime"
                    checked={!formAffectsBalance}
                    onChange={(e) => setFormAffectsBalance(!e.target.checked)}
                  />
                  <div>
                    <span className="block text-sm font-medium text-yellow-300">
                      Esta data é retroativa. Deseja que esta conta não afete seu saldo atual?
                    </span>
                    <span className="mt-0.5 block text-xs text-yellow-300/70">
                      Marque para registrar sem lançar movimentação na carteira ao quitar.
                    </span>
                  </div>
                </label>
              )}
            </div>
            <label className="block">
              <span className="mb-1 block text-sm text-text-secondary">Data de fim</span>
              <input
                type="date"
                readOnly
                value={formParcelas.dataFim ?? ""}
                className="w-full cursor-default rounded-xl border border-bg-muted bg-bg-muted px-3 py-2 text-text-secondary outline-none"
              />
            </label>
          </div>
        )}

        {formIsRecorrente && (
          <>
            <label className="block">
              <span className="mb-1 block text-sm text-text-secondary">Período de recorrência</span>
              <select
                value={formRecorrencia.periodoRecorrencia ?? "Mensal"}
                onChange={(e) =>
                  setFormRecorrencia((prev) => ({ ...prev, periodoRecorrencia: e.target.value }))
                }
                className="w-full rounded-xl border border-bg-muted bg-bg-muted px-3 py-2 text-white outline-none transition focus:border-accent-lime"
              >
                <option value="Diário">Diário</option>
                <option value="Semanal">Semanal</option>
                <option value="Mensal">Mensal</option>
                <option value="Anual">Anual</option>
              </select>
            </label>

            {editAccount ? (
              <label className="block">
                <span className="mb-1 block text-sm text-text-secondary">Data da primeira ocorrência</span>
                <input
                  type="date"
                  className="w-full rounded-xl border border-bg-muted bg-bg-muted px-3 py-2 text-white outline-none transition focus:border-accent-lime"
                  value={formRecorrencia.dataProxima ?? ""}
                  onChange={(e) =>
                    setFormRecorrencia((prev) => ({ ...prev, dataProxima: e.target.value }))
                  }
                />
              </label>
            ) : (
              <label className="block">
                <span className="mb-1 block text-sm text-text-secondary">Dia de vencimento</span>
                <input
                  type="number"
                  min="1"
                  max="31"
                  step="1"
                  placeholder="Ex.: 10"
                  className="w-full rounded-xl border border-bg-muted bg-bg-muted px-3 py-2 text-white outline-none transition focus:border-accent-lime"
                  value={formRecorrenciaDay}
                  onChange={(e) => setFormRecorrenciaDay(e.target.value)}
                />
                <span className="mt-1 block text-xs text-text-secondary">
                  A primeira ocorrência será criada no mês atual com este dia.
                </span>
              </label>
            )}

            <div>
              <span className="mb-1 block text-sm text-text-secondary">Duração</span>
              <div className="flex gap-1 rounded-xl bg-bg-muted p-1">
                {(["infinita", "N_meses"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setFormRecorrenciaTermino(opt)}
                    className={cn(
                      "flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition",
                      formRecorrenciaTermino === opt
                        ? "bg-accent-lime text-black"
                        : "text-white hover:bg-bg-overlay",
                    )}
                  >
                    {opt === "infinita" ? "Sem data de término" : "Encerrar após"}
                  </button>
                ))}
              </div>
            </div>

            {formRecorrenciaTermino === "N_meses" && (
              editAccount ? (
                <label className="block">
                  <span className="mb-1 block text-sm text-text-secondary">Data de término</span>
                  <input
                    type="date"
                    className="w-full rounded-xl border border-bg-muted bg-bg-muted px-3 py-2 text-white outline-none transition focus:border-accent-lime"
                    value={formRecorrencia.dataTermino ?? ""}
                    onChange={(e) =>
                      setFormRecorrencia((prev) => ({ ...prev, dataTermino: e.target.value }))
                    }
                  />
                </label>
              ) : (
                <label className="block">
                  <span className="mb-1 block text-sm text-text-secondary">Número de meses</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Ex.: 12"
                    className="w-full rounded-xl border border-bg-muted bg-bg-muted px-3 py-2 text-white outline-none transition focus:border-accent-lime"
                    value={formRecorrenciaNMeses}
                    onChange={(e) => setFormRecorrenciaNMeses(e.target.value)}
                  />
                </label>
              )
            )}
          </>
        )}

        <div>
          <span className="mb-1 block text-sm text-text-secondary">Categoria</span>
          <div className="max-h-[180px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-700 [&::-webkit-scrollbar-track]:bg-transparent">
            <div className="grid grid-cols-3 gap-1.5">
              {categoriesQuery.isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-16 animate-pulse rounded-lg bg-bg-muted" />
                  ))
                : (categoriesQuery.data ?? []).map((cat) => {
                    const active = formCategoria === cat.name;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => { setFormCategoria(cat.name); setFormCategoryId(cat.id); setCategoriaCustom(""); }}
                        className={cn(
                          "flex h-16 w-full flex-col items-center justify-center gap-1 rounded-lg border bg-bg-muted px-1.5 py-1.5 text-center text-[11px] font-semibold transition",
                          active
                            ? "border-accent-lime text-white"
                            : "border-transparent text-text-secondary hover:border-bg-overlay hover:text-white",
                        )}
                      >
                        <span
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
                          style={{ backgroundColor: `${cat.color}22` }}
                        >
                          <DynamicIcon name={cat.icon} className="h-4 w-4" style={{ color: cat.color }} />
                        </span>
                        <span className="w-full truncate">{cat.name}</span>
                      </button>
                    );
                  })}
              <button
                type="button"
                onClick={() => { setFormCategoria("Outro"); setFormCategoryId(""); }}
                className={cn(
                  "flex h-16 w-full flex-col items-center justify-center gap-1 rounded-lg border bg-bg-muted px-1.5 py-1.5 text-center text-[11px] font-semibold transition",
                  formCategoria === "Outro"
                    ? "border-accent-lime text-white"
                    : "border-transparent text-text-secondary hover:border-bg-overlay hover:text-white",
                )}
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: "#6B728022" }}>
                  <DynamicIcon name="MoreHorizontal" className="h-4 w-4" style={{ color: "#6B7280" }} />
                </span>
                <span className="w-full truncate">Outro</span>
              </button>
            </div>
          </div>
          {formCategoria === "Outro" && (
            <input
              type="text"
              placeholder="Digite a categoria personalizada"
              className="mt-2 w-full rounded-xl border border-bg-muted bg-bg-muted px-3 py-2 text-white outline-none transition focus:border-accent-lime"
              value={categoriaCustom}
              onChange={(e) => setCategoriaCustom(e.target.value)}
            />
          )}
        </div>

        <div>
          <span className="mb-1 block text-sm text-text-secondary">Forma de pagamento</span>
          <select
            value={formForma}
            onChange={(e) => {
              setFormForma(e.target.value);
              if (e.target.value !== "Outro") setFormaCustom("");
            }}
            className="w-full rounded-xl border border-bg-muted bg-bg-muted px-3 py-2 text-white outline-none transition focus:border-accent-lime"
          >
            <option value="">Selecione</option>
            {PAYMENT_FORMATS.map((format) => (
              <option key={format} value={format}>
                {format}
              </option>
            ))}
          </select>
          {formForma === "Outro" && (
            <input
              type="text"
              placeholder="Digite a forma de pagamento personalizada"
              className="mt-2 w-full rounded-xl border border-bg-muted bg-bg-muted px-3 py-2 text-white outline-none transition focus:border-accent-lime"
              value={formaCustom}
              onChange={(e) => setFormaCustom(e.target.value)}
            />
          )}
        </div>

        <div>
          <span className="mb-1 block text-sm text-text-secondary">
            Carteira <span className="text-text-muted">(opcional)</span>
          </span>
          <select
            value={formCarteiraId}
            onChange={(e) => setFormCarteiraId(e.target.value)}
            className="w-full rounded-xl border border-bg-muted bg-bg-muted px-3 py-2 text-white outline-none transition focus:border-accent-lime"
          >
            <option value="">Nenhuma</option>
            {(walletsQuery.data ?? []).map((w) => (
              <option key={w._id} value={w._id}>{w.nome}</option>
            ))}
          </select>
        </div>

        {!formIsParcelada && !formIsRecorrente && (
          <div>
            <label className="block">
              <span className="mb-1 block text-sm text-text-secondary">Data de vencimento</span>
              <input
                type="date"
                className="w-full rounded-xl border border-bg-muted bg-bg-muted px-3 py-2 text-white outline-none transition focus:border-accent-lime"
                value={formDueDate}
                onChange={(e) => {
                  setFormDueDate(e.target.value);
                  if (!isPastMonth(e.target.value)) setFormAffectsBalance(true);
                }}
              />
            </label>
            {isPastMonth(formDueDate) && (
              <label className="mt-2 flex cursor-pointer items-start gap-3 rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-3 transition hover:border-yellow-500/60">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-accent-lime"
                  checked={!formAffectsBalance}
                  onChange={(e) => setFormAffectsBalance(!e.target.checked)}
                />
                <div>
                  <span className="block text-sm font-medium text-yellow-300">
                    Esta data é retroativa. Deseja que esta conta não afete seu saldo atual?
                  </span>
                  <span className="mt-0.5 block text-xs text-yellow-300/70">
                    Marque para registrar sem lançar movimentação na carteira ao quitar.
                  </span>
                </div>
              </label>
            )}
          </div>
        )}

        <label className="block">
          <span className="mb-1 block text-sm text-text-secondary">Descrição (opcional)</span>
          <textarea
            rows={3}
            className="w-full resize-none rounded-xl border border-bg-muted bg-bg-muted px-3 py-2 text-white outline-none transition placeholder:text-text-muted focus:border-accent-lime"
            placeholder="Observação opcional"
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
          />
        </label>

        {(createMutation.isError || editMutation.isError) && (
          <div className="rounded-xl bg-accent-red/10 p-3 text-sm text-accent-red">
            {getApiErrorMessages(
              createMutation.error || editMutation.error,
              "Não foi possível salvar a conta.",
            ).map((msg) => (
              <p key={msg}>{msg}</p>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
