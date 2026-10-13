import { BadRequestException, Body, Controller, Get, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ICurrentUser } from '../../common/types/current-user.type';
import { VozService } from './voz.service';
import { GroqClient } from './groq.client';
import { InterpretarVozDto } from './dto/interpretar-voz.dto';
import { ConfirmarVozDto } from './dto/confirmar-voz.dto';

@ApiTags('Voz')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/voz')
export class VozController {
  constructor(
    private readonly vozService: VozService,
    private readonly groq: GroqClient,
  ) {}

  // Permite ao frontend esconder o botão de microfone quando a chave não está configurada.
  @Get('status')
  status() {
    return { disponivel: this.groq.configurado };
  }

  // Cota gratuita da Groq é limitada — o throttle por usuário/IP evita que um único
  // cliente esgote a cota diária de todos.
  @Throttle(40, 3600)
  @Post('interpretar')
  @UseInterceptors(
    FileInterceptor('audio', {
      // Abaixo do teto de 4,5 MB do corpo de requisição de funções da Vercel. Em opus
      // (~32 kbps) isso cobre bem mais que os 2 minutos de gravação permitidos no app.
      limits: { fileSize: 4 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const mime = (file.mimetype || '').toLowerCase();
        if (mime.startsWith('audio/') || mime.startsWith('video/webm')) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Formato de áudio não suportado.'), false);
        }
      },
    }),
  )
  async interpretar(
    @CurrentUser() user: ICurrentUser,
    @UploadedFile() audio: Express.Multer.File | undefined,
    @Body() dto: InterpretarVozDto,
  ) {
    return this.vozService.interpretar(user._id.toString(), {
      audio: audio ? { buffer: audio.buffer, mimetype: audio.mimetype } : undefined,
      texto: dto.texto,
      carteiraPadraoId: dto.carteiraPadraoId,
      hoje: dto.hoje,
    });
  }

  @Post('confirmar')
  async confirmar(@CurrentUser() user: ICurrentUser, @Body() dto: ConfirmarVozDto) {
    return this.vozService.confirmar(user._id.toString(), dto);
  }
}
