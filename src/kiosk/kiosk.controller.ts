import { Body, Controller, Post } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import {
  KioskAuthDto,
  KioskBoardDto,
  KioskClockDto,
  KioskMealDto,
  KioskReasonDto,
  KioskUsersDto,
} from './dto/kiosk-auth.dto';
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

  /** 通所/退所の打刻（操作トークンが必要） */
  @Post('clock')
  clock(@Body() dto: KioskClockDto) {
    return this.service.clock(dto.operationToken, dto.type);
  }

  /** 打刻画面の情報（今日の予定・中抜け・アラート） */
  @Post('board')
  board(@Body() dto: KioskBoardDto) {
    return this.service.board(dto.operationToken);
  }

  /** 本人による喫食の記録/取消 */
  @Post('meal')
  meal(@Body() dto: KioskMealDto) {
    return this.service.recordMeal(dto.operationToken, dto.eaten);
  }

  /** 欠席・遅刻・早退の理由入力 */
  @Post('reason')
  reason(@Body() dto: KioskReasonDto) {
    return this.service.submitReason(
      dto.operationToken,
      dto.date,
      dto.kind,
      dto.reason,
    );
  }
}
