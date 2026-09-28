import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";

import { AppLayout } from "./components/layout/AppLayout";
import { LandingPage } from "./pages/LandingPage";
import { ToastProvider } from "./components/ui/Toast";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider, useAuth, computeHasAccess, extractSubscription } from "./contexts/AuthContext";
import { getAccessToken, hasRefreshToken, refreshAccessToken } from "./lib/auth";
import { api } from "./lib/api";
import { ADMIN_EMAIL } from "./lib/brand";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Analytics } from "@vercel/analytics/react"
import type { User } from "./types/api";

const BudgetPage = lazy(() => import("./pages/BudgetPage").then((m) => ({ default: m.BudgetPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const ExpensesPage = lazy(() => import("./pages/ExpensesPage").then((m) => ({ default: m.ExpensesPage })));
const GoalsPage = lazy(() => import("./pages/GoalsPage").then((m) => ({ default: m.GoalsPage })));
const ContasPage = lazy(() => import("./pages/ContasPage").then((m) => ({ default: m.ContasPage })));
const TransactionsPage = lazy(() => import("./pages/TransactionsPage").then((m) => ({ default: m.TransactionsPage })));
const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("./pages/RegisterPage").then((m) => ({ default: m.RegisterPage })));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage })));
const VerifyEmailPage = lazy(() => import("./pages/VerifyEmailPage").then((m) => ({ default: m.VerifyEmailPage })));
const WalletPage = lazy(() => import("./pages/WalletPage").then((m) => ({ default: m.WalletPage })));
const WalletsPage = lazy(() => import("./pages/WalletsPage").then((m) => ({ default: m.WalletsPage })));
const CartoesPage = lazy(() => import("./pages/CartoesPage").then((m) => ({ default: m.CartoesPage })));
const CartaoPage = lazy(() => import("./pages/CartaoPage").then((m) => ({ default: m.CartaoPage })));
const FaturaRedirectPage = lazy(() => import("./pages/FaturaRedirectPage").then((m) => ({ default: m.FaturaRedirectPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const FaqPage = lazy(() => import("./pages/FaqPage").then((m) => ({ default: m.FaqPage })));
const SupportAdminPage = lazy(() => import("./pages/SupportAdminPage").then((m) => ({ default: m.SupportAdminPage })));
const CheckoutPage = lazy(() => import("./pages/CheckoutPage").then((m) => ({ default: m.CheckoutPage })));

function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-base">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-bg-overlay border-t-accent-lime" />
    </div>
  );
}

function PrivateRoute() {
  const location = useLocation();
  const { isLocked } = useAuth();

  if (isLocked || !getAccessToken()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

function SubscriptionGate() {
  const location = useLocation();
  const { subscription } = useAuth();

  if (!subscription) return null;

  // A conta admin precisa acessar o Painel Admin mesmo sem assinatura — é de lá que ela
  // libera acesso gratuito (o dela ou o de outros usuários). Sem este bypass, ninguém
  // consegue clicar em "Liberar acesso gratuito" a partir dessa própria conta.
  if (subscription.email === ADMIN_EMAIL) {
    return <Outlet />;
  }

  if (!computeHasAccess(subscription)) {
    return <Navigate to="/checkout" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

function resolveAuthRedirect(hasToken: string | null, isLocked: boolean): string | null {
  if (hasToken && isLocked) {
    return "/login";
  }

  if (hasToken) {
    return "/dashboard";
  }

  return null;
}

function RootRoute() {
  const { isLocked } = useAuth();
  const redirect = resolveAuthRedirect(getAccessToken(), isLocked);

  return <Navigate to={redirect ?? "/landing"} replace />;
}

type BootStatus = 'booting' | 'ready' | 'offline';

function AppBoot({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<BootStatus>(
    hasRefreshToken() ? 'booting' : 'ready',
  );
  const { unlock, setSubscription } = useAuth();

  const tryRefresh = useCallback(async () => {
    setStatus('booting');
    await refreshAccessToken();
    if (getAccessToken()) {
      try {
        const { data } = await api.get<User>('/api/auth/me');
        setSubscription(extractSubscription(data));
      } catch {
        // If /me fails, still unlock (network issue, don't block the app)
      }
      // Gera notificações de contas vencidas/a vencer para o usuário logado
      api.post('/api/notifications/sync').catch(() => {});
      unlock();
      setStatus('ready');
    } else if (!hasRefreshToken()) {
      setStatus('ready');
    } else {
      setStatus('offline');
    }
  }, [unlock, setSubscription]);

  useEffect(() => {
    if (!hasRefreshToken()) return;
    tryRefresh();
  }, [tryRefresh]);

  if (status === 'booting') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-base">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-bg-overlay border-t-accent-lime" />
      </div>
    );
  }

  if (status === 'offline') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg-base">
        <p className="text-sm text-text-muted">Sem conexão com o servidor.</p>
        <button
          onClick={tryRefresh}
          className="rounded-lg bg-accent-lime px-4 py-2 text-sm font-medium text-bg-base light:text-black"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
        <AppBoot>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<RootRoute />} />
              <Route path="/landing" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />

              <Route element={<PrivateRoute />}>
                <Route path="/checkout" element={<CheckoutPage />} />

                <Route element={<SubscriptionGate />}>
                  <Route element={<AppLayout />}>
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/expenses" element={<ExpensesPage />} />
                    <Route path="/transactions" element={<TransactionsPage />} />
                    <Route path="/budget" element={<BudgetPage />} />
                    <Route path="/goals" element={<GoalsPage />} />
                    <Route path="/contas" element={<ContasPage />} />
                    <Route path="/pending" element={<Navigate to="/contas" replace />} />
                    <Route path="/carteiras" element={<WalletsPage />} />
                    <Route path="/carteiras/:id" element={<WalletPage />} />
                    <Route path="/cartoes" element={<CartoesPage />} />
                    <Route path="/cartoes/:id" element={<CartaoPage />} />
                    <Route path="/cartoes/fatura/:faturaId" element={<FaturaRedirectPage />} />
                    <Route path="/configuracoes" element={<SettingsPage />} />
                    <Route path="/faq" element={<FaqPage />} />
                    <Route path="/admin/suporte" element={<SupportAdminPage />} />
                  </Route>
                </Route>
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
          <SpeedInsights />
          <Analytics />
        </AppBoot>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>

  );
}
