import { A, LI, P, PublicPageLayout, Secao, SubSecao, UL } from "../../components/landing/PublicPageLayout";
import { publicPage } from "../../content/public-pages";

const page = publicPage("controle-de-contas");

export function ControleDeContasPage() {
  return (
    <PublicPageLayout
      page={page}
      lead="Quase nenhuma conta é esquecida por falta de dinheiro: ela é esquecida porque o vencimento estava só na memória. No MeuGasto cada compromisso tem data, e o app avisa quando a data chega."
    >
      <Secao id="conta" titulo="O que é uma conta aqui">
        <P>
          Uma conta é um compromisso com data de vencimento: aluguel, internet, escola, parcela de um empréstimo. Ela
          guarda título, valor, vencimento, categoria e a forma de pagamento prevista. Enquanto não é quitada, fica na
          lista do que está por vir.
        </P>
        <P>
          Conta não é a mesma coisa que gasto. O gasto é o dinheiro que já saiu; a conta é o dinheiro que vai sair. É
          por isso que ela tem uma lista própria, e não se mistura com o seu{" "}
          <A to="/controle-de-gastos">histórico de gastos</A> antes da hora.
        </P>
      </Secao>

      <Secao id="pagar" titulo="Quitando uma conta">
        <P>
          Ao marcar a conta como paga, você escolhe de qual carteira o dinheiro saiu, e o lançamento correspondente é
          criado — o saldo daquela carteira cai e a despesa passa a contar nos totais do mês.
        </P>
        <P>
          Existe também o caso da conta que você quer apenas registrar, sem mexer em saldo nenhum: uma despesa antiga
          que já foi contabilizada por fora, por exemplo. Nesse caso ela é quitada sem gerar movimentação financeira.
        </P>
        <P>
          Se a carteira escolhida for um cartão de crédito, a conta vira uma compra na fatura do ciclo certo, em vez de
          um pagamento solto que nunca apareceria no cartão. Veja{" "}
          <A to="/controle-de-cartao">controle de cartão e parcelas</A>.
        </P>
      </Secao>

      <Secao id="recorrencia" titulo="Contas que repetem">
        <P>
          Contas fixas são cadastradas uma vez como recorrentes, com a periodicidade — diária, semanal, mensal ou anual
          — e, se fizer sentido, uma data para parar. A cada ciclo a ocorrência do período aparece para ser paga, sem
          novo cadastro.
        </P>
        <P>
          Quando um mês não tem aquela cobrança, ele pode ser pulado sem desfazer a recorrência: o molde continua
          valendo para os meses seguintes.
        </P>
        <SubSecao titulo="Assinaturas cobradas no cartão">
          <P>
            Uma conta recorrente pode ser vinculada a um cartão. Aí a cobrança de cada mês entra sozinha na fatura
            quando a data chega, e a conta aparece apontando para o cartão — porque não há nada a pagar
            separadamente.
          </P>
        </SubSecao>
      </Secao>

      <Secao id="parcelada" titulo="Contas parceladas">
        <P>
          Uma conta pode ser parcelada: você informa o total de parcelas, o valor de cada uma e quando a primeira
          vence. O app controla quantas já foram pagas e quais faltam, mantendo cada parcela no seu próprio mês.
        </P>
      </Secao>

      <Secao id="receber" titulo="Contas a receber">
        <P>
          O mesmo cadastro atende o outro lado. Uma conta pode ser do tipo a receber — o pagamento de um freela, um
          reembolso, um aluguel que entra — com vencimento e recorrência iguais aos de uma conta a pagar. Ao receber,
          o valor entra na carteira que você escolher.
        </P>
      </Secao>

      <Secao id="avisos" titulo="Os avisos de vencimento">
        <P>
          Uma vez por dia o MeuGasto olha suas contas e gera aviso para:
        </P>
        <UL>
          <LI>o que vence hoje;</LI>
          <LI>o que já passou do prazo e continua em aberto.</LI>
        </UL>
        <P>
          Os avisos ficam no sino de notificações dentro do app, e a verificação roda também quando você entra — para
          que o aviso não dependa de você ter aberto o app no dia exato.
        </P>
      </Secao>

      <Secao id="contexto" titulo="Vencimentos e o resto do planejamento">
        <P>
          Saber o que vence muda o que você pode guardar. É olhando a lista do mês que dá para decidir quanto sobra
          para uma <A to="/metas-financeiras">meta financeira</A> sem comprometer uma conta — e é por isso que as duas
          coisas vivem no mesmo lugar, dentro do{" "}
          <A to="/controle-financeiro-pessoal">controle financeiro pessoal</A>.
        </P>
      </Secao>
    </PublicPageLayout>
  );
}
