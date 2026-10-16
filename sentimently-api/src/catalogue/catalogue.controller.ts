import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { Public } from '../auth/auth.decorators';
import { CatalogueService } from './catalogue.service';
import { ProductQueryDto } from './product-query.dto';

// Public catalogue data: the Vercel CDN may cache it briefly.
const CACHE = 'public, max-age=60, stale-while-revalidate=300';

@Controller()
@Public()
export class CatalogueController {
  constructor(private readonly catalogue: CatalogueService) {}

  @Get('products')
  @Header('Cache-Control', CACHE)
  list(@Query() q: ProductQueryDto) {
    return this.catalogue.list(q);
  }

  @Get('products/:slug')
  @Header('Cache-Control', CACHE)
  one(@Param('slug') slug: string) {
    return this.catalogue.bySlug(slug);
  }

  /** :kind is sentiments | occasions | recipients | categories */
  @Get('taxonomy/:kind')
  @Header('Cache-Control', CACHE)
  taxonomy(@Param('kind') kind: string) {
    return this.catalogue.taxonomy(kind);
  }

  @Get('taxonomy/:kind/:slug')
  @Header('Cache-Control', CACHE)
  hub(
    @Param('kind') kind: string,
    @Param('slug') slug: string,
    @Query() q: ProductQueryDto,
  ) {
    return this.catalogue.hub(kind, slug, q);
  }
}
