import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

// Chega como multipart (junto do áudio) ou JSON (modo texto) — por isso tudo é string.
export class InterpretarVozDto {
  // Modo texto: o usuário digitou/ditou pelo teclado em vez de gravar.
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  texto?: string;

  // Carteira usada quando a fala não menciona nenhuma (lembrada no navegador).
  @IsOptional()
  @IsString()
  carteiraPadraoId?: string;

  // "Hoje" no calendário local do usuário — sem isso, "ontem" dito às 23h em UTC-3 vira
  // o dia errado se o servidor calcular em UTC.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  hoje?: string;
}
