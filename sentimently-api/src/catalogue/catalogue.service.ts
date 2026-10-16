import { Injectable, NotFoundException } from '@nestjs/common';
import { JsonStore } from '../storage/json-store.service';
import { ProductQueryDto } from './product-query.dto';
import {
  Page,
  Product,
  ProductView,
  TaxonomyItem,
  TaxonomyKind,
} from './product.types';

const KIND_BY_PATH: Record<string, TaxonomyKind> = {
  sentiments: 'sentiment',
  occasions: 'occasion',
  recipients: 'recipient',
  categories: 'category',
};

/** Which ProductQueryDto filter and which Product field belong to each taxonomy kind. */
const FILTER_BY_KIND: Record<TaxonomyKind, keyof ProductQueryDto> = {
  sentiment: 'sentiment',
  occasion: 'occasion',
  recipient: 'recipient',
  category: 'category',
};

export const effectivePrice = (p: Product) => p.offerPrice ?? p.price; // PR-06

const view = (p: Product): ProductView => ({
  ...p,
  effectivePrice: effectivePrice(p),
  onOffer: p.offerPrice != null && p.offerPrice < p.price,
});

function inGroup(p: Product, kind: TaxonomyKind, slug: string): boolean {
  switch (kind) {
    case 'category':
      return p.category === slug;
    case 'sentiment':
      return !!p.sentiments?.includes(slug);
    case 'occasion':
      return !!p.occasions?.includes(slug);
    case 'recipient':
      return !!p.recipients?.includes(slug);
  }
}

@Injectable()
export class CatalogueService {
  constructor(private readonly store: JsonStore) {}

  async list(q: ProductQueryDto): Promise<Page<ProductView>> {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 24;
    const needle = q.q?.trim().toLowerCase();

    return this.store.read<Product, Page<ProductView>>('products', (all) => {
      const items = all.filter(
        (p) =>
          p.isActive !== false &&
          (!q.sentiment || inGroup(p, 'sentiment', q.sentiment)) &&
          (!q.occasion || inGroup(p, 'occasion', q.occasion)) &&
          (!q.recipient || inGroup(p, 'recipient', q.recipient)) &&
          (!q.category || inGroup(p, 'category', q.category)) &&
          (!q.type || p.type === q.type) &&
          (q.minPrice === undefined || effectivePrice(p) >= q.minPrice) &&
          (q.maxPrice === undefined || effectivePrice(p) <= q.maxPrice) &&
          (!needle ||
            `${p.name} ${p.description}`.toLowerCase().includes(needle)),
      );

      const sorters: Record<string, (a: Product, b: Product) => number> = {
        popularity: (a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0),
        price_asc: (a, b) => effectivePrice(a) - effectivePrice(b),
        price_desc: (a, b) => effectivePrice(b) - effectivePrice(a),
        rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
        newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
      };
      items.sort(sorters[q.sort ?? 'popularity']);

      const start = (page - 1) * pageSize;
      return {
        data: items.slice(start, start + pageSize).map(view),
        page,
        pageSize,
        total: items.length,
      };
    });
  }

  async bySlug(slug: string): Promise<ProductView> {
    const p = await this.store.findOne<Product>(
      'products',
      (x) => x.slug === slug && x.isActive !== false,
    );
    if (!p) throw new NotFoundException(`No gift with slug "${slug}"`);
    return view(p);
  }

  kind(path: string): TaxonomyKind {
    const k = KIND_BY_PATH[path];
    if (!k) throw new NotFoundException(`Unknown group "${path}"`);
    return k;
  }

  /** All items of one taxonomy kind with the number of active gifts in each. */
  async taxonomy(path: string) {
    const kind = this.kind(path);
    const items = await this.store.find<TaxonomyItem>(
      'taxonomy',
      (t) => t.kind === kind,
    );
    items.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const counts = await this.store.read<Product, number[]>(
      'products',
      (all) => {
        const active = all.filter((p) => p.isActive !== false);
        return items.map(
          (t) => active.filter((p) => inGroup(p, kind, t.slug)).length,
        );
      },
    );
    return items.map((t, i) => ({ ...t, productCount: counts[i] }));
  }

  /** A browse hub: the group plus the same filtered product grid. */
  async hub(path: string, slug: string, q: ProductQueryDto) {
    const kind = this.kind(path);
    const hub = await this.store.findOne<TaxonomyItem>(
      'taxonomy',
      (t) => t.kind === kind && t.slug === slug,
    );
    if (!hub) throw new NotFoundException(`No ${kind} "${slug}"`);
    const products = await this.list({ ...q, [FILTER_BY_KIND[kind]]: slug });
    return { hub, products };
  }
}
