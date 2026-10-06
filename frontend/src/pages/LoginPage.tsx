import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Fingerprint, Lock, Loader2, Mail } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { browserSupportsWebAuthn, startAuthentication } from "@simplewebauthn/browser";

import { AuthCard } from "../components/AuthCard";
import { Field } from "../components/Field";
import { SubmitButton } from "../components/SubmitButton";
import { api } from "../lib/api";
import { setTokens } from "../lib/auth";
import { getApiErrorMessages } from "../lib/errors";
import { WEBAUTHN_TRIED_KEY } from "../lib/webauthn-suggestion";
import { useAuth, extractSubscription } from "../contexts/AuthContext";
import type { AuthTokens, User } from "../types/api";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";

const LAST_EMAIL_KEY = "contacerta_last_email";

const loginSchema = z.object({
  email: z.string().trim().email("Informe um email válido"),
  password: z.string().min(8, "A senha deve ter no mínimo 8 caracteres"),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [apiErrors, setApiErrors] = useState<string[]>([]);
  const [webAuthnSupported, setWebAuthnSupported] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [biometricError, setBiometricError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { unlock, setSubscription } = useAuth();
  const queryClient = useQueryClient();
  const redirectTo = (location.state as { from?: string } | null)?.from ?? "/dashboard";
  const hasCheckedSupport = useRef(false);
  const hasAutoTriggered = useRef(false);

  useEffect(() => {
    if (hasCheckedSupport.current) return;
    hasCheckedSupport.current = true;
    setWebAuthnSupported(browserSupportsWebAuthn());
  }, []);

  // Auto-dispara biometria ao carregar se há email salvo e browser suporta WebAuthn.
  // Chrome Android: funciona direto. Safari iOS: cai em NotAllowedError e recua para o botão manual.
  useEffect(() => {
    if (!webAuthnSupported || hasAutoTriggered.current) return;
    if (!localStorage.getItem(LAST_EMAIL_KEY)) return;
    hasAutoTriggered.current = true;
    void handleBiometricLogin(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webAuthnSupported]);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: localStorage.getItem(LAST_EMAIL_KEY) ?? "",
      password: "",
    },
  });

  const emailValue = watch("email");

  async function onSubmit(values: LoginForm) {
    setApiErrors([]);
    setBiometricError(null);

    try {
      const { data } = await api.post<AuthTokens>("/api/auth/login", values);

      if (!data?.accessToken || !data?.refreshToken) {
        throw new Error("Resposta inválida do servidor");
      }

      localStorage.setItem(LAST_EMAIL_KEY, values.email.trim().toLowerCase());
      queryClient.clear();
      setTokens(data.accessToken, data.refreshToken);
      try {
        const { data: me } = await api.get<User>('/api/auth/me');
        setSubscription(extractSubscription(me));
      } catch { /* fail silently */ }
      unlock();
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setApiErrors(getApiErrorMessages(error, "Nao foi possivel entrar. Verifique suas credenciais."));
    }
  }

  async function handleBiometricLogin(silent = false) {
    setBiometricError(null);
    const email = (emailValue || localStorage.getItem(LAST_EMAIL_KEY) || "").trim().toLowerCase();

    if (!email) {
      setBiometricError("Informe seu email antes de usar a biometria.");
      return;
    }

    setBiometricLoading(true);
    try {
      const { data: options } = await api.post<PublicKeyCredentialRequestOptionsJSON>(
        "/api/auth/webauthn/login/options",
        { email },
      );

      const authResponse = await startAuthentication({ optionsJSON: options });

      const { data: tokens } = await api.post<AuthTokens>(
        "/api/auth/webauthn/login/verify",
        { email, response: authResponse },
      );

      localStorage.setItem(LAST_EMAIL_KEY, email);
      queryClient.clear();
      setTokens(tokens.accessToken, tokens.refreshToken);
      try {
        const { data: me } = await api.get<User>('/api/auth/me');
        setSubscription(extractSubscription(me));
      } catch { /* fail silently */ }
      unlock();
      navigate(redirectTo, { replace: true });
    } catch (err: unknown) {
      const apiMsg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      const name = (err as { name?: string })?.name;
      const status = (err as { response?: { status?: number } })?.response?.status;

      if (name === "NotAllowedError") {
        if (!silent) setBiometricError("Operação cancelada pelo dispositivo.");
      } else if (status === 404) {
        // Só sinaliza sugestão quando o usuário clicou manualmente (não no auto-trigger silencioso)
        if (!silent) sessionStorage.setItem(WEBAUTHN_TRIED_KEY, "tried");
      } else if (apiMsg) {
        setBiometricError(apiMsg);
      } else {
        setBiometricError("Não foi possível autenticar. Use email e senha.");
      }
    } finally {
      setBiometricLoading(false);
    }
  }

  return (
    <AuthCard
      title="Bem-vindo de volta"
      subtitle="Gerencie suas finanças com inteligência"
      footer={
        <>
          Não tem conta?{" "}
          <Link to="/register" className="font-semibold text-accent-brand hover:underline">
            Criar conta
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Field
          {...register("email")}
          label="E-mail"
          type="email"
          placeholder="seu@email.com"
          autoComplete="email"
          icon={<Mail className="h-4 w-4" />}
          error={errors.email?.message}
        />

        <Field
          {...register("password")}
          label="Senha"
          type={showPassword ? "text" : "password"}
          placeholder="Sua senha"
          autoComplete="current-password"
          icon={<Lock className="h-4 w-4" />}
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="text-text-secondary hover:text-text-primary"
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
          error={errors.password?.message}
        />

        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-xs font-medium text-accent-brand hover:underline">
            Esqueci minha senha
          </Link>
        </div>

        {apiErrors.length > 0 && (
          <div className="rounded-icon border border-accent-red/40 bg-accent-red/10 px-3 py-2 text-sm text-accent-red">
            {apiErrors.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        )}

        <SubmitButton loading={isSubmitting}>Entrar</SubmitButton>
      </form>

      {webAuthnSupported && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border-default" />
            <span className="text-xs text-text-muted">ou</span>
            <div className="h-px flex-1 bg-border-default" />
          </div>

          <button
            type="button"
            onClick={() => handleBiometricLogin()}
            disabled={biometricLoading || isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-pill border border-border-strong px-4 py-3 text-sm font-medium text-text-primary transition-colors hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            {biometricLoading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Aguardando biometria...</>
            ) : (
              <><Fingerprint className="h-4 w-4 text-accent-brand" /> Entrar com biometria</>
            )}
          </button>

          {biometricError && (
            <p className="text-center text-xs text-accent-red">{biometricError}</p>
          )}
        </div>
      )}
    </AuthCard>
  );
}
