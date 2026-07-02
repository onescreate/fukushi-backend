import { SetMetadata } from '@nestjs/common';
import { Permission } from './permissions';

export const REQUIRE_PERMISSION_KEY = 'requiredPermissions';

/**
 * エンドポイントに必要な権限を宣言する。
 * 例: @RequirePermission('user.manage')
 * 複数指定した場合は「すべて」を満たす必要がある。
 */
export const RequirePermission = (...permissions: Permission[]) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, permissions);
