import { IsString, Matches, MinLength } from 'class-validator';

export class ResetSenhaDto {
  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[A-Z])(?=.*\d)/, { message: 'A senha precisa ter uma letra maiúscula e um número' })
  password!: string;
}
