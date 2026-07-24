import { Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { AuthCard } from "../components/AuthCard";
import { api } from "../lib/api";
import { setTokens } from "../lib/auth";
import { getApiErrorText } from "../lib/errors";
import { useAuth, extractSubscription } from "../contexts/AuthContext";
import type { AuthTokens, User } from "../types/api";

type VerifyState =
  | { status: "loading"; message: string }
  | { status: "error"; message: string };

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();
  const { unlock, setSubscription } = useAuth();
  const [state, setState] = useState<VerifyState>({
    status: "loading",
    message: "Verificando seu email...",
  });

  useEffect(() => {
    if (!token) {
      setState({ status: "error", message: "Token de verificação ausente." });
      return;
    }

    api
      .get<AuthTokens>("/api/auth/verify-email", { params: { token } })
      .then(async ({ data }) => {
        if (!data?.accessToken || !data?.refreshToken) {
          throw new Error("Resposta inválida do servidor");
        }

        setTokens(data.accessToken, data.refreshToken);
        try {
          const { data: me } = await api.get<User>('/api/auth/me');
          setSubscription(extractSubscription(me));
        } catch { /* fail silently */ }
        unlock();
        navigate("/dashboard", { replace: true });
      })
      .catch((error) => {
        setState({
          status: "error",
          message: getApiErrorText(error, "Nao foi possivel verificar este email. O token pode ter expirado."),
        });
      });
  }, [token, navigate, unlock, setSubscription]);

  return (
    <AuthCard
      title="Verificação de email"
      footer={
        <Link to="/login" className="font-semibold text-accent-lime hover:underline">
          Ir para login
        </Link>
      }
    >
      <div className="flex flex-col items-center gap-3 text-center">
        {state.status === "loading" && <Loader2 className="h-12 w-12 animate-spin text-accent-lime" />}
        {state.status === "error" && <XCircle className="h-12 w-12 text-accent-red" />}
        <p className="text-sm text-text-secondary">{state.message}</p>
      </div>
    </AuthCard>
  );
}
