import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { TenantsService } from './tenants.service';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.provision(dto.orgSlug, dto.plan);
  }

  @Get()
  list() {
    return this.tenantsService.list();
  }

  @Get(':orgSlug')
  find(@Param('orgSlug') orgSlug: string) {
    return this.tenantsService.findBySlugOrThrow(orgSlug);
  }
}
