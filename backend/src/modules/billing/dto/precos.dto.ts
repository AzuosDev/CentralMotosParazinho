import { IsNumber, Max, Min, ValidateIf } from 'class-validator';

// Preço padrão do Plano Empresarial (todos os clientes sem preço próprio).
export class SetPrecosDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000)
  valorMensal!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000)
  valorAnual!: number;
}

// Preço próprio de um cliente; null volta a usar o preço padrão.
export class SetPrecoUsuarioDto {
  @ValidateIf((_o, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000)
  valorMensal!: number | null;

  @ValidateIf((_o, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000)
  valorAnual!: number | null;
}
