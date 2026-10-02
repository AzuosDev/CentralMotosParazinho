import { A, LI, P, PublicPageLayout, Secao, SubSecao, UL } from "../../components/landing/PublicPageLayout";
import { publicPage } from "../../content/public-pages";

const page = publicPage("controle-de-cartao");

export function ControleDeCartaoPage() {
  return (
    <PublicPageLayout
      page={page}
      lead="O cartão de crédito é a parte das finanças que mais confunde, porque o gasto e o pagamento acontecem em meses diferentes. No MeuGasto o cartão tem fatura por ciclo, parcelamento que se espalha pelos meses e uma dívida que nunca é somada ao seu saldo."
    >
      <Secao id="cadastro" titulo="Como o cartão é cadastrado">
        <P>
          Um cartão entra com limite, dia de fechamento e dia de vencimento. São esses dois dias que definem em qual
          fatura cada compra vai cair: comprar depois do fechamento joga a despesa para o ciclo seguinte, exatamente
          como o banco faz.
        </P>
        <P>
          O cartão fica numa lista separada das suas contas. Ele aparece com a dívida do ciclo e o limite usado — e
          não entra na soma do seu saldo, porque compra parcelada no crédito não é dinheiro que saiu da conta.
        </P>
      </Secao>

      <Secao id="fatura" titulo="A fatura de cada mês">
        <P>
          A fatura é criada na primeira compra do ciclo e vai acumulando as seguintes. Nela você vê o total devido, o
          quanto já foi pago, a data de fechamento e a de vencimento, e a lista de compras que a compõem.
        </P>
        <P>
          Enquanto o ciclo não fecha, a fatura está aberta e continua recebendo compras. Depois do fechamento, ela
          passa a fechada e espera o pagamento. A fatura também aparece como uma conta a pagar na sua lista de
          vencimentos, para que ela não fique fora do radar — veja{" "}
          <A to="/controle-de-contas">controle de contas a pagar</A>.
        </P>
      </Secao>

      <Secao id="parcelas" titulo="Parcelamentos">
        <P>
          Uma compra parcelada é cadastrada uma vez, com o total de parcelas, e o app distribui cada parcela na fatura
          do mês correspondente. Você não precisa lançar "3/10" à mão todo mês, e consegue ver hoje o peso que esse
          parcelamento vai ter nos próximos meses.
        </P>
        <P>
          Se o parcelamento foi cadastrado por engano, ele pode ser excluído enquanto nenhuma das faturas envolvidas
          tiver recebido pagamento — se alguma já recebeu, é só desfazer esse pagamento primeiro. As parcelas somem
          dos meses que ocupavam, e uma fatura que fique sem nenhuma movimentação deixa de existir em vez de ficar lá
          zerada.
        </P>
      </Secao>

      <Secao id="pagamento" titulo="Pagando a fatura">
        <P>
          No pagamento você escolhe de qual carteira o dinheiro sai, e o valor é transferido dessa carteira para a
          fatura — então o seu saldo cai nesse momento, que é quando o dinheiro realmente sai.
        </P>

        <SubSecao titulo="Pagamento parcial e rotativo">
          <P>
            Dá para pagar menos que o total. A fatura fica marcada como parcialmente paga, com o quanto falta, e o
            restante é levado para a fatura seguinte como saldo anterior, com os juros que você informar. É o rotativo
            registrado como ele é, em vez de uma dívida que desaparece da tela.
          </P>
        </SubSecao>

        <SubSecao titulo="Desfazer um pagamento">
          <P>
            Pagamento lançado errado pode ser desfeito. A transferência é removida, o saldo da carteira volta ao que
            era, a fatura volta a dever o valor e a conta a pagar correspondente deixa de estar quitada.
          </P>
        </SubSecao>
      </Secao>

      <Secao id="estorno" titulo="Estorno de uma compra">
        <P>
          Compra cancelada ou devolvida pelo lojista entra como estorno, vinculado à compra original. O valor é
          descontado do total da fatura, e a mesma compra não pode ser estornada duas vezes — o app recusa a segunda
          tentativa, para não descontar o valor de novo.
        </P>
      </Secao>

      <Secao id="divida-e-saldo" titulo="Dívida do cartão e saldo disponível">
        <P>
          É a distinção que organiza o resto. No MeuGasto:
        </P>
        <UL>
          <LI>
            <strong className="font-semibold text-white">saldo</strong> é a soma das suas carteiras — dinheiro que está
            lá agora;
          </LI>
          <LI>
            <strong className="font-semibold text-white">dívida do cartão</strong> é o total das faturas em aberto —
            dinheiro que vai sair;
          </LI>
          <LI>pagar a fatura é o momento em que um vira o outro, e aí sim o saldo muda.</LI>
        </UL>
        <P>
          Para a pergunta "no que eu gastei", porém, a compra no cartão conta normalmente e aparece nos totais por
          categoria, como se explica em <A to="/controle-de-gastos">controle de gastos</A>.
        </P>
      </Secao>

      <Secao id="assinaturas" titulo="O que é cobrado no cartão todo mês">
        <P>
          Assinaturas e mensalidades cobradas no cartão podem ser cadastradas como contas recorrentes vinculadas a
          ele. Quando a data de cobrança chega, a despesa entra sozinha na fatura do ciclo certo, sem você lançar nada
          — e a conta aparece apontando para o cartão, não como um pagamento separado a fazer.
        </P>
        <P>
          O cartão é uma das peças do <A to="/controle-financeiro-pessoal">controle financeiro pessoal</A> — e
          geralmente a que mais pesa.
        </P>
      </Secao>
    </PublicPageLayout>
  );
}
