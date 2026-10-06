import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Mail } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";

import { AuthCard } from "../components/AuthCard";
import { Field } from "../components/Field";
import { SubmitButton } from "../components/SubmitButton";
import { api } from "../lib/api";

const forgotSchema = z.object({
  email: z.string().trim().email("Informe um email válido"),
});

type ForgotForm = z.infer<typeof forgotSchema>;

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotForm>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ForgotForm) {
    try {
      await api.post("/api/auth/forgot-password", values);
    } finally {
      setSent(true);
    }
  }

  return (
    <AuthCard
      title="Esqueci minha senha"
      subtitle="Enviaremos as instruções por email"
      footer={
        <Link to="/login" className="font-semibold text-accent-brand hover:underline">
          Voltar para login
        </Link>
      }
    >
      {sent ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <CheckCircle2 className="h-12 w-12 text-accent-brand" />
          <p className="text-sm text-text-secondary">
            Se este email estiver cadastrado, você receberá as instruções
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Field
            {...register("email")}
            type="email"
            placeholder="seu@email.com"
            autoComplete="email"
            icon={<Mail className="h-4 w-4" />}
            error={errors.email?.message}
          />

          <SubmitButton loading={isSubmitting}>Enviar</SubmitButton>
        </form>
      )}
    </AuthCard>
  );
}
