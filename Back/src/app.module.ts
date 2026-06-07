import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { DataBaseModule } from './database/database.module';
import { LoggerModule } from 'nestjs-pino';
import * as path from 'path';
import { AuthModule } from './modules/auth/auth.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { AutomationModule } from './modules/automation/automation.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { AiModule } from './modules/ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        autoLogging: true,
        timestamp: () => `,"time":"${new Date().toISOString()}"`,
        customSuccessMessage: function (req, res) {
          return `✅ [${req.method}] ${req.url} - Status: ${res.statusCode}`;
        },

        customErrorMessage: function (req, res, err) {
          return `❌ [${req.method}] ${req.url} - Failed with error: ${err.message}`;
        },

        transport: {
          targets: [
            process.env.NODE_ENV !== 'production'
              ? {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    singleLine: false,
                    translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
                    ignore: 'pid,hostname',
                    levelFirst: true,
                  },
                }
              : { target: 'pino/file', options: { destination: 1 } },
            {
              target: 'pino-roll',
              options: {
                file: path.join(
                  'logs',
                  `app-${new Date().toISOString().split('T')[0]}.log`,
                ),
                size: '10m',
                frequency: 'daily',
                mkdir: true,
              },
            },
          ],
        },
      },
    }),
    DataBaseModule,
    TenantModule,
    AuthModule,
    OrganizationsModule,
    AccountingModule,
    AutomationModule,
    AiModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
