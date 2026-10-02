import { A, AExterno, LI, P, PublicPageLayout, Secao, UL } from "../../components/landing/PublicPageLayout";
import { publicPage } from "../../content/public-pages";
import { AZUOS_URL } from "../../components/landing/chrome";

const page = publicPage("sobre-o-meugasto");

export function SobreOMeuGastoPage() {
  return (
    <PublicPageLayout
      page={page}
      lead="O MeuGasto é um aplicativo de controle financeiro pessoal desenvolvido pela Azuos Dev para ajudar pessoas a organizar gastos, contas, cartões, parcelas e metas em um só lugar."
    >
      <Secao id="o-que-e" titulo="O que é o MeuGasto">
        <P>
          É um aplicativo web de finanças pessoais, usado pelo navegador no computador ou no celular — e instalável na
          tela inicial, como um app. Dentro dele você mantém suas carteiras e saldos, seus lançamentos de entrada e
          saída, seus cartões de crédito com fatura e parcelamento, suas contas a pagar e a receber com vencimento, e
          suas metas financeiras.
        </P>
        <P>
          Os lançamentos chegam de duas formas: digitados por você ou{" "}
          <A to="/importar-extrato-ofx">importados do extrato em OFX</A> do seu banco. O MeuGasto não se conecta à sua
          conta bancária.
        </P>
      </Secao>

      <Secao id="problema" titulo="Qual problema ele resolve">
        <P>
          O problema não é falta de informação — é informação espalhada. O saldo está no app do banco, a fatura no app
          do cartão, o vencimento do aluguel na memória e o quanto você já juntou para a viagem em nenhum lugar. Cada
          vez que você quer saber como está, precisa juntar tudo de novo de cabeça.
        </P>
        <P>
          O MeuGasto existe para que essa conta esteja sempre feita: um saldo que é a soma real das suas contas, uma
          fatura que mostra o que vence em cada mês antes do mês chegar, uma lista do que está vencendo e um progresso
          de meta que anda junto com os seus lançamentos.
        </P>
        <P>
          Há uma decisão de projeto no centro disso: dívida de cartão nunca é somada ao saldo. Compra no crédito é
          dinheiro que vai sair, não dinheiro que você tem — e misturar as duas coisas é o que faz o saldo parecer
          maior do que é.
        </P>
      </Secao>

      <Secao id="para-quem" titulo="Para quem ele foi feito">
        <P>
          Para quem cuida das próprias finanças e quer enxergá-las por inteiro, sem virar operador de planilha. Ele é
          especialmente útil para quem:
        </P>
        <UL>
          <LI>tem dinheiro em mais de um lugar — conta, dinheiro em espécie, poupança;</LI>
          <LI>usa cartão de crédito com frequência e parcela compras;</LI>
          <LI>tem contas fixas e vencimentos espalhados pelo mês;</LI>
          <LI>prefere não dar a nenhum aplicativo acesso à conta do banco.</LI>
        </UL>
        <P>
          Há também uma versão Empresarial, personalizada para negócios, combinada direto com a equipe — as condições
          estão na <A to="/">página inicial</A>.
        </P>
      </Secao>

      <Secao id="recursos" titulo="O que tem dentro">
        <UL>
          <LI>
            <A to="/controle-financeiro-pessoal">Controle financeiro pessoal</A> — carteiras, saldo consolidado,
            transferências e o painel do mês.
          </LI>
          <LI>
            <A to="/controle-de-gastos">Controle de gastos</A> — lançamentos por categoria, totais do mês e evolução
            ao longo dos meses.
          </LI>
          <LI>
            <A to="/controle-de-cartao">Cartão, faturas e parcelas</A> — fatura por ciclo, parcelamento, pagamento
            parcial, rotativo e estorno.
          </LI>
          <LI>
            <A to="/controle-de-contas">Contas a pagar e a receber</A> — vencimentos, recorrências, parcelas e avisos
            do que vence.
          </LI>
          <LI>
            <A to="/metas-financeiras">Metas financeiras</A> — valor-alvo, prazo, progresso e categoria vinculada.
          </LI>
          <LI>
            <A to="/importar-extrato-ofx">Importação de extrato OFX</A> — com sugestão de categoria e sem duplicar o
            que já estava lançado.
          </LI>
          <LI>Entrada por biometria, usando o sensor do próprio aparelho em vez da senha digitada.</LI>
        </UL>
      </Secao>

      <Secao id="azuos" titulo="Quem desenvolve: Azuos Dev">
        <P>
          O MeuGasto é um produto próprio da <AExterno href={AZUOS_URL}>Azuos Dev</AExterno>, a desenvolvedora
          responsável pelo projeto: é ela quem constrói, mantém e dá suporte ao aplicativo. A relação é direta — a
          Azuos Dev é a desenvolvedora, e o MeuGasto é o aplicativo de controle financeiro pessoal que ela desenvolve.
        </P>
        <P>
          Os canais de contato e de suporte, assim como os planos e o teste grátis, ficam na{" "}
          <A to="/">página inicial do MeuGasto</A>.
        </P>
      </Secao>
    </PublicPageLayout>
  );
}
