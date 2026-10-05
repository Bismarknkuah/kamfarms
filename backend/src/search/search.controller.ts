import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { SearchService } from './search.service';

@ApiTags('search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(private readonly service: SearchService) {}

  /** Quick search for the signed-in person. Any signed-in person may ask: the service decides, kind by kind, what they may see. */
  @Get()
  search(@CurrentUser() actor: AuthenticatedUser, @Query('q') q?: string) { return this.service.search(actor, q ?? ''); }
}
