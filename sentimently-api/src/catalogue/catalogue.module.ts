import { Module } from '@nestjs/common';
import { AdminCatalogueController } from './admin-catalogue.controller';
import { AdminCatalogueService } from './admin-catalogue.service';
import { CatalogueController } from './catalogue.controller';
import { CatalogueService } from './catalogue.service';

@Module({
  controllers: [CatalogueController, AdminCatalogueController],
  providers: [CatalogueService, AdminCatalogueService],
  exports: [CatalogueService],
})
export class CatalogueModule {}
