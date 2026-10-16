import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { DeliveryDto, QuoteLineDto } from '../pricing/quote.dto';
import { STATUSES, OrderStatus } from './order.types';

export class DigitalDetailsDto {
  @IsEmail() @MaxLength(254) recipientEmail!: string;
  @IsOptional() @IsString() @MaxLength(3600) message?: string;
  /** When to deliver. Leave out to send as soon as the order is paid. */
  @IsOptional() @IsDateString() sendAt?: string;
}

export class CheckoutLineDto extends QuoteLineDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => DigitalDetailsDto)
  digital?: DigitalDetailsDto;
}

export class CheckoutDeliveryDto extends DeliveryDto {
  @IsOptional() @IsString() @MinLength(10) @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MinLength(7) @MaxLength(30) phone?: string;
}

export class ContactInfoDto {
  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
}

export class CheckoutDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => CheckoutLineDto)
  lines!: CheckoutLineDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CheckoutDeliveryDto)
  delivery?: CheckoutDeliveryDto;
  @IsOptional() @IsString() @MaxLength(40) promoCode?: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => ContactInfoDto)
  contact?: ContactInfoDto;
  @IsIn(['cod', 'bank_transfer', 'card']) paymentMethod!:
    'cod' | 'bank_transfer' | 'card';
}

export class TrackDto {
  @IsString() @MaxLength(40) number!: string;
  @IsEmail() @MaxLength(254) email!: string;
}

export class TransitionDto {
  @IsIn(STATUSES) status!: OrderStatus;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsOptional() @IsString() @MaxLength(60) courier?: string;
  @IsOptional() @IsString() @MaxLength(100) trackingRef?: string;
}

export class AdminOrderQueryDto {
  /** One status or a comma-separated list, e.g. preparing,in_production */
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() from?: string; // YYYY-MM-DD
  @IsOptional() @IsString() to?: string;
  @IsOptional() @Type(() => Number) page?: number;
  @IsOptional() @Type(() => Number) pageSize?: number;
}
