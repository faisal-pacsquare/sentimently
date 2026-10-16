import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ClaimOrderDto {
  @IsString() @MaxLength(40) number!: string;
  @IsEmail() @MaxLength(254) email!: string;
}

export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
}

export class CreateReminderDto {
  @IsString() @MaxLength(100) label!: string;
  @IsDateString() date!: string;
  @IsOptional() @IsString() @MaxLength(100) recipientName?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  notifyDaysBefore?: number;
}

export class UpdateReminderDto {
  @IsOptional() @IsString() @MaxLength(100) label?: string;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsString() @MaxLength(100) recipientName?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  notifyDaysBefore?: number;
}
