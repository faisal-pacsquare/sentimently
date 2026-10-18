import { rupees } from '@sentimently/api';
import { Button, Chip, Container, EmptyState, SafeImage } from '@sentimently/ui';
import { Link } from 'react-router-dom';
import { ProductGrid } from '../components/ProductGrid';
import { useProducts, useStoreSettings, useTaxonomy } from '../lib/queries';
import { QueryError } from '../lib/present';

const TILES = ['tile--rose', 'tile--gold', 'tile--plum', 'tile--sage', 'tile--sky'];

function Collage() {
  const { data } = useProducts({ sort: 'popularity', pageSize: 3 });
  const items = (data?.data ?? []).slice(0, 3);
  return (
    <div className="collage" aria-hidden={items.length ? undefined : true}>
      <span className="collage__blob collage__blob--a" aria-hidden="true" />
      <span className="collage__blob collage__blob--b" aria-hidden="true" />
      {items.length === 0 ? (
        <div className="collage__empty" aria-hidden="true"><span>♡</span></div>
      ) : (
        items.map((p, i) => (
          <Link key={p.id} to={`/gifts/${p.slug}`} className={`collage__card collage__card--${i + 1}`} aria-label={`${p.name}, ${rupees(p.effectivePrice)}`}>
            <span className="collage__img"><SafeImage src={p.imageUrls?.[0]} name={p.name} eager /></span>
            <span className="collage__label">
              <span className="collage__name">{p.name}</span>
              <span className="collage__price">{rupees(p.effectivePrice)}</span>
            </span>
          </Link>
        ))
      )}
    </div>
  );
}

function Trust() {
  const { data } = useStoreSettings();
  const items = [
    { icon: '✦', title: 'Made personal', text: 'Your words, your card, your packaging.' },
    { icon: '➶', title: 'Same-day delivery', text: 'In our biggest cities, when you order early.' },
    { icon: '◈', title: data ? `Free over ${rupees(data.freeDeliveryThreshold)}` : 'Free delivery', text: 'Cash on delivery available.' },
    { icon: '❀', title: 'Handmade with care', text: 'Ribbon flowers and keepsakes made to order.' },
  ];
  return (
    <section className="trust" aria-label="Why Bloomora">
      <Container>
        <ul role="list" className="trust__list">
          {items.map((t) => (
            <li key={t.title}>
              <span className="trust__icon" aria-hidden="true">{t.icon}</span>
              <span><strong>{t.title}</strong><span className="trust__text">{t.text}</span></span>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

function Feelings() {
  const { data, error, isPending, refetch, isFetching } = useTaxonomy('feelings');
  return (
    <section className="section" aria-labelledby="feelings-h">
      <Container>
        <p className="eyebrow">Start with a feeling</p>
        <h2 id="feelings-h" className="section__title">What do you want to <em className="accent">say</em>?</h2>
        {error ? (
          <QueryError error={error} onRetry={() => refetch()} retrying={isFetching} what="the feelings" />
        ) : isPending ? (
          <p aria-busy="true">Loading feelings…</p>
        ) : !data.length ? (
          <EmptyState title="Our gifts are being added" message="Please check back very soon." />
        ) : (
          <ul className="tiles" role="list">
            {data.map((t, i) => (
              <li key={t.slug}>
                <Link to={`/browse/feelings/${t.slug}`} className={`tile ${TILES[i % TILES.length]}`} aria-labelledby={`tile-${t.slug}`} aria-describedby={t.blurb ? `tile-${t.slug}-d` : undefined}>
                  <span className="tile__num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                  <span className="tile__name" id={`tile-${t.slug}`}>{t.name}</span>
                  {t.blurb && <span className="tile__blurb" id={`tile-${t.slug}-d`}>{t.blurb}</span>}
                  <span className="tile__go" aria-hidden="true">Explore →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </section>
  );
}

function Occasions() {
  const { data } = useTaxonomy('occasions');
  if (!data?.length) return null; // optional section: leave it out rather than show an error
  return (
    <section className="section section--tight" aria-labelledby="occasions-h">
      <Container>
        <p className="eyebrow">For every moment</p>
        <h2 id="occasions-h" className="section__title">Shop by occasion</h2>
        <ul className="chip-row chip-row--left" role="list">
          {data.map((t) => (
            <li key={t.slug}>
              <Chip as={Link} to={`/browse/occasions/${t.slug}`}>{t.name}</Chip>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

function Popular() {
  const { data, error, isPending, refetch, isFetching } = useProducts({ sort: 'popularity', pageSize: 8 });
  return (
    <section className="section" aria-labelledby="popular-h">
      <Container>
        <div className="section__head">
          <div>
            <p className="eyebrow">Loved right now</p>
            <h2 id="popular-h" className="section__title">Popular gifts</h2>
          </div>
          <Link to="/shop" className="more-link">See everything →</Link>
        </div>
        <ProductGrid
          products={data?.data}
          loading={isPending}
          error={error}
          onRetry={() => refetch()}
          retrying={isFetching}
          empty={{ title: 'Our gifts are being added', message: 'Please check back very soon.' }}
        />
      </Container>
    </section>
  );
}

export function Home() {
  return (
    <>
      <title>Bloomora: luxury gifts and handmade bouquets</title>
      <section className="hero">
        <Container className="hero__grid">
          <div className="hero__copy">
            <p className="pill">Personalised gifts across Pakistan</p>
            <h1 className="hero__title">Every feeling deserves a <em className="accent">gift</em></h1>
            <p className="hero__lead">Start with what you want to say. We help you find the gift, write it in your words, and deliver it with care.</p>
            <div className="hero__cta">
              <Button as={Link} to="/shop">Browse all gifts</Button>
              <Button as={Link} to="/browse/categories" variant="secondary">Browse by category</Button>
            </div>
          </div>
          <Collage />
        </Container>
      </section>

      <Trust />
      <Feelings />
      <Occasions />
      <Popular />

      <section className="section" aria-labelledby="how-h">
        <Container>
          <p className="eyebrow">How it works</p>
          <h2 id="how-h" className="section__title">Made <em className="accent">personal</em>, start to finish</h2>
          <ol className="steps" role="list">
            <li>
              <span className="steps__n" aria-hidden="true">1</span>
              <h3>Your words, on the gift</h3>
              <p>Add a name and a message of up to 900 characters, choose a card design and packaging, and see it come together before you pay.</p>
            </li>
            <li>
              <span className="steps__n" aria-hidden="true">2</span>
              <h3>They add their own address</h3>
              <p>Do not know where they live? Send a private gift link. They add their address once, and you never see it.</p>
            </li>
            <li>
              <span className="steps__n" aria-hidden="true">3</span>
              <h3>Gifts across distance</h3>
              <p>We deliver to cities across Pakistan, packed with care and tracked all the way, so a gift can travel as far as the feeling.</p>
            </li>
          </ol>
        </Container>
      </section>

      <section className="cta" aria-labelledby="cta-h">
        <Container className="cta__box">
          <div>
            <h2 id="cta-h">Not sure where to <em className="accent accent--light">start</em>?</h2>
            <p>Tell us who it is for and what you want to say. We will point you to the right gift.</p>
          </div>
          <div className="cta__buttons">
            <Button as={Link} to="/shop">Browse all gifts</Button>
            <Button as={Link} to="/contact" variant="secondary">Ask us</Button>
          </div>
        </Container>
      </section>
    </>
  );
}
