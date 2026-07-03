import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  App,
  applicationDefault,
  getApps,
  initializeApp,
} from 'firebase-admin/app';
import { Auth, DecodedIdToken, getAuth } from 'firebase-admin/auth';

/**
 * Firebase Admin SDK の初期化とトークン検証を担うサービス。
 * 認証情報は環境変数 GOOGLE_APPLICATION_CREDENTIALS（サービスアカウント鍵）から読み込む。
 */
@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private app!: App;

  onModuleInit() {
    const existing = getApps();
    if (existing.length === 0) {
      this.app = initializeApp({
        credential: applicationDefault(),
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
      this.logger.log(
        `Firebase Admin 初期化完了 (project: ${process.env.FIREBASE_PROJECT_ID})`,
      );
    } else {
      this.app = existing[0];
    }
  }

  /** FirebaseのIDトークンを検証し、デコード結果を返す（無効なら例外）。 */
  verifyIdToken(idToken: string): Promise<DecodedIdToken> {
    return getAuth(this.app).verifyIdToken(idToken);
  }

  auth(): Auth {
    return getAuth(this.app);
  }

  /** メール＋パスワードでFirebaseユーザーを作成し uid を返す。 */
  async createUser(params: {
    email: string;
    password: string;
    displayName?: string;
  }): Promise<string> {
    const user = await getAuth(this.app).createUser(params);
    return user.uid;
  }

  /** パスワードを再設定する。 */
  setPassword(uid: string, password: string): Promise<unknown> {
    return getAuth(this.app).updateUser(uid, { password });
  }

  /** Firebaseユーザーを削除する。 */
  deleteUser(uid: string): Promise<void> {
    return getAuth(this.app).deleteUser(uid);
  }
}
