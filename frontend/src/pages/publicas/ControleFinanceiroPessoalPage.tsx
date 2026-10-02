import { A, LI, P, PublicPageLayout, Secao, SubSecao, UL } from "../../components/landing/PublicPageLayout";
import { publicPage } from "../../content/public-pages";

const page = publicPage("controle-financeiro-pessoal");

export function ControleFinanceiroPessoalPage() {
  return (
    <PublicPageLayout
      page={page}
      lead="O MeuGasto é um aplicativo de controle financeiro pessoal. Ele junta num só lugar o que você tem nas contas, o que já comprou no cartão, o que vence nos próximos dias e o quanto falta para cada meta."
    >
      <Secao id="o-que-e" titulo="O que é controle financeiro pessoal">
        <P>
          Controle financeiro pessoal é saber três coisas a qualquer momento: quanto você tem agora, quanto já está
          comprometido com compromissos que ainda não venceram e para onde seu dinheiro tem ido. Não é fazer planilha
          bonita nem cortar tudo — é parar de descobrir o problema quando a conta já chegou.
        </P>
        <P>
          A dificuldade quase nunca é falta de disciplina: é que a informação está espalhada. O saldo está no app do
          banco, a fatura está no app do cartão, o aluguel está na memória e o quanto você já juntou para a viagem
          está em nenhum lugar. Juntar isso de novo, todo mês, é o trabalho que cansa.
        </P>
      </Secao>

      <Secao id="como-ajuda" titulo="Como o MeuGasto ajuda">
        <P>
          O MeuGasto reúne essas partes em um só cadastro, com os números se conversando. Você lança as movimentações
          (ou <A to="/importar-extrato-ofx">importa o extrato em OFX</A>) e o app mantém o resto em dia.
        </P>

        <SubSecao titulo="Quanto você tem, agora">
          <P>
            Suas contas entram como carteiras: conta corrente, dinheiro na mão, poupança, quantas você precisar. Cada
            lançamento mexe no saldo da carteira certa, e o topo do painel mostra a soma de todas — é esse número que
            responde "quanto eu tenho hoje". Transferências entre carteiras também ficam registradas, saindo de uma e
            entrando na outra.
          </P>
          <P>
            Compra no cartão de crédito fica de fora dessa soma de propósito: ela é dívida a vencer, não dinheiro que
            já saiu da conta. Misturar as duas coisas é o que faz o saldo parecer maior do que é.
          </P>
        </SubSecao>

        <SubSecao titulo="Gastos, por categoria e por mês">
          <P>
            Cada despesa tem categoria, e o painel mostra quanto foi para cada uma no mês escolhido, além da evolução
            do seu saldo ao longo dos meses. É assim que o padrão aparece sem você montar gráfico nenhum. Mais sobre
            isso em <A to="/controle-de-gastos">controle de gastos</A>.
          </P>
        </SubSecao>

        <SubSecao titulo="Cartão, fatura e parcelas">
          <P>
            Cada compra no cartão cai na fatura do ciclo certo, e um parcelamento se distribui pelos meses que ele
            realmente ocupa — você vê o que vence em cada mês antes de o mês chegar. Pagamento parcial e estorno
            também estão lá. Veja <A to="/controle-de-cartao">controle de cartão e parcelas</A>.
          </P>
        </SubSecao>

        <SubSecao titulo="O que vence, e quando">
          <P>
            Contas a pagar e a receber ficam com vencimento, podendo ser recorrentes ou parceladas, e o app avisa o
            que vence hoje e o que já passou do prazo. Veja{" "}
            <A to="/controle-de-contas">controle de contas a pagar</A>.
          </P>
        </SubSecao>

        <SubSecao titulo="Para onde você está indo">
          <P>
            Uma meta guarda quanto você quer juntar, com prazo ou sem, e mostra o progresso. Vinculando uma categoria,
            os lançamentos dela somam na meta sozinhos. Veja <A to="/metas-financeiras">metas financeiras</A>.
          </P>
        </SubSecao>
      </Secao>

      <Secao id="rotina" titulo="A rotina que isso cria">
        <P>
          Na prática, o uso do dia a dia é curto. O que muda é que cada número tem um lugar e nenhum deles precisa ser
          recalculado de cabeça:
        </P>
        <UL>
          <LI>lançar o que entrou e o que saiu, ou importar o extrato do mês de uma vez;</LI>
          <LI>conferir o que vence nos próximos dias antes de gastar;</LI>
          <LI>olhar a fatura do cartão enquanto ela ainda está abrindo, não no dia do vencimento;</LI>
          <LI>no fim do mês, ver por categoria onde o dinheiro foi — e decidir a partir disso.</LI>
        </UL>
      </Secao>

      <Secao id="limites" titulo="O que o MeuGasto não faz">
        <P>
          O MeuGasto não se conecta à sua conta bancária. Não há login do banco, não há leitura automática de
          movimentação. Os lançamentos chegam de duas formas: você digita, ou você importa o arquivo OFX que o próprio
          banco disponibiliza. É uma escolha de projeto: menos acesso aos seus dados, em troca de um pouco mais de
          trabalho seu.
        </P>
        <P>
          Ele também não dá recomendação de investimento nem promete render seu dinheiro. O trabalho dele é mostrar a
          sua situação com clareza o bastante para você decidir. Se você quiser conhecer o produto e quem o desenvolve
          antes de testar, leia <A to="/sobre-o-meugasto">sobre o MeuGasto</A>.
        </P>
      </Secao>
    </PublicPageLayout>
  );
}
