import {
  BadRequestException,
  Inject,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { JsonStore } from '../storage/json-store.service';
import { buildCatalogue, parseCsv } from './catalogue-import';
import {
  CreateProductDto,
  ImportCatalogueDto,
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

  /**
   * Deletes gifts for good, with what hangs off them: wishlist entries, reviews and the photos uploaded for them.
   * Past orders are not touched: each order line keeps its own copy of the gift's name, price and slug.
   * Ids that are not in the shop are skipped, so a second click or a stale list does no harm.
   */
  async removeMany(ids: string[]) {
    const wanted = new Set(ids);
    const gone = await this.store.mutate('products', (docs) => {
      const removed: Product[] = [];
      for (let i = docs.length - 1; i >= 0; i--)
        if (wanted.has(docs[i].id))
          removed.push(...(docs.splice(i, 1) as Product[]));
      return removed;
    });
    if (gone.length) {
      const gift = new Set(gone.map((p) => p.id));
      for (const collection of ['wishlists', 'reviews'] as const)
        await this.store.mutate(collection, (docs) => {
          for (let i = docs.length - 1; i >= 0; i--)
            if (gift.has((docs[i] as { productId?: string }).productId ?? ''))
              docs.splice(i, 1);
        });
      for (const p of gone) await this.dropPhotos(p.imageUrls, []);
    }
    return { deleted: gone.length, notFound: wanted.size - gone.length };
  }

  async remove(id: string) {
    const { deleted } = await this.removeMany([id]);
    if (!deleted) throw new NotFoundException('Gift not found');
  }

  /** Shows or hides several gifts at once. Hidden gifts keep everything and can be shown again. */
  async setVisibility(ids: string[], visible: boolean) {
    const wanted = new Set(ids);
    const changed = await this.store.mutate('products', (docs) => {
      let n = 0;
      for (const d of docs)
        if (wanted.has(d.id) && (d as Product).isActive !== visible) {
          (d as Product).isActive = visible;
          d.updatedAt = new Date().toISOString();
          n++;
        }
      return n;
    });
    return { changed };
  }

  /**
   * Adds new gifts (and any new groups) from the studio's two spreadsheets, with every row checked first.
   * Nothing is saved unless every row is valid. A gift whose slug is already in the shop is left exactly as it is,
   * so photos and prices edited here are never overwritten, and running the same files twice adds nothing new.
   */
  async importSpreadsheet(dto: ImportCatalogueDto) {
    const [taxonomy, products, extras] = await Promise.all([
      this.store.all<TaxonomyItem>('taxonomy'),
      this.store.all<Product>('products'),
      this.store.all('extras'),
    ]);
    const csv = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const groupKey = (kind: string, slug: string) => `${kind}/${slug}`;
    const haveGroups = new Set(taxonomy.map((t) => groupKey(t.kind, t.slug)));
    const lines = taxonomy.map((t) =>
      [t.kind, t.slug, t.name, t.blurb, t.image, t.sortOrder]
        .map(csv)
        .join(','),
    );
    // New groups from the file are added after the shop's own, so the products can refer to either.
    const incoming = dto.taxonomyCsv ? parseCsv(dto.taxonomyCsv) : [];
    const header = (incoming[0] ?? []).map((h) => h.trim());
    const col = (row: string[], name: string) =>
      (row[header.indexOf(name)] ?? '').trim();
    for (const row of incoming.slice(1)) {
      const key = groupKey(col(row, 'kind').toLowerCase(), col(row, 'slug'));
      if (haveGroups.has(key)) continue;
      lines.push(
        [
          col(row, 'kind'),
          col(row, 'slug'),
          col(row, 'name'),
          col(row, 'blurb'),
          col(row, 'image'),
          col(row, 'sortOrder'),
        ]
          .map(csv)
          .join(','),
      );
    }
    const result = buildCatalogue({
      taxonomyCsv: ['kind,slug,name,blurb,image,sortOrder', ...lines].join(
        '\n',
      ),
      productsCsv: dto.productsCsv,
      extraCodes: extras.map((e) => e.id),
      existingProducts: products,
    });
    if (result.errors.length)
      throw new BadRequestException({ message: result.errors.slice(0, 30) });

    const haveSlugs = new Set(products.map((p) => p.slug));
    const newGroups = result.taxonomy.filter(
      (t) => !haveGroups.has(groupKey(t.kind, t.slug)),
    );
    const newGifts = result.products.filter((p) => !haveSlugs.has(p.slug));
    const skipped = result.products.filter((p) => haveSlugs.has(p.slug));

    if (!dto.dryRun) {
      if (newGroups.length)
        await this.store.mutate('taxonomy', (docs) => {
          for (const g of newGroups)
            if (
              !docs.some(
                (d) =>
                  (d as TaxonomyItem).kind === g.kind &&
                  (d as TaxonomyItem).slug === g.slug,
              )
            )
              docs.push(g);
        });
      if (newGifts.length)
        await this.store.mutate('products', (docs) => {
          for (const p of newGifts)
            if (!docs.some((d) => (d as Product).slug === p.slug)) docs.push(p);
        });
    }
    return {
      saved: !dto.dryRun,
      addedGifts: newGifts.map((p) => p.name),
      skippedGifts: skipped.map((p) => p.name),
      addedGroups: newGroups.map((g) => `${g.kind}: ${g.name}`),
      warnings: result.warnings.filter((w) => /no image/.test(w)),
    };
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

  /**
   * Deletes a category, feeling, occasion or recipient group.
   * A category that still has gifts (hidden ones too) can only be deleted by naming another category to move them to.
   * For the other kinds the gifts stay and simply lose that tag.
   */
  async removeTaxonomy(id: string, moveTo?: string) {
    const [group, products] = await Promise.all([
      this.store.get<TaxonomyItem>('taxonomy', id),
      this.store.all<Product>('products'),
    ]);
    if (!group) throw new NotFoundException('Group not found');
    const FIELD = {
      sentiment: 'sentiments',
      occasion: 'occasions',
      recipient: 'recipients',
    } as const;
    const uses = (p: Product) =>
      group.kind === 'category'
        ? p.category === group.slug
        : (p[FIELD[group.kind]] ?? []).includes(group.slug);
    const using = products.filter(uses);

    if (group.kind === 'category' && using.length) {
      if (!moveTo)
        throw new ConflictException(
          `${using.length} ${using.length === 1 ? 'gift is' : 'gifts are'} in this category. Choose another category to move ${using.length === 1 ? 'it' : 'them'} to first.`,
        );
      if (moveTo === group.slug)
        throw new BadRequestException(
          'Choose a different category to move the gifts to',
        );
      const target = await this.store.findOne<TaxonomyItem>(
        'taxonomy',
        (t) => t.kind === 'category' && t.slug === moveTo,
      );
      if (!target)
        throw new BadRequestException(
          'The category to move the gifts to does not exist',
        );
    }

    const ids = new Set(using.map((p) => p.id));
    if (ids.size)
      await this.store.mutate('products', (docs) => {
        for (const d of docs) {
          if (!ids.has(d.id)) continue;
          const p = d as Product;
          if (group.kind === 'category') p.category = moveTo as string;
          else {
            const f = FIELD[group.kind];
            p[f] = (p[f] ?? []).filter((s) => s !== group.slug);
          }
          p.updatedAt = new Date().toISOString();
        }
      });
    await this.store.remove('taxonomy', id);
    return { giftsUpdated: ids.size };
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
