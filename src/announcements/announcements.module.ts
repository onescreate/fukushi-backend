import { Module } from '@nestjs/common';
import { AnnouncementsController } from './announcements.controller';
import { MyAnnouncementsController } from './my-announcements.controller';
import { AnnouncementsService } from './announcements.service';

@Module({
  controllers: [AnnouncementsController, MyAnnouncementsController],
  providers: [AnnouncementsService],
})
export class AnnouncementsModule {}
