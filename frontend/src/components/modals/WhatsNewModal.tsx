import { Rocket } from "lucide-react";
import { ModalShell } from "./ModalShell";

// Altere esta constante a cada novo deploy para exibir o modal novamente
const WHATS_NEW_VERSION = "2025-07-v2";
const STORAGE_KEY = "whats-new-seen";

export function hasSeenWhatsNew() {
  return localStorage.getItem(STORAGE_KEY) === WHATS_NEW_VERSION;
}

export function markWhatsNewAsSeen() {
  localStorage.setItem(STORAGE_KEY, WHATS_NEW_VERSION);
}

const sections = [
  {
    emoji: "🔐",
    title: "Login com Biometria",
    items: [
      "Entre com Face ID, digital ou PIN, sem precisar digitar a senha",
      "O prompt biométrico abre automaticamente ao carregar a tela de login",
      "Gerencie suas chaves biométricas em Minha Conta (adicionar e remover)",
      "Troque a senha confirmando via biometria, sem precisar informar a senha atual",
      "Sugestão para ativar biometria após o primeiro login com email e senha",
    ],
  },
  {
    emoji: "📄",
    title: "Importação de Extratos (OFX)",
    items: [
      "Importe o extrato do seu banco (.ofx) direto na página da carteira",
      "Categorização automática de PIX, TED e transferências por palavras-chave",
      "Histórico de importações com botão 'Desfazer' para reverter um lote inteiro",
      "Deduplicação automática: transações já importadas são ignoradas",
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
      icon={<Rocket className="h-5 w-5 text-accent-lime" />}
      onClose={handleClose}
      footer={
        <button
          type="button"
          onClick={handleClose}
          className="w-full rounded-xl bg-accent-lime py-2.5 text-sm font-semibold text-black transition hover:opacity-90"
        >
          Entendido!
        </button>
      }
    >
      <div className="flex flex-col gap-5 pb-1">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="mb-2 text-sm font-bold text-white">
              {section.emoji} {section.title}
            </p>
            <ul className="flex flex-col gap-1.5">
              {section.items.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-text-secondary">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-lime" />
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
