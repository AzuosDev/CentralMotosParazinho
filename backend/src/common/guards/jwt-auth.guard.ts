import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../../modules/users/users.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService, private usersService: UsersService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token não fornecido');
    }

    const token = authHeader.slice(7).trim();
    let user;
    try {
      const payload = this.jwtService.verify(token) as any;
      user = await this.usersService.findById(payload.sub);
    } catch (error) {
      throw new UnauthorizedException('Token inválido');
    }
    // Bloqueio vale na hora, sem esperar o access token (15 min) expirar.
    if (user.bloqueado) throw new UnauthorizedException('Conta bloqueada');
    request.user = user;
    return true;
  }
}
