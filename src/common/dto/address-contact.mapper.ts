import { AddressContactDto } from './address-contact.dto';

/** DTOの住所・連絡先フィールドを Prisma の data 形式に変換する。 */
export function mapAddressContact(dto: AddressContactDto) {
  return {
    establishedOn: dto.establishedOn ? new Date(dto.establishedOn) : undefined,
    postalCode: dto.postalCode,
    prefecture: dto.prefecture,
    city: dto.city,
    addressLine: dto.addressLine,
    phone: dto.phone,
  };
}
