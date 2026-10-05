import { Module } from '@nestjs/common';
import { SupplyModule } from '../supply/supply.module';
import { DispatchTrackingModule } from '../dispatch-tracking/dispatch-tracking.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({ imports: [SupplyModule, DispatchTrackingModule], controllers: [SearchController], providers: [SearchService] })
export class SearchModule {}
