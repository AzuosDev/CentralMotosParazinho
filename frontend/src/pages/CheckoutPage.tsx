import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Check, CheckCircle, Copy, CreditCard, Loader2, QrCode } from "lucide-react";
import { api } from "../lib/api";
import { useAuth, extractSubscription, computeHasAccess } from "../contexts/AuthContext";
import { cn } from "../lib/utils";
import type { User } from "../types/api";

type PlanCycle = "monthly" | "annual";
type PaymentMethod = "pix" | "stripe";
type Step = "select" | "pix-qr" | "success";

interface PixData {
  id: string;
  qrCodeImage: string;
  copiaECola: string;
  expiracao: string;
}

const PLANS = {
  monthly: { label: "Mensal", price: "R$ 29,90", period: "/mês", savings: null },
  annual: { label: "Anual", price: "R$ 299,90", period: "/ano", savings: "Economize 2 meses (16%)" },
};

const FEATURES = [
  "Dashboard consolidado de todas as carteiras",
  "Contas a pagar e receber, com parcelamento e recorrência",
  "Importação de extrato bancário via OFX",
  "Categorização de gastos e insights financeiros",
  "Login biométrico (Face ID / digital)",
  "Metas financeiras com acompanhamento automático",
];

function trialDaysLeft(trialEndsAt: string | null | undefined): number {
  if (!trialEndsAt) return 0;
  return Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

export function CheckoutPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { subscription, setSubscription } = useAuth();

  const [cycle, setCycle] = useState<PlanCycle>("monthly");
  const [method, setMethod] = useState<PaymentMethod>("pix");
  const [step, setStep] = useState<Step>("select");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pixData, setPixData] = useState<PixData | null>(null);
  const [copied, setCopied] = useState(false);
  const [cpfCnpj, setCpfCnpj] = useState("");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Handle Stripe success redirect
  const success = searchParams.get("success");
  useEffect(() => {
    if (!success) return;
    const refresh = async () => {
      try {
        const { data: me } = await api.get<User>('/api/auth/me');
        setSubscription(extractSubscription(me));
        setStep("success");
      } catch {
        setStep("success");
      }
    };
    void refresh();
  }, [success, setSubscription]);

  // Redirect if already has active subscription
  useEffect(() => {
    if (!subscription) return;
    if (
      computeHasAccess(subscription) &&
      subscription.subscriptionStatus !== 'trial' &&
      !success
    ) {
      navigate("/dashboard", { replace: true });
    }
  }, [subscription, navigate, success]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const startPixPolling = useCallback((paymentId: string) => {
    pollingRef.current = setInterval(async () => {
      try {
        const { data } = await api.get<{ paid: boolean }>(`/api/billing/pix/${paymentId}/status`);
        if (data.paid) {
          stopPolling();
          const { data: me } = await api.get<User>('/api/auth/me');
          setSubscription(extractSubscription(me));
          setStep("success");
        }
      } catch {
        // Keep polling on error
      }
    }, 5000);
  }, [stopPolling, setSubscription]);

  const formatCpfCnpj = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 14);
    if (digits.length <= 11) {
      return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (_, a, b, c, d) =>
        [a, b, c].filter(Boolean).join('.') + (d ? '-' + d : ''),
      );
    }
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, (_, a, b, c, d, e) =>
      `${a}.${b}.${c}/${d}` + (e ? '-' + e : ''),
    );
  };

  const handleProceed = async () => {
    if (method === 'pix' && cpfCnpj.replace(/\D/g, '').length < 11) {
      setError('Informe um CPF ou CNPJ válido para pagar via PIX.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post<{ method: string; url?: string; pixData?: PixData }>(
        '/api/billing/checkout',
        { plan: 'basico', cycle, method, ...(method === 'pix' ? { cpfCnpj } : {}) },
      );

      if (method === 'stripe' && data.url) {
        window.location.href = data.url;
        return;
      }

      if (method === 'pix' && data.pixData) {
        setPixData(data.pixData);
        setStep("pix-qr");
        startPixPolling(data.pixData.id);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? "Erro ao iniciar pagamento. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!pixData) return;
    await navigator.clipboard.writeText(pixData.copiaECola);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const daysLeft = trialDaysLeft(subscription?.trialEndsAt);
  const isTrialActive = subscription?.subscriptionStatus === 'trial' && daysLeft > 0;
  const isExpired = !computeHasAccess(subscription);

  if (step === "success") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg-base px-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent-lime/10">
          <CheckCircle className="h-10 w-10 text-accent-lime" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-text-primary">Pagamento confirmado!</h1>
          <p className="mt-2 text-sm text-text-secondary">Sua assinatura do Plano Básico está ativa.</p>
        </div>
        <button
          onClick={() => navigate("/dashboard", { replace: true })}
          className="flex items-center gap-2 rounded-xl bg-accent-lime px-6 py-3 text-sm font-bold text-black"
        >
          Ir para o Dashboard <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (step === "pix-qr" && pixData) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-bg-base px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border border-border-default bg-bg-card p-8">
          <button
            onClick={() => { stopPolling(); setStep("select"); setPixData(null); }}
            className="mb-6 text-sm text-text-secondary hover:text-text-primary"
          >
            ← Voltar
          </button>

          <div className="text-center">
            <QrCode className="mx-auto mb-3 h-8 w-8 text-accent-lime" />
            <h2 className="text-xl font-bold text-text-primary">Pague via PIX</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Escaneie o QR Code com o app do seu banco
            </p>
          </div>

          <div className="mt-6 flex justify-center">
            <div className="rounded-xl border border-border-default bg-white p-3">
              <img
                src={`data:image/png;base64,${pixData.qrCodeImage}`}
                alt="QR Code PIX"
                className="h-48 w-48"
              />
            </div>
          </div>

          <div className="mt-6">
            <p className="mb-2 text-xs text-text-secondary">Ou copie o código:</p>
            <div className="flex gap-2">
              <input
                readOnly
                value={pixData.copiaECola}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="min-w-0 flex-1 rounded-lg border border-border-default bg-bg-muted px-3 py-2 text-xs text-text-primary font-mono"
              />
              <button
                onClick={handleCopy}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border-default bg-bg-overlay px-3 py-2 text-xs font-medium text-text-primary hover:bg-bg-muted transition-colors"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-accent-lime" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copiado!" : "Copiar"}
              </button>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-center gap-2 text-sm text-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin text-accent-lime" />
            Aguardando confirmação do pagamento…
          </div>

          <p className="mt-3 text-center text-xs text-text-muted">
            Válido até {new Date(pixData.expiracao).toLocaleDateString('pt-BR')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg-base px-4 py-12">
      <div className="mx-auto w-full max-w-lg">
        {/* Header */}
        {isExpired && !isTrialActive && (
          <div className="mb-6 rounded-xl border border-accent-red/30 bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
            Seu período de teste terminou. Escolha um plano para continuar.
          </div>
        )}
        {isTrialActive && (
          <div className="mb-6 rounded-xl border border-accent-lime/30 bg-accent-lime/10 px-4 py-3 text-sm text-accent-lime">
            Seu teste termina em {daysLeft} {daysLeft === 1 ? 'dia' : 'dias'}. Assine agora para não perder o acesso.
          </div>
        )}

        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-text-primary">Plano Básico</h1>
          <p className="mt-2 text-text-secondary">Acesso completo ao MeuGasto</p>
        </div>

        {/* Features */}
        <div className="mb-8 rounded-2xl border border-border-default bg-bg-card p-6">
          <p className="mb-4 text-sm font-semibold text-text-secondary uppercase tracking-wide">O que está incluso</p>
          <ul className="space-y-2">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-text-primary">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-lime" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Cycle toggle */}
        <div className="mb-6">
          <p className="mb-3 text-sm font-medium text-text-secondary">Período de cobrança</p>
          <div className="grid grid-cols-2 gap-3">
            {(["monthly", "annual"] as PlanCycle[]).map((c) => (
              <button
                key={c}
                onClick={() => setCycle(c)}
                className={cn(
                  "rounded-xl border p-4 text-left transition-colors",
                  cycle === c
                    ? "border-accent-lime bg-accent-lime/10"
                    : "border-border-default bg-bg-card hover:bg-bg-overlay",
                )}
              >
                <p className="text-sm font-semibold text-text-primary">{PLANS[c].label}</p>
                <p className="mt-1 text-xl font-bold text-text-primary">
                  {PLANS[c].price}
                  <span className="text-sm font-normal text-text-secondary">{PLANS[c].period}</span>
                </p>
                {PLANS[c].savings && (
                  <p className="mt-1 text-xs text-accent-lime">{PLANS[c].savings}</p>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Payment method */}
        <div className="mb-6">
          <p className="mb-3 text-sm font-medium text-text-secondary">Forma de pagamento</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setMethod("pix")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium transition-colors",
                method === "pix"
                  ? "border-accent-lime bg-accent-lime/10 text-accent-lime"
                  : "border-border-default bg-bg-card text-text-primary hover:bg-bg-overlay",
              )}
            >
              <QrCode className="h-4 w-4" /> PIX
            </button>
            <button
              onClick={() => setMethod("stripe")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium transition-colors",
                method === "stripe"
                  ? "border-accent-lime bg-accent-lime/10 text-accent-lime"
                  : "border-border-default bg-bg-card text-text-primary hover:bg-bg-overlay",
              )}
            >
              <CreditCard className="h-4 w-4" /> Cartão
            </button>
          </div>
          {method === "pix" && (
            <>
              <p className="mt-2 text-xs text-text-muted">Pagamento único — renovação manual a cada ciclo.</p>
              <div className="mt-3">
                <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                  CPF ou CNPJ <span className="text-accent-red">*</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  value={cpfCnpj}
                  onChange={(e) => setCpfCnpj(formatCpfCnpj(e.target.value))}
                  className="w-full rounded-xl border border-border-default bg-bg-card px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-lime focus:outline-none"
                />
              </div>
            </>
          )}
          {method === "stripe" && (
            <p className="mt-2 text-xs text-text-muted">Assinatura recorrente — renovação automática pelo cartão.</p>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-accent-red/30 bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
            {error}
          </div>
        )}

        <button
          onClick={handleProceed}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-lime py-4 text-sm font-bold text-black transition-all hover:brightness-110 disabled:opacity-60"
        >
          {loading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Processando…</>
          ) : (
            <>Assinar — {PLANS[cycle].price}{PLANS[cycle].period} <ArrowRight className="h-4 w-4" /></>
          )}
        </button>

        <p className="mt-4 text-center text-xs text-text-muted">
          Cancele quando quiser · Sem multas · Dados seguros
        </p>
      </div>
    </div>
  );
}
