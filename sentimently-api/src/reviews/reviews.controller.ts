import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CurrentUser, Public, Roles } from '../auth/auth.decorators';
import type { AuthUser } from '../customers/customer.types';
import { ReviewsService } from './reviews.service';

export class CreateReviewDto {
  @IsInt() @Min(1) @Max(5) rating!: number;
  @IsOptional() @IsString() @MaxLength(2000) text?: string;
}

export class ModerateReviewDto {
  @IsIn(['published', 'hidden']) status!: 'published' | 'hidden';
}

@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('products/:slug/reviews')
  @Public()
  list(@Param('slug') slug: string) {
    return this.reviews.listForProduct(slug);
  }

  @Post('products/:slug/reviews')
  create(
    @CurrentUser() u: AuthUser,
    @Param('slug') slug: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviews.create(u.id, slug, dto);
  }

  @Get('admin/reviews')
  @Roles('staff', 'admin')
  all() {
    return this.reviews.all();
  }

  /** Permanent. Hiding is reversible; this is not, so it is for administrators only. */
  @Delete('admin/reviews/:id')
  @Roles('admin')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.reviews.remove(id);
  }

  @Patch('admin/reviews/:id')
  @Roles('staff', 'admin')
  moderate(@Param('id') id: string, @Body() dto: ModerateReviewDto) {
    return this.reviews.setStatus(id, dto.status);
  }
}
