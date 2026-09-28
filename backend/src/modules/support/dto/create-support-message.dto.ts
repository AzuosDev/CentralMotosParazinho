import { IsIn, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import type { SupportMessageTipo } from '../schemas/support-message.schema';

export class CreateSupportMessageDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  titulo!: string;

  @IsIn(['bug', 'sugestao'])
  tipo!: SupportMessageTipo;

  @IsNotEmpty()
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  mensagem!: string;
}
