import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../../users/users.service';
import { UserDocument } from '../../users/schemas/user.schema';
import * as bcrypt from 'bcrypt';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private usersService: UsersService) {
    super({ usernameField: 'email' });
  }

  async validate(email: string, password: string) {
    const user: UserDocument | null = await this.usersService.findByEmail(email);
    if (!user) throw new UnauthorizedException('Credenciais inválidas');
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) throw new UnauthorizedException('Credenciais inválidas');
    if (!user.emailVerified) throw new UnauthorizedException('Email não verificado');
    if (user.bloqueado) throw new UnauthorizedException('Conta bloqueada. Fale com o administrador.');
    // return user object (including password) for internal use
    return user;
  }
}
