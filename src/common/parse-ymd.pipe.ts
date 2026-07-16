import {
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * クエリ等の日付文字列 "YYYY-MM-DD" を検証するパイプ。
 * - 形式不正 → 400
 * - 実在しない日付(2026-02-30 / 2026-13-01 等) → 400
 * これにより `new Date(生文字列)` による Invalid Date（誤結果・空結果・Prismaエラー）を防ぐ。
 */
@Injectable()
export class ParseYmdPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    if (typeof value !== 'string' || !YMD.test(value)) {
      throw new BadRequestException(
        '日付は YYYY-MM-DD 形式で指定してください',
      );
    }
    const [y, m, d] = value.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (
      dt.getUTCFullYear() !== y ||
      dt.getUTCMonth() !== m - 1 ||
      dt.getUTCDate() !== d
    ) {
      throw new BadRequestException('存在しない日付です');
    }
    return value;
  }
}
