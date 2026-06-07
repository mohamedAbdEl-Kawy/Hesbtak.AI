import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'crypto';
import { DataBaseService } from '../../database/database.service';
import { TenantService } from '../tenant/tenant.service';
import { RagIndexService } from '../ai/rag-index.service';
import {
  AcceptInvitationDto,
  CompleteOnboardingDto,
  ForgotPasswordDto,
  InviteMemberDto,
  LoginDto,
  OnboardingAnswerDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyOtpDto,
} from './dto';

@Injectable()
export class AuthService {
  private readonly onboardingQuestions = [
    { key: 'business_model', question: 'What does the business sell?' },
    { key: 'payment_methods', question: 'Which payment methods do you use?' },
    { key: 'main_expenses', question: 'What are the main expense categories?' },
  ];

  constructor(
    private readonly db: DataBaseService,
    private readonly jwt: JwtService,
    private readonly tenant: TenantService,
    private readonly ragIndex: RagIndexService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.db.user.findUnique({
      where: {
        email: dto.email,
      },
    });
    if (exists) {
      throw new BadRequestException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const organizationId = randomUUID();
    const schemaName = this.tenant.schemaNameForOrganization(organizationId);
    const result = await this.db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          fullName: dto.fullName,
          email: dto.email.toLowerCase(),
          passwordHash,
        },
      });
      const organization = await tx.organization.create({
        data: {
          id: organizationId,
          name: dto.organizationName,
          industry: dto.industry,
          currency: dto.currency ?? 'USD',
          schemaName,
        },
      });
      await tx.organizationUser.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          role: 'owner',
          joinedAt: new Date(),
        },
      });
      return { user, organization };
    });

    await this.tenant.provisionTenantSchema(result.organization.schemaName);
    await this.tenant.seedChartOfAccounts(
      result.organization.schemaName,
      result.organization.industry,
    );
    await this.ragIndex.reindexTenant({
      organizationId: result.organization.id,
      schemaName: result.organization.schemaName,
      role: 'owner',
    });

    return {
      accessToken: this.sign(result.user),
      user: this.publicUser(result.user),
      organization: result.organization,
      onboarding: { nextQuestion: this.onboardingQuestions[0] },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.db.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tenants = await this.db.organizationUser.findMany({
      where: { userId: user.id, isActive: true },
      include: { organization: true },
    });

    return {
      accessToken: this.sign(user),
      user: this.publicUser(user),
      tenants: tenants.map((tenant) => ({
        organizationId: tenant.organizationId,
        schemaName: tenant.organization.schemaName,
        organizationName: tenant.organization.name,
        role: tenant.role,
      })),
    };
  }

  // todo: refactoring the onboarding process
  async getNextOnboardingQuestion(organizationId: string, userId: string) {
    const context = await this.tenant.fromOrganizationId(organizationId, userId);
    const schema = this.tenant.quote(context.schemaName);
    const responses = await this.db.$queryRawUnsafe<{ question_key: string }[]>(
      `SELECT question_key FROM ${schema}.onboarding_responses`,
    );
    return (
      this.onboardingQuestions.find(
        (q) => !responses.some((r) => r.question_key === q.key),
      ) ?? null
    );
  }

  async answerOnboarding(
    organizationId: string,
    userId: string,
    dto: OnboardingAnswerDto,
  ) {
    const context = await this.tenant.fromOrganizationId(organizationId, userId, [
      'owner',
      'accountant',
    ]);
    const schema = this.tenant.quote(context.schemaName);
    const rows = await this.db.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO ${schema}.onboarding_responses (question_key, answer)
       VALUES ($1, $2)
       RETURNING id`,
      dto.questionKey,
      dto.answer,
    );
    await this.ragIndex.indexSource(
      context,
      'onboarding_questionnaire',
      rows[0].id,
    );

    return {
      stored: true,
      nextQuestion: await this.getNextOnboardingQuestion(organizationId, userId),
    };
  }

  async completeOnboarding(
    organizationId: string,
    userId: string,
    dto: CompleteOnboardingDto,
  ) {
    const context = await this.tenant.fromOrganizationId(organizationId, userId, [
      'owner',
      'accountant',
    ]);
    const schema = this.tenant.quote(context.schemaName);
    for (const answer of dto.answers) {
      const rows = await this.db.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO ${schema}.onboarding_responses (question_key, answer)
         VALUES ($1, $2)
         RETURNING id`,
        answer.questionKey,
        answer.answer,
      );
      await this.ragIndex.indexSource(
        context,
        'onboarding_questionnaire',
        rows[0].id,
      );
    }

    return {
      completed: true,
      nextQuestion: await this.getNextOnboardingQuestion(organizationId, userId),
    };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.db.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user) {
      return { sent: true };
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await bcrypt.hash(code, 12);
    await this.db.passwordResetOtp.create({
      data: {
        userId: user.id,
        codeHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    return {
      sent: true,
      expiresInMinutes: 10,
      devCode: process.env.NODE_ENV === 'production' ? undefined : code,
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.db.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user) {
      throw new BadRequestException('Invalid or expired code');
    }
    await this.findValidOtp(user.id, dto.code);
    return { verified: true };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.db.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user) {
      throw new BadRequestException('Invalid or expired code');
    }

    const otp = await this.findValidOtp(user.id, dto.code);
    const passwordHash = await bcrypt.hash(dto.password, 12);
    await this.db.$transaction([
      this.db.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
      this.db.passwordResetOtp.update({
        where: { id: otp.id },
        data: { usedAt: new Date() },
      }),
    ]);
    return { reset: true };
  }

  async inviteMember(
    organizationId: string,
    userId: string,
    dto: InviteMemberDto,
  ) {
    await this.tenant.fromOrganizationId(organizationId, userId, ['owner']);
    const token = randomBytes(32).toString('hex');
    const invitation = await this.db.invitation.create({
      data: {
        organizationId,
        email: dto.email.toLowerCase(),
        role: dto.role,
        token,
        invitedBy: userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      invitation,
      emailQueued: true,
      acceptUrl: `/api/v1/auth/accept-invitation`,
    };
  }

  async acceptInvitation(userId: string, dto: AcceptInvitationDto) {
    const invitation = await this.db.invitation.findUnique({
      where: { token: dto.token },
    });
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    if (invitation.acceptedAt || invitation.expiresAt < new Date()) {
      throw new BadRequestException('Invitation is no longer valid');
    }

    await this.db.$transaction(async (tx) => {
      await tx.organizationUser.upsert({
        where: {
          organizationId_userId: {
            organizationId: invitation.organizationId,
            userId,
          },
        },
        create: {
          organizationId: invitation.organizationId,
          userId,
          role: invitation.role,
          invitedBy: invitation.invitedBy,
          joinedAt: new Date(),
        },
        update: {
          role: invitation.role,
          isActive: true,
          joinedAt: new Date(),
        },
      });
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
    });

    return { accepted: true, organizationId: invitation.organizationId };
  }

  private sign(user: { id: string; email: string; globalRole: string }): string {
    return this.jwt.sign({
      sub: user.id,
      email: user.email,
      globalRole: user.globalRole,
    });
  }

  private publicUser(user: {
    id: string;
    fullName: string;
    email: string;
    globalRole: string;
  }) {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      globalRole: user.globalRole,
    };
  }

  private async findValidOtp(userId: string, code: string) {
    const otps = await this.db.passwordResetOtp.findMany({
      where: {
        userId,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    for (const otp of otps) {
      if (await bcrypt.compare(code, otp.codeHash)) {
        return otp;
      }
    }
    throw new BadRequestException('Invalid or expired code');
  }
}
