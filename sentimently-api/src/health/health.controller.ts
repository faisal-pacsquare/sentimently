import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Public } from '../auth/auth.decorators';
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
  ) {}

  @Get()
  async check() {
    try {
      await this.store.all('storeConfig');
    } catch {
      throw new ServiceUnavailableException('Data store is not reachable');
    }
    return { status: 'ok', store: this.driver.constructor.name };
  }
}
