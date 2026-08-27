import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { WebAuthnService } from './webauthn.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ICurrentUser } from '../../common/types/current-user.type';
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from '@simplewebauthn/server';

interface RequestWithUser extends Request {
  user: ICurrentUser;
}

@Controller('api/auth/webauthn')
export class WebAuthnController {
  constructor(private readonly webAuthnService: WebAuthnService) {}

  // Registration (user must be logged in)

  @UseGuards(JwtAuthGuard)
  @Post('register/options')
  @HttpCode(200)
  async registrationOptions(@Req() req: RequestWithUser) {
    return this.webAuthnService.getRegistrationOptions(req.user._id.toString());
  }

  @UseGuards(JwtAuthGuard)
  @Post('register/verify')
  @HttpCode(200)
  async registrationVerify(
    @Req() req: RequestWithUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.webAuthnService.verifyRegistration(
      req.user._id.toString(),
      body as unknown as RegistrationResponseJSON,
    );
  }

  // Authentication (public)

  @Post('login/options')
  @HttpCode(200)
  async loginOptions(@Body() body: { email: string }) {
    return this.webAuthnService.getLoginOptions(body.email);
  }

  @Post('login/verify')
  @HttpCode(200)
  async loginVerify(@Body() body: { email: string; response: Record<string, unknown> }) {
    return this.webAuthnService.verifyLogin(
      body.email,
      body.response as unknown as AuthenticationResponseJSON,
    );
  }

  // Re-authentication (JWT-protected, for password change)

  @UseGuards(JwtAuthGuard)
  @Post('reauth/options')
  @HttpCode(200)
  async reauthOptions(@Req() req: RequestWithUser) {
    return this.webAuthnService.getReauthOptions(req.user._id.toString());
  }

  @UseGuards(JwtAuthGuard)
  @Post('reauth/verify')
  @HttpCode(200)
  async reauthVerify(
    @Req() req: RequestWithUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.webAuthnService.verifyReauth(
      req.user._id.toString(),
      body as unknown as AuthenticationResponseJSON,
    );
  }

  // Credential management

  @UseGuards(JwtAuthGuard)
  @Get('credentials')
  async listCredentials(@Req() req: RequestWithUser) {
    return this.webAuthnService.listCredentials(req.user._id.toString());
  }

  @UseGuards(JwtAuthGuard)
  @Delete('credentials/:credentialId')
  @HttpCode(200)
  async deleteCredential(
    @Req() req: RequestWithUser,
    @Param('credentialId') credentialId: string,
  ) {
    return this.webAuthnService.deleteCredential(req.user._id.toString(), credentialId);
  }
}
