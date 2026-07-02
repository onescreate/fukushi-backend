import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** 認証不要のエンドポイントに付ける（health, kiosk 等） */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
