import { useEffect, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Check,
  Clock,
  Coins,
  Copy,
  Fingerprint,
  LayoutDashboard,
  Lock,
  Mail,
  MessageCircle,
  ShieldCheck,
  Server,
  Tag,
  Target,
  Upload,
  UserCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/utils";

const features: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: LayoutDashboard,
    title: "Dashboard consolidado",
    description:
      "Veja o saldo de todas as suas carteiras (banco, dinheiro, cartão) num único lugar, atualizado a cada movimentação.",
  },
  {
    icon: Clock,
    title: "Contas a pagar e receber",
    description:
      "Cadastre parcelamentos e contas recorrentes (aluguel, assinaturas, financiamentos) e nunca perca um vencimento.",
  },
  {
    icon: Upload,
    title: "Importe seu extrato bancário",
    description:
      "Suba o arquivo OFX do seu banco e o MeuGasto lança as transações automaticamente, sem digitar uma por uma.",
  },
  {
    icon: Tag,
    title: "Categorização de gastos",
    description: "Entenda pra onde vai seu dinheiro, por categoria e por período.",
  },
  {
    icon: Fingerprint,
    title: "Login biométrico",
    description: "Entre com Face ID ou digital, sem precisar digitar senha toda vez.",
  },
  {
    icon: Target,
    title: "Metas financeiras",
    description:
      "Defina um valor e um prazo, vincule a uma categoria e acompanhe seu progresso automaticamente a cada gasto.",
  },
];

const securityPoints: { icon: LucideIcon; text: string }[] = [
  { icon: Lock, text: "Conexão criptografada via HTTPS em toda comunicação com o app." },
  {
    icon: Fingerprint,
    text: "Login biométrico processado localmente no seu dispositivo, sua senha não precisa trafegar pela rede toda vez que você entra.",
  },
  { icon: Server, text: "Dados hospedados em infraestrutura totalmente segura." },
  {
    icon: UserCheck,
    text: "Você é o único com acesso à sua conta. Nunca compartilhamos ou visualizamos seus dados.",
  },
];

const basicFeatures = [
  "Dashboard consolidado de todas as suas carteiras",
  "Contas a pagar e receber, com parcelamento e recorrência",
  "Importe seu extrato bancário via arquivo OFX",
  "Categorização de gastos",
  "Login biométrico",
  "Insights financeiros",
];

const businessFeatures = [
  "Tudo do plano Básico",
  "Versão personalizada para o seu negócio",
  "Manutenções corretivas prioritárias",
  "Atualizações dedicadas",
];

const CONTACT_EMAIL = "udawgs.org@gmail.com";
const SALES_WHATSAPP_NUMBER = "5588996784110";
const SALES_WHATSAPP_MESSAGE = "Olá! Tenho interesse no plano Empresarial do MeuGasto.";
const CONTACT_WHATSAPP_MESSAGE = "Olá! Tenho uma dúvida sobre o MeuGasto.";
const CONTACT_WHATSAPP_DISPLAY = "(88) 9 9678-4110";

const faqs: { question: string; answer: string }[] = [
  {
    question: "Como funciona o teste grátis de 15 dias?",
    answer:
      "Você cria sua conta e usa o app completo por 15 dias sem pagar nada. Só pedimos pagamento se você decidir continuar.",
  },
  {
    question: "Preciso conectar minha conta bancária automaticamente?",
    answer:
      "Não. Você cadastra suas transações manualmente ou importa o extrato do seu banco via arquivo OFX. O MeuGasto não acessa sua conta bancária diretamente.",
  },
  {
    question: "Como cancelo?",
    answer: "A qualquer momento, direto nas configurações da sua conta, sem precisar ligar ou mandar e-mail.",
  },
  {
    question: "Meus dados financeiros estão seguros?",
    answer:
      "Toda comunicação é criptografada (HTTPS) e o login biométrico não expõe sua senha na rede. Veja mais na seção de Segurança acima.",
  },
  {
    question: "Qual a diferença entre o plano Básico e o Empresarial?",
    answer:
      "O Básico dá acesso completo ao MeuGasto para uso pessoal, com assinatura direta pelo app. O Empresarial é uma versão personalizada para o seu negócio, com manutenções corretivas prioritárias e atualizações dedicadas. O valor final e o escopo são definidos em conversa com nosso time.",
  },
  {
    question: "Posso trocar entre mensal e anual depois de assinar?",
    answer:
      "Sim. No plano Básico, você troca entre mensal e anual quando quiser, direto nas configurações da conta, e a mudança vale a partir do próximo ciclo de cobrança. No Empresarial, qualquer ajuste é combinado direto com nosso time.",
  },
  {
    question: "O teste grátis de 15 dias vale para qual plano?",
    answer:
      "Só para o plano Básico. O Empresarial funciona por consulta comercial, fale com a gente pra montar a melhor proposta pro seu negócio.",
  },
];

// Helpers de animação (sem dependência externa)

function useInView<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, inView };
}

function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={cn(
        "transition-all duration-700 ease-out",
        inView ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
        className,
      )}
      style={{ transitionDelay: inView ? `${delay}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}

// Seções

const navLinks = [
  { id: "funcionalidades", label: "Funcionalidades" },
  { id: "seguranca", label: "Segurança" },
  { id: "precos", label: "Preço" },
  { id: "contato", label: "Contato" },
];

function Nav() {
  const handleNavClick = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="sticky top-4 z-50 flex w-full justify-center px-4 sm:top-6 sm:px-6">
      <header className="flex w-full max-w-4xl items-center justify-between rounded-full border border-border-default bg-bg-card px-5 py-3 shadow-lg shadow-black/30 sm:px-6">
        <div className="flex shrink-0 items-center gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-icon bg-accent-lime/10">
            <Coins className="h-5 w-5 text-accent-lime" />
          </span>
          <span className="font-sans text-lg font-bold tracking-tight text-text-primary">MeuGasto</span>
        </div>

        <div className="flex items-center gap-8">
          <nav className="hidden items-center gap-6 md:flex">
            {navLinks.map(({ id, label }) => (
              <a
                key={id}
                href={`#${id}`}
                onClick={(event) => handleNavClick(event, id)}
                className="cursor-pointer text-sm font-medium text-text-secondary transition-colors duration-200 hover:text-text-primary"
              >
                {label}
              </a>
            ))}
          </nav>

          <Link
            to="/login"
            className="shrink-0 cursor-pointer rounded-full bg-accent-lime px-4 py-2 text-sm font-bold text-black transition-colors duration-200 hover:brightness-110"
          >
            Entrar
          </Link>
        </div>
      </header>
    </div>
  );
}

function Hero() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const base = "transition-all duration-700 ease-out";
  const state = mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0";

  return (
    <section className="relative mx-auto flex w-full max-w-4xl flex-col items-center px-4 py-16 text-center sm:px-6 sm:py-24">
      <h1
        className={cn(base, state, "font-sans text-4xl font-extrabold leading-tight tracking-tight text-text-primary sm:text-5xl")}
      >
        Suas finanças organizadas <br className="hidden sm:block" /> sem depender de banco nenhum!
      </h1>
      <p
        className={cn(base, state, "mt-5 max-w-2xl text-lg text-text-secondary")}
        style={{ transitionDelay: mounted ? "150ms" : "0ms" }}
      >
        Controle gastos, contas a pagar e carteiras num só lugar. <br className="hidden sm:block" /> Comece grátis por 15 dias e aproveite.
      </p>
      <div
        className={cn(base, state, "mt-8 flex flex-col items-center gap-3 sm:flex-row")}
        style={{ transitionDelay: mounted ? "300ms" : "0ms" }}
      >
        <Link
          to="/register"
          className="flex cursor-pointer items-center gap-2 rounded-xl bg-accent-lime px-6 py-3 text-sm font-bold text-black transition-colors duration-200 hover:brightness-110"
        >
          Começar teste grátis
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          to="/login"
          className="cursor-pointer rounded-xl border border-border-default px-6 py-3 text-sm font-medium text-text-primary transition-colors duration-200 hover:bg-bg-overlay"
        >
          Já tenho conta
        </Link>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="funcionalidades" className="mx-auto w-full max-w-6xl scroll-mt-28 px-4 py-16 sm:px-6">
      <h2 className="text-center font-sans text-3xl font-bold text-text-primary">
        Tudo que você precisa pra organizar sua vida financeira
      </h2>
      <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(({ icon: Icon, title, description }, index) => (
          <Reveal key={title} delay={index * 80}>
            <div className="h-full rounded-card bg-bg-card p-6 ring-1 ring-border-default transition-colors duration-300 hover:ring-accent-lime/40">
              <Icon className="h-6 w-6 text-accent-lime" />
              <h3 className="mt-4 font-sans text-lg font-bold text-text-primary">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">{description}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function SecuritySection() {
  return (
    <section id="seguranca" className="scroll-mt-28 bg-bg-card py-16">
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
        <div className="mb-10 flex flex-col items-center text-center">
          <ShieldCheck className="mb-3 h-6 w-6 text-accent-lime" />
          <h2 className="font-sans text-3xl font-bold text-text-primary">
            Seus dados financeiros, tratados com o cuidado que merecem
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {securityPoints.map(({ icon: Icon, text }, index) => (
            <Reveal key={text} delay={index * 80}>
              <div className="flex h-full items-start gap-3 rounded-card bg-bg-muted p-5 transition-colors duration-300 hover:bg-bg-overlay">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-accent-lime" />
                <p className="min-w-0 text-sm leading-relaxed text-text-secondary">{text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

type BillingCycle = "monthly" | "annual";

// Crossfade: quando `value` muda, primeiro esconde o conteúdo antigo (fade-out) e só troca
// o valor exibido depois que a transição de saída terminou. Evita a troca seca de texto.
function useCrossfade<T>(value: T, duration = 200) {
  const [displayValue, setDisplayValue] = useState(value);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (value === displayValue) return;
    setVisible(false);
    const timeout = setTimeout(() => {
      setDisplayValue(value);
      setVisible(true);
    }, duration);
    return () => clearTimeout(timeout);
  }, [value, displayValue, duration]);

  return { displayValue, visible };
}

function PricingCard({
  highlight,
  delay,
  badge,
  priceNode,
  disclaimer,
  features,
  cta,
}: {
  highlight: boolean;
  delay: number;
  badge: string;
  priceNode: ReactNode;
  disclaimer: string;
  features: string[];
  cta: ReactNode;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={cn(
        "h-full transition-all duration-700 ease-out",
        inView ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
      )}
      style={{ transitionDelay: inView ? `${delay}ms` : "0ms" }}
    >
      <div
        className={cn(
          "flex h-full flex-col rounded-card bg-bg-card p-6 ring-1 transition-colors duration-300 sm:p-8",
          highlight ? "ring-accent-lime/40 hover:ring-accent-lime/60" : "ring-border-default hover:ring-accent-lime/30",
        )}
      >
        <p className={cn("text-sm font-semibold uppercase tracking-widest", highlight ? "text-accent-lime" : "text-text-secondary")}>
          {badge}
        </p>

        {priceNode}

        <p className="mt-3 text-sm text-text-secondary">{disclaimer}</p>

        <ul className="mt-6 space-y-3 text-left">
          {features.map((feature, index) => (
            <li
              key={feature}
              className={cn(
                "flex items-start gap-2 text-sm text-text-secondary transition-all duration-500 ease-out",
                inView ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0",
              )}
              style={{ transitionDelay: inView ? `${250 + index * 70}ms` : "0ms" }}
            >
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-lime" />
              <span className="min-w-0">{feature}</span>
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-6">{cta}</div>
      </div>
    </div>
  );
}

function BusinessContactCta() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-border-default px-6 py-3 text-sm font-bold text-text-primary transition-all duration-200 hover:border-accent-lime hover:text-accent-lime"
      >
        Falar com vendas
        <ArrowRight className="h-4 w-4" />
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
            aria-hidden="true"
            tabIndex={-1}
          />
          <div className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-xl border border-border-default bg-bg-card text-left shadow-xl">
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Interesse no plano Empresarial")}`}
              className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-text-primary transition-colors duration-200 hover:bg-bg-overlay hover:text-accent-lime"
            >
              <Mail className="h-4 w-4" />
              Por e-mail
            </a>
            <a
              href={`https://wa.me/${SALES_WHATSAPP_NUMBER}?text=${encodeURIComponent(SALES_WHATSAPP_MESSAGE)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 border-t border-border-default px-4 py-3 text-sm font-medium text-text-primary transition-colors duration-200 hover:bg-bg-overlay hover:text-accent-lime"
            >
              <MessageCircle className="h-4 w-4" />
              Pelo WhatsApp
            </a>
          </div>
        </>
      )}
    </div>
  );
}

function Pricing() {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const isAnnual = cycle === "annual";
  const { displayValue: displayCycle, visible: priceVisible } = useCrossfade(cycle);
  const displayIsAnnual = displayCycle === "annual";

  const fadeClass = cn(
    "transition-all duration-200 ease-out",
    priceVisible ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0",
  );

  return (
    <section id="precos" className="mx-auto w-full max-w-4xl scroll-mt-28 px-4 py-16 text-center sm:px-6">
      <h2 className="font-sans text-3xl font-bold text-text-primary">Escolha o plano ideal pra você</h2>

      <Reveal delay={0} className="mt-8 flex justify-center">
        <div className="relative inline-flex rounded-full bg-bg-card p-1 ring-1 ring-border-default">
          <div
            className={cn(
              "absolute inset-y-1 left-1 w-24 rounded-full bg-accent-lime transition-transform duration-300 ease-out",
              isAnnual && "translate-x-24",
            )}
          />
          <button
            type="button"
            onClick={() => setCycle("monthly")}
            className={cn(
              "relative z-10 w-24 cursor-pointer rounded-full py-2 text-sm font-semibold transition-colors duration-300",
              !isAnnual ? "text-black" : "text-text-secondary hover:text-text-primary",
            )}
          >
            Mensal
          </button>
          <button
            type="button"
            onClick={() => setCycle("annual")}
            className={cn(
              "relative z-10 w-24 cursor-pointer rounded-full py-2 text-sm font-semibold transition-colors duration-300",
              isAnnual ? "text-black" : "text-text-secondary hover:text-text-primary",
            )}
          >
            Anual
          </button>
        </div>
      </Reveal>

      <div className="mt-10 grid grid-cols-1 gap-6 text-left md:grid-cols-2">
        <PricingCard
          highlight
          delay={0}
          badge="Básico"
          priceNode={
            <div className={fadeClass}>
              <p className="mt-3 font-sans text-4xl font-extrabold text-text-primary">
                {displayIsAnnual ? "R$299,90" : "R$29,90"}
                <span className="text-lg font-medium text-text-secondary">{displayIsAnnual ? "/ano" : "/mês"}</span>
              </p>
              <p className="mt-2 text-sm text-accent-lime">
                {displayIsAnnual
                  ? "Equivale a R$24,99/mês, economize ~2 meses (16%)"
                  : "ou R$299,90/ano, economize ~2 meses (16%)"}
              </p>
            </div>
          }
          disclaimer="15 dias grátis, sem cartão de crédito. Cancele quando quiser."
          features={basicFeatures}
          cta={
            <Link
              to="/register"
              className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent-lime px-6 py-3 text-sm font-bold text-black transition-colors duration-200 hover:brightness-110"
            >
              Começar teste grátis
              <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />

        <PricingCard
          highlight={false}
          delay={100}
          badge="Empresarial"
          priceNode={
            <div className={fadeClass}>
              <p className="mt-3 font-sans text-4xl font-extrabold text-text-primary">
                {displayIsAnnual ? "A partir de R$599,90" : "A partir de R$49,90"}
                <span className="text-lg font-medium text-text-secondary">{displayIsAnnual ? "/ano" : "/mês"}</span>
              </p>
            </div>
          }
          disclaimer="Valor sob consulta, de acordo com a necessidade do seu negócio."
          features={businessFeatures}
          cta={<BusinessContactCta />}
        />
      </div>
    </section>
  );
}

function FAQItem({
  question,
  answer,
  isOpen,
  onToggle,
}: {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-card bg-bg-card p-5 ring-1 ring-border-default transition-colors duration-300 hover:ring-accent-lime/30">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full cursor-pointer items-center justify-between text-left font-sans text-base font-semibold text-text-primary"
      >
        <span className="min-w-0">{question}</span>
        <span
          className={cn(
            "ml-4 shrink-0 text-text-secondary transition-transform duration-300",
            isOpen && "rotate-45",
          )}
        >
          +
        </span>
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-in-out",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <p className="pt-3 text-sm leading-relaxed text-text-secondary">{answer}</p>
        </div>
      </div>
    </div>
  );
}

function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
      <h2 className="text-center font-sans text-3xl font-bold text-text-primary">Perguntas frequentes</h2>
      <div className="mt-10 space-y-3">
        {faqs.map((faq, index) => (
          <Reveal key={faq.question} delay={index * 60}>
            <FAQItem
              question={faq.question}
              answer={faq.answer}
              isOpen={openIndex === index}
              onToggle={() => setOpenIndex((current) => (current === index ? null : index))}
            />
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function ContactSection() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard indisponível (ex: contexto não seguro), link mailto continua funcionando.
    }
  };

  return (
    <section id="contato" className="mx-auto w-full max-w-3xl scroll-mt-28 px-4 py-16 text-center sm:px-6">
      <Reveal delay={0}>
        <div className="rounded-card bg-bg-card p-8 ring-1 ring-border-default transition-shadow duration-300 hover:shadow-lg hover:shadow-accent-lime/10 sm:p-10">
          <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-icon bg-accent-lime/10">
            <Mail className="h-6 w-6 text-accent-lime" />
          </span>
          <h2 className="font-sans text-2xl font-bold text-text-primary sm:text-3xl">Fale conosco</h2>
          <p className="mt-2 text-sm text-text-secondary">Tem dúvidas ou quer saber mais? Fale com a gente.</p>

          <div className="mt-6 flex w-full flex-col items-center justify-center gap-3">
            <div className="group flex flex-col items-center gap-2 sm:relative sm:flex-row sm:justify-center sm:gap-0">
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="cursor-pointer break-all text-base font-semibold text-accent-lime underline-offset-4 transition-colors duration-200 hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
              <button
                type="button"
                onClick={handleCopy}
                aria-label={copied ? "Email copiado" : "Copiar email"}
                title={copied ? "Copiado!" : "Copiar email"}
                className={cn(
                  "flex cursor-pointer items-center justify-center rounded-xl border p-2 transition-all duration-200",
                  "sm:absolute sm:left-full sm:top-1/2 sm:ml-2 sm:-translate-y-1/2 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100",
                  copied && "sm:opacity-100",
                  copied
                    ? "border-accent-lime/40 bg-accent-lime/10 text-accent-lime"
                    : "border-border-default text-text-secondary hover:bg-bg-overlay hover:text-text-primary",
                )}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="mt-4 flex w-full items-center justify-center gap-2 text-sm text-text-secondary">
            <span className="h-px w-8 bg-border-default" aria-hidden="true" />
            ou
            <span className="h-px w-8 bg-border-default" aria-hidden="true" />
          </div>

          <div className="mt-4 flex w-full items-center justify-center">
            <a
              href={`https://wa.me/${SALES_WHATSAPP_NUMBER}?text=${encodeURIComponent(CONTACT_WHATSAPP_MESSAGE)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="relative inline-block cursor-pointer text-base font-semibold text-accent-lime underline-offset-4 transition-colors duration-200 hover:underline"
            >
              <MessageCircle className="absolute right-full top-1/2 mr-2 h-4 w-4 -translate-y-1/2" />
              {CONTACT_WHATSAPP_DISPLAY}
            </a>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-20 text-center sm:px-6">
      <h2 className="font-sans text-3xl font-bold text-text-primary sm:text-4xl">
        Pare de perder o controle das suas finanças
      </h2>
      <Link
        to="/register"
        className="mt-8 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-accent-lime px-8 py-4 text-base font-bold text-black transition-colors duration-200 hover:brightness-110"
      >
        Começar teste grátis
        <ArrowRight className="h-4 w-4" />
      </Link>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border-default py-8 text-center text-xs text-text-secondary">
      © {new Date().getFullYear()} MeuGasto. Desenvolvido por <a href="https://github.com/Felipe-Souzza/" className="text-accent-lime underline hover:no-underline">uDawgs</a>.
    </footer>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-bg-base">
      <Nav />
      <Hero />
      <Features />
      <SecuritySection />
      <Pricing />
      <FAQSection />
      <ContactSection />
      <FinalCTA />
      <Footer />
    </div>
  );
}
