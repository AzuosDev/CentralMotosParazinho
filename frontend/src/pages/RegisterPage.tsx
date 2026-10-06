import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Eye, EyeOff, Loader2, Lock, Mail, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";

import { AuthCard } from "../components/AuthCard";
import { Field } from "../components/Field";
import { SubmitButton } from "../components/SubmitButton";
import { api } from "../lib/api";
import { getApiErrorMessages, setFieldErrorsFromApi } from "../lib/errors";
import type { User } from "../types/api";

const registerSchema = z
  .object({
    email: z.string().trim().email("Informe um email válido"),
    password: z
      .string()
      .min(8, "A senha deve ter no mínimo 8 caracteres")
      .regex(/[A-Z]/, "A senha deve conter ao menos 1 letra maiúscula")
      .regex(/[0-9]/, "A senha deve conter ao menos 1 número"),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não coincidem",
  });

type RegisterForm = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [apiErrors, setApiErrors] = useState<string[]>([]);
  const [success, setSuccess] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  async function handleResend() {
    if (resendCooldown > 0 || resendLoading) return;

    setResendLoading(true);
    setResendError(null);
    setResendMessage(null);

    try {
      await api.post("/api/auth/resend-verification", { email: registeredEmail });
      setResendMessage("Email reenviado! Confira sua caixa de entrada.");
      setResendCooldown(60);
    } catch (error) {
      setResendError(getApiErrorMessages(error, "Não foi possível reenviar o email. Tente novamente em instantes.").join(" "));
    } finally {
      setResendLoading(false);
    }
  }

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" },
  });

  async function onSubmit(values: RegisterForm) {
    setApiErrors([]);

    try {
      await api.post<User>("/api/auth/register", {
        email: values.email,
        password: values.password,
      });
      setRegisteredEmail(values.email);
      setSuccess(true);
    } catch (error) {
      const messages = setFieldErrorsFromApi(error, setError, ["email", "password"]);
      setApiErrors(messages.length ? messages : getApiErrorMessages(error, "Nao foi possivel criar sua conta."));
    }
  }

  if (success) {
    return (
      <AuthCard
        title="Cadastro iniciado"
        footer={
          <Link to="/login" className="font-semibold text-accent-brand hover:underline">
            Voltar para login
          </Link>
        }
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <CheckCircle2 className="h-12 w-12 text-accent-brand" />
          <p className="text-sm text-text-secondary">
            Verifique seu email para confirmar o cadastro
          </p>

          <button
            type="button"
            onClick={handleResend}
            disabled={resendCooldown > 0 || resendLoading}
            className="mt-2 flex items-center gap-2 rounded-xl border border-border-default px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-bg-overlay disabled:cursor-not-allowed disabled:opacity-50"
          >
            {resendLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {resendCooldown > 0
              ? `Reenviar em ${resendCooldown}s`
              : "Reenviar email de verificação"}
          </button>

          {resendMessage && <p className="text-xs text-accent-brand">{resendMessage}</p>}
          {resendError && <p className="text-xs text-accent-red">{resendError}</p>}
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Criar conta"
      subtitle="Comece a organizar suas finanças"
      footer={
        <>
          Já tem conta?{" "}
          <Link to="/login" className="font-semibold text-accent-brand hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Field
          {...register("email")}
          type="email"
          placeholder="seu@email.com"
          autoComplete="email"
          icon={<Mail className="h-4 w-4" />}
          error={errors.email?.message}
        />

        <Field
          {...register("password")}
          type={showPassword ? "text" : "password"}
          placeholder="Senha"
          autoComplete="new-password"
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

        <Field
          {...register("confirmPassword")}
          type={showPassword ? "text" : "password"}
          placeholder="Confirmar senha"
          autoComplete="new-password"
          icon={<Lock className="h-4 w-4" />}
          error={errors.confirmPassword?.message}
        />

        {apiErrors.length > 0 && (
          <div className="rounded-icon border border-accent-red/40 bg-accent-red/10 px-3 py-2 text-sm text-accent-red">
            {apiErrors.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        )}

        <SubmitButton loading={isSubmitting}>Criar conta</SubmitButton>
      </form>
    </AuthCard>
  );
}
