import {
  BadRequestException,
  Inject,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { JsonStore } from '../storage/json-store.service';
import {
  CreateProductDto,
  TaxonomyDto,
  UpdateProductDto,
  UpdateTaxonomyDto,
} from './admin-catalogue.dto';
import { Logger } from '@nestjs/common';
import { IMAGE_STORE, ImageStore } from '../images/image-store';
import { Product, TaxonomyItem, TaxonomyKind } from './product.types';

@Injectable()
export class AdminCatalogueService {
  private readonly logger = new Logger('AdminCatalogue');

  constructor(
    private readonly store: JsonStore,
    @Inject(IMAGE_STORE) private readonly images: ImageStore,
  ) {}

  /** Photos a gift no longer lists are deleted from the photo store (links to other sites are left alone). */
  private async dropPhotos(
    before: string[] | undefined,
    after: string[] | undefined,
  ) {
    const kept = new Set(after ?? []);
    for (const url of before ?? []) {
      if (kept.has(url) || !this.images.owns(url)) continue;
      try {
        await this.images.remove(url);
      } catch (e) {
        this.logger.warn(`Could not delete the photo ${url}: ${String(e)}`);
      }
    }
  }

  /** Includes inactive gifts, which the public catalogue hides. */
  all() {
    return this.store.all<Product>('products');
  }

  async create(dto: CreateProductDto) {
    await this.validate(dto);
    const now = new Date().toISOString();
    const product = {
      ...dto,
      id: randomUUID(),
      isActive: dto.isActive ?? true,
      reviewCount: 0,
      rating: null,
      createdAt: now,
      updatedAt: now,
    } as Product;
    await this.store.mutate('products', (docs) => {
      if (docs.some((d) => (d as Product).slug === dto.slug))
        throw new ConflictException(
          `A gift with slug "${dto.slug}" already exists`,
        );
      docs.push(product);
    });
    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    const current = await this.store.get<Product>('products', id);
    if (!current) throw new NotFoundException('Gift not found');
    const next = { ...current, ...dto };
    await this.validate(next as CreateProductDto);
    const saved = await this.store.mutate('products', (docs) => {
      if (
        dto.slug &&
        docs.some((d) => d.id !== id && (d as Product).slug === dto.slug)
      ) {
        throw new ConflictException(
          `A gift with slug "${dto.slug}" already exists`,
        );
      }
      const i = docs.findIndex((d) => d.id === id);
      if (i < 0) throw new NotFoundException('Gift not found');
      docs[i] = { ...docs[i], ...dto, id, updatedAt: new Date().toISOString() };
      return docs[i] as Product;
    });
    if (dto.imageUrls) await this.dropPhotos(current.imageUrls, dto.imageUrls);
    return saved;
  }

  /** Gifts are hidden, not deleted, so past orders keep pointing at them. */
  async deactivate(id: string) {
    const p = await this.store.update<Product>('products', id, {
      isActive: false,
    });
    if (!p) throw new NotFoundException('Gift not found');
  }

  async createTaxonomy(dto: TaxonomyDto) {
    const now = new Date().toISOString();
    const item = {
      ...dto,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    } as TaxonomyItem;
    await this.store.mutate('taxonomy', (docs) => {
      if (
        docs.some(
          (d) =>
            (d as TaxonomyItem).kind === dto.kind &&
            (d as TaxonomyItem).slug === dto.slug,
        )
      ) {
        throw new ConflictException(`${dto.kind} "${dto.slug}" already exists`);
      }
      docs.push(item);
    });
    return item;
  }

  async updateTaxonomy(id: string, dto: UpdateTaxonomyDto) {
    const t = await this.store.update<TaxonomyItem>(
      'taxonomy',
      id,
      dto as Partial<TaxonomyItem>,
    );
    if (!t) throw new NotFoundException('Group not found');
    return t;
  }

  private async validate(p: CreateProductDto) {
    if (p.offerPrice != null && p.offerPrice >= p.price)
      throw new BadRequestException('offerPrice must be lower than price');
    if (
      p.leadTimeMinDays != null &&
      p.leadTimeMaxDays != null &&
      p.leadTimeMinDays > p.leadTimeMaxDays
    ) {
      throw new BadRequestException(
        'leadTimeMinDays cannot be greater than leadTimeMaxDays',
      );
    }
    const [taxonomy, extras] = await Promise.all([
      this.store.all<TaxonomyItem>('taxonomy'),
      this.store.all('extras'),
    ]);
    const has = (kind: TaxonomyKind, slug: string) =>
      taxonomy.some((t) => t.kind === kind && t.slug === slug);
    const unknown = [
      ...(has('category', p.category) ? [] : [`category "${p.category}"`]),
      ...(p.sentiments ?? [])
        .filter((s) => !has('sentiment', s))
        .map((s) => `sentiment "${s}"`),
      ...(p.occasions ?? [])
        .filter((s) => !has('occasion', s))
        .map((s) => `occasion "${s}"`),
      ...(p.recipients ?? [])
        .filter((s) => !has('recipient', s))
        .map((s) => `recipient "${s}"`),
      ...(p.allowedExtras ?? [])
        .filter((e) => !extras.some((x) => x.id === e))
        .map((e) => `extra "${e}"`),
    ];
    if (unknown.length)
      throw new BadRequestException(`Unknown: ${unknown.join(', ')}`);
  }
}
