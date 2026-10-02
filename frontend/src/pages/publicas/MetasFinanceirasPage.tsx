import { A, LI, P, PublicPageLayout, Secao, UL } from "../../components/landing/PublicPageLayout";
import { publicPage } from "../../content/public-pages";

const page = publicPage("metas-financeiras");

export function MetasFinanceirasPage() {
  return (
    <PublicPageLayout
      page={page}
      lead="Uma meta financeira é um número com nome. Sem isso, guardar dinheiro é um esforço sem fim visível; com isso, cada valor guardado vira progresso que você consegue ver."
    >
      <Secao id="criar" titulo="Criando uma meta">
        <P>
          Uma meta tem nome, valor-alvo e, se você quiser, prazo. "Viagem, R$ 5.000, até dezembro" é uma meta; "juntar
          dinheiro" não é. O prazo é opcional de propósito: há objetivos que têm data e há objetivos que só precisam
          acontecer.
        </P>
        <P>
          Você pode registrar quanto já tem guardado para ela desde o começo, em vez de começar sempre do zero — se a
          meta já estava em andamento antes de você usar o app, ela entra no ponto em que está.
        </P>
      </Secao>

      <Secao id="progresso" titulo="Acompanhando o progresso">
        <P>
          Cada meta mostra o quanto já foi juntado, o quanto falta e o percentual atingido. Ao chegar no valor-alvo,
          ela é marcada como concluída sozinha. Há também uma visão do progresso geral, somando todas as suas metas —
          útil quando você tem três ou quatro ao mesmo tempo e quer saber se, no conjunto, está andando.
        </P>
      </Secao>

      <Secao id="categoria" titulo="A categoria vinculada">
        <P>
          Este é o detalhe que faz a meta não virar mais uma coisa para atualizar à mão. Ao vincular uma categoria à
          meta, todo lançamento feito naquela categoria soma no progresso automaticamente.
        </P>
        <P>
          Uma categoria "Viagem" vinculada à meta "Viagem" significa que a passagem que você lançou hoje já aparece no
          progresso — inclusive quando a compra foi no cartão de crédito, porque para a meta o que importa é que o
          compromisso foi assumido.
        </P>
        <P>
          Sem a categoria vinculada, a meta continua funcionando: você atualiza o valor guardado quando quiser. Com
          ela, o acompanhamento acontece como efeito do que você já estava registrando em{" "}
          <A to="/controle-de-gastos">controle de gastos</A>.
        </P>
      </Secao>

      <Secao id="organizacao" titulo="Por que metas ajudam na organização">
        <P>
          Uma meta não guarda dinheiro por você — ela muda a pergunta que você se faz. O efeito prático é esse:
        </P>
        <UL>
          <LI>o objetivo para de competir com gastos do dia a dia de memória e passa a ter um número ao lado;</LI>
          <LI>o progresso visível sustenta o hábito melhor do que a intenção;</LI>
          <LI>o prazo transforma "um dia" em quanto por mês;</LI>
          <LI>várias metas lado a lado mostram quando você está tentando fazer demais ao mesmo tempo.</LI>
        </UL>
        <P>
          Para decidir quanto cabe guardar em cada mês, vale olhar antes o que já está comprometido — é a conversa
          entre meta e vencimento que torna o plano realista, como se vê no{" "}
          <A to="/controle-financeiro-pessoal">controle financeiro pessoal</A>.
        </P>
      </Secao>
    </PublicPageLayout>
  );
}
