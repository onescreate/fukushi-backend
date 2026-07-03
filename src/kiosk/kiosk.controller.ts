import { Body, Controller, Post } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { KioskAuthDto, KioskUsersDto } from './dto/kiosk-auth.dto';
import { KioskService } from './kiosk.service';

// タブレット（キオスク）用。Firebase認証は不要で、端末トークンで守る。
@Public()
@Controller('kiosk')
export class KioskController {
  constructor(private readonly service: KioskService) {}

  /** 端末トークンから、その店舗の利用者一覧を返す（PIN選択画面用） */
  @Post('users')
  users(@Body() dto: KioskUsersDto) {
    return this.service.kioskUsers(dto.deviceToken);
  }

  /** PIN認証。成功で短命の操作トークンを返す。 */
  @Post('authenticate')
  authenticate(@Body() dto: KioskAuthDto) {
    return this.service.authenticate(dto.deviceToken, dto.userId, dto.pin);
  }
}
