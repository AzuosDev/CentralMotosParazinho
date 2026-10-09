import { lazy, Suspense, useEffect, useId, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeftRight,
  BarChart2,
  Bike,
  CalendarCheck,
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  Clock,
  CreditCard,
  Gauge,
  HelpCircle,
  Home,
  Landmark,
  LayoutDashboard,
  LifeBuoy,
  Lightbulb,
  List,
  LogOut,
  Menu,
  Moon,
  Plus,
  Settings,
  Sun,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useTheme } from "../../hooks/useTheme";
import { useAuth } from "../../contexts/AuthContext";
import { NotificationBell } from "../NotificationBell";
import { useInactivityLock } from "../../hooks/useInactivityLock";
import { clearTokens, getAccessToken, getRefreshToken } from "../../lib/auth";
import { api } from "../../lib/api";
import { cn } from "../../lib/utils";
import type { User } from "../../types/api";
import { useToast } from "../ui/Toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserProfileModal } from "../modals/UserProfileModal";
import { WebAuthnSuggestionModal } from "../modals/WebAuthnSuggestionModal";
import { useWebAuthnSuggestion } from "../../hooks/useWebAuthnSuggestion";
import { hasSeenWhatsNew } from "../modals/WhatsNewModal";
import { ADMIN_EMAIL } from "../../lib/brand";
import { BrandLockup, BrandSymbol } from "../BrandMark";
const TransactionModal = lazy(() =>
  import("../modals/TransactionModal").then((m) => ({ default: m.TransactionModal }))
);
const WhatsNewModal = lazy(() =>
  import("../modals/WhatsNewModal").then((m) => ({ default: m.WhatsNewModal }))
);

type NavItem = {
  to: string;
  /** Compara contra pathname+search, para links com query string. */
  match?: string;
  label: string;
  icon: LucideIcon;
};

type NavGroup = {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
};

type NavEntry = NavItem | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

// Dashboard e Motos ficam soltos (são as duas telas do dia a dia da loja); o resto vive
// dentro de grupos recolhíveis para encurtar o menu.
const navigation: NavEntry[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/motos", label: "Motos", icon: Bike },
  {
    label: "Relatórios",
    icon: BarChart2,
    items: [
      { to: "/relatorios", label: "Visão Geral", icon: Gauge },
      { to: "/motos/relatorio", label: "Motos no Mês", icon: Bike },
      { to: "/resumo", label: "Resumo", icon: CalendarRange },
      { to: "/insights", label: "Insights", icon: Lightbulb },
    ],
  },
  {
    label: "Movimentações",
    icon: ArrowLeftRight,
    items: [
      { to: "/expenses", label: "Gastos", icon: TrendingDown },
      {
        to: "/transactions?type=INCOME",
        match: "/transactions?type=INCOME",
        label: "Ganhos",
        icon: TrendingUp,
      },
      { to: "/transactions", label: "Transações", icon: List },
    ],
  },
  {
    label: "Carteiras e Cartões",
    icon: Wallet,
    items: [
      { to: "/carteiras", label: "Carteiras", icon: Landmark },
      { to: "/cartoes", label: "Cartões", icon: CreditCard },
    ],
  },
  {
    label: "Planejamento",
    icon: CalendarCheck,
    items: [
      { to: "/contas", label: "Contas", icon: Clock },
      { to: "/goals", label: "Metas Financeiras", icon: Target },
    ],
  },
];

/** Lista plana de todos os destinos, usada no modo comprimido (só ícones). */
const flatNavigation: NavItem[] = navigation.flatMap((entry) =>
  isGroup(entry) ? entry.items : [entry],
);

function isNavItemActive(item: NavItem, currentPath: string, currentUrl: string) {
  if (item.match) {
    // Comparação exata incluindo ?query.
    return currentUrl === item.match;
  }

  if (item.to === "/motos") {
    // "Motos" acende na lista e na ficha (/motos/:id), mas não no relatório mensal: ele
    // tem item próprio dentro do grupo Relatórios.
    return (
      currentPath === "/motos" ||
      (currentPath.startsWith("/motos/") && currentPath !== "/motos/relatorio")
    );
  }

  if (item.to === "/transactions") {
    // "Transações" não acende quando o filtro de Ganhos está ativo.
    return currentPath === "/transactions" && currentUrl !== "/transactions?type=INCOME";
  }

  return (
    currentPath === item.to ||
    // Rotas filhas (/carteiras/:id, /cartoes/fatura/:id) mantêm o pai aceso.
    currentPath.startsWith(`${item.to}/`)
  );
}

const mobileNavigation = [
  { to: "/dashboard", label: "Início", icon: Home },
  { to: "/expenses", label: "Gastos", icon: BarChart2 },
  { to: "/contas", label: "Contas", icon: Clock },
  { to: "/goals", label: "Metas", icon: Target },
] as const;

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/motos": "Motos",
  "/motos/relatorio": "Motos no Mês",
  "/relatorios": "Visão Geral",
  "/resumo": "Resumo",
  "/insights": "Insights",
  "/expenses": "Gastos",
  "/transactions": "Transações",
  "/carteiras": "Carteiras",
  "/cartoes": "Cartões",
  "/contas": "Contas",
  "/goals": "Metas Financeiras",
  "/budget": "Orçamento",
  "/configuracoes": "Configurações",
  "/faq": "Perguntas Frequentes",
  "/admin/suporte": "Painel Admin",
};

/** Título exato ou, em rota filha (/carteiras/:id, /cartoes/fatura/:id), o título do pai. */
function resolvePageTitle(currentPath: string) {
  const exact = pageTitles[currentPath];

  if (exact) {
    return exact;
  }

  const parent = Object.keys(pageTitles).find((path) =>
    currentPath.startsWith(`${path}/`),
  );

  return parent ? pageTitles[parent] : "Central Motos";
}

const fallbackEmail = "usuario@centralmotos.app";

function isEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getUserEmailFromToken() {
  const token = getAccessToken();

  if (!token) {
    return null;
  }

  try {
    const payload = JSON.parse(window.atob(token.split(".")[1] ?? ""));
    return isEmail(payload.email) ? payload.email : null;
  } catch {
    return null;
  }
}

function Avatar({ email, name, avatarUrl }: { email: string; name?: string; avatarUrl?: string }) {
  const [imgError, setImgError] = useState(false);
  const letter = (name || email).charAt(0).toUpperCase();

  useEffect(() => {
    setImgError(false);
  }, [avatarUrl]);

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={name || email}
        className="h-10 w-10 shrink-0 rounded-full object-cover"
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-bg-muted text-sm font-bold text-accent-brand">
      {letter}
    </span>
  );
}

function ThemeToggleButton({ collapsed = false }: { collapsed?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const Icon = isDark ? Sun : Moon;
  const label = isDark ? "Tema claro" : "Tema escuro";

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "group relative flex w-full items-center rounded-xl px-3 py-2.5 text-sm text-text-secondary transition hover:bg-bg-overlay hover:text-text-primary",
        collapsed ? "justify-center" : "gap-3",
      )}
      aria-label={isDark ? "Ativar tema claro" : "Ativar tema escuro"}
      title={collapsed ? label : undefined}
    >
      <Icon className="h-4 w-4" />
      {!collapsed && <span>{label}</span>}
      {collapsed && (
        <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg border border-border-default bg-bg-card px-3 py-2 text-xs font-semibold text-text-primary opacity-0 shadow-xl transition group-hover:opacity-100">
          {label}
        </span>
      )}
    </button>
  );
}

type NavItemLinkProps = {
  item: NavItem;
  active: boolean;
  collapsed?: boolean;
  nested?: boolean;
  onNavigate?: () => void;
};

function NavItemLink({
  item,
  active,
  collapsed = false,
  nested = false,
  onNavigate,
}: NavItemLinkProps) {
  const { to, label, icon: Icon } = item;

  return (
    <Link
      to={to}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={cn(
        "group relative flex items-center rounded-xl text-sm font-medium transition",
        collapsed ? "justify-center px-3 py-3" : "gap-3 px-4",
        nested ? "py-2" : "py-3",
        active
          ? "bg-bg-muted text-text-primary"
          : "text-text-secondary hover:bg-bg-overlay hover:text-text-primary",
      )}
    >
      <Icon className={cn("h-5 w-5 shrink-0", active && "text-accent-brand")} />
      {!collapsed && <span className="truncate">{label}</span>}

      {/* Tooltip só no modo comprimido. */}
      {collapsed && (
        <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg border border-border-default bg-bg-card px-3 py-2 text-xs font-semibold text-text-primary opacity-0 shadow-xl transition group-hover:opacity-100">
          {label}
        </span>
      )}
    </Link>
  );
}

type NavGroupBlockProps = {
  group: NavGroup;
  currentPath: string;
  currentUrl: string;
  onNavigate?: () => void;
};

function NavGroupBlock({
  group,
  currentPath,
  currentUrl,
  onNavigate,
}: NavGroupBlockProps) {
  const { label, icon: Icon, items } = group;
  const hasActiveChild = items.some((child) =>
    isNavItemActive(child, currentPath, currentUrl),
  );
  // Nasce aberto quando a rota atual é de um dos filhos (deep link, refresh, atalho do PWA).
  const [open, setOpen] = useState(hasActiveChild);
  const contentId = `${useId()}-subitens`;

  // Reabre quando a navegação vem de fora da sidebar (menu inferior, link em outra tela).
  useEffect(() => {
    if (hasActiveChild) {
      setOpen(true);
    }
  }, [hasActiveChild]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={contentId}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition",
          // Fechado com filho ativo fica destacado; aberto, quem acende é o subitem.
          hasActiveChild && !open
            ? "text-text-primary"
            : "text-text-secondary hover:bg-bg-overlay hover:text-text-primary",
        )}
      >
        <Icon className={cn("h-5 w-5 shrink-0", hasActiveChild && "text-accent-brand")} />
        <span className="flex-1 truncate text-left">{label}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          id={contentId}
          role="group"
          className="ml-5 mt-1 flex flex-col gap-1 border-l border-border-default pl-2"
        >
          {items.map((child) => (
            <NavItemLink
              key={`${child.to}-${child.label}`}
              item={child}
              active={isNavItemActive(child, currentPath, currentUrl)}
              nested
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Item da barra inferior do mobile: lista plana, sem hierarquia nem tooltip. */
function MobileNavLink({
  item,
  active,
}: {
  item: NavItem;
  active: boolean;
}) {
  const { to, label, icon: Icon } = item;

  return (
    <Link
      to={to}
      className={cn(
        "flex flex-col items-center gap-1 text-xs",
        active ? "text-accent-brand" : "text-text-muted",
      )}
    >
      <Icon className="h-5 w-5" />
      {label}
    </Link>
  );
}

type SidebarContentProps = {
  currentPath: string;
  currentUrl: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  onLogout: () => void;
  onNavigate?: () => void;
  onOpenProfile?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

function SidebarContent({
  currentPath,
  currentUrl,
  email,
  name,
  avatarUrl,
  onLogout,
  onNavigate,
  onOpenProfile,
  collapsed = false,
  onToggleCollapse,
}: SidebarContentProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-3 p-6",
          collapsed ? "justify-center px-4" : "justify-between",
        )}
      >
        {onToggleCollapse ? (
          <>
            <button
              type="button"
              onClick={onToggleCollapse}
              className="shrink-0 rounded-icon transition hover:opacity-75"
              aria-label={collapsed ? "Expandir menu lateral" : "Comprimir menu lateral"}
              title={collapsed ? "Expandir menu" : "Comprimir menu"}
            >
              <BrandSymbol className="h-8 w-8" />
            </button>
            {!collapsed && (
              <Link to="/dashboard" onClick={onNavigate} className="min-w-0">
                <BrandLockup symbolClassName="hidden" />
              </Link>
            )}
          </>
        ) : (
          <Link
            to="/dashboard"
            onClick={onNavigate}
            className={cn("min-w-0", collapsed && "flex justify-center")}
            title={collapsed ? "Central Motos" : undefined}
          >
            <BrandLockup showName={!collapsed} />
          </Link>
        )}

        {onToggleCollapse && !collapsed && (
          <button
            onClick={onToggleCollapse}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-bg-muted text-text-secondary transition hover:bg-bg-overlay hover:text-text-primary"
            aria-label="Comprimir menu lateral"
            title="Comprimir menu"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav
        className={cn(
          "flex flex-1 flex-col gap-1",
          collapsed ? "px-3" : "px-4",
        )}
      >
        {/* Comprimida não há espaço para hierarquia: mostra tudo como ícone. */}
        {collapsed
          ? flatNavigation.map((item) => (
              <NavItemLink
                key={`${item.to}-${item.label}`}
                item={item}
                active={isNavItemActive(item, currentPath, currentUrl)}
                collapsed
                onNavigate={onNavigate}
              />
            ))
          : navigation.map((entry) =>
              isGroup(entry) ? (
                <NavGroupBlock
                  key={entry.label}
                  group={entry}
                  currentPath={currentPath}
                  currentUrl={currentUrl}
                  onNavigate={onNavigate}
                />
              ) : (
                <NavItemLink
                  key={`${entry.to}-${entry.label}`}
                  item={entry}
                  active={isNavItemActive(entry, currentPath, currentUrl)}
                  onNavigate={onNavigate}
                />
              ),
            )}
      </nav>

      <div className={cn("flex flex-col gap-1 pb-1", collapsed ? "px-3" : "px-4")}>
        {email === ADMIN_EMAIL && (
          <Link
            to="/admin/suporte"
            onClick={onNavigate}
            title={collapsed ? "Painel Admin" : undefined}
            className={cn(
              "group relative flex items-center rounded-xl py-3 text-sm font-medium transition",
              collapsed ? "justify-center px-3" : "gap-3 px-4",
              currentPath === "/admin/suporte"
                ? "bg-bg-muted text-text-primary"
                : "text-text-secondary hover:bg-bg-overlay hover:text-text-primary",
            )}
          >
            <LifeBuoy className={cn("h-5 w-5", currentPath === "/admin/suporte" && "text-accent-brand")} />
            {!collapsed && <span>Painel Admin</span>}
            {collapsed && (
              <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg border border-border-default bg-bg-card px-3 py-2 text-xs font-semibold text-text-primary opacity-0 shadow-xl transition group-hover:opacity-100">
                Painel Admin
              </span>
            )}
          </Link>
        )}
        <Link
          to="/faq"
          onClick={onNavigate}
          title={collapsed ? "FAQ" : undefined}
          className={cn(
            "group relative flex items-center rounded-xl py-3 text-sm font-medium transition",
            collapsed ? "justify-center px-3" : "gap-3 px-4",
            currentPath === "/faq"
              ? "bg-bg-muted text-text-primary"
              : "text-text-secondary hover:bg-bg-overlay hover:text-text-primary",
          )}
        >
          <HelpCircle className={cn("h-5 w-5", currentPath === "/faq" && "text-accent-brand")} />
          {!collapsed && <span>FAQ</span>}
          {collapsed && (
            <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg border border-border-default bg-bg-card px-3 py-2 text-xs font-semibold text-text-primary opacity-0 shadow-xl transition group-hover:opacity-100">
              FAQ
            </span>
          )}
        </Link>
        <NotificationBell collapsed={collapsed} />
      </div>

      <div
        className={cn(
          "border-t border-border-default py-4",
          collapsed ? "px-3" : "px-4",
        )}
      >
        <div className="relative">
          <div
            className={cn(
              "flex items-center gap-3",
              collapsed && "justify-center",
            )}
          >
            <button
              type="button"
              onClick={collapsed ? () => setUserMenuOpen((v) => !v) : onOpenProfile}
              className="shrink-0 rounded-full transition hover:ring-2 hover:ring-accent-brand/50 focus:outline-none"
              title={collapsed ? (name || email) : "Abrir perfil"}
              aria-label={collapsed ? "Menu do usuário" : "Abrir perfil do usuário"}
            >
              <Avatar email={email} name={name} avatarUrl={avatarUrl} />
            </button>
            {!collapsed && (
              <button
                type="button"
                onClick={() => setUserMenuOpen((v) => !v)}
                className="min-w-0 flex-1 text-left transition hover:opacity-80"
                aria-label="Menu do usuário"
              >
                <p className="truncate text-sm font-semibold text-text-primary">
                  {name || email.split("@")[0]}
                </p>
                <p className="truncate text-xs text-text-secondary">{email}</p>
              </button>
            )}
          </div>

          {userMenuOpen && (
            <>
              <button
                className="fixed inset-0 z-10 h-full w-full cursor-default"
                onClick={() => setUserMenuOpen(false)}
                aria-hidden="true"
                tabIndex={-1}
              />
              <div
                className={cn(
                  "absolute z-20 min-w-[180px] rounded-xl border border-border-default bg-bg-card p-1 shadow-xl",
                  collapsed
                    ? "bottom-0 left-full ml-3"
                    : "bottom-full left-0 mb-2 w-full",
                )}
              >
                <button
                  onClick={() => { setUserMenuOpen(false); onOpenProfile?.(); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary transition hover:bg-bg-overlay hover:text-text-primary"
                >
                  <Settings className="h-4 w-4" />
                  Configurações
                </button>
                <button
                  onClick={() => { setUserMenuOpen(false); onLogout(); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary transition hover:bg-bg-overlay hover:text-accent-red"
                >
                  <LogOut className="h-4 w-4" />
                  Sair
                </button>
              </div>
            </>
          )}
        </div>

        <div className="mt-4 grid gap-1">
          <ThemeToggleButton collapsed={collapsed} />
        </div>
      </div>
    </>
  );
}

import { createContext, useContext } from "react";

function MobileNotificationBell() {
  return <NotificationBell openDirection="down" iconOnly />;
}

export const TransactionModalContext = createContext<{ open: boolean; setOpen: React.Dispatch<React.SetStateAction<boolean>> }>({
  open: false,
  setOpen: () => {},
});

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const { lock, isLocked } = useAuth();
  useInactivityLock(lock, isLocked);
  const [whatsNewOpen, setWhatsNewOpen] = useState(() => !hasSeenWhatsNew());
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const [txTab, setTxTab] = useState<"INCOME" | "EXPENSE" | "TRANSFER">("EXPENSE");
  const [userProfileOpen, setUserProfileOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);
  const webAuthnSuggestion = useWebAuthnSuggestion();

  const [email, setEmail] = useState(
    () => getUserEmailFromToken() ?? fallbackEmail,
  );
  const userQuery = useQuery<User>({
    queryKey: ["user-profile"],
    queryFn: () => api.get<User>("/api/users/me").then((r) => r.data),
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
  const name = userQuery.data?.name;
  const avatarUrl = userQuery.data?.avatarUrl;

  const currentPath = location.pathname;
  const currentUrl = `${location.pathname}${location.search}`;
  const title = resolvePageTitle(currentPath);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const tokenEmail = getUserEmailFromToken();

    if (tokenEmail) {
      setEmail(tokenEmail);
      return;
    }

    let active = true;

    api
      .get<User>("/api/auth/me")
      .then(({ data }) => {
        if (active && isEmail(data.email)) {
          setEmail(data.email);
        }
      })
      .catch(() => {
        if (active) {
          setEmail(fallbackEmail);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const handleLogout = async () => {
    try {
      const refreshToken = getRefreshToken();
      await api.post("/api/auth/logout", { refreshToken });
    } catch {
      // Ignora falha de logout do servidor e segue com o fluxo local.
    } finally {
      clearTokens();
      queryClient.clear();
      addToast("Sessão encerrada com sucesso.", "success");
      navigate("/login", { replace: true });
    }
  };

  const openTx = (tab: "INCOME" | "EXPENSE" | "TRANSFER") => {
    setAddModalOpen(false);
    setTxTab(tab);
    setTxOpen(true);
  };

  return (
    <TransactionModalContext.Provider value={{ open: addModalOpen, setOpen: setAddModalOpen }}>
        <div className="min-h-screen bg-bg-base text-text-primary">
      <aside
        className={cn(
          "fixed left-0 top-0 hidden h-full flex-col bg-bg-card transition-[width] duration-200 lg:flex",
          desktopSidebarCollapsed ? "w-20" : "w-64",
        )}
      >
        <SidebarContent
          currentPath={currentPath}
          currentUrl={currentUrl}
          email={email}
          name={name}
          avatarUrl={avatarUrl}
          onLogout={handleLogout}
          onOpenProfile={() => setUserProfileOpen(true)}
          collapsed={desktopSidebarCollapsed}
          onToggleCollapse={() =>
            setDesktopSidebarCollapsed((collapsed) => !collapsed)
          }
        />
      </aside>

      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 h-full w-full bg-black/60"
            onClick={() => setMobileSidebarOpen(false)}
            aria-label="Fechar menu lateral"
          />
          <aside className="relative flex h-full w-[min(20rem,86vw)] flex-col bg-bg-card shadow-2xl">
            <div className="absolute right-3 top-3">
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-xl bg-bg-muted text-text-secondary transition hover:bg-bg-overlay hover:text-text-primary"
                aria-label="Fechar menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarContent
              currentPath={currentPath}
              currentUrl={currentUrl}
              email={email}
              name={name}
              avatarUrl={avatarUrl}
              onLogout={handleLogout}
              onOpenProfile={() => { setMobileSidebarOpen(false); setUserProfileOpen(true); }}
              onNavigate={() => setMobileSidebarOpen(false)}
            />
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border-default bg-bg-card px-4 py-3 lg:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-bg-muted text-text-secondary transition hover:bg-bg-overlay hover:text-text-primary"
            aria-label="Abrir menu lateral"
          >
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="truncate font-sans text-lg font-bold text-text-primary">
            {title}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <MobileNotificationBell />
          <button
            onClick={() => setUserProfileOpen(true)}
            className="rounded-full transition hover:ring-2 hover:ring-accent-brand/50 focus:outline-none"
            aria-label="Abrir perfil do usuário"
          >
            <Avatar email={email} name={name} avatarUrl={avatarUrl} />
          </button>
        </div>
      </header>

      <main
        className={cn(
          "min-h-screen bg-bg-base p-5 pb-24 transition-[margin] duration-200 lg:pb-5",
          desktopSidebarCollapsed ? "lg:ml-20" : "lg:ml-64",
        )}
      >
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>

      {/* Barra inferior: lista plana própria, com o FAB ocupando a célula central. */}
      <nav className="fixed bottom-0 left-0 z-40 grid w-full grid-cols-5 border-t border-border-default bg-bg-card px-3 pb-3 pt-2 lg:hidden">
        {mobileNavigation.slice(0, 2).map((item) => (
          <MobileNavLink
            key={item.to}
            item={item}
            active={isNavItemActive(item, currentPath, currentUrl)}
          />
        ))}

        <button
          onClick={() => setAddModalOpen(true)}
          className="-mt-6 mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent-brand text-white shadow-lg shadow-accent-brand/40"
          aria-label="Adicionar transação"
        >
          <Plus className="h-6 w-6" />
        </button>

        {mobileNavigation.slice(2).map((item) => (
          <MobileNavLink
            key={item.to}
            item={item}
            active={isNavItemActive(item, currentPath, currentUrl)}
          />
        ))}
      </nav>

      {addModalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/60 p-4 sm:place-items-center">
          <div className="w-full max-w-sm rounded-2xl border border-border-default bg-bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-sans text-lg font-bold">Nova movimentação</h2>
              <button
                onClick={() => setAddModalOpen(false)}
                className="rounded-lg px-2 py-1 text-text-secondary hover:bg-bg-overlay hover:text-text-primary"
              >
                Fechar
              </button>
            </div>
            <div className="grid gap-3">
              <button
                onClick={() => openTx("EXPENSE")}
                className="flex items-center gap-3 rounded-xl bg-bg-muted p-4 text-left hover:bg-bg-overlay"
              >
                <ArrowLeftRight className="h-5 w-5 text-accent-brand" />
                <span className="font-semibold">Nova Movimentação</span>
              </button>
              <button
                onClick={() => { setAddModalOpen(false); navigate("/contas?action=create"); }}
                className="flex items-center gap-3 rounded-xl bg-bg-muted p-4 text-left hover:bg-bg-overlay"
              >
                <Clock className="h-5 w-5 text-accent-yellow" />
                <span className="font-semibold">Nova Conta</span>
              </button>
              <button
                onClick={() => { setAddModalOpen(false); navigate("/goals?action=create"); }}
                className="flex items-center gap-3 rounded-xl bg-bg-muted p-4 text-left hover:bg-bg-overlay"
              >
                <Target className="h-5 w-5 text-accent-brand" />
                <span className="font-semibold">Nova Meta</span>
              </button>
              <button
                onClick={() => { setAddModalOpen(false); navigate("/carteiras?action=create"); }}
                className="flex items-center gap-3 rounded-xl bg-bg-muted p-4 text-left hover:bg-bg-overlay"
              >
                <Landmark className="h-5 w-5 text-text-secondary" />
                <span className="font-semibold">Nova Carteira</span>
              </button>
              <button
                onClick={() => { setAddModalOpen(false); navigate("/cartoes?action=create"); }}
                className="flex items-center gap-3 rounded-xl bg-bg-muted p-4 text-left hover:bg-bg-overlay"
              >
                <CreditCard className="h-5 w-5 text-text-secondary" />
                <span className="font-semibold">Novo Cartão</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <Suspense fallback={null}>
        <TransactionModal open={txOpen} onClose={() => setTxOpen(false)} defaultTab={txTab} />
      </Suspense>

      <Suspense fallback={null}>
        <WhatsNewModal open={whatsNewOpen} onClose={() => setWhatsNewOpen(false)} />
      </Suspense>

      <UserProfileModal
        open={userProfileOpen}
        onClose={() => setUserProfileOpen(false)}
      />

      <WebAuthnSuggestionModal
        open={webAuthnSuggestion.open}
        isForm1={webAuthnSuggestion.isForm1}
        onDismiss={webAuthnSuggestion.dismiss}
        onRegistered={webAuthnSuggestion.markRegistered}
      />
    </div>
  </TransactionModalContext.Provider>
  );
}
