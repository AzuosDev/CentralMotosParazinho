import { A, LI, P, PublicPageLayout, Secao, SubSecao, UL } from "../../components/landing/PublicPageLayout";
import { publicPage } from "../../content/public-pages";

const page = publicPage("importar-extrato-ofx");

export function ImportarExtratoOfxPage() {
  return (
    <PublicPageLayout
      page={page}
      lead="Digitar um mês inteiro de extrato é o que faz a maioria das pessoas desistir de controlar as contas na segunda semana. A importação em OFX resolve essa parte: o banco gera o arquivo, você revisa e confirma."
    >
      <Secao id="o-que-e-ofx" titulo="O que é um arquivo OFX">
        <P>
          OFX (Open Financial Exchange) é um formato de arquivo criado para troca de informação financeira. Em vez de
          uma tela para ler com os olhos, é um arquivo com as movimentações descritas de forma que um programa
          consiga interpretar: cada lançamento com sua data, seu valor, sua descrição e um identificador próprio.
        </P>
        <P>
          Praticamente todo banco brasileiro oferece o extrato nesse formato, geralmente junto da opção de baixar em
          PDF, com nomes como "OFX", "Money" ou "exportar para gerenciador financeiro". É um arquivo que você baixa —
          nada é liberado para terceiros no processo.
        </P>
      </Secao>

      <Secao id="para-que-serve" titulo="Para que ele serve aqui">
        <P>
          O OFX é o caminho para trazer seu histórico sem digitação. Um mês de extrato pode ter quarenta ou cinquenta
          linhas; importar é questão de alguns cliques, e o resultado é o mesmo de tê-las lançado uma a uma.
        </P>
      </Secao>

      <Secao id="como-funciona" titulo="Como a importação funciona no MeuGasto">
        <SubSecao titulo="1. Escolher a carteira">
          <P>
            A importação acontece dentro de uma carteira — a conta à qual aquele extrato pertence. Isso é o que faz
            cada lançamento mexer no saldo certo.
          </P>
        </SubSecao>

        <SubSecao titulo="2. Subir o arquivo e revisar">
          <P>
            Enviado o arquivo, o app lê as movimentações e monta uma lista para sua conferência. De cada lançamento ele
            aproveita:
          </P>
          <UL>
            <LI>a data da movimentação;</LI>
            <LI>o valor, e o sinal dele — negativo entra como gasto, positivo como ganho;</LI>
            <LI>a descrição que o banco escreveu;</LI>
            <LI>o identificador do lançamento no banco, usado para não importar nada duas vezes.</LI>
          </UL>
          <P>
            Nessa mesma tela o app sugere uma categoria para cada linha a partir da descrição — compra em farmácia cai
            em saúde, posto em transporte, mensalidade de streaming em assinaturas digitais, e assim por diante. É
            sugestão: você troca o que não ficou bom antes de confirmar.
          </P>
          <P>
            Linhas que o banco inclui mas não são movimentação de verdade, como as de saldo do dia, são descartadas, e
            o que já estava lançado aparece marcado para você não duplicar.
          </P>
        </SubSecao>

        <SubSecao titulo="3. Confirmar">
          <P>
            Na confirmação, os lançamentos entram na carteira escolhida e passam a contar no saldo e nos totais por
            categoria, como qualquer outro. O identificador do banco é guardado com cada um — então reimportar o mesmo
            arquivo, ou um arquivo com período sobreposto, não cria duplicata: o repetido é ignorado.
          </P>
        </SubSecao>

        <SubSecao titulo="Dá para desfazer">
          <P>
            Cada importação fica registrada como um lote, com o nome do arquivo e quantos lançamentos trouxe. Se você
            importou o arquivo errado ou na carteira errada, desfazer o lote remove de uma vez tudo o que ele criou.
          </P>
        </SubSecao>
      </Secao>

      <Secao id="sem-banco" titulo="Sem conectar diretamente ao banco">
        <P>
          Vale deixar explícito, porque muitos aplicativos de finanças funcionam de outro jeito: o MeuGasto{" "}
          <strong className="font-semibold text-white">não se conecta à sua conta bancária</strong>. Ele não pede a
          senha do seu banco, não usa open finance e não lê sua movimentação sozinho.
        </P>
        <P>
          O arquivo OFX é você quem baixa e é você quem envia, quando quiser. A contrapartida é honesta: essa parte
          não é automática. Em troca, nenhum acesso à sua conta fica guardado em lugar nenhum.
        </P>
      </Secao>

      <Secao id="depois" titulo="Depois de importar">
        <P>
          Com o extrato dentro do app, o resto do trabalho é o de sempre: conferir as categorias e olhar o total de
          cada uma no mês, como se descreve em <A to="/controle-de-gastos">controle de gastos</A>. A importação é um
          atalho para a digitação — a leitura do que aquilo significa continua sendo o ponto, e é o que o{" "}
          <A to="/controle-financeiro-pessoal">controle financeiro pessoal</A> resolve.
        </P>
      </Secao>
    </PublicPageLayout>
  );
}
