import { Injectable, NotFoundException } from '@nestjs/common';
import { JsonStore } from '../storage/json-store.service';
import { ProductQueryDto, SuggestQueryDto } from './product-query.dto';
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

/** Words a person typed, lower-cased. Every word must match, in any order ("rose ribbon" finds "ribbon rose"). */
const words = (s: string) =>
  s.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
const hasAll = (text: string, tokens: string[]) =>
  tokens.every((t) => text.includes(t));

@Injectable()
export class CatalogueService {
  constructor(private readonly store: JsonStore) {}

  async list(q: ProductQueryDto): Promise<Page<ProductView>> {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 24;
    const tokens = words(q.q ?? '');

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
          (!tokens.length ||
            hasAll(`${p.name} ${p.description}`.toLowerCase(), tokens)),
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

  /**
   * What to offer while someone is still typing: the gifts whose name or description match, best matches first,
   * and the categories, feelings, occasions and recipients whose name matches (only those that have gifts to show).
   * Only gifts on the shop are offered. One or no letters offer nothing.
   */
  async suggest(q: SuggestQueryDto) {
    const needle = (q.q ?? '').trim().toLowerCase();
    const tokens = words(needle);
    if (needle.length < 2) return { products: [], groups: [] };

    const live = await this.store.read<Product, Product[]>('products', (all) =>
      all.filter((p) => p.isActive !== false && (!q.type || p.type === q.type)),
    );
    const rank = (p: Product) => {
      const name = p.name.toLowerCase();
      if (name.startsWith(needle)) return 0;
      if (name.split(/[^a-z0-9]+/).some((w) => w.startsWith(tokens[0])))
        return 1;
      return hasAll(name, tokens) ? 2 : 3; // 3: only the description matches
    };
    const products = live
      .filter((p) => hasAll(`${p.name} ${p.description}`.toLowerCase(), tokens))
      .sort(
        (a, b) =>
          rank(a) - rank(b) ||
          (b.reviewCount ?? 0) - (a.reviewCount ?? 0) ||
          a.name.localeCompare(b.name),
      )
      .slice(0, 6)
      .map((p) => ({
        slug: p.slug,
        name: p.name,
        price: effectivePrice(p),
        onOffer: p.offerPrice != null && p.offerPrice < p.price,
        imageUrl: p.imageUrls?.[0] ?? null,
      }));

    const groups = (
      await this.store.find<TaxonomyItem>('taxonomy', (t) =>
        hasAll(t.name.toLowerCase(), tokens),
      )
    )
      .map((t) => ({
        kind: t.kind,
        slug: t.slug,
        name: t.name,
        gifts: live.filter((p) => inGroup(p, t.kind, t.slug)).length,
        starts: t.name.toLowerCase().startsWith(needle) ? 0 : 1,
      }))
      .filter((g) => g.gifts > 0)
      .sort((a, b) => a.starts - b.starts || b.gifts - a.gifts)
      .slice(0, 5)
      .map(({ kind, slug, name, gifts }) => ({ kind, slug, name, gifts }));

    return { products, groups };
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
