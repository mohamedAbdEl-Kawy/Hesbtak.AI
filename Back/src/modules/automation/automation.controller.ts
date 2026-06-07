import { Body, Controller, Get, Headers, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, JwtUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantService } from '../tenant/tenant.service';
import { AutomationService } from './automation.service';
import { RecurringEntryDto } from './dto';

@UseGuards(JwtAuthGuard)
@Controller('tenant')
export class AutomationController {
  constructor(
    private readonly automation: AutomationService,
    private readonly tenant: TenantService,
  ) {}

  @Post('recurring-entries')
  async createRecurring(
    @Headers('x-tenant-id') orgId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: RecurringEntryDto,
  ) {
    return this.automation.createRecurringEntry(
      await this.tenant.fromOrganizationId(orgId, user.sub, ['owner', 'accountant']),
      user.sub,
      dto,
    );
  }

  @Get('recurring-entries')
  async recurring(@Headers('x-tenant-id') orgId: string, @CurrentUser() user: JwtUser) {
    return this.automation.listRecurringEntries(await this.tenant.fromOrganizationId(orgId, user.sub));
  }

  @Post('recurring-entries/run')
  async runRecurring(@Headers('x-tenant-id') orgId: string, @CurrentUser() user: JwtUser) {
    return this.automation.runRecurringEntries(await this.tenant.fromOrganizationId(orgId, user.sub, ['owner', 'accountant']));
  }

  @Get('insights/dashboard')
  async dashboard(@Headers('x-tenant-id') orgId: string, @CurrentUser() user: JwtUser) {
    return this.automation.dashboard(await this.tenant.fromOrganizationId(orgId, user.sub));
  }

  @Get('forecasts')
  async forecasts(
    @Headers('x-tenant-id') orgId: string,
    @CurrentUser() user: JwtUser,
    @Query('months') months?: string,
  ) {
    return this.automation.forecast(
      await this.tenant.fromOrganizationId(orgId, user.sub),
      months ? Number(months) : 12,
    );
  }

  @Get('alerts')
  async alerts(@Headers('x-tenant-id') orgId: string, @CurrentUser() user: JwtUser) {
    return this.automation.listAlerts(await this.tenant.fromOrganizationId(orgId, user.sub));
  }

  @Post('alerts/evaluate')
  async evaluateAlerts(@Headers('x-tenant-id') orgId: string, @CurrentUser() user: JwtUser) {
    return this.automation.evaluateAlerts(await this.tenant.fromOrganizationId(orgId, user.sub, ['owner', 'accountant']));
  }

  @Get('suggestions')
  async suggestions(@Headers('x-tenant-id') orgId: string, @CurrentUser() user: JwtUser) {
    return this.automation.suggestions(await this.tenant.fromOrganizationId(orgId, user.sub));
  }
}
