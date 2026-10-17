import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Global,
  Header,
  HttpCode,
  Inject,
  Module,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import type { Response } from 'express';
import { Public, Roles } from '../auth/auth.decorators';
import { Product } from '../catalogue/product.types';
import { JsonStore } from '../storage/json-store.service';
import {
  createImageStore,
  detectImage,
  IMAGE_STORE,
  ImageStore,
  LocalDiskStore,
  mimeFor,
} from './image-store';

/** The browser shrinks photos before sending, so this is generous. Vercel itself refuses bodies over 4.5 MB. */
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

export class DeleteImageDto {
  @IsString() @MaxLength(500) url!: string;
}

@Controller()
export class ImagesController {
  constructor(
    @Inject(IMAGE_STORE) private readonly images: ImageStore,
    private readonly store: JsonStore,
  ) {}

  /** Upload one photo (field name "file"). Returns the address to save on the gift. */
  @Post('admin/images')
  @Roles('staff', 'admin')
  @HttpCode(201)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_PHOTO_BYTES, files: 1 },
    }),
  )
  async upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file)
      throw new BadRequestException([
        'Choose a photo to upload (field "file")',
      ]);
    const kind = detectImage(file.buffer);
    if (!kind)
      throw new BadRequestException([
        'That file is not a photo we can use. Use a JPEG, PNG, WebP or GIF image.',
      ]);
    const url = await this.images.put(file.buffer, kind.ext, kind.contentType);
    return { url };
  }

  /** Removes an uploaded photo, unless a gift still uses it. Links to other sites are never touched. */
  @Delete('admin/images')
  @Roles('staff', 'admin')
  @HttpCode(204)
  async remove(@Body() dto: DeleteImageDto) {
    if (!this.images.owns(dto.url))
      throw new BadRequestException([
        'That is not a photo uploaded here, so it cannot be deleted from here',
      ]);
    const users = await this.store.find<Product>(
      'products',
      (p) => !!p.imageUrls?.includes(dto.url),
    );
    if (users.length)
      throw new ConflictException(
        `This photo is still used by "${users[0]!.name}". Remove it from the gift first.`,
      );
    await this.images.remove(dto.url);
  }

  /** Development only: serves photos saved to this computer. (In production they come straight from Vercel Blob.) */
  @Get('uploads/:file')
  @Public()
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('X-Content-Type-Options', 'nosniff')
  async serve(@Param('file') file: string, @Res() res: Response) {
    if (!(this.images instanceof LocalDiskStore))
      throw new NotFoundException('Not found');
    const data = await this.images.read(file);
    if (!data) throw new NotFoundException('Not found');
    res.type(mimeFor(file) ?? 'application/octet-stream').send(data);
  }
}

@Global()
@Module({
  controllers: [ImagesController],
  providers: [{ provide: IMAGE_STORE, useFactory: () => createImageStore() }],
  exports: [IMAGE_STORE],
})
export class ImagesModule {}
