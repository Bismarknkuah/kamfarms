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
import { SupplyModule } from './supply/supply.module';
import { ControlCenterModule } from './control-center/control-center.module';
import { DispatchTrackingModule } from './dispatch-tracking/dispatch-tracking.module';
import { SearchModule } from './search/search.module';
import { MillDispatchModule } from './mill-dispatch/mill-dispatch.module';
import { MachinesModule } from './machines/machines.module';
import { ProductionModule } from './production/production.module';
import { PackagingModule } from './packaging/packaging.module';
import { CustomersModule } from './customers/customers.module';
import { SalesModule } from './sales/sales.module';
import { SiteModule } from './site/site.module';
import { InsightsModule } from './insights/insights.module';
import { FinanceModule } from './finance/finance.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SettingsModule } from './settings/settings.module';
import { EmailModule } from './email/email.module';
import { MessagingModule } from './messaging/messaging.module';
import { CallsModule } from './calls/calls.module';
import { TasksModule } from './tasks/tasks.module';
import { ReportsModule } from './reports/reports.module';
import { AiModule } from './ai/ai.module';
import { AuditViewerModule } from './audit-viewer/audit-viewer.module';
import { BackupModule } from './backup/backup.module';
import { SystemResetModule } from './system-reset/system-reset.module';
import { SystemOverviewModule } from './system-overview/system-overview.module';
// Roles, Permissions, Health modules implemented - imports above now resolve.

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AuditModule,
    InventoryLedgerModule,
    NotificationsModule,
    SettingsModule,
    EmailModule,
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
    SupplyModule,
    ControlCenterModule,
    DispatchTrackingModule,
    SearchModule,
    MillDispatchModule,
    MachinesModule,
    ProductionModule,
    PackagingModule,
    CustomersModule,
    SalesModule,
    SiteModule,
    InsightsModule,
    SystemOverviewModule,
    FinanceModule,
    MessagingModule,
    CallsModule,
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
