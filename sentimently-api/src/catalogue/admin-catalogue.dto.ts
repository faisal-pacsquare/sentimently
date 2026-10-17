import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lower-case words joined by hyphens',
  })
  @MaxLength(100)
  slug!: string;

  @IsString() @MaxLength(150) name!: string;
  @IsString() @MaxLength(5000) description!: string;
  @Type(() => Number) @IsInt() @Min(0) price!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offerPrice?: number | null;
  @IsIn(['physical', 'digital']) type!: 'physical' | 'digital';
  @Type(() => Number) @IsInt() @Min(0) stock!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) leadTimeMinDays?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) leadTimeMaxDays?: number;
  @IsOptional() @IsBoolean() isMadeToOrder?: boolean;
  @IsOptional() @IsBoolean() isPerishable?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsIn(['egift', 'greeting']) digitalKind?: 'egift' | 'greeting';
  @IsString() category!: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  sentiments?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  occasions?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  recipients?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  allowedExtras?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  // A full https:// link, or an address on this site (a photo uploaded in local development).
  @Matches(/^(https?:\/\/\S+|\/[^\s]*)$/, {
    each: true,
    message: 'each photo must be a web link or an uploaded photo',
  })
  @MaxLength(500, { each: true })
  imageUrls?: string[];
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class TaxonomyDto {
  @IsIn(['sentiment', 'occasion', 'recipient', 'category']) kind!:
    'sentiment' | 'occasion' | 'recipient' | 'category';
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(100) slug!: string;
  @IsString() @MaxLength(100) name!: string;
  @IsOptional() @IsString() @MaxLength(500) blurb?: string;
  @IsOptional() @IsUrl({ require_tld: false }) image?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateTaxonomyDto extends PartialType(TaxonomyDto) {}

/** The catalogue spreadsheets, as text. The same two files the `import:catalogue` command reads. */
export class ImportCatalogueDto {
  @IsOptional() @IsString() @MaxLength(90_000) taxonomyCsv?: string;
  @IsString() @MaxLength(90_000) productsCsv!: string;
  /** Check the files and report, without saving anything. */
  @IsOptional() @IsBoolean() dryRun?: boolean;
}
