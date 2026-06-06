import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CurrentUser, JwtUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantService } from '../tenant/tenant.service';
import { CreateAiWorkflowDto } from './dto';
import { UploadFileInterceptor } from './ai-utils';
import { WorkflowAutomationService } from './workflow-automation.service';
import { AiWorkflowStep, WorkflowStateService } from './workflow-state.service';

@UseGuards(JwtAuthGuard)
@Controller('ai/workflow')
export class AiWorkflowController {
  constructor(
    private readonly tenant: TenantService,
    private readonly state: WorkflowStateService,
    private readonly automation: WorkflowAutomationService,
  ) {}

  @Post()
  async createWorkflow(
    @Headers('x-tenant-id') orgId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateAiWorkflowDto,
  ) {
    const tenant = await this.tenant.fromOrganizationId(orgId, user.sub, [
      'owner',
      'accountant',
    ]);

    return this.state.createWorkflow({
      organizationId: tenant.organizationId,
      userId: user.sub,
      documentSide: dto.documentSide,
      paymentStatus: dto.paymentStatus,
    });
  }

  @Get(':id')
  async getWorkflow(
    @Headers('x-tenant-id') orgId: string,
    @CurrentUser() user: JwtUser,
    @Param('id') workflowId: string,
  ) {
    const tenant = await this.tenant.fromOrganizationId(orgId, user.sub);
    return this.state.getWorkflow(workflowId, tenant.organizationId, user.sub);
  }

  @Post(':id/upload')
  @UseInterceptors(UploadFileInterceptor.single())
  async uploadAndRunWorkflow(
    @Headers('x-tenant-id') orgId: string,
    @CurrentUser() user: JwtUser,
    @Param('id') workflowId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('Invoice file is required');
    }

    const tenant = await this.tenant.fromOrganizationId(orgId, user.sub, [
      'owner',
      'accountant',
    ]);

    return this.automation.runFromUpload({
      workflowId,
      tenant,
      userId: user.sub,
      file,
    });
  }

  @Post(':id/confirm-extraction')
  async confirmExtractionDisabled() {
    return this.manualConfirmationDisabled();
  }

  @Post(':id/confirm-classification')
  async confirmClassificationDisabled() {
    return this.manualConfirmationDisabled();
  }

  @Post(':id/confirm-account-mapping')
  async confirmAccountMappingDisabled() {
    return this.manualConfirmationDisabled();
  }

  @Post(':id/confirm-journal')
  async confirmJournalDisabled() {
    return this.manualConfirmationDisabled();
  }

  @Post(':id/confirm-payment')
  async confirmPaymentDisabled() {
    return this.manualConfirmationDisabled();
  }

  private manualConfirmationDisabled() {
    throw new BadRequestException({
      message:
        'Manual confirmation is disabled. Upload a document and the backend will run system approvals automatically.',
      autonomousStep: AiWorkflowStep.EXTRACTION,
    });
  }
}
