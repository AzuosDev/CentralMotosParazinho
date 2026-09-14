import type { ReactNode } from "react";
import { X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { formatDisplayDate } from "../../lib/finance";
import { SupportThread } from "./SupportThread";

export function SupportThreadDrawer({
  open,
  onClose,
  messageId,
  viewerRole,
  invalidateListKey,
  titulo,
  tipoLabel,
  tipoIcon: TipoIcon,
  tipoColor,
  createdAt,
  mensagem,
  userEmail,
  headerActions,
}: {
  open: boolean;
  onClose: () => void;
  messageId: string;
  viewerRole: "admin" | "user";
  invalidateListKey: string[];
  titulo: string;
  tipoLabel: string;
  tipoIcon: LucideIcon;
  tipoColor: string;
  createdAt: string;
  mensagem: string;
  userEmail?: string;
  headerActions?: ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 h-full w-full bg-black/60"
        onClick={onClose}
        aria-label="Fechar chamado"
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-2xl flex-col bg-bg-card shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-bg-muted px-5 py-4">
          <div className="min-w-0">
            <p className={cn("flex items-center gap-1.5 text-xs font-semibold", tipoColor)}>
              <TipoIcon className="h-3.5 w-3.5" /> {tipoLabel}
            </p>
            <h2 className="mt-1 truncate font-sans text-base font-bold text-white">{titulo}</h2>
            <p className="mt-0.5 text-xs text-text-muted">
              Aberto em {formatDisplayDate(createdAt)}
              {userEmail ? ` · ${userEmail}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-text-secondary hover:bg-bg-overlay hover:text-white"
            aria-label="Fechar chamado"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {headerActions && (
          <div className="shrink-0 border-b border-bg-muted px-5 py-3">{headerActions}</div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="whitespace-pre-wrap text-sm text-white">{mensagem}</p>
          <SupportThread messageId={messageId} viewerRole={viewerRole} invalidateListKey={invalidateListKey} />
        </div>
      </aside>
    </div>
  );
}
