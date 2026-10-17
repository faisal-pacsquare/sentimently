import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Product } from '../catalogue/product.types';
import { Customer } from '../customers/customer.types';
import { Doc } from '../storage/storage.types';
import { JsonStore } from '../storage/json-store.service';

export interface Review extends Doc {
  productId: string;
  customerId: string;
  rating: number;
  text?: string;
  verified: boolean;
  status: 'published' | 'hidden';
}

/**
 * Order shape this relies on (created in B4): { customerId, status, lines: [{ productId }] }.
 * A purchase counts once the order is paid or beyond.
 */
const PURCHASED = [
  'paid',
  'preparing',
  'in_production',
  'dispatched',
  'delivered',
];

@Injectable()
export class ReviewsService {
  constructor(private readonly store: JsonStore) {}

  private async product(slug: string) {
    const p = await this.store.findOne<Product>(
      'products',
      (x) => x.slug === slug && x.isActive !== false,
    );
    if (!p) throw new NotFoundException(`No gift with slug "${slug}"`);
    return p;
  }

  async listForProduct(slug: string) {
    const p = await this.product(slug);
    const [reviews, customers] = await Promise.all([
      this.store.find<Review>(
        'reviews',
        (r) => r.productId === p.id && r.status === 'published',
      ),
      this.store.all<Customer>('customers'),
    ]);
    const firstName = (id: string) =>
      customers.find((c) => c.id === id)?.name?.split(' ')[0] ?? 'Customer';
    return reviews
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => ({
        id: r.id,
        rating: r.rating,
        text: r.text,
        verified: r.verified,
        author: firstName(r.customerId),
        createdAt: r.createdAt,
      }));
  }

  /** Any signed-in customer may review. Only reviews from buyers (verified) count towards the rating. */
  async create(
    customerId: string,
    slug: string,
    dto: { rating: number; text?: string },
  ) {
    const p = await this.product(slug);
    const bought = await this.store.findOne<
      Doc & {
        customerId: string;
        status: string;
        lines?: { productId: string }[];
      }
    >(
      'orders',
      (o) =>
        o.customerId === customerId &&
        PURCHASED.includes(o.status) &&
        !!o.lines?.some((l) => l.productId === p.id),
    );
    const now = new Date().toISOString();
    const review: Review = {
      id: randomUUID(),
      productId: p.id,
      customerId,
      rating: dto.rating,
      text: dto.text,
      verified: !!bought,
      status: 'published',
      createdAt: now,
      updatedAt: now,
    };
    await this.store.mutate('reviews', (docs) => {
      if (
        docs.some(
          (d) =>
            (d as Review).productId === p.id &&
            (d as Review).customerId === customerId,
        )
      ) {
        throw new ConflictException('You have already reviewed this gift');
      }
      docs.push(review);
    });
    await this.recompute(p.id);
    return {
      id: review.id,
      rating: review.rating,
      text: review.text,
      verified: review.verified,
    };
  }

  // ---------- moderation (staff) ----------

  all() {
    return this.store.all<Review>('reviews');
  }

  async setStatus(id: string, status: 'published' | 'hidden') {
    const r = await this.store.update<Review>('reviews', id, { status });
    if (!r) throw new NotFoundException('Review not found');
    await this.recompute(r.productId);
    return r;
  }

  /** Deletes a review for good and updates the gift's rating without it. */
  async remove(id: string) {
    const gone = await this.store.mutate('reviews', (docs) => {
      const i = docs.findIndex((d) => d.id === id);
      return i < 0 ? undefined : (docs.splice(i, 1)[0] as Review);
    });
    if (!gone) throw new NotFoundException('Review not found');
    await this.recompute(gone.productId);
  }

  /** rating and reviewCount come only from published, verified reviews. */
  private async recompute(productId: string) {
    const counted = await this.store.find<Review>(
      'reviews',
      (r) =>
        r.productId === productId && r.status === 'published' && r.verified,
    );
    const rating = counted.length
      ? Math.round(
          (counted.reduce((s, r) => s + r.rating, 0) / counted.length) * 10,
        ) / 10
      : null;
    await this.store.update<Product>('products', productId, {
      rating,
      reviewCount: counted.length,
    });
  }
}
