import type { ReactNode } from "react";
import { X } from "lucide-react";

export function ModalShell({
  open,
  title,
  icon,
  onClose,
  children,
  footer,
  containerClassName = "",
}: {
  open: boolean;
  title: string;
  icon: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  containerClassName?: string;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-center items-start overflow-y-auto bg-black/60 backdrop-blur-sm p-3 sm:p-4">
      <div
        className={`relative my-auto w-full max-w-lg max-h-[92vh] flex flex-col rounded-2xl border border-bg-muted bg-bg-card shadow-2xl ${containerClassName}`}
      >
        {/* Cabeçalho fixo */}
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 shrink-0">
          <div className="flex items-center gap-3">
            {icon}
            <h2 className="font-sans text-lg font-bold text-text-primary">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl text-text-secondary hover:bg-bg-overlay hover:text-text-primary"
            aria-label="Fechar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Corpo com scroll */}
        <div className="flex-1 overflow-y-auto px-5 py-3">{children}</div>

        {/* Footer fixo (se fornecido) */}
        {footer && (
          <div className="shrink-0 border-t border-bg-muted px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
