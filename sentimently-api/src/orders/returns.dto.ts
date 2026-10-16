import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  MaxLength,
} from 'class-validator';

export class CancelDto {
  @IsString() @MaxLength(40) number!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class ReturnRequestDto {
  @IsString() @MaxLength(40) number!: string;
  @IsEmail() @MaxLength(254) email!: string;
  /** "return": changed my mind (7 days). "damaged": arrived damaged (48 hours, photo needed). */
  @IsIn(['return', 'damaged']) kind!: 'return' | 'damaged';
  @IsString() @MaxLength(1000) reason!: string;
  /** Links to photos. Uploading files needs an object store, which is not set up yet. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUrl({ require_tld: false }, { each: true })
  photoUrls?: string[];
  /** Positions (0, 1, ...) of the order lines to send back. Leave out for every returnable line. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(0, { each: true })
  lines?: number[];
  @IsOptional() @IsBoolean() confirmUnused?: boolean;
}

export class DecisionDto {
  @IsIn(['approve', 'reject']) decision!: 'approve' | 'reject';
  /** Damaged goods only: send a replacement or refund in full. */
  @IsOptional() @IsIn(['refund', 'replacement']) resolution?:
    'refund' | 'replacement';
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class CompleteReturnDto {
  /** Goods turned out to be faulty: the delivery fee is refunded too. */
  @IsOptional() @IsBoolean() faulty?: boolean;
}
