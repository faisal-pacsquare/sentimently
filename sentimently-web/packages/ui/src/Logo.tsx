import { useId } from 'react';
import { MARK_ART } from './logo-art';

/**
 * The Bloomora logo: a crown over a bouquet of roses, with the name set in the page's own display font.
 * The art is drawn once in scripts/make-logo.py (colours: plum, rose and gold).
 *
 * `tone` is the background it sits on: "light" (ivory pages) writes the name in deep plum,
 * "dark" (the footer, the admin sidebar) writes it in gold.
 * `layout` is "inline" (mark beside the name, for headers) or "stacked" (mark above the name, with the tagline).
 */
export function LogoMark({ className = '', title }: { className?: string; title?: string }) {
  // Several marks can share a page, and gradient ids must be unique per copy.
  const id = `lm${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg
      className={`sy-logo__mark ${className}`}
      viewBox="0 0 200 200"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      // Fixed, hand-written markup from logo-art.ts; nothing user-supplied is ever put here.
      dangerouslySetInnerHTML={{ __html: MARK_ART.split('__ID__').join(id) }}
    />
  );
}

export interface LogoProps {
  tone?: 'light' | 'dark';
  layout?: 'inline' | 'stacked';
  /** Show the line "Luxury gifts and handmade bouquets" (stacked layout). */
  tagline?: boolean;
  /** Small word under the name, e.g. "studio" in the admin console. */
  sub?: string;
  className?: string;
}

export function Logo({ tone = 'light', layout = 'inline', tagline = false, sub, className = '' }: LogoProps) {
  return (
    <span className={`sy-logo sy-logo--${layout} sy-logo--${tone} ${className}`}>
      <LogoMark />
      <span className="sy-logo__words">
        <span className="sy-logo__name">Bloomora</span>
        {sub && <span className="sy-logo__sub">{sub}</span>}
        {tagline && <span className="sy-logo__tag">Luxury gifts &amp; handmade bouquets</span>}
      </span>
    </span>
  );
}
