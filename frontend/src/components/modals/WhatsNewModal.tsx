import { Rocket } from "lucide-react";
import { ModalShell } from "./ModalShell";

// Altere esta constante a cada novo deploy para exibir o modal novamente
const WHATS_NEW_VERSION = "2026-09-v1";
const STORAGE_KEY = "whats-new-seen";

export function hasSeenWhatsNew() {
  return localStorage.getItem(STORAGE_KEY) === WHATS_NEW_VERSION;
}

export function markWhatsNewAsSeen() {
  localStorage.setItem(STORAGE_KEY, WHATS_NEW_VERSION);
}

const sections = [
  {
    emoji: "💳",
    title: "Faturas mais confiáveis",
    items: [
      "A fatura do mês atual agora abre selecionada por padrão ao entrar no cartão",
      "Faturas vazias 'fantasmas' somem sozinhas depois de excluir ou estornar uma compra",
      "Uma fatura que volta a ter saldo devedor deixa de ficar marcada como paga por engano",
    ],
  },
  {
    emoji: "🔗",
    title: "Vincular contas ao cartão",
    items: [
      "Contas recorrentes (assinaturas como Netflix) podem ser vinculadas a um cartão — a cobrança entra sozinha na fatura",
      "Conta já vinculada mostra o selo 'Vinculada a [cartão]' em vez de ações manuais que não deviam mais aparecer",
      "Vincular uma conta antiga ao cartão preserva a data original da compra",
    ],
  },
  {
    emoji: "➕",
    title: "Lançar compra no cartão, mais fácil",
    items: [
      "O botão '+ Nova Compra' virou um menu: à vista, parcelada, vincular recorrente ou vincular conta parcelada",
      "Compras parceladas podem ser renomeadas depois de criadas",
      "Nome do cartão agora é texto livre, e o ícone não muda mais sozinho ao editar",
    ],
  },
  {
    emoji: "↩️",
    title: "Corrigir com segurança",
    items: [
      "Novo botão 'Desfazer pagamento' numa fatura já paga por engano",
      "Não é mais possível estornar a mesma compra duas vezes",
      "Mensagem de erro ao excluir uma compra parcelada agora diz qual fatura está bloqueando",
    ],
  },
  {
    emoji: "📊",
    title: "Saldo e Dashboard sempre batendo",
    items: [
      "O Saldo do Dashboard sempre bate com a soma da tela 'Carteiras'",
      "Pagar a fatura de um cartão agora aparece em Saídas e no gráfico de Evolução Mensal",
      "Arquivar um cartão (em vez de excluir) mantém o histórico e some das listas",
    ],
  },
];

export function WhatsNewModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  function handleClose() {
    markWhatsNewAsSeen();
    onClose();
  }

  return (
    <ModalShell
      open={open}
      title="O que há de novo"
      icon={<Rocket className="h-5 w-5 text-accent-brand" />}
      onClose={handleClose}
      footer={
        <button
          type="button"
          onClick={handleClose}
          className="w-full rounded-xl bg-accent-brand py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Entendido!
        </button>
      }
    >
      <div className="flex flex-col gap-5 pb-1">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="mb-2 text-sm font-bold text-text-primary">
              {section.emoji} {section.title}
            </p>
            <ul className="flex flex-col gap-1.5">
              {section.items.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-text-secondary">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-brand" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}
