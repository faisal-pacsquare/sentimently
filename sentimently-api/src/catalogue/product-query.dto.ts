import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const SORTS = [
  'popularity',
  'price_asc',
  'price_desc',
  'rating',
  'newest',
] as const;
export type Sort = (typeof SORTS)[number];

export class ProductQueryDto {
  @IsOptional() @IsString() sentiment?: string;
  @IsOptional() @IsString() occasion?: string;
  @IsOptional() @IsString() recipient?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsIn(['physical', 'digital']) type?: 'physical' | 'digital';
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minPrice?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxPrice?: number;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsIn(SORTS) sort?: Sort;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
