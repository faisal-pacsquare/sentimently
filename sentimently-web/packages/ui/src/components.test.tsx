import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { Button, Chip, ErrorState, Price, ProblemList, ProductCard, SafeImage, SelectField, Stars, TextField } from './components';

describe('Price', () => {
  it('shows one price normally', () => {
    render(<Price price={3500} />);
    expect(screen.getByText('Rs 3,500')).toBeInTheDocument();
    expect(screen.queryByText(/was/i)).toBeNull();
  });

  it('shows the offer price with the old one struck through, readable by screen readers', () => {
    const { container } = render(<Price price={6000} offerPrice={4500} />);
    expect(container.querySelector('del')).toHaveTextContent('Was Rs 6,000');
    expect(container).toHaveTextContent('Now Rs 4,500');
  });

  it('ignores an offer that is not lower', () => {
    const { container } = render(<Price price={1000} offerPrice={1000} />);
    expect(container.querySelector('del')).toBeNull();
  });
});

describe('Stars', () => {
  it('never invents stars when there are no verified reviews', () => {
    render(<Stars rating={null} count={0} />);
    expect(screen.getByText('No reviews yet')).toBeInTheDocument();
  });

  it('reads out the rating', () => {
    render(<Stars rating={4.5} count={12} />);
    expect(screen.getByText(/4\.5/)).toBeInTheDocument();
    expect(screen.getByText(/out of 5/)).toBeInTheDocument();
  });
});

describe('Button', () => {
  it('is a real button, and cannot be pressed while loading', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick} loading>Add</Button>);
    const b = screen.getByRole('button', { name: /add/i });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('can be a link, and a disabled link cannot be followed or tabbed to', async () => {
    const onClick = vi.fn();
    render(<Button as="a" href="/x" disabled onClick={onClick}>Go</Button>);
    const a = screen.getByText('Go');
    expect(a).toHaveAttribute('aria-disabled', 'true');
    expect(a).toHaveAttribute('tabindex', '-1');
  });
});

describe('Chip', () => {
  it('announces whether it is on', () => {
    render(<Chip pressed>Birthday</Chip>);
    expect(screen.getByRole('button', { name: 'Birthday' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('ErrorState', () => {
  it('offers a retry for a temporary failure, with the reference to quote to support', async () => {
    const retry = vi.fn();
    render(<ErrorState onRetry={retry} requestId="req-42" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(retry).toHaveBeenCalled();
    expect(screen.getByText(/req-42/)).toBeInTheDocument();
  });

  it('does not offer a retry when retrying cannot help', () => {
    render(<ErrorState onRetry={() => undefined} temporary={false} message="That gift is gone." />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('never says "not found" by itself', () => {
    render(<ErrorState />);
    expect(screen.queryByText(/not found/i)).toBeNull();
  });
});

describe('ProblemList', () => {
  it('lists the sentences the server sent', () => {
    render(<ProblemList problems={['Line 1: only 3 left', 'Choose a delivery city']} />);
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Line 1: only 3 left', 'Choose a delivery city']);
  });

  it('renders nothing when there are none', () => {
    const { container } = render(<ProblemList problems={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('fields', () => {
  it('connect label, hint and error to the input', () => {
    render(<TextField label="Email" hint="We never share it" error="Enter a valid email" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter a valid email');
  });

  it('shows the hint when there is no error', () => {
    render(<SelectField label="City" hint="Where it goes"><option>Karachi</option></SelectField>);
    expect(screen.getByLabelText('City')).toHaveAccessibleDescription('Where it goes');
  });
});

describe('ProductCard', () => {
  it('labels offers and digital gifts, and makes the title the link', () => {
    render(
      <ProductCard
        product={{ name: 'Photo Book', price: 6000, offerPrice: 4500, digital: false, rating: null }}
        linkProps={{ href: '/gifts/photo-book' }}
      />,
    );
    expect(screen.getByRole('link', { name: 'Photo Book' })).toHaveAttribute('href', '/gifts/photo-book');
    expect(screen.getByText('On offer')).toBeInTheDocument();
    expect(screen.getByText('No reviews yet')).toBeInTheDocument();
  });
});

describe('SafeImage', () => {
  it('shows the photo, and a tile with the first letter if the file will not load', () => {
    const { container } = render(<SafeImage src="/missing.jpg" name="Photo mug" />);
    const img = container.querySelector('img')!;
    expect(img).toBeInTheDocument();
    fireEvent.error(img);
    expect(container.querySelector('img')).toBeNull();
    expect(container).toHaveTextContent('P');
  });

  it('shows the tile straight away when there is no photo', () => {
    const { container } = render(<SafeImage name="Candle" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container).toHaveTextContent('C');
  });
});
