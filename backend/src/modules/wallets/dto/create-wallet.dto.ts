import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateWalletDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nome!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  saldo?: number;

  @IsOptional()
  @IsString()
  icone?: string;

  @IsOptional()
  @IsIn(['conta', 'dinheiro', 'credito'])
  tipo?: 'conta' | 'dinheiro' | 'credito';

  @IsOptional()
  // tipo !== 'credito' (explícito) é o único caso que pula a validação — se `tipo` não vier
  // no payload (comum num PATCH parcial que só atualiza limite/dia de um cartão já
  // existente), o campo continua validado. Ver correção pós-auditoria: um PATCH que não
  // reenviava `tipo` deixava esses campos passarem sem checar tipo/faixa.
  @ValidateIf((o) => o.tipo !== 'conta' && o.tipo !== 'dinheiro')
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  limite?: number;

  @IsOptional()
  // tipo !== 'credito' (explícito) é o único caso que pula a validação — se `tipo` não vier
  // no payload (comum num PATCH parcial que só atualiza limite/dia de um cartão já
  // existente), o campo continua validado. Ver correção pós-auditoria: um PATCH que não
  // reenviava `tipo` deixava esses campos passarem sem checar tipo/faixa.
  @ValidateIf((o) => o.tipo !== 'conta' && o.tipo !== 'dinheiro')
  @IsNumber()
  @Min(1)
  @Max(31)
  @Type(() => Number)
  diaFechamento?: number;

  @IsOptional()
  // tipo !== 'credito' (explícito) é o único caso que pula a validação — se `tipo` não vier
  // no payload (comum num PATCH parcial que só atualiza limite/dia de um cartão já
  // existente), o campo continua validado. Ver correção pós-auditoria: um PATCH que não
  // reenviava `tipo` deixava esses campos passarem sem checar tipo/faixa.
  @ValidateIf((o) => o.tipo !== 'conta' && o.tipo !== 'dinheiro')
  @IsNumber()
  @Min(1)
  @Max(31)
  @Type(() => Number)
  diaVencimento?: number;

  @IsOptional()
  // tipo !== 'credito' (explícito) é o único caso que pula a validação — se `tipo` não vier
  // no payload (comum num PATCH parcial que só atualiza limite/dia de um cartão já
  // existente), o campo continua validado. Ver correção pós-auditoria: um PATCH que não
  // reenviava `tipo` deixava esses campos passarem sem checar tipo/faixa.
  @ValidateIf((o) => o.tipo !== 'conta' && o.tipo !== 'dinheiro')
  @IsString()
  carteiraPagamentoId?: string;

  @IsOptional()
  // tipo !== 'credito' (explícito) é o único caso que pula a validação — se `tipo` não vier
  // no payload (comum num PATCH parcial que só atualiza limite/dia de um cartão já
  // existente), o campo continua validado. Ver correção pós-auditoria: um PATCH que não
  // reenviava `tipo` deixava esses campos passarem sem checar tipo/faixa.
  @ValidateIf((o) => o.tipo !== 'conta' && o.tipo !== 'dinheiro')
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  taxaJurosRotativo?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  bandeira?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4)
  ultimosDigitos?: string;
}
