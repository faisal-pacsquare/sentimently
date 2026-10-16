import { ApiError, leadTimeText, rupees } from '@sentimently/api';
import type { Product as ProductT, Review } from '@sentimently/api';
import { Badge, Button, Container, Price, SafeImage, Stars } from '@sentimently/ui';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useBasket } from '../lib/basket';
import { AccountBits } from '../components/AccountBits';
import { QueryError } from '../lib/present';
import { useProduct, useReviews, useStoreSettings } from '../lib/queries';
import { NotFound } from './NotFound';

function Gallery({ product }: { product: ProductT }) {
  const images = product.imageUrls ?? [];
  const [index, setIndex] = useState(0);
  const current = images[index];
  return (
    <div className="gallery">
      <div className="gallery__main" role="img" aria-label={current ? product.name : `${product.name}: photo coming soon`}>
        <SafeImage key={current ?? 'none'} src={current} name={product.name} eager />
      </div>
      {images.length > 1 && (
        <ul className="gallery__thumbs" role="list" aria-label="More photos">
          {images.map((src, i) => (
            <li key={src}>
              <button type="button" onClick={() => setIndex(i)} aria-label={`Photo ${i + 1} of ${images.length}`} aria-pressed={i === index}>
                <SafeImage src={src} name={product.name} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DeliveryNote({ product }: { product: ProductT }) {
  const { data } = useStoreSettings();
  const lead = leadTimeText(product.leadTimeMinDays, product.leadTimeMaxDays);
  return (
    <ul className="facts" role="list">
      {product.type === 'digital' && <li>Sent by email in minutes, or at the date and time you choose.</li>}
      {product.isMadeToOrder && lead && <li>Made to order: about {lead} before it leaves the studio.</li>}
      {product.isPerishable && <li>Fresh gift: it can be scheduled up to 3 days ahead.</li>}
      {product.type === 'physical' && data && <li>Free delivery on orders over {rupees(data.freeDeliveryThreshold)}.</li>}
      {product.type === 'physical' && data && <li>Order before {data.sameDayCutoffHour > 12 ? data.sameDayCutoffHour - 12 : data.sameDayCutoffHour}pm for same-day delivery in Karachi, Lahore, Islamabad and Rawalpindi.</li>}
      <li><Link to="/delivery">Delivery and returns</Link></li>
    </ul>
  );
}

function Reviews({ slug }: { slug: string }) {
  const { data, error, isPending, refetch, isFetching } = useReviews(slug);
  return (
    <section className="reviews" aria-labelledby="reviews-h">
      <h2 id="reviews-h">Reviews</h2>
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} retrying={isFetching} what="the reviews" />
      ) : isPending ? (
        <p aria-busy="true">Loading reviews…</p>
      ) : !data.length ? (
        <p>No reviews yet.</p>
      ) : (
        <ul role="list" className="review-list">
          {data.map((r: Review) => (
            <li key={r.id}>
              <p className="review__top">
                <strong>{r.author}</strong>
                {r.verified && <Badge tone="digital">Verified purchase</Badge>}
                <span className="review__stars" aria-label={`${r.rating} out of 5`}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
              </p>
              {r.text && <p>{r.text}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ProductView({ product }: { product: ProductT }) {
  const basket = useBasket();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const soldOut = !product.isMadeToOrder && product.stock <= 0;
  const maxQuantity = product.isMadeToOrder ? 10 : Math.max(1, Math.min(10, product.stock));
  const lowStock = !product.isMadeToOrder && product.stock > 0 && product.stock <= 5;
  const canPersonalise = product.type === 'physical';

  const add = () => {
    basket.add({
      productId: product.id, slug: product.slug, name: product.name, image: product.imageUrls?.[0],
      type: product.type, hintPrice: product.effectivePrice, quantity,
    });
    setAdded(true);
  };

  return (
    <Container className="page">
      <title>{`${product.name} | Sentimently`}</title>
      <nav aria-label="Breadcrumb" className="crumbs">
        <Link to="/shop">All gifts</Link> / <span aria-current="page">{product.name}</span>
      </nav>
      <div className="product">
        <Gallery product={product} />
        <div className="product__info">
          <h1>{product.name}</h1>
          <p className="product__rating"><Stars rating={product.rating} count={product.reviewCount} /></p>
          <p className="product__price">
            <Price price={product.price} offerPrice={product.offerPrice} />
            {product.onOffer && <Badge tone="offer">On offer</Badge>}
            {product.type === 'digital' && <Badge tone="digital">Digital</Badge>}
          </p>
          <p className="product__desc">{product.description}</p>

          {soldOut ? (
            <p className="sy-alert sy-alert--warn" role="status">This gift is sold out right now.</p>
          ) : (
            <>
              {lowStock && <p className="sy-alert sy-alert--warn" role="status">Only {product.stock} left.</p>}
              <div className="product__buy">
                {canPersonalise && (
                  <Button as={Link} to={`/studio/${product.slug}`} size="normal">Personalise</Button>
                )}
                <label className="qty">
                  <span className="sy-sr-only">Quantity</span>
                  <select className="sy-input" value={quantity} onChange={(e) => { setQuantity(Number(e.target.value)); setAdded(false); }}>
                    {Array.from({ length: maxQuantity }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <Button variant={canPersonalise ? 'secondary' : 'primary'} onClick={add}>
                  {canPersonalise ? 'Add without personalising' : 'Add to gift box'}
                </Button>
              </div>
              <p aria-live="polite" className="added">
                {added && (
                  <>
                    Added to your gift box. <Link to="/box">View gift box</Link>
                  </>
                )}
              </p>
            </>
          )}
          <AccountBits.Wishlist product={product} />
          <DeliveryNote product={product} />
        </div>
      </div>
      <Reviews slug={product.slug} />
      <AccountBits product={product} />
    </Container>
  );
}

export function Product() {
  const { slug = '' } = useParams();
  const { data, error, isPending, refetch, isFetching } = useProduct(slug);
  if (error) {
    // 404 is a real "no such gift". Anything else is a failure to load, and gets a retry, not "not found".
    if (error instanceof ApiError && error.isNotFound) return <NotFound what="that gift" />;
    return <Container className="page"><QueryError error={error} onRetry={() => refetch()} retrying={isFetching} what="this gift" /></Container>;
  }
  if (isPending) return <Container className="page"><div className="sy-skeleton" style={{ height: '22rem' }} aria-busy="true" aria-label="Loading gift" /></Container>;
  return <ProductView product={data} />;
}
