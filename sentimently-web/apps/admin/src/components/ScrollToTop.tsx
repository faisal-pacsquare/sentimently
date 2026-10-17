import { useLayoutEffect } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

/**
 * A new page opens at its top. Without this, the single-page app keeps the old scroll position, so a link clicked
 * in the footer opens the next page already scrolled to its footer.
 * Going to another page of a list (?page=2) also returns to the top; changing a filter does not move the page.
 */
export function ScrollToTop() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const page = params.get('page');
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname, page]);
  return null;
}
