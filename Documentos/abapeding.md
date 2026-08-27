# MeuGasto — Prompts de Desenvolvimento Sequenciados

Baseado no que já está construido nessa aba do meu sistema

### Aba Contas Pendentes;

#### 1 Contas Pendentes Estado atual:

- Titulo
- Valor
- Data
- Descrição

---

#### 2 Contas Pendentes Ideal:

- Titulo;
- Valor da conta;
- Data: de inicio e fim
- Se a conta é parcelada, não parcelada ou se é recorrente
- Categoria
- Formato de pagamento: Cartão de crédito, Pix, dinheiro ou outro (o suário pode adicionar)
- Descrição

---

#### 2.1 se for parcelada:

- Valor total;
- Quantidade de parcelas; opções padroes ou outros (o usuário define)
- Valor da parcela: baseado no valor total
- Data de inicio e fim
- Progresso: Quantas parcelas foram pagas, parcelas restantes, parecida com o da aba de metas

---

#### 2.2 Não parcelada

- seguir o formato padrão

#### 2.3 Recorrente

- Valor
- periodo da recorrencia
- Forma de pagamento



# 🚀 PROMPTS SEQUENCIADOS - MODIFICAÇÃO ABA CONTAS PENDENTES
## ContaCerta | Desenvolvimento Controlado Por Etapas

---

## ⚠️ INSTRUÇÕES CRÍTICAS - LEIA ANTES DE EXECUTAR

### REGRA OURO:
**NÃO MODIFIQUE NADA ALÉM DO QUE FOI SOLICITADO EM CADA ETAPA.**

### PROTEÇÕES OBRIGATÓRIAS:
- ❌ NÃO altere: `queryKeys` (`["pending"]`, `["dashboard"]`)
- ❌ NÃO remova: componente `ConfirmDeleteModal` e sua assinatura
- ❌ NÃO mude: estrutura base dos schemas Mongoose (campos `_id`, `title`, `value`, `dueDate`, `paid`)
- ❌ NÃO modifique: invalidação de cache em `React-Query`
- ⚠️ **ATENÇÃO JSX**: Valide TODAS as tags (abertura/fechamento), props, indentação e closures de componentes

### FLUXO:
Execute as etapas **SEQUENCIALMENTE** (1 → 2 → 3 → 4 → 5). Não pule etapas.
Após cada etapa, valide o resultado antes de prosseguir.

---

# 📋 ETAPA 1: ESTENDER SCHEMA MONGOOSE (Backend)

```
CONTEXTO:
Você está modificando APENAS o schema MongoDB do módulo "Contas Pendentes" no backend.
Projeto: ContaCerta
Arquivo alvo: backend/src/modules/pending/pending-account.schema.ts (ou similar)

TAREFA ESPECÍFICA:
O schema atual possui: { title, value, dueDate, paid, description }

Estenda o schema com EXATAMENTE estes novos campos:
1. isParcelada: boolean (default: false)
2. isRecorrente: boolean (default: false)
3. categoria: string (enum: ['Alimentação', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Outro'], default: 'Outro')
4. formatoPagamento: string (enum: ['Cartão de Crédito', 'Pix', 'Dinheiro', 'Outro'], default: 'Outro')
5. Se isParcelada === true, adicione SUBFILA (nested object):
   - totalParcelas: number
   - valorParcela: number (calculado: total / totalParcelas)
   - parcelasPayas: number (default: 0)
   - dataInicio: Date
   - dataFim: Date
   ILA:
   - periodoRecorrencia: string (enum: ['Diário', 'Semanal', 'Mensal', 'Anual'], default: 'Mensal')
   - dataProxima: Date (próxima ocorrência)

REGRAS IMPERATIVAS:
- Mantenha a estrutura base intacta (campos originais não podem ser removidos)
- Use validações Mongoose nativas (required, enum, default)
- NÃO modifique _id, timestamps ou índices existentes
- NÃO remova campos atuais
- Adicione comentários JSDoc explicando cada campo novo
- Se o schema usa interface TypeScript, atualize-a também (PROTEJA: não quebre tipagem existente)

VALIDAÇÃO OBRIGATÓRIA AO FINAL:
□ Schema compila sem erros
□ Subfila de parcelas só existe se isParcelada === true
□ Subfila de recorrência só existe se isRecorrente === true
□ Todos os campos têm default ou are required conforme esperado
□ Não há conflito de tipos entre campos novos e existentes
□ MongoDB consegue validar enums corretamente

Forneça:
1. Código completo do schema modificado
2. Listagem de mudanças (linhas adicionadas)
3. Confirmação de cada validação acima
```

---

# 📋 ETAPA 2: ATUALIZAR TIPOS TYPESCRIPT (Frontend)

```
CONTEXTO:
Você está sincronizando os tipos TypeScript do frontend com o novo schema backend.
Projeto: ContaCerta
Arquivo alvo: frontend/src/types/api.ts (ou onde PendingAccount é definido)

TAREFA ESPECÍFICA:
Estenda a interface/type PendingAccount com os mesmos campos da ETAPA 1:
- isParcelada: boolean
- isRecorrente: boolean
- categoria: 'Alimentação' | 'Transporte' | 'Saúde' | 'Educação' | 'Lazer' | 'Outro'
- formatoPagamento: 'Cartão de Crédito' | 'Pix' | 'Dinheiro' | 'Outro'
- parcelas?: { totalParcelas: number; valorParcela: number; parcelasPayas: number; dataInicio: string; dataFim: string }
- recorrencia?: { periodoRecorrencia: 'Diário' | 'Semanal' | 'Mensal' | 'Anual'; dataProxima: string }

REGRAS IMPERATIVAS:
- Use string para datas (ISO format: "2026-06-17T14:30:00Z")
- Mantenha campos originais (id, title, value, dueDate, paid, description)
- Subfila "parcelas" é OPCIONAL (?) - só presente se isParcelada true
- Subfila "recorrencia" é OPCIONAL (?) - só presente se isRecorrente true
- NÃO modifique outras types (não quebre PendingItem, Response, etc.)
- Adicione comentários TSDocs para cada propriedade nova
- Valide que não há conflito com tipos existentes (ex.: PendingItem, PendingResponse)

VALIDAÇÃO OBRIGATÓRIA AO FINAL:
□ TypeScript não lança erros de compilação (tsc --noEmit)
□ PendingAccount é compatível com o novo schema Mongoose
□ Tipos de enum correspondem aos do backend
□ Optional fields (?) estão corretos
□ Não há union types conflitantes
□ Interfaces não duplicam nomes

Forneça:
1. Interface/Type PendingAccount completa e modificada
2. Listagem de adições (linhas novas)
3. Confirmação de cada validação acima
```

---

# 📋 ETAPA 3: ATUALIZAR ENDPOINTS API (Backend)

```
CONTEXTO:
Você está ampliando os endpoints REST da API para aceitar e retornar os novos campos.
Projeto: ContaCerta
Arquivo alvo: backend/api/pending.ts (ou backend/src/modules/pending/routes.ts)

TAREFA ESPECÍFICA:
Os endpoints atuais: GET /api/pending, POST /api/pending, PATCH /api/pending/:id, DELETE /api/pending/:id

Modifique APENAS os handlers para:

1. POST /api/pending:
   - Aceite os novos campos no body (isParcelada, isRecorrente, categoria, formatoPagamento, parcelas, recorrencia)
   - Valide que se isParcelada=true, parcelas DEVE estar presente e ser válido
   - Valide que se isRecorrente=true, recorrencia DEVE estar presente e ser válido
   - Se isParcelada=true e totalParcelas > 0, calcule automaticamente: valorParcela = total / totalParcelas
   - Retorne o documento criado com todos os campos

2. PATCH /api/pending/:id:
   - Aceite updates para os novos campos
   - Se isParcelada muda de false→true, exija parcelas no body
   - Se isParcelada muda de true→false, remova subfila parcelas
   - Se isRecorrente muda de false→true, exija recorrencia no body
   - Se isRecorrente muda de true→false, remova subfila recorrencia
   - Retorne documento atualizado

3. GET /api/pending:
   - Retorne TODOS os campos (novos + antigos)
   - Sem mudanças no filtro/paginação

4. DELETE /api/pending/:id:
   - Sem mudanças necessárias

REGRAS IMPERATIVAS:
- Use validação Mongoose/Zod nativa (não apenas lógica JavaScript solta)
- Se houver formato de erro padrão (ex: { error: "..." }), mantenha-o
- Não modifique rotas GET /api/pending e DELETE (só melhorar POST e PATCH)
- Erro 400 se dados inválidos (ex: isParcelada=true sem parcelas)
- NÃO altere autenticação ou middleware de segurança
- Adicione comentários explicando lógica de validação nova

VALIDAÇÃO OBRIGATÓRIA AO FINAL:
□ POST /api/pending cria documento com novos campos
□ PATCH /api/pending/:id atualiza sem quebrar subfilas
□ GET /api/pending retorna novos campos
□ DELETE continua funcionando
□ Validações de schema Mongoose são respeitadas
□ Erros 400 são retornados corretamente para dados inválidos
□ queryKeys ["pending"] continua invalidando corretamente no frontend

Forneça:
1. Código completo dos handlers POST e PATCH modificados
2. Exemplos de payload JSON correto (POST e PATCH)
3. Exemplos de erro 400 (dados inválidos)
4. Confirmação de cada validação acima
```

---

# 📋 ETAPA 4: REFATORAR UI - PendingPage.tsx (Frontend)

```
CONTEXTO:
Você está ampliando a interface visual de PendingPage.tsx para exibir e editar os novos campos.
ATENÇÃO CRÍTICA: Erros de JSX quebram a aplicação. Valide TODAS as tags, closures e props.
Projeto: ContaCerta
Arquivo alvo: frontend/src/pages/PendingPage.tsx

TAREFA ESPECÍFICA:
A página atual exibe contas com: titulo, valor, data, descrição, botão pagar

Modifique APENAS:
1. Formulário de criação/edição (adicione):
   - Checkbox: "É parcelada?" (mostrar subcampos APENAS se true)
     - Subcampos: "Quantas parcelas?", "Valor total?" (valorParcela calculado automaticamente)
   - Checkbox: "É recorrente?" (mostrar subcampos APENAS se true)
     - Subcampos: "Período" (dropdown: Diário/Semanal/Mensal/Anual)
   - Dropdown: "Categoria" (Alimentação, Transporte, Saúde, Educação, Lazer, Outro)
   - Dropdown: "Forma de pagamento" (Cartão de Crédito, Pix, Dinheiro, Outro)
   - Mantenha: titulo, valor, data início/fim, descrição

2. Lista de contas (adicione colunas/card fields):
   - Ícone ou label para "Parcelada" / "Recorrente"
   - "Categoria" (texto ou ícone)
   - "Forma de pagamento" (texto)
   - Se isParcelada: mostrar barra de progresso ou "X/Y parcelas pagas" (similar a metas)
   - Manter: titulo, valor, data, descrição, botão deletar, botão editar

REGRAS IMPERATIVAS DE JSX:
- ⚠️ TODAS as tags <input>, <select>, <div>, <button> DEVEM ter fechamento </> ou />
- ⚠️ Props de condicionalidade DEVEM estar entre chaves: {isParcelada && <div>...</div>}
- ⚠️ Indentação DEVE ser consistente (2 ou 4 espaços)
- ⚠️ Callbacks (onChange, onClick) DEVEM estar corretos: onClick={() => handleClick(id)}
- ⚠️ Keys em listas DEVEM ser únicos: {items.map(item => <div key={item.id}>...</div>)}
- ⚠️ Não feche tags indevidamente (ex: <input /> é correto, <input></input> pode quebrar)

REGRAS FUNCIONAIS:
- Reutilize componentes existentes (modais, botões, etc. de components/)
- NÃO altere queryKeys ["pending"], ["dashboard"]
- NÃO remova ConfirmDeleteModal
- Use React Query hooks (useQuery, useMutation) existentes
- TailwindCSS para estilização (sem CSS customizado fora de config)
- Se usar condicionais para mostrar/esconder campos, use {isParcelada && <field />}
- Calcule valorParcela no frontend: Math.round((total / parcelas) * 100) / 100

VALIDAÇÃO OBRIGATÓRIA AO FINAL:
□ Componente renderiza sem erros de JSX
□ Checkboxes de "Parcelada" e "Recorrente" mostram/escondem campos corretamente
□ Dropdowns funcionam (Categoria, Forma de Pagamento)
□ Subcampos de parcelas mostram barra de progresso (se parcelada)
□ Form submit envia dados corretos para API (via useMutation)
□ Lista de contas exibe todos os novos campos
□ Botões "Editar" e "Deletar" funcionam (ConfirmDeleteModal intacta)
□ Sem erros no console (TS, React, JSX)
□ Sem warnings de React (keys, dependencies, etc.)

ATENÇÃO ESPECÍFICA A JSX:
- Valide manualmente CADA tag de abertura/fechamento
- Evite: <div> sem </div>, tags autofecháveis sem />, atributos fora de quotes
- Exemplo CORRETO: <input type="text" value={state} onChange={(e) => setState(e.target.value)} />
- Exemplo ERRADO: <input type=text value=state onChange=handleChange>

Forneça:
1. Código completo de PendingPage.tsx modificado
2. Listagem de mudanças (linhas adicionadas, removidas, modificadas)
3. Validação MANUAL de todas as tags JSX
4. Confirmação de cada validação acima
5. Print/screenshot de funcionamento (se possível no terminal)
```

---

# 📋 ETAPA 5: VALIDAÇÃO FINAL E TESTES (Integração)

```
CONTEXTO:
Você está validando que todas as 4 etapas anteriores funcionam juntas sem quebras.
Projeto: ContaCerta (frontend + backend integrados)

TAREFA ESPECÍFICA:
Execute testes de integração manual:

1. TESTE DE CRIAR CONTA PARCELADA:
   - Abra o formulário de criação
   - Preencha: titulo, valor total (ex: 1000), ative "Parcelada", defina 5 parcelas
   - Sistema DEVE calcular: valorParcela = 200
   - Clique "Salvar"
   - Validar: Backend salva com isParcelada=true, parcelas.totalParcelas=5, parcelas.valorParcela=200
   - Validar: Frontend exibe "X/5 parcelas pagas" ou barra de progresso

2. TESTE DE CRIAR CONTA RECORRENTE:
   - Abra o formulário
   - Preencha: titulo, valor, ative "Recorrente", selecione "Mensal"
   - Clique "Salvar"
   - Validar: Backend salva com isRecorrente=true, recorrencia.periodoRecorrencia='Mensal'
   - Validar: Frontend exibe "Recorrente" ou ícone de recorrência

3. TESTE DE EDITAR CONTA:
   - Abra conta existente para editar
   - Mude de "Não parcelada" para "Parcelada" (adicione dados de parcelas)
   - Clique "Atualizar"
   - Validar: PATCH /api/pending/:id atualiza corretamente
   - Validar: Frontend reflete mudança sem erros

4. TESTE DE DELETAR CONTA:
   - Clique "Deletar" em qualquer conta
   - Modal de confirmação DEVE aparecer (ConfirmDeleteModal intacto)
   - Confirme deleção
   - Validar: DELETE /api/pending/:id funciona
   - Validar: Lista atualiza (queryKey ["pending"] invalidado)

5. TESTE DE VALIDAÇÃO:
   - Tente salvar conta parcelada SEM informar parcelas → API retorna erro 400
   - Tente salvar conta recorrente SEM informar período → API retorna erro 400
   - Validar: Frontend exibe erro amigável

6. TESTE DE CAMPOS OBRIGATÓRIOS:
   - Categoria e Forma de Pagamento devem ter defaults
   - Tente criar conta SEM preencher categoria → DEVE ter default 'Outro'
   - Tente criar conta SEM preencher forma de pagamento → DEVE ter default 'Outro'

REGRAS CRÍTICAS:
- NÃO modifique nada. Apenas execute testes.
- Se algum teste falhar, RELATE o erro ESPECÍFICO (mensagem exata, stack trace)
- Não corrija erros nesta etapa (será feito em etapa de correção posterior se necessária)

VALIDAÇÃO OBRIGATÓRIA AO FINAL:
□ Teste 1: Conta parcelada criada corretamente (backend + frontend)
□ Teste 2: Conta recorrente criada corretamente (backend + frontend)
□ Teste 3: Edição de conta funciona sem quebras
□ Teste 4: Deleção funciona (modal intacta, lista atualiza)
□ Teste 5: Validações de erro retornam 400 e frontend exibe mensagem
□ Teste 6: Defaults de categoria e forma de pagamento funcionam
□ NÃO há erros no console (TS, React, Network)
□ NÃO há warnings de React (keys, dependencies, etc.)
□ queryKeys ["pending"] e ["dashboard"] invalidam corretamente
□ ConfirmDeleteModal continua funcionando sem alterações

Forneça:
1. Resultado de cada teste (✅ PASSOU ou ❌ FALHOU)
2. Se falhou: erro específico, stack trace, contexto
3. Se passou: confirmação de cada validação acima
4. Resumo final: "Sistema está pronto para produção" ou "Requer correções"
```

---

## 🎯 RESUMO DE EXECUÇÃO

| Etapa | Arquivo(s) | Ação | Validação |
|-------|-----------|------|-----------|
| 1 | `backend/src/modules/pending/pending-account.schema.ts` | Estender schema Mongoose | Schema compila ✅ |
| 2 | `frontend/src/types/api.ts` | Atualizar tipos TS | TypeScript compila ✅ |
| 3 | `backend/api/pending.ts` | Ampliar endpoints | API retorna campos novos ✅ |
| 4 | `frontend/src/pages/PendingPage.tsx` | Refatorar UI | UI exibe campos, sem erros JSX ✅ |
| 5 | INTEGRAÇÃO | Testar tudo junto | Todos os testes passam ✅ |

---

## ⚡ COMO EXECUTAR

```bash
# Execute no terminal com openclaude:
openclaude --model openai/gpt-oss-120b:free "$(cat PROMPTS_FINAIS_CONTACERTA.md | sed -n '/^# 📋 ETAPA 1/,/^# 📋 ETAPA 2/p')"

# Após completar ETAPA 1, faça:
openclaude --model openai/gpt-oss-120b:free "$(cat PROMPTS_FINAIS_CONTACERTA.md | sed -n '/^# 📋 ETAPA 2/,/^# 📋 ETAPA 3/p')"

# E assim por diante...
```

---

## 🔒 PROTEÇÕES FINAIS

**NÃO MODIFICAR NADA ALÉM DO SOLICITADO:**
- ✅ Estenda (não reescreva) schemas, tipos e endpoints
- ✅ Mantenha ConfirmDeleteModal intacto
- ✅ Mantenha queryKeys ["pending"], ["dashboard"]
- ✅ Mantenha invalidação de cache em React Query
- ✅ Valide TODAS as tags JSX (abertura, fechamento, props)

**SE ENCONTRAR CONFLITO:**
- Relate o conflito específico
- NÃO prossiga para próxima etapa
- Aguarde resolução antes de continuar

---

**Gerado em**: 2026-06-17 | **Versão**: 1.0 | **Status**: Pronto para Execução