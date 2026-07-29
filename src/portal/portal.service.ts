import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

/** ポータル（会計DB）から読み取る法人・店舗・職員（読み取り専用）。 */
export interface PortalCorp {
  id: string;
  name: string;
  invoiceNum?: string | null; // 適格請求書発行事業者登録番号
  postalCode?: string | null;
  address?: string | null;
  tel?: string | null;
  fax?: string | null;
}

/** ポータルの口座（振込先）。 */
export interface PortalAccount {
  id: string;
  corpId: string | null;
  bankName: string | null;
  branch: string | null;
  type: string | null;
  number: string | null;
  holder: string | null;
  name: string | null;
  shopIds: unknown;
}
export interface PortalShop {
  id: string;
  name: string;
  corpId: string | null;
  status: string | null;
  businessCategory: string | null;
}
export interface PortalStaff {
  id: number;
  lastName: string;
  firstName: string;
  shopId: string | null;
  status: string | null;
  role: string | null;
  jobTitle: string | null;
}

/** ポータルのログインユーザー（ones_accounting_users）。 */
export interface PortalUser {
  id: string;
  name: string | null;
  email: string;
  role: string | null;
  permissions: unknown;
  systemAccess: unknown;
  staffId: number | null;
  shopId: string | null;
}

/**
 * ポータル（会計）システムのDBを読み取り専用で参照するサービス。
 * PORTAL_DATABASE_URL が未設定なら無効（enabled=false）。
 * 同一Cloud SQLインスタンス内の別DB(postgres)へ、福祉ユーザーのSELECT権限で接続する。
 */
@Injectable()
export class PortalService implements OnModuleDestroy {
  private readonly logger = new Logger('PortalService');
  private readonly pool: Pool | null;

  constructor() {
    const url = process.env.PORTAL_DATABASE_URL;
    if (url) {
      this.pool = new Pool({ connectionString: url, max: 3, statement_timeout: 10_000 });
      this.logger.log('ポータルDB連携: 有効');
    } else {
      this.pool = null;
      this.logger.warn('PORTAL_DATABASE_URL 未設定：ポータル連携は無効です');
    }
  }

  get enabled(): boolean {
    return !!this.pool;
  }

  private async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (!this.pool) throw new Error('PORTAL_DATABASE_URL 未設定：ポータル連携が無効です');
    const r = await this.pool.query(sql, params);
    return r.rows as T[];
  }

  /** ポータルのログインユーザーをメールで引き当てる（福祉ログインの照合用）。 */
  async getUserByEmail(email: string): Promise<PortalUser | null> {
    if (!this.pool) return null;
    const rows = await this.query<PortalUser>(
      `SELECT id::text AS id, name, email, role,
              permissions, system_access AS "systemAccess",
              staff_id AS "staffId", shop_id AS "shopId"
       FROM ones_accounting_users
       WHERE email = $1 AND (delete_flag = false OR delete_flag IS NULL)
       LIMIT 1`,
      [email],
    );
    return rows[0] ?? null;
  }

  getCorps(): Promise<PortalCorp[]> {
    return this.query<PortalCorp>(
      `SELECT corp_id::text AS id, name, invoice_num AS "invoiceNum",
              postal_code AS "postalCode", address, tel, fax
       FROM corps ORDER BY corp_id ASC`,
    );
  }

  /** 1法人の発行者情報（請求書の発行者に使う）。 */
  async getCorpById(corpId: string): Promise<PortalCorp | null> {
    if (!this.pool) return null;
    const rows = await this.query<PortalCorp>(
      `SELECT corp_id::text AS id, name, invoice_num AS "invoiceNum",
              postal_code AS "postalCode", address, tel, fax
       FROM corps WHERE corp_id::text = $1 LIMIT 1`,
      [corpId],
    );
    return rows[0] ?? null;
  }

  /** 法人の社印画像（無ければ null）。 */
  async getCorpSeal(corpId: string): Promise<string | null> {
    if (!this.pool) return null;
    const rows = await this.query<{ sealImage: string | null }>(
      `SELECT seal_image AS "sealImage"
       FROM ones_accounting_corp_seals WHERE corp_id = $1 LIMIT 1`,
      [corpId],
    );
    return rows[0]?.sealImage ?? null;
  }

  /** 法人に紐づく口座（振込先の候補）。 */
  async getAccountsByCorp(corpId: string): Promise<PortalAccount[]> {
    if (!this.pool) return [];
    return this.query<PortalAccount>(
      `SELECT account_id::text AS id, corp_id::text AS "corpId",
              bank_name AS "bankName", branch, type, number, holder, name,
              shop_ids AS "shopIds"
       FROM accounts WHERE corp_id::text = $1 ORDER BY account_id ASC`,
      [corpId],
    );
  }

  getShops(): Promise<PortalShop[]> {
    return this.query<PortalShop>(
      `SELECT shop_id AS id, name, corp_id::text AS "corpId", status,
              business_category AS "businessCategory"
       FROM shops ORDER BY shop_id ASC`,
    );
  }

  getStaffs(): Promise<PortalStaff[]> {
    return this.query<PortalStaff>(
      `SELECT staff_id AS id, last_name AS "lastName", first_name AS "firstName",
              shop_id AS "shopId", status, role, job_title AS "jobTitle"
       FROM staffs ORDER BY staff_id ASC`,
    );
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }
}
