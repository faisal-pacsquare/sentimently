import { Button, Container } from '@sentimently/ui';
import { Link } from 'react-router-dom';

/** Only for things that really do not exist. A failed request is an ErrorState, never this. */
export function NotFound({ what = 'that page' }: { what?: string }) {
  return (
    <Container className="page">
      <title>Not found | Bloomora</title>
      <div className="sy-state">
        <h1>We could not find {what}</h1>
        <p>It may have moved, or the link may be mistyped.</p>
        <Button as={Link} to="/shop">Browse all gifts</Button>
      </div>
    </Container>
  );
}
