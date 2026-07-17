import { Module } from '@nestjs/common';
import { PortalService } from './portal.service';
import { PortalController } from './portal.controller';
import { PortalLinkService } from './portal-link.service';
import { PortalLinkController } from './portal-link.controller';

@Module({
  providers: [PortalService, PortalLinkService],
  controllers: [PortalController, PortalLinkController],
  exports: [PortalService],
})
export class PortalModule {}
