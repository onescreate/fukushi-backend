import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Principal } from '../auth/principal.types';
import { RequirePermission } from '../auth/require-permission.decorator';
import { UpsertAnnouncementDto } from './dto/announcement.dto';
import { AnnouncementsService } from './announcements.service';

// お知らせ管理。投稿/編集=announcement.manage、職員フィード閲覧=attendance.view。
@RequirePermission('announcement.manage')
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly service: AnnouncementsService) {}

  @RequirePermission('attendance.view')
  @Get(':facilityId/feed')
  feed(
    @CurrentUser() principal: Principal,
    @Param('facilityId') facilityId: string,
  ) {
    return this.service.staffFeed(principal, facilityId);
  }

  @Get(':facilityId')
  list(
    @CurrentUser() principal: Principal,
    @Param('facilityId') facilityId: string,
  ) {
    return this.service.list(principal, facilityId);
  }

  @Post(':facilityId')
  create(
    @CurrentUser() principal: Principal,
    @Param('facilityId') facilityId: string,
    @Body() dto: UpsertAnnouncementDto,
  ) {
    return this.service.create(principal, facilityId, dto);
  }

  @Put(':facilityId/:id')
  update(
    @CurrentUser() principal: Principal,
    @Param('facilityId') facilityId: string,
    @Param('id') id: string,
    @Body() dto: UpsertAnnouncementDto,
  ) {
    return this.service.update(principal, facilityId, id, dto);
  }

  @Delete(':facilityId/:id')
  remove(
    @CurrentUser() principal: Principal,
    @Param('facilityId') facilityId: string,
    @Param('id') id: string,
  ) {
    return this.service.remove(principal, facilityId, id);
  }
}
