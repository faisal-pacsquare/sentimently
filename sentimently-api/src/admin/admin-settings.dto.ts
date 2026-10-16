import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** One delivery tier. The settings PATCH replaces the whole table, so send every city. */
export interface RateInput {
  fee: number;
  minDays: number;
  maxDays: number;
  sameDay: boolean;
}

export class UpdateStoreDto {
  @IsOptional() @IsString() @MaxLength(200) announcement?: string | null;
  @IsOptional() @IsString() @MaxLength(300) banner?: string | null;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  freeDeliveryThreshold?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  sameDayCutoffHour?: number;
  /** { "Karachi": { "fee": 350, "minDays": 0, "maxDays": 0, "sameDay": true }, ... } */
  @IsOptional() @IsObject() deliveryRates?: Record<string, RateInput>;
  @IsOptional() @IsObject() restOfPakistan?: RateInput;
  /** { "Karachi": 40 }: same-day orders a city can take in a day. A city left out has no limit. */
  @IsOptional() @IsObject() sameDayCapacity?: Record<string, number>;
  @IsOptional() @IsString() @MaxLength(30) contactPhone?: string | null;
  @IsOptional() @IsEmail() contactEmail?: string | null;
  @IsOptional() @IsObject() socialLinks?: Record<string, string>;
  @IsOptional() @IsString() @MaxLength(1000) bankTransferInstructions?:
    string | null;
}

export class CreatePromoDto {
  @Matches(/^[A-Za-z0-9]{3,20}$/, {
    message: 'code must be 3 to 20 letters or digits',
  })
  code!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) percent!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minOrder?: number;
  @IsOptional() @IsBoolean() firstOrderOnly?: boolean;
  @IsOptional() @IsDateString() startsAt?: string | null;
  @IsOptional() @IsDateString() endsAt?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdatePromoDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) percent?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minOrder?: number;
  @IsOptional() @IsBoolean() firstOrderOnly?: boolean;
  @IsOptional() @IsDateString() startsAt?: string | null;
  @IsOptional() @IsDateString() endsAt?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateExtraDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) name?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) price?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateStaffDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsString() @MinLength(12) @MaxLength(128) password!: string;
  @IsIn(['staff', 'admin']) role!: 'staff' | 'admin';
}
