import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, CheckCircle, Copy, ExternalLink, Loader2, QrCode, Receipt } from "lucide-react";

import { api } from "../../lib/api";
import { cn } from "../../lib/utils";
import { formatCurrency } from "../../lib/finance";
import { formatCpfCnpj } from "../../lib/cpfCnpj";
import { useAuth, extractSubscription } from "../../contexts/AuthContext";
import type { User } from "../../types/api";

type FaturaStatus = "paga" | "pendente" | "vencida" | "cancelada" | "estornada";

// Espelha FaturaAssinatura em backend/src/modules/billing/billing.service.ts.
type Fatura = {
  id: string;
  origem: "pix" | "cartao";
  descricao: string;
  valor: number;
  status: FaturaStatus;
  vencimento: string | null;
  pagoEm: string | null;
  url: string | null;
  podePagarPix: boolean;
};

type PixData = {
  id: string;
  qrCodeImage: string;
  copiaECola: string;
  expiracao: string;
};

type Cycle = "monthly" | "annual";

const PLANOS: Record<Cycle, { label: string; preco: string }> = {
  monthly: { label: "Mensal", preco: "R$ 29,90" },
  annual: { label: "Anual", preco: "R$ 299,90" },
};

const statusConfig: Record<FaturaStatus, { label: string; className: string }> = {
  paga: { label: "Paga", className: "bg-accent-brand/15 text-accent-brand" },
  pendente: { label: "Em aberto", className: "bg-accent-yellow/15 text-accent-yellow" },
  vencida: { label: "Vencida", className: "bg-accent-red/15 text-accent-red" },
  cancelada: { label: "Cancelada", className: "bg-bg-muted text-text-secondary" },
  estornada: { label: "Estornada", className: "bg-bg-muted text-text-secondary" },
};

// "2026-10-20" → 20/10/2026 sem passar por Date (que leria como UTC e voltaria um dia).
function formatDia(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function errorMessage(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

function PixPanel({ pix, onClose }: { pix: PixData; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(pix.copiaECola);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4 rounded-xl border border-border-default bg-bg-muted p-4">
      <div className="flex justify-center">
        <div className="rounded-xl bg-white p-3">
          <img src={`data:image/png;base64,${pix.qrCodeImage}`} alt="QR Code PIX" className="h-44 w-44" />
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs text-text-secondary">PIX copia e cola:</p>
        <div className="flex gap-2">
          <input
            readOnly
            value={pix.copiaECola}
            onClick={(e) => (e.target as HTMLInputElement).select()}
            className="min-w-0 flex-1 rounded-lg border border-border-default bg-bg-card px-3 py-2 font-mono text-xs text-text-primary"
          />
          <button
            onClick={handleCopy}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border-default bg-bg-overlay px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-bg-card"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-accent-brand" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copiado!" : "Copiar"}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 text-sm text-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin text-accent-brand" />
        Aguardando confirmação do pagamento…
      </div>
      <p className="text-center text-xs text-text-muted">Válido até {formatDia(pix.expiracao)}</p>

      <button onClick={onClose} className="w-full text-center text-xs text-text-secondary hover:text-text-primary">
        Fechar
      </button>
    </div>
  );
}

export function PagamentoSection() {
  const queryClient = useQueryClient();
  const { subscription, setSubscription } = useAuth();

  const [cycle, setCycle] = useState<Cycle>(subscription?.billingCycle === "annual" ? "annual" : "monthly");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [pix, setPix] = useState<PixData | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pago, setPago] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const configQuery = useQuery<{ pix: boolean; cartao: boolean }>({
    queryKey: ["billing-config"],
    queryFn: async () => (await api.get<{ pix: boolean; cartao: boolean }>("/api/billing/config")).data,
    staleTime: Infinity,
  });

  const faturasQuery = useQuery<Fatura[]>({
    queryKey: ["billing-faturas"],
    queryFn: async () => (await api.get<Fatura[]>("/api/billing/faturas")).data,
  });

  // CPF/CNPJ já salvo no primeiro PIX — preenche o campo pra não pedir de novo.
  useEffect(() => {
    api
      .get<User>("/api/auth/me")
      .then(({ data }) => {
        if (data.cpfCnpj) setCpfCnpj((atual) => atual || formatCpfCnpj(data.cpfCnpj!));
      })
      .catch(() => {});
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const startPolling = useCallback(
    (paymentId: string) => {
      stopPolling();
      pollingRef.current = setInterval(async () => {
        try {
          const { data } = await api.get<{ paid: boolean }>(`/api/billing/pix/${paymentId}/status`);
          if (!data.paid) return;
          stopPolling();
          setPix(null);
          setPago(true);
          const { data: me } = await api.get<User>("/api/auth/me");
          setSubscription(extractSubscription(me));
          void queryClient.invalidateQueries({ queryKey: ["billing-faturas"] });
        } catch {
          // continua tentando no próximo intervalo
        }
      }, 5000);
    },
    [stopPolling, setSubscription, queryClient],
  );

  const abrirPix = (data: PixData) => {
    setPix(data);
    setPago(false);
    startPolling(data.id);
    void queryClient.invalidateQueries({ queryKey: ["billing-faturas"] });
  };

  const pagarFatura = async (fatura: Fatura) => {
    setError(null);
    setLoadingId(fatura.id);
    try {
      const { data } = await api.get<PixData>(`/api/billing/faturas/${fatura.id}/pix`);
      abrirPix(data);
    } catch (err) {
      setError(errorMessage(err, "Não foi possível gerar o PIX desta fatura."));
    } finally {
      setLoadingId(null);
    }
  };

  const gerarPagamento = async () => {
    if (cpfCnpj.replace(/\D/g, "").length < 11) {
      setError("Informe um CPF ou CNPJ válido para pagar via PIX.");
      return;
    }
    setError(null);
    setLoadingId("novo");
    try {
      const { data } = await api.post<{ pixData?: PixData }>("/api/billing/checkout", {
        plan: "basico",
        cycle,
        method: "pix",
        cpfCnpj,
      });
      if (data.pixData) abrirPix(data.pixData);
    } catch (err) {
      setError(errorMessage(err, "Erro ao gerar o PIX. Tente novamente."));
    } finally {
      setLoadingId(null);
    }
  };

  const fecharPix = () => {
    stopPolling();
    setPix(null);
  };

  const faturas = faturasQuery.data ?? [];
  const abertas = faturas.filter((f) => f.status === "pendente" || f.status === "vencida");
  const historico = faturas.filter((f) => f.status !== "pendente" && f.status !== "vencida");
  const pixDisponivel = configQuery.data?.pix ?? false;

  const renderFatura = (f: Fatura) => (
    <div key={f.id} className="flex items-center justify-between gap-3 rounded-xl bg-bg-muted px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-text-primary">{f.descricao}</p>
        <p className="text-xs text-text-secondary">
          {f.origem === "pix" ? "PIX" : "Cartão"} · Venc. {formatDia(f.vencimento)}
          {f.pagoEm && ` · Pago em ${formatDia(f.pagoEm)}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="text-right">
          <p className="text-sm font-semibold text-text-primary">{formatCurrency(f.valor)}</p>
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", statusConfig[f.status].className)}>
            {statusConfig[f.status].label}
          </span>
        </div>
        {f.podePagarPix && pixDisponivel ? (
          <button
            onClick={() => pagarFatura(f)}
            disabled={loadingId !== null}
            title="Pagar com PIX"
            className="rounded-lg bg-accent-brand p-2 text-white transition hover:bg-accent-brand-hover disabled:opacity-50"
          >
            {loadingId === f.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
          </button>
        ) : (
          f.url && (
            <a
              href={f.url}
              target="_blank"
              rel="noreferrer"
              title="Ver comprovante"
              className="rounded-lg p-2 text-text-secondary transition hover:bg-bg-overlay hover:text-text-primary"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4 rounded-2xl bg-bg-card p-6">
      <div className="flex items-center gap-3">
        <Receipt className="h-5 w-5 shrink-0 text-accent-brand" />
        <div>
          <h2 className="font-semibold text-text-primary">Pagamento</h2>
          <p className="text-xs text-text-secondary">
            Pague ou renove a assinatura via PIX a qualquer momento. Os dias pagos somam ao prazo atual.
          </p>
        </div>
      </div>

      {pago && (
        <div className="flex items-center gap-2 rounded-xl bg-accent-brand/10 px-4 py-3 text-sm text-accent-brand">
          <CheckCircle className="h-4 w-4 shrink-0" />
          Pagamento confirmado! Sua assinatura foi renovada.
        </div>
      )}

      {pix ? (
        <PixPanel pix={pix} onClose={fecharPix} />
      ) : (
        <>
          {/* Faturas atuais (em aberto) */}
          {abertas.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-text-secondary">Faturas em aberto</p>
              {abertas.map(renderFatura)}
            </div>
          )}

          {/* Novo pagamento */}
          {configQuery.isLoading ? null : pixDisponivel ? (
            abertas.length === 0 && (
              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-wider text-text-secondary">Novo pagamento</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["monthly", "annual"] as Cycle[]).map((c) => (
                    <button
                      key={c}
                      onClick={() => setCycle(c)}
                      className={cn(
                        "rounded-xl border p-3 text-left transition-colors",
                        cycle === c
                          ? "border-accent-brand bg-accent-brand/10"
                          : "border-border-default bg-bg-muted hover:bg-bg-overlay",
                      )}
                    >
                      <p className="text-xs text-text-secondary">{PLANOS[c].label}</p>
                      <p className="text-sm font-bold text-text-primary">{PLANOS[c].preco}</p>
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="CPF ou CNPJ"
                  value={cpfCnpj}
                  onChange={(e) => setCpfCnpj(formatCpfCnpj(e.target.value))}
                  className="w-full rounded-xl border border-border-default bg-bg-muted px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-brand focus:outline-none"
                />
                <button
                  onClick={gerarPagamento}
                  disabled={loadingId !== null}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-brand px-4 py-3 text-sm font-bold text-white transition hover:bg-accent-brand-hover disabled:opacity-50"
                >
                  {loadingId === "novo" ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Gerando PIX...</>
                  ) : (
                    <><QrCode className="h-4 w-4" /> Gerar PIX de {PLANOS[cycle].preco}</>
                  )}
                </button>
              </div>
            )
          ) : (
            <div className="flex items-start gap-2 rounded-xl bg-bg-muted px-4 py-3 text-sm text-text-secondary">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              Pagamento via PIX indisponível no momento. Fale com o suporte.
            </div>
          )}

          {error && <p className="text-xs text-accent-red">{error}</p>}

          {/* Faturas anteriores */}
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-text-secondary">Faturas anteriores</p>
            {faturasQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
              </div>
            ) : faturasQuery.isError ? (
              <p className="text-sm text-accent-red">Não foi possível carregar as faturas.</p>
            ) : historico.length > 0 ? (
              historico.map(renderFatura)
            ) : (
              <p className="text-sm text-text-muted">Nenhuma fatura anterior.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
