import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { ReceivablesController } from './receivables.controller';
import { ReceivablesService } from './receivables.service';
import { FinanceCenterController } from './finance-center.controller';
import { FinanceCenterService } from './finance-center.service';

@Module({
  controllers: [InvoicesController, PaymentsController, ExpensesController, ReceivablesController, FinanceCenterController],
  providers: [InvoicesService, PaymentsService, ExpensesService, ReceivablesService, FinanceCenterService],
  exports: [InvoicesService, PaymentsService, ExpensesService, ReceivablesService],
})
export class FinanceModule {}
