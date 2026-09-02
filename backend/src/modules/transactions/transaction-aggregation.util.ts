// Estorno de compra no cartão é uma EXPENSE de valor positivo (o schema proíbe valor
// negativo, ver transaction.schema.ts) marcada com isEstorno — sem essa correção, toda
// agregação de valor de Transaction conta a compra revertida como gasto cheio de novo,
// mesmo a fatura já refletindo o estorno corretamente (cartoes.service.ts#recomputeValorTotal
// usa a mesma regra). Isso já apareceu divergente em três arquivos diferentes (dashboard,
// insights, expenses) — qualquer agregação nova de valor de Transaction deve reutilizar isto
// em vez de reescrever o $cond, senão o próximo relatório nasce com o mesmo bug.
//
// Seguro aplicar incondicionalmente mesmo em agregações que misturam INCOME e EXPENSE:
// isEstorno só é gravado como true em transações de cartão, que são sempre EXPENSE
// (cartoes.service.ts#estornar) — para uma linha INCOME o $cond sempre cai no ramo '$value'.
export const SIGNED_VALUE_EXPR = {
  $cond: ['$isEstorno', { $multiply: ['$value', -1] }, '$value'],
};

export function signedValue(row: { value: number; isEstorno?: boolean }): number {
  return row.isEstorno ? -row.value : row.value;
}
