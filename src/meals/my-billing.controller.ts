import { Controller, ForbiddenException, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Principal } from '../auth/principal.types';
import { BillingService } from './billing.service';

// 利用者本人の請求書（ログイン必須・利用者のみ）
@Controller('my/billing')
export class MyBillingController {
  constructor(private readonly service: BillingService) {}

  @Get()
  list(@CurrentUser() principal: Principal) {
    if (principal.type !== 'user') {
      throw new ForbiddenException('この機能は利用者専用です');
    }
    return this.service.myBilling(principal.id);
  }
}
