import { useState } from "react";
import { Fingerprint, Loader2, ShieldCheck, X } from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

type Props = {
  open: boolean;
  isForm1: boolean;
  onDismiss: () => void;
  onRegistered: () => void;
};

export function WebAuthnSuggestionModal({ open, isForm1, onDismiss, onRegistered }: Props) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!open) return null;

  const handleRegister = async () => {
    setError(null);
    setLoading(true);
    try {
      const { data: options } = await api.post<PublicKeyCredentialCreationOptionsJSON>(
        "/api/auth/webauthn/register/options",
      );
      const response = await startRegistration({ optionsJSON: options });
      await api.post("/api/auth/webauthn/register/verify", response);
      queryClient.invalidateQueries({ queryKey: ["webauthn-credentials"] });
      setSuccess(true);
      setTimeout(onRegistered, 1500);
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name;
      if (name === "NotAllowedError") {
        setError("Operação cancelada. Você pode ativar depois em Configurações.");
      } else {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message;
        setError(msg ?? "Não foi possível ativar a biometria.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-black/60" onClick={onDismiss} aria-hidden="true" />
      <div className="relative w-full max-w-sm rounded-2xl border border-border-default bg-bg-card p-6 shadow-2xl">
        <button
          onClick={onDismiss}
          className="absolute right-4 top-4 rounded-lg p-1 text-text-muted transition hover:bg-bg-overlay hover:text-text-primary"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-brand/10">
          <Fingerprint className="h-6 w-6 text-accent-brand" />
        </div>

        {success ? (
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <ShieldCheck className="h-10 w-10 text-accent-brand" />
            <p className="font-semibold text-text-primary">Biometria ativada!</p>
            <p className="text-sm text-text-secondary">
              No próximo login, use o Face ID ou digital para entrar mais rápido.
            </p>
          </div>
        ) : (
          <>
            <h2 className="mb-1 font-sans text-base font-bold text-text-primary">
              {isForm1
                ? "Você tentou entrar com biometria"
                : "Entre mais rápido com biometria"}
            </h2>
            <p className="mb-5 text-sm text-text-secondary">
              {isForm1
                ? "Quer ativar o login por Face ID ou digital agora? Leva menos de 10 segundos."
                : "Ative o Face ID ou digital para entrar sem digitar senha."}
            </p>

            {error && <p className="mb-3 text-xs text-accent-red">{error}</p>}

            <div className="flex flex-col gap-2">
              <button
                onClick={handleRegister}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-brand px-4 py-2.5 text-sm font-bold text-white transition hover:bg-accent-brand-hover disabled:opacity-70"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Aguardando dispositivo...
                  </>
                ) : (
                  <>
                    <Fingerprint className="h-4 w-4" />
                    Ativar agora
                  </>
                )}
              </button>
              <button
                onClick={onDismiss}
                disabled={loading}
                className="w-full rounded-xl px-4 py-2.5 text-sm font-medium text-text-secondary transition hover:bg-bg-overlay disabled:opacity-50"
              >
                Agora não
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
