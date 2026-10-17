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
import { Roles } from '../auth/auth.decorators';
import { AdminCatalogueService } from './admin-catalogue.service';
import {
  BulkGiftsDto,
  BulkVisibilityDto,
  CreateProductDto,
  ImportCatalogueDto,
  TaxonomyDto,
  UpdateProductDto,
  UpdateTaxonomyDto,
} from './admin-catalogue.dto';

/** Studio staff manage the catalogue here (E2-5). Image files need an object store; for now images are URLs. */
@Controller('admin')
@Roles('staff', 'admin')
export class AdminCatalogueController {
  constructor(private readonly admin: AdminCatalogueService) {}

  @Get('products')
  all() {
    return this.admin.all();
  }

  @Post('products')
  create(@Body() dto: CreateProductDto) {
    return this.admin.create(dto);
  }

  @Patch('products/:id')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.admin.update(id, dto);
  }

  @Delete('products/:id')
  @HttpCode(204)
  deactivate(@Param('id') id: string) {
    return this.admin.deactivate(id);
  }

  /** Adds the gifts and groups in two spreadsheets. Gifts already in the shop (same slug) are never changed. */
  /** Show or hide the gifts picked in the catalogue list. */
  @Post('products/bulk-visibility')
  @HttpCode(200)
  setVisibility(@Body() dto: BulkVisibilityDto) {
    return this.admin.setVisibility(dto.ids, dto.visible);
  }

  /** Permanent, for several gifts at once. Administrators only. */
  @Post('products/bulk-delete')
  @Roles('admin')
  @HttpCode(200)
  removeMany(@Body() dto: BulkGiftsDto) {
    return this.admin.removeMany(dto.ids);
  }

  /** Permanent. Hiding (the route above) is reversible; this is not, so it is for administrators only. */
  @Delete('products/:id/permanent')
  @Roles('admin')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.admin.remove(id);
  }

  @Post('catalogue/import')
  @HttpCode(200)
  importSpreadsheet(@Body() dto: ImportCatalogueDto) {
    return this.admin.importSpreadsheet(dto);
  }

  @Post('taxonomy')
  createTaxonomy(@Body() dto: TaxonomyDto) {
    return this.admin.createTaxonomy(dto);
  }

  @Patch('taxonomy/:id')
  updateTaxonomy(@Param('id') id: string, @Body() dto: UpdateTaxonomyDto) {
    return this.admin.updateTaxonomy(id, dto);
  }
}
