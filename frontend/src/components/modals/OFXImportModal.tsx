import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { ModalShell } from "./ModalShell";
import { api } from "../../lib/api";
import { cn } from "../../lib/utils";
import { useCategories, useIncomeCategories } from "./TransactionFormFields";
import type { Wallet } from "../../types/api";
import type { Category } from "../../types/finance";

interface ImportCandidate {
  fitId: string | null;
  date: string;
  value: number;
  type: "EXPENSE" | "INCOME";
  description: string;
  suggestedCategoryId: string | null;
  suggestedCategoryName: string | null;
  alreadyImported: boolean;
}

interface CandidateRow extends ImportCandidate {
  selected: boolean;
  categoryId: string | null;
}

type Phase = "upload" | "preview" | "done";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function CategorySelect({
  value,
  type,
  expenseCategories,
  incomeCategories,
  onChange,
}: {
  value: string | null;
  type: "EXPENSE" | "INCOME";
  expenseCategories: Category[];
  incomeCategories: Category[];
  onChange: (id: string | null) => void;
}) {
  const cats = type === "INCOME" ? incomeCategories : expenseCategories;
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full rounded-lg bg-bg-muted px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-lime"
    >
      <option value="">Sem categoria</option>
      {cats.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  );
}

export function OFXImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>("upload");
  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<CandidateRow[]>([]);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const { data: wallets = [] } = useQuery<Wallet[]>({
    queryKey: ["wallets"],
    queryFn: async () => {
      const { data } = await api.get<Wallet[]>("/api/wallets");
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: expenseCats = [] } = useCategories();
  const { data: incomeCats = [] } = useIncomeCategories();

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!file || !selectedWalletId) throw new Error("Selecione a carteira e o arquivo");
      const form = new FormData();
      form.append("file", file);
      form.append("carteiraId", selectedWalletId);
      const { data } = await api.post<ImportCandidate[]>("/api/import/ofx/preview", form);
      return data;
    },
    onSuccess: (candidates) => {
      setPreviewError(null);
      setRows(
        candidates.map((c) => ({
          ...c,
          selected: !c.alreadyImported,
          categoryId: c.suggestedCategoryId,
        })),
      );
      setPhase("preview");
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setPreviewError(msg || "Erro ao analisar o arquivo OFX.");
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const selected = rows.filter((r) => r.selected);
      const { data } = await api.post<{ imported: number; skipped: number }>(
        "/api/import/ofx/confirm",
        {
          carteiraId: selectedWalletId,
          transactions: selected.map((r) => ({
            fitId: r.fitId,
            date: r.date,
            value: r.value,
            type: r.type,
            categoryId: r.categoryId ?? undefined,
            description: r.description,
          })),
        },
      );
      return data;
    },
    onSuccess: (res) => {
      setResult(res);
      setPhase("done");
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["import-batches"] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setPreviewError(msg || "Erro ao importar transações.");
    },
  });

  function handleClose() {
    setPhase("upload");
    setFile(null);
    setSelectedWalletId("");
    setRows([]);
    setResult(null);
    setPreviewError(null);
    if (fileRef.current) fileRef.current.value = "";
    onClose();
  }

  function toggleRow(idx: number) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, selected: !r.selected } : r)));
  }

  function toggleAll(checked: boolean) {
    setRows((prev) => prev.map((r) => (r.alreadyImported ? r : { ...r, selected: checked })));
  }

  function setCategoryForRow(idx: number, catId: string | null) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, categoryId: catId } : r)));
  }

  const selectedCount = rows.filter((r) => r.selected).length;
  const alreadyCount = rows.filter((r) => r.alreadyImported).length;
  const isImporting = confirmMutation.isPending;

  return (
    <ModalShell
      open={open}
      title="Importar Extrato OFX"
      icon={<FileText className="h-5 w-5 text-accent-lime" />}
      onClose={handleClose}
      containerClassName={phase === "preview" ? "max-w-2xl" : ""}
      footer={
        phase === "upload" ? (
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => previewMutation.mutate()}
              disabled={!file || !selectedWalletId || previewMutation.isPending}
              className="flex items-center gap-2 rounded-xl bg-accent-lime px-5 py-2 text-sm font-bold text-black transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {previewMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Analisando...</>
              ) : (
                <><Upload className="h-4 w-4" /> Analisar</>
              )}
            </button>
          </div>
        ) : phase === "preview" ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-text-secondary">
              {selectedCount} selecionada{selectedCount !== 1 ? "s" : ""}
              {alreadyCount > 0 && ` · ${alreadyCount} já importada${alreadyCount !== 1 ? "s" : ""}`}
            </span>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPhase("upload")}
                className="rounded-xl px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={() => confirmMutation.mutate()}
                disabled={selectedCount === 0 || isImporting}
                className="flex items-center gap-2 rounded-xl bg-accent-lime px-5 py-2 text-sm font-bold text-black transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isImporting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Importando...</>
                ) : (
                  `Importar ${selectedCount} transaç${selectedCount !== 1 ? "ões" : "ão"}`
                )}
              </button>
            </div>
          </div>
        ) : null
      }
    >
      {/* Fase 1: Upload */}
      {phase === "upload" && (
        <div className="space-y-5 py-1">
          <div>
            <label className="mb-2 block text-sm text-text-secondary">Carteira de destino *</label>
            <select
              value={selectedWalletId}
              onChange={(e) => setSelectedWalletId(e.target.value)}
              className="w-full rounded-xl bg-bg-muted px-4 py-3 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-lime"
            >
              <option value="">Selecione uma carteira</option>
              {wallets.filter((w) => w.tipo !== "VIRTUAL").map((w) => (
                <option key={w._id} value={w._id}>{w.nome}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm text-text-secondary">Arquivo OFX / QFX *</label>
            <div
              className={cn(
                "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 text-center transition cursor-pointer",
                file ? "border-accent-lime bg-accent-lime/5" : "border-bg-muted hover:border-accent-lime/50",
              )}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className={cn("h-8 w-8", file ? "text-accent-lime" : "text-text-secondary")} />
              {file ? (
                <>
                  <p className="font-semibold text-text-primary">{file.name}</p>
                  <p className="text-xs text-text-secondary">{(file.size / 1024).toFixed(1)} KB, clique para trocar</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-text-primary">Clique para selecionar ou arraste o arquivo</p>
                  <p className="text-xs text-text-secondary">Formatos aceitos: .ofx, .qfx · Máx. 5 MB</p>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".ofx,.qfx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  setPreviewError(null);
                }}
              />
            </div>
          </div>

          {previewError && (
            <div className="flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-sm text-status-danger">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {previewError}
            </div>
          )}

          <p className="text-xs text-text-secondary">
            O sistema vai analisar o arquivo e mostrar as transações para revisão antes de salvar qualquer coisa.
          </p>
        </div>
      )}

      {/* Fase 2: Preview */}
      {phase === "preview" && (
        <div className="space-y-3 py-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-secondary">
              {rows.length} transaç{rows.length !== 1 ? "ões" : "ão"} encontrada{rows.length !== 1 ? "s" : ""}
            </span>
            <label className="flex items-center gap-2 cursor-pointer text-text-secondary hover:text-text-primary transition">
              <input
                type="checkbox"
                checked={rows.filter((r) => !r.alreadyImported).every((r) => r.selected)}
                onChange={(e) => toggleAll(e.target.checked)}
                className="accent-accent-lime"
              />
              Selecionar todas
            </label>
          </div>

          <div className="divide-y divide-bg-muted rounded-xl border border-bg-muted overflow-hidden">
            {rows.map((row, idx) => (
              <div
                key={idx}
                className={cn(
                  "flex items-start gap-3 px-3 py-2.5 transition",
                  row.alreadyImported ? "opacity-40" : "light:hover:bg-bg-muted/40",
                )}
              >
                <input
                  type="checkbox"
                  checked={row.selected}
                  disabled={row.alreadyImported}
                  onChange={() => toggleRow(idx)}
                  className="mt-0.5 accent-accent-lime shrink-0"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-text-secondary shrink-0">{row.date}</span>
                    <span className="truncate text-sm text-text-primary">{row.description}</span>
                    {row.alreadyImported && (
                      <span className="shrink-0 rounded-full bg-bg-muted px-2 py-0.5 text-xs text-text-secondary">
                        Já importado
                      </span>
                    )}
                  </div>
                  <CategorySelect
                    value={row.categoryId}
                    type={row.type}
                    expenseCategories={expenseCats}
                    incomeCategories={incomeCats}
                    onChange={(id) => setCategoryForRow(idx, id)}
                  />
                </div>
                <span
                  className={cn(
                    "shrink-0 text-sm font-semibold tabular-nums",
                    row.type === "INCOME" ? "text-accent-lime" : "text-accent-red",
                  )}
                >
                  {row.type === "INCOME" ? "+" : "-"}{brl.format(row.value)}
                </span>
              </div>
            ))}
          </div>

          {previewError && (
            <div className="flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-sm text-status-danger">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {previewError}
            </div>
          )}
        </div>
      )}

      {/* Fase 3: Concluído */}
      {phase === "done" && result && (
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <CheckCircle className="h-14 w-14 text-accent-lime" />
          <div>
            <p className="text-lg font-bold text-text-primary">Importação concluída!</p>
            <p className="mt-1 text-sm text-text-secondary">
              <strong className="text-text-primary">{result.imported}</strong> transaç{result.imported !== 1 ? "ões importadas" : "ão importada"}
              {result.skipped > 0 && (
                <> · <strong className="text-text-primary">{result.skipped}</strong> ignorada{result.skipped !== 1 ? "s" : ""} (duplicadas)</>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="mt-2 rounded-xl bg-accent-lime px-6 py-2.5 text-sm font-bold text-black transition hover:brightness-110"
          >
            Fechar
          </button>
        </div>
      )}
    </ModalShell>
  );
}
