import { forwardRef, useId, useState } from 'react';
import type {
  ComponentPropsWithoutRef, ElementType, HTMLAttributes, InputHTMLAttributes, ReactNode,
  SelectHTMLAttributes, TextareaHTMLAttributes,
} from 'react';

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

/** "Rs 3,500". Whole rupees only. */
export const formatRupees = (n: number) => `Rs ${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

// ---------- layout and access ----------

export function Container({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('sy-container', className)} {...rest} />;
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sy-sr-only">{children}</span>;
}

export function SkipLink({ href = '#main', children = 'Skip to content' }: { href?: string; children?: ReactNode }) {
  return (
    <a className="sy-skip" href={href}>
      {children}
    </a>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span role="status">
      <span className="sy-spinner" aria-hidden="true" />
      <VisuallyHidden>{label}</VisuallyHidden>
    </span>
  );
}

// ---------- button, chip, badge ----------

type ButtonOwn = {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'normal' | 'small';
  block?: boolean;
  loading?: boolean;
  /** Works on links too: a disabled link is skipped by the keyboard and cannot be followed. */
  disabled?: boolean;
};
type ButtonProps<T extends ElementType> = ButtonOwn & { as?: T } & Omit<ComponentPropsWithoutRef<T>, keyof ButtonOwn | 'as'>;

/** A button, or any link component (`as={Link} to="/shop"`). A link that is disabled keeps its place but cannot be followed. */
export function Button<T extends ElementType = 'button'>({
  as, variant = 'primary', size = 'normal', block, loading, disabled: disabledProp, className, children, ...rest
}: ButtonProps<T>) {
  const Tag: ElementType = as ?? 'button';
  const isButton = Tag === 'button';
  const disabled = disabledProp || loading;
  const props: Record<string, unknown> = { ...rest };
  if (isButton) {
    props.type = (rest as { type?: string }).type ?? 'button';
    props.disabled = disabled;
  } else if (disabled) {
    props['aria-disabled'] = true;
    props.tabIndex = -1;
    props.onClick = (e: Event) => e.preventDefault();
  }
  return (
    <Tag className={cx('sy-btn', `sy-btn--${variant}`, size === 'small' && 'sy-btn--small', block && 'sy-btn--block', className)} aria-busy={loading || undefined} {...props}>
      {loading && <span className="sy-spinner" aria-hidden="true" />}
      {children}
    </Tag>
  );
}

/** A filter or choice. Pass `pressed` for a toggle, or `current` when it is a link to the page you are on. */
export function Chip<T extends ElementType = 'button'>({
  as, pressed, current, className, ...rest
}: { as?: T; pressed?: boolean; current?: boolean } & Omit<ComponentPropsWithoutRef<T>, 'as'>) {
  const Tag: ElementType = as ?? 'button';
  const extra: Record<string, unknown> = {};
  if (pressed !== undefined) extra['aria-pressed'] = pressed;
  if (current) extra['aria-current'] = 'true';
  if (Tag === 'button') extra.type = 'button';
  return <Tag className={cx('sy-chip', className)} {...extra} {...rest} />;
}

export function Badge({ tone, className, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: 'offer' | 'digital' | 'warn' }) {
  return <span className={cx('sy-badge', tone && `sy-badge--${tone}`, className)} {...rest} />;
}

// ---------- price and rating ----------

export function Price({ price, offerPrice, className }: { price: number; offerPrice?: number | null; className?: string }) {
  const onOffer = offerPrice != null && offerPrice < price;
  return (
    <span className={cx('sy-price', className)}>
      <span className={cx('sy-price__now', onOffer && 'sy-price__now--offer')}>
        {onOffer && <VisuallyHidden>Now </VisuallyHidden>}
        {formatRupees(onOffer ? offerPrice : price)}
      </span>
      {onOffer && (
        <del className="sy-price__was">
          <VisuallyHidden>Was </VisuallyHidden>
          {formatRupees(price)}
        </del>
      )}
    </span>
  );
}

/** Stars only from verified reviews. With none, it says so instead of showing empty or made-up stars. */
export function Stars({ rating, count }: { rating?: number | null; count?: number }) {
  if (rating == null || !count) return <span className="sy-stars">No reviews yet</span>;
  const full = Math.round(rating);
  return (
    <span className="sy-stars">
      <span className="sy-stars__icons" aria-hidden="true">
        {'★'.repeat(full)}
        {'☆'.repeat(5 - full)}
      </span>
      <span>
        <VisuallyHidden>Rated </VisuallyHidden>
        {rating.toFixed(1)}
        <VisuallyHidden> out of 5</VisuallyHidden> ({count})
      </span>
    </span>
  );
}

// ---------- images ----------

/** A photo that falls back to a coloured tile with the first letter if the file is missing or the link is broken. */
export function SafeImage({ src, name, className, eager }: { src?: string; name: string; className?: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className={className} aria-hidden="true">{name.slice(0, 1)}</span>;
  return <img className={className} src={src} alt="" loading={eager ? 'eager' : 'lazy'} onError={() => setFailed(true)} />;
}

// ---------- product card ----------

export interface ProductCardData {
  name: string;
  price: number;
  offerPrice?: number | null;
  rating?: number | null;
  reviewCount?: number;
  image?: string;
  digital?: boolean;
  soldOut?: boolean;
  madeToOrder?: boolean;
}

export function ProductCard<T extends ElementType = 'a'>({
  product, linkAs, linkProps,
}: { product: ProductCardData; linkAs?: T; linkProps: Omit<ComponentPropsWithoutRef<T>, 'children'> }) {
  const Link: ElementType = linkAs ?? 'a';
  const onOffer = product.offerPrice != null && product.offerPrice < product.price;
  return (
    <article className="sy-card">
      <div className="sy-card__badges">
        {onOffer && <Badge tone="offer">On offer</Badge>}
        {product.digital && <Badge tone="digital">Digital</Badge>}
        {product.soldOut && <Badge tone="warn">Sold out</Badge>}
      </div>
      <div className="sy-card__media" aria-hidden="true">
        <SafeImage src={product.image} name={product.name} />
      </div>
      <div className="sy-card__body">
        <h3 className="sy-card__title">
          <Link {...(linkProps as object)}>{product.name}</Link>
        </h3>
        <Stars rating={product.rating} count={product.reviewCount} />
        <div className="sy-card__meta">
          <Price price={product.price} offerPrice={product.offerPrice} />
          {product.madeToOrder && <Badge>Made to order</Badge>}
        </div>
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="sy-card" aria-hidden="true">
      <div className="sy-skeleton" style={{ aspectRatio: '4 / 3', borderRadius: 0 }} />
      <div className="sy-card__body">
        <div className="sy-skeleton" style={{ height: '1.1rem', width: '80%' }} />
        <div className="sy-skeleton" style={{ height: '0.9rem', width: '40%' }} />
        <div className="sy-skeleton" style={{ height: '1.1rem', width: '30%', marginTop: 'auto' }} />
      </div>
    </div>
  );
}

// ---------- states ----------

/**
 * A failed request. It never says "not found" or shows an empty list: that was the prototype's worst bug.
 * `temporary` failures (offline, busy, server fault) offer a retry; others explain what to change.
 */
export function ErrorState({
  title, message, requestId, onRetry, retrying, temporary = true, children,
}: {
  title?: string; message?: string; requestId?: string; onRetry?: () => void; retrying?: boolean; temporary?: boolean; children?: ReactNode;
}) {
  return (
    <div className="sy-state sy-state--error" role="alert">
      <h2>{title ?? 'Something went wrong'}</h2>
      <p>{message ?? 'We could not load this. It is not your fault; please try again.'}</p>
      {onRetry && temporary && (
        <Button onClick={onRetry} loading={retrying}>
          Try again
        </Button>
      )}
      {children}
      {requestId && <p className="sy-state__ref">Reference: {requestId}</p>}
    </div>
  );
}

export function EmptyState({ title, message, children }: { title: string; message?: string; children?: ReactNode }) {
  return (
    <div className="sy-state">
      <h2>{title}</h2>
      {message && <p>{message}</p>}
      {children}
    </div>
  );
}

export function Alert({ tone = 'info', children, ...rest }: HTMLAttributes<HTMLDivElement> & { tone?: 'error' | 'info' | 'warn' }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('sy-alert', `sy-alert--${tone}`)} {...rest}>
      {children}
    </div>
  );
}

/** A list of problems from the server (a 400's `details`). */
export function ProblemList({ title = 'Please check the following', problems }: { title?: string; problems: string[] }) {
  if (!problems.length) return null;
  return (
    <Alert tone="error">
      <strong>{title}</strong>
      <ul>
        {problems.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </Alert>
  );
}

// ---------- form fields ----------

type FieldShell = { label: string; hint?: string; error?: string };

function Shell({ id, label, hint, error, children }: FieldShell & { id: string; children: ReactNode }) {
  return (
    <div className="sy-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && (
        <span className="sy-field__hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="sy-field__error" id={`${id}-error`}>
          {error}
        </span>
      )}
    </div>
  );
}

const describedBy = (id: string, hint?: string, error?: string) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined);

export const TextField = forwardRef<HTMLInputElement, FieldShell & InputHTMLAttributes<HTMLInputElement>>(function TextField(
  { label, hint, error, className, ...rest }, ref,
) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error}>
      <input ref={ref} id={id} className={cx('sy-input', className)} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...rest} />
    </Shell>
  );
});

export const TextArea = forwardRef<HTMLTextAreaElement, FieldShell & TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea(
  { label, hint, error, className, ...rest }, ref,
) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error}>
      <textarea ref={ref} id={id} className={cx('sy-input', className)} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...rest} />
    </Shell>
  );
});

export const SelectField = forwardRef<HTMLSelectElement, FieldShell & SelectHTMLAttributes<HTMLSelectElement>>(function SelectField(
  { label, hint, error, className, children, ...rest }, ref,
) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error}>
      <select ref={ref} id={id} className={cx('sy-input', className)} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...rest}>
        {children}
      </select>
    </Shell>
  );
});
