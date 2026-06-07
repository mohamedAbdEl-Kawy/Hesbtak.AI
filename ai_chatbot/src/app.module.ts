import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { EmbeddingsModule } from './embeddings/embeddings.module';
import { PrismaModule } from './prisma/prisma.module';
import { RetrievalModule } from './retrieval/retrieval.module';
import { TenantsModule } from './tenants/tenants.module';

import { LanggraphModule } from './langgraph/langgraph.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    TenantsModule,
    EmbeddingsModule,
    RetrievalModule,
    LanggraphModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
