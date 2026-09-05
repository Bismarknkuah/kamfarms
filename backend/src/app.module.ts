import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { validateEnv } from './config/env.validation';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { PermissionsModule } from './permissions/permissions.module';
import { AuditModule } from './audit/audit.module';
import { HealthModule } from './health/health.module';
import { OrganizationModule } from './organization/organization.module';
import { FarmsModule } from './farms/farms.module';
import { WarehousesModule } from './warehouses/warehouses.module';
import { MasterDataModule } from './master-data/master-data.module';
import { InventoryLedgerModule } from './inventory-ledger/inventory-ledger.module';
import { PaddyModule } from './paddy/paddy.module';
import { LogisticsModule } from './logistics/logistics.module';
import { MachinesModule } from './machines/machines.module';
import { ProductionModule } from './production/production.module';
import { PackagingModule } from './packaging/packaging.module';
import { CustomersModule } from './customers/customers.module';
import { SalesModule } from './sales/sales.module';
import { FinanceModule } from './finance/finance.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MessagingModule } from './messaging/messaging.module';
import { TasksModule } from './tasks/tasks.module';
import { ReportsModule } from './reports/reports.module';
import { AiModule } from './ai/ai.module';
import { AuditViewerModule } from './audit-viewer/audit-viewer.module';
import { BackupModule } from './backup/backup.module';
import { SystemResetModule } from './system-reset/system-reset.module';
// Roles, Permissions, Health modules implemented — imports above now resolve.

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AuditModule,
    InventoryLedgerModule,
    NotificationsModule,
    AuthModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    HealthModule,
    OrganizationModule,
    FarmsModule,
    WarehousesModule,
    MasterDataModule,
    PaddyModule,
    LogisticsModule,
    MachinesModule,
    ProductionModule,
    PackagingModule,
    CustomersModule,
    SalesModule,
    FinanceModule,
    MessagingModule,
    TasksModule,
    ReportsModule,
    AiModule,
    AuditViewerModule,
    BackupModule,
    SystemResetModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
