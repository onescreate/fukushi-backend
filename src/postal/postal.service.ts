import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

interface ZipcloudResult {
  address1: string; // 都道府県
  address2: string; // 市区町村
  address3: string; // 町域
}

@Injectable()
export class PostalService {
  /** 郵便番号（7桁）から住所を引く。外部API zipcloud を利用。 */
  async lookup(zipcode: string) {
    const z = (zipcode ?? '').replace(/[^0-9]/g, '');
    if (z.length !== 7) {
      throw new BadRequestException('郵便番号は7桁で入力してください');
    }

    let data: { results?: ZipcloudResult[] | null };
    try {
      const res = await fetch(
        `https://zipcloud.ibsnet.co.jp/api/search?zipcode=${z}`,
      );
      data = (await res.json()) as { results?: ZipcloudResult[] | null };
    } catch {
      throw new ServiceUnavailableException(
        '住所検索サービスに接続できませんでした',
      );
    }

    const r = data.results?.[0];
    if (!r) throw new NotFoundException('該当する住所が見つかりません');

    return {
      postalCode: z,
      prefecture: r.address1,
      city: r.address2,
      town: r.address3,
    };
  }
}
