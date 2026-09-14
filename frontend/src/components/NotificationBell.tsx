import { useEffect, useRef, useState } from "react";
import { Bell, BellDot, Check, CheckCheck, Clock, MessageCircle, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { cn } from "../lib/utils";
import { formatDisplayDate } from "../lib/finance";

type NotificationType =
  | "VENCIDA_PAGAR"
  | "VENCIDA_RECEBER"
  | "VENCE_HOJE_PAGAR"
  | "VENCE_HOJE_RECEBER";

type Notification = {
  _id: string;
  type: NotificationType;
  title: string;
  message: string;
  pendingAccountId: string;
  read: boolean;
  generatedDate: string;
  createdAt: string;
};

type SupportBellItem = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  targetPath: string;
};

const typeConfig: Record<NotificationType, { color: string; dot: string }> = {
  VENCIDA_PAGAR: {
    color: "text-accent-red",
    dot: "bg-accent-red",
  },
  VENCIDA_RECEBER: {
    color: "text-accent-red",
    dot: "bg-accent-red",
  },
  VENCE_HOJE_PAGAR: {
    color: "text-accent-yellow",
    dot: "bg-accent-yellow",
  },
  VENCE_HOJE_RECEBER: {
    color: "text-accent-yellow",
    dot: "bg-accent-yellow",
  },
};

export function NotificationBell({
  collapsed = false,
  openDirection = "up",
  iconOnly = false,
}: {
  collapsed?: boolean;
  openDirection?: "up" | "down";
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["notifications"],
    queryFn: () => api.get<Notification[]>("/api/notifications").then((r) => r.data),
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
  });

  // Chamados de suporte abertos (visão admin) ou com resposta nova (visão do usuário).
  // Não é a mesma coleção dos lembretes de conta — só é mesclado aqui na exibição.
  const { data: supportItems = [] } = useQuery<SupportBellItem[]>({
    queryKey: ["support-bell"],
    queryFn: () => api.get<SupportBellItem[]>("/api/support/notifications").then((r) => r.data),
    refetchInterval: 5 * 1000,
    staleTime: 0,
  });

  const unreadCount = notifications.length + supportItems.length;

  const markOneMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/api/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllMutation = useMutation({
    mutationFn: () => api.patch("/api/notifications/read-all"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const dismissSupportMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/api/support/messages/${id}/dismiss`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-bell"] });
      queryClient.invalidateQueries({ queryKey: ["support-messages"] });
      queryClient.invalidateQueries({ queryKey: ["support-messages-mine"] });
    },
  });

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleNotificationClick = (n: Notification) => {
    if (!n.read) markOneMutation.mutate(n._id);
    setOpen(false);
    navigate("/contas");
  };

  const handleSupportItemClick = (item: SupportBellItem) => {
    dismissSupportMutation.mutate(item.id);
    setOpen(false);
    navigate(item.targetPath);
  };

  const BellIcon = unreadCount > 0 ? BellDot : Bell;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={collapsed || iconOnly ? "Notificações" : undefined}
        aria-label="Notificações"
        className={cn(
          "group relative flex items-center rounded-xl text-sm transition",
          iconOnly
            ? "h-10 w-10 justify-center"
            : "w-full px-3 py-2.5",
          open
            ? "bg-bg-overlay text-text-primary"
            : "text-text-secondary hover:bg-bg-overlay hover:text-text-primary",
          !iconOnly && (collapsed ? "justify-center" : "gap-3"),
        )}
      >
        <div className="relative shrink-0">
          <BellIcon className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent-red text-[9px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </div>
        {!collapsed && !iconOnly && <span>Notificações</span>}
        {collapsed && !iconOnly && (
          <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg border border-border-default bg-bg-card px-3 py-2 text-xs font-semibold text-text-primary opacity-0 shadow-xl transition group-hover:opacity-100">
            Notificações{unreadCount > 0 ? ` (${unreadCount})` : ""}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className={cn(
            "absolute z-50 w-80 rounded-2xl border border-border-default bg-bg-card shadow-2xl",
            collapsed
              ? "bottom-0 left-full ml-3"
              : openDirection === "down"
                ? "right-0 top-full mt-2"
                : "bottom-full left-0 mb-2",
          )}
        >
          <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
            <span className="text-sm font-semibold text-text-primary">
              Notificações
              {unreadCount > 0 && (
                <span className="ml-2 rounded-full bg-accent-red px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </span>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => markAllMutation.mutate()}
                  disabled={markAllMutation.isPending}
                  title="Marcar todas como lidas"
                  className="rounded-lg p-1.5 text-text-muted transition hover:bg-bg-overlay hover:text-text-primary"
                >
                  <CheckCheck className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-text-muted transition hover:bg-bg-overlay hover:text-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 && supportItems.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <Bell className="h-8 w-8 text-text-muted" />
                <p className="text-sm text-text-muted">Nenhuma notificação pendente</p>
              </div>
            ) : (
              <>
              {supportItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSupportItemClick(item)}
                  className="flex w-full items-start gap-3 border-b border-border-default px-4 py-3 text-left transition last:border-0 hover:bg-bg-overlay"
                >
                  <MessageCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-lime" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-accent-lime">{item.title}</p>
                    <p className="truncate text-sm text-text-primary">{item.message}</p>
                    <p className="mt-0.5 text-xs text-text-muted">{formatDisplayDate(item.createdAt)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      dismissSupportMutation.mutate(item.id);
                    }}
                    title="Marcar como lida"
                    className="mt-1 shrink-0 rounded-lg p-1 text-text-muted transition hover:bg-bg-muted hover:text-text-primary"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                </button>
              ))}
              {notifications.map((n) => {
                const cfg = typeConfig[n.type] ?? { color: "text-text-secondary", dot: "bg-text-muted" };
                return (
                  <button
                    key={n._id}
                    type="button"
                    onClick={() => handleNotificationClick(n)}
                    className="flex w-full items-start gap-3 border-b border-border-default px-4 py-3 text-left transition last:border-0 hover:bg-bg-overlay"
                  >
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", cfg.dot)} />
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-xs font-semibold", cfg.color)}>{n.title}</p>
                      <p className="truncate text-sm text-text-primary">{n.message}</p>
                      <p className="mt-0.5 text-xs text-text-muted">
                        {formatDisplayDate(n.generatedDate)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        markOneMutation.mutate(n._id);
                      }}
                      title="Marcar como lida"
                      className="mt-1 shrink-0 rounded-lg p-1 text-text-muted transition hover:bg-bg-muted hover:text-text-primary"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  </button>
                );
              })}
              </>
            )}
          </div>

          {notifications.length > 0 && (
            <div className="border-t border-border-default px-4 py-2">
              <button
                type="button"
                onClick={() => { setOpen(false); navigate("/contas"); }}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold text-accent-lime transition hover:opacity-80"
              >
                <Clock className="h-3.5 w-3.5" />
                Ver todas as contas
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
