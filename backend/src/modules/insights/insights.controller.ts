import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ICurrentUser } from '../../common/types/current-user.type';
import { InsightsService } from './insights.service';
import { GetAnnualSummaryDto } from './dto/get-annual-summary.dto';
import { GetCashflowDto } from './dto/get-cashflow.dto';

@ApiTags('Insights')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/insights')
export class InsightsController {
  constructor(private insightsService: InsightsService) {}

  @Get('overview')
  async getOverview(@CurrentUser() user: ICurrentUser) {
    return this.insightsService.getOverview(user._id.toString());
  }

  @Get('cashflow')
  async getCashflow(@CurrentUser() user: ICurrentUser, @Query() query: GetCashflowDto) {
    return this.insightsService.getCashflow(user._id.toString(), query);
  }

  @Get('goals-progress')
  async getGoalsProgress(@CurrentUser() user: ICurrentUser, @Query() query: GetCashflowDto) {
    return this.insightsService.getGoalsProgress(user._id.toString(), query);
  }

  @Get('annual-aggregates')
  async getAnnualAggregates(@CurrentUser() user: ICurrentUser, @Query() query: GetAnnualSummaryDto) {
    const year = query.year ?? new Date().getFullYear();
    return this.insightsService.getAnnualAggregates(user._id.toString(), year);
  }

  @Get('expenses-breakdown')
  async getExpensesBreakdown(@CurrentUser() user: ICurrentUser, @Query() query: GetCashflowDto) {
    return this.insightsService.getExpensesBreakdown(user._id.toString(), query);
  }

  @Get('income-breakdown')
  async getIncomeBreakdown(@CurrentUser() user: ICurrentUser, @Query() query: GetCashflowDto) {
    return this.insightsService.getIncomeBreakdown(user._id.toString(), query);
  }

  @Get('accounts-overview')
  async getAccountsOverview(@CurrentUser() user: ICurrentUser) {
    return this.insightsService.getAccountsOverview(user._id.toString());
  }

  @Get('wallets-evolution')
  async getWalletsEvolution(@CurrentUser() user: ICurrentUser, @Query() query: GetCashflowDto) {
    return this.insightsService.getWalletsEvolution(user._id.toString(), query);
  }

  @Throttle(5, 60)
  @Get('annual-summary')
  async getAnnualSummary(@CurrentUser() user: ICurrentUser, @Query() query: GetAnnualSummaryDto) {
    const year = query.year ?? new Date().getFullYear();
    return this.insightsService.getAnnualSummary(user._id.toString(), year);
  }
}
