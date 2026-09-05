import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InventoryLedgerService } from './inventory-ledger.service';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { scopedLocationIds } from '../common/utils/scope.util';

@ApiTags('inventory-transactions')
@ApiBearerAuth()
@Controller('inventory-transactions')
export class InventoryTransactionsController {
  constructor(private readonly ledger: InventoryLedgerService) {}

  @Get()
  @RequirePermission([PERMISSIONS.AUDIT_VIEW, PERMISSIONS.FARM_INVENTORY_VIEW, PERMISSIONS.WAREHOUSE_INVENTORY_VIEW, PERMISSIONS.MILLING_VIEW])
  async list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('locationType') locationType?: string,
    @Query('locationId') locationId?: string,
    @Query('batchNumber') batchNumber?: string,
    @Query('productId') productId?: string,
    @Query('paddyGradeId') paddyGradeId?: string,
    @Query('packagingSizeId') packagingSizeId?: string,
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const farmScope = scopedLocationIds(actor, 'FARM');
    const warehouseScope = scopedLocationIds(actor, 'WAREHOUSE');
    if (!farmScope.isGlobal) {
      const allowed = [...farmScope.ids, ...warehouseScope.ids];
      if (locationId && !allowed.includes(locationId)) {
        return [];
      }
      if (!locationId) {
        if (allowed.length === 0) return [];
        locationId = allowed[0];
        locationType = farmScope.ids.includes(locationId) ? 'FARM' : 'WAREHOUSE';
      }
    }

    return this.ledger.listTransactions({ locationType, locationId, batchNumber, productId, paddyGradeId, packagingSizeId, type, from, to });
  }
}
