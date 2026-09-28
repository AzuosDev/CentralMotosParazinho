import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSupportReplyDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  mensagem!: string;
}
