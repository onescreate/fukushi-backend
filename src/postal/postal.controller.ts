import { Controller, Get, Param } from '@nestjs/common';
import { PostalService } from './postal.service';

// 郵便番号から住所を引く（ログイン済みなら誰でも利用可・権限不要）
@Controller('postal')
export class PostalController {
  constructor(private readonly service: PostalService) {}

  @Get(':zipcode')
  lookup(@Param('zipcode') zipcode: string) {
    return this.service.lookup(zipcode);
  }
}
