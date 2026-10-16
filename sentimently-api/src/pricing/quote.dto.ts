import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** The prototype shows 8 relationships and 4 card designs; the names were not captured, so these are assumed. */
export const RELATIONSHIPS = [
  'partner',
  'spouse',
  'parent',
  'child',
  'sibling',
  'friend',
  'colleague',
  'other',
] as const;
export const CARD_DESIGNS = [
  'classic',
  'floral',
  'minimal',
  'festive',
] as const;
export const MESSAGE_MAX_CHARS = 900; // PZ-03

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class PersonalisationDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'recipientName is required' })
  @MaxLength(100) // PZ-01
  recipientName!: string;

  @IsIn(RELATIONSHIPS) relationship!: (typeof RELATIONSHIPS)[number]; // PZ-02
  @IsIn(CARD_DESIGNS) cardDesign!: (typeof CARD_DESIGNS)[number]; // PZ-05

  // The 900-character rule is checked in the service (counts characters, not UTF-16 units). This only bounds the payload.
  @IsOptional() @IsString() @MaxLength(3600) message?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  extras?: string[];
}

export class QuoteLineDto {
  @IsString() @MaxLength(100) productId!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(20) quantity!: number;
  @IsOptional()
  @ValidateNested()
  @Type(() => PersonalisationDto)
  personalisation?: PersonalisationDto;
}

export class DeliveryDto {
  @IsOptional() @IsString() @MaxLength(60) city?: string;
  @IsOptional() @IsIn(['address', 'gift_link']) method?:
    'address' | 'gift_link';
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must look like 2027-03-01' })
  date?: string;
  @IsOptional()
  @IsIn(['PK'], { message: 'We only deliver within Pakistan' })
  country?: string; // DL-10
}

export class QuoteDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => QuoteLineDto)
  lines!: QuoteLineDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => DeliveryDto)
  delivery?: DeliveryDto;
  @IsOptional() @IsString() @MaxLength(40) promoCode?: string;
  /** Lets a guest use a first-gift code: we check whether this email has ordered before. */
  @IsOptional() @IsEmail() email?: string;
}
