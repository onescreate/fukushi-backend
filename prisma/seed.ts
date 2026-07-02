/**
 * 開発用の初期データ投入（seed）。
 * 固定UUIDで upsert しているため、何度実行しても重複しない（冪等）。
 *
 * 実行: npx prisma db seed
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// 固定UUID（再実行時に同じレコードを更新するため）
const IDS = {
  corporation: '00000000-0000-0000-0000-000000000001',
  facility: '00000000-0000-0000-0000-000000000002',
  systemAdmin: '00000000-0000-0000-0000-000000000003',
  systemAdminRole: '00000000-0000-0000-0000-000000000004',
  sampleUser: '00000000-0000-0000-0000-000000000005',
  facilityStaff: '00000000-0000-0000-0000-000000000006',
  facilityStaffRole: '00000000-0000-0000-0000-000000000007',
};

async function main() {
  // 1. テスト法人
  const corporation = await prisma.corporation.upsert({
    where: { id: IDS.corporation },
    update: {},
    create: { id: IDS.corporation, name: 'テスト法人' },
  });

  // 2. テスト店舗
  const facility = await prisma.facility.upsert({
    where: { id: IDS.facility },
    update: {},
    create: {
      id: IDS.facility,
      corporationId: corporation.id,
      name: 'テスト店舗A',
      serviceType: 'continuous_b',
    },
  });

  // 3. システム管理者（職員）。Firebase連携は Step 0-4 で紐付ける。
  const admin = await prisma.staff.upsert({
    where: { id: IDS.systemAdmin },
    update: {},
    create: {
      id: IDS.systemAdmin,
      corporationId: corporation.id,
      lastName: '管理',
      firstName: '太郎',
      email: 'admin@example.com',
    },
  });

  // 4. 管理者のロール割当（facilityId=null → 法人全体の system_admin）
  await prisma.staffFacilityRole.upsert({
    where: { id: IDS.systemAdminRole },
    update: {},
    create: {
      id: IDS.systemAdminRole,
      staffId: admin.id,
      facilityId: null,
      role: 'system_admin',
    },
  });

  // 4b. 一般スタッフ（権限が狭い。RBACの拒否テスト用）
  const staff = await prisma.staff.upsert({
    where: { id: IDS.facilityStaff },
    update: {},
    create: {
      id: IDS.facilityStaff,
      corporationId: corporation.id,
      lastName: 'スタッフ',
      firstName: '次郎',
      email: 'staff@example.com',
    },
  });
  await prisma.staffFacilityRole.upsert({
    where: { id: IDS.facilityStaffRole },
    update: {},
    create: {
      id: IDS.facilityStaffRole,
      staffId: staff.id,
      facilityId: facility.id, // 特定店舗の一般スタッフ
      role: 'staff',
    },
  });

  // 5. サンプル利用者（PIN=1234 をbcryptハッシュ化）
  const pinHash = await bcrypt.hash('1234', 10);
  await prisma.user.upsert({
    where: { id: IDS.sampleUser },
    update: {},
    create: {
      id: IDS.sampleUser,
      corporationId: corporation.id,
      facilityId: facility.id,
      loginId: 'user001',
      lastName: '利用',
      firstName: '花子',
      kana: 'リヨウ ハナコ',
      pinCode: pinHash,
    },
  });

  console.log('✅ seed 完了');
  console.log(`  法人: ${corporation.name}`);
  console.log(`  店舗: ${facility.name}`);
  console.log(`  管理者: ${admin.email}（system_admin）`);
  console.log(`  スタッフ: ${staff.email}（staff・店舗限定）`);
  console.log(`  利用者: user001 / PIN=1234`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
