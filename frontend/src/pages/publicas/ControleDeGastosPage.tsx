import { A, LI, P, PublicPageLayout, Secao, SubSecao, UL } from "../../components/landing/PublicPageLayout";
import { publicPage } from "../../content/public-pages";

const page = publicPage("controle-de-gastos");

export function ControleDeGastosPage() {
  return (
    <PublicPageLayout
      page={page}
      lead="Controlar gastos não é anotar tudo e nunca olhar de novo. É ter cada despesa num lugar onde ela se soma às outras, por categoria e por mês, para que o total faça sentido no fim."
    >
      <Secao id="lancamento" titulo="Lançando um gasto">
        <P>
          Um gasto no MeuGasto tem valor, data, categoria e a carteira de onde o dinheiro saiu. É esse último campo que
          faz o saldo daquela conta cair na hora — e é por isso que o número do topo do painel continua valendo depois
          do lançamento, sem você recalcular nada.
        </P>
        <P>
          Lançamentos com data futura ficam agendados: aparecem na lista, mas não mexem no saldo até a data chegar.
          Assim você registra o que já sabe que vai sair sem que o saldo de hoje fique errado.
        </P>
        <P>
          O mesmo vale para o que entra. Salário, freela, reembolso — ganhos são lançados do mesmo jeito, na carteira
          que recebeu.
        </P>
      </Secao>

      <Secao id="categorias" titulo="Categorias: onde o padrão aparece">
        <P>
          Cada despesa recebe uma categoria. O app já vem com um conjunto pronto — supermercado, transporte, saúde,
          assinaturas digitais, comida e bebida, entre outras — e você cria as suas quando faz falta.
        </P>
        <P>
          A categoria é o que transforma uma lista de lançamentos em informação. Trinta compras soltas não dizem nada;
          "R$ 1.240 em supermercado e R$ 410 em comida e bebida neste mês" diz bastante.
        </P>
      </Secao>

      <Secao id="acompanhamento" titulo="O acompanhamento de cada mês">
        <P>
          O painel tem um seletor de mês e ano. Escolhido o período, você vê:
        </P>
        <UL>
          <LI>quanto entrou e quanto saiu naquele mês;</LI>
          <LI>o total por categoria, para saber onde o dinheiro foi;</LI>
          <LI>a evolução mensal, para comparar com os meses anteriores;</LI>
          <LI>os lançamentos mais recentes, para conferir o que foi registrado.</LI>
        </UL>
        <P>
          O saldo exibido acima disso é outra coisa, e de propósito: ele é sempre "quanto eu tenho agora", a soma das
          suas carteiras, e não muda quando você troca o mês no seletor. Um é a foto do presente, o outro é o
          movimento do período.
        </P>
      </Secao>

      <Secao id="cartao-e-gasto" titulo="Gasto no cartão conta como gasto">
        <P>
          Uma compra no cartão de crédito aparece normalmente nos gastos por categoria: para a pergunta "no que eu
          gastei", ela conta. O que ela não faz é derrubar o saldo da sua conta, porque o dinheiro só sai quando a
          fatura é paga. Essa separação está explicada em{" "}
          <A to="/controle-de-cartao">controle de cartão e parcelas</A>.
        </P>
      </Secao>

      <Secao id="menos-digitacao" titulo="Menos digitação">
        <SubSecao titulo="Importando o extrato">
          <P>
            Em vez de digitar um mês inteiro, você pode subir o arquivo OFX do banco. O app lê as movimentações,
            sugere categoria para cada uma, marca as que já estavam lançadas e espera sua confirmação. O passo a passo
            está em <A to="/importar-extrato-ofx">importar extrato OFX</A>.
          </P>
        </SubSecao>

        <SubSecao titulo="O que repete todo mês">
          <P>
            Despesas fixas não precisam ser digitadas de novo a cada mês: elas podem ser cadastradas como contas
            recorrentes, com vencimento próprio. Veja <A to="/controle-de-contas">controle de contas a pagar</A>.
          </P>
        </SubSecao>
      </Secao>

      <Secao id="contexto" titulo="Onde isso se encaixa">
        <P>
          Controle de gastos é uma parte do trabalho maior de{" "}
          <A to="/controle-financeiro-pessoal">controle financeiro pessoal</A>: saber o que saiu só ajuda de verdade
          quando você também sabe o que tem, o que vence e para onde quer chegar.
        </P>
      </Secao>
    </PublicPageLayout>
  );
}
