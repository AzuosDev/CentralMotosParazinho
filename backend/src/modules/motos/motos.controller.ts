import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MotosService } from './motos.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ICurrentUser } from '../../common/types/current-user.type';
import { CreateMotoDto } from './dto/create-moto.dto';
import { UpdateMotoDto } from './dto/update-moto.dto';
import { VenderMotoDto } from './dto/vender-moto.dto';
import { GetMotosDto } from './dto/get-motos.dto';
import { GetRelatorioMotosDto } from './dto/get-relatorio-motos.dto';

@ApiTags('Motos')
@ApiBearerAuth()
@Controller('api/motos')
export class MotosController {
  constructor(private motosService: MotosService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@CurrentUser() user: ICurrentUser, @Body() dto: CreateMotoDto) {
    return this.motosService.create(user._id.toString(), dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@CurrentUser() user: ICurrentUser, @Query() query: GetMotosDto) {
    return this.motosService.findAll(user._id.toString(), query);
  }

  // Declarada antes de @Get(':id') de propósito: na ordem inversa, 'relatorio' casaria com
  // o parâmetro :id e a rota nunca seria alcançada.
  @UseGuards(JwtAuthGuard)
  @Get('relatorio')
  relatorio(@CurrentUser() user: ICurrentUser, @Query() query: GetRelatorioMotosDto) {
    return this.motosService.relatorio(user._id.toString(), query);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@CurrentUser() user: ICurrentUser, @Param('id') id: string) {
    return this.motosService.findOne(user._id.toString(), id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/resumo')
  resumo(@CurrentUser() user: ICurrentUser, @Param('id') id: string) {
    return this.motosService.resumo(user._id.toString(), id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/vender')
  vender(@CurrentUser() user: ICurrentUser, @Param('id') id: string, @Body() dto: VenderMotoDto) {
    return this.motosService.vender(user._id.toString(), id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(@CurrentUser() user: ICurrentUser, @Param('id') id: string, @Body() dto: UpdateMotoDto) {
    return this.motosService.update(user._id.toString(), id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@CurrentUser() user: ICurrentUser, @Param('id') id: string) {
    return this.motosService.remove(user._id.toString(), id);
  }
}
