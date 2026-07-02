/**
 * Step 0-4 動作検証スクリプト（開発用）。
 *
 * 目的: 「正しくログインした時に GET /me が本人情報を返す」ことを、
 *       本物のFirebaseログイントークンを使って確認する。
 *
 * 流れ:
 *   1) Admin SDK で開発用の管理者ユーザー(admin@example.com)を作成/更新
 *   2) seedのstaffレコードに firebase_uid を紐付け
 *   3) メール/パスワードでサインインして本物のIDトークンを取得
 *   4) IDTOKEN=... を標準出力に出す（呼び出し側が /me をcurlで叩く）
 *
 * 実行: npx ts-node scripts/verify-me.ts
 */
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { PrismaClient } from '@prisma/client';

const EMAIL = 'admin@example.com';
const PASSWORD = 'DevTest1234!';
const API_KEY = process.env.FIREBASE_WEB_API_KEY;

async function main() {
  if (!API_KEY) throw new Error('FIREBASE_WEB_API_KEY が未設定です');

  if (getApps().length === 0) {
    initializeApp({
      credential: applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
  }
  const auth = getAuth();

  // 1) 開発用ユーザーを用意（無ければ作成、あればパスワードを既知の値に更新）
  let uid: string;
  try {
    const existing = await auth.getUserByEmail(EMAIL);
    uid = existing.uid;
    await auth.updateUser(uid, { password: PASSWORD });
  } catch {
    const created = await auth.createUser({
      email: EMAIL,
      password: PASSWORD,
      emailVerified: true,
    });
    uid = created.uid;
  }
  console.error(`[verify] Firebaseユーザー uid=${uid}`);

  // 2) staff レコードに firebase_uid を紐付け
  const prisma = new PrismaClient();
  await prisma.staff.update({
    where: { email: EMAIL },
    data: { firebaseUid: uid },
  });
  await prisma.$disconnect();
  console.error('[verify] staff.firebase_uid を紐付けました');

  // 3) メール/パスワードでサインインしてIDトークンを取得
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: EMAIL,
        password: PASSWORD,
        returnSecureToken: true,
      }),
    },
  );
  const data = (await res.json()) as { idToken?: string; error?: unknown };
  if (!data.idToken) {
    console.error('[verify] サインイン失敗:', JSON.stringify(data.error));
    process.exit(1);
  }

  // 4) IDトークンを出力（呼び出し側が /me を叩く）
  console.log(`IDTOKEN=${data.idToken}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
