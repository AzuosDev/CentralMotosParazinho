import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CartoesService } from './cartoes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ICurrentUser } from '../../common/types/current-user.type';
import { CreateParcelamentoDto } from './dto/create-parcelamento.dto';
import { PagarFaturaDto } from './dto/pagar-fatura.dto';
import { VincularContaPendenteDto } from './dto/vincular-conta-pendente.dto';

@ApiTags('Cartoes')
@ApiBearerAuth()
@Controller('api/cartoes')
@UseGuards(JwtAuthGuard)
export class CartoesController {
  constructor(private cartoesService: CartoesService) {}

  @Get()
  listar(@CurrentUser() user: ICurrentUser) {
    return this.cartoesService.listarCartoes(user._id.toString());
  }

  @Post('parcelamentos')
  criarParcelamento(@CurrentUser() user: ICurrentUser, @Body() dto: CreateParcelamentoDto) {
    return this.cartoesService.criarParcelamento(user._id.toString(), dto);
  }

  @Post('transacoes/:id/estorno')
  estornar(@CurrentUser() user: ICurrentUser, @Param('id') id: string) {
    return this.cartoesService.estornar(user._id.toString(), id);
  }

  @Post('vincular-conta-pendente')
  vincularContaPendente(@CurrentUser() user: ICurrentUser, @Body() dto: VincularContaPendenteDto) {
    return this.cartoesService.vincularContaPendente(user._id.toString(), dto);
  }

  @Get(':id')
  detalharCartao(@CurrentUser() user: ICurrentUser, @Param('id') id: string) {
    return this.cartoesService.detalharCartao(user._id.toString(), id);
  }

  @Get(':id/parcelamentos')
  listarParcelamentos(@CurrentUser() user: ICurrentUser, @Param('id') id: string) {
    return this.cartoesService.listarParcelamentos(user._id.toString(), id);
  }

  @Get(':id/faturas/:faturaId')
  detalharFatura(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
    @Param('faturaId') faturaId: string,
  ) {
    return this.cartoesService.detalharFatura(user._id.toString(), id, faturaId);
  }

  @Post(':id/faturas/:faturaId/pagar')
  @HttpCode(200)
  pagar(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
    @Param('faturaId') faturaId: string,
    @Body() dto: PagarFaturaDto,
  ) {
    return this.cartoesService.pagar(user._id.toString(), id, faturaId, dto);
  }
}
