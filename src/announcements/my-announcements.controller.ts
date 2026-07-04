import { Controller, ForbiddenException, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Principal } from '../auth/principal.types';
import { AnnouncementsService } from './announcements.service';

// 利用者本人用のお知らせフィード。
@Controller('my/announcements')
export class MyAnnouncementsController {
  constructor(private readonly service: AnnouncementsService) {}

  @Get()
  list(@CurrentUser() principal: Principal) {
    if (principal.type !== 'user') {
      throw new ForbiddenException('この機能は利用者専用です');
    }
    return this.service.userFeed(principal.facilityId);
  }
}
