import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Public } from '../auth/auth.decorators';
import { IMAGE_STORE, ImageStore } from '../images/image-store';
import { HttpMailer, MAILER, Mailer } from '../mail/mailer';
import { SkipThrottle } from '@nestjs/throttler';
import { JsonStore } from '../storage/json-store.service';
import { STORAGE_DRIVER, StorageDriver } from '../storage/storage.types';

@Controller('health')
@Public()
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly store: JsonStore,
    @Inject(STORAGE_DRIVER) private readonly driver: StorageDriver,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(IMAGE_STORE) private readonly images: ImageStore,
  ) {}

  @Get()
  async check() {
    try {
      await this.store.all('storeConfig');
    } catch {
      throw new ServiceUnavailableException('Data store is not reachable');
    }
    return {
      status: 'ok',
      store: this.driver.constructor.name,
      // "console" means emails are only logged, not sent
      mail:
        this.mailer instanceof HttpMailer ? this.mailer.provider : 'console',
      // "blob" = photo uploads work in production; "none" = create a Blob store (see DEPLOYMENT.md)
      images: this.images.kind,
    };
  }
}
