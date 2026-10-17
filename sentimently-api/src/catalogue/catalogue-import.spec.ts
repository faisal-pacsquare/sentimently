import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCatalogue, parseCsv } from './catalogue-import';

const sample = (f: string) =>
  readFileSync(join(__dirname, '../../samples', f), 'utf8');
const EXTRAS = [
  'classic_wrap',
  'premium_wrap',
  'keepsake_box',
  'chocolate_box',
  'dried_flower_posy',
  'express_same_day',
];

const TAXONOMY = 'kind,slug,name\nsentiment,miss,Miss\ncategory,home,Home\n';
const HEADER =
  'slug,name,description,price,offerPrice,type,digitalKind,stock,category,sentiments,occasions,recipients,allowedExtras,isMadeToOrder,leadTimeMinDays,leadTimeMaxDays,isPerishable,isActive,imageUrls';
const row = (over: Record<string, string> = {}) => {
  const base: Record<string, string> = {
    slug: 'a-gift',
    name: 'A gift',
    description: 'A description that is long enough.',
    price: '1000',
    offerPrice: '',
    type: 'physical',
    digitalKind: '',
    stock: '5',
    category: 'home',
    sentiments: 'miss',
    occasions: '',
    recipients: '',
    allowedExtras: '',
    isMadeToOrder: '',
    leadTimeMinDays: '',
    leadTimeMaxDays: '',
    isPerishable: '',
    isActive: '',
    imageUrls: '/i.jpg',
    ...over,
  };
  // a spreadsheet puts quotes around any cell that contains a comma, a quote or a line break
  const cell = (v: string) =>
    /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  return HEADER.split(',')
    .map((h) => cell(base[h]))
    .join(',');
};
const run = (
  rows: string[],
  taxonomyCsv = TAXONOMY,
  existingProducts: never[] = [],
) =>
  buildCatalogue({
    taxonomyCsv,
    productsCsv: `${HEADER}\n${rows.join('\n')}\n`,
    extraCodes: EXTRAS,
    existingProducts,
    now: '2026-11-20T00:00:00.000Z',
  });

describe('CSV reading', () => {
  it('handles quotes, commas, line breaks inside quotes, Windows line ends and a byte-order mark', () => {
    const csv =
      '﻿a,b,c\r\n1,"two, with comma","three ""quoted""\r\nand a new line"\r\n\r\n4,5,6';
    expect(parseCsv(csv)).toEqual([
      ['a', 'b', 'c'],
      ['1', 'two, with comma', 'three "quoted"\r\nand a new line'],
      ['4', '5', '6'],
    ]);
  });

  it('keeps empty cells and a final line with no line end', () => {
    expect(parseCsv('a,b,c\n1,,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ]);
  });
});

describe('a shop that is missing some feelings (dropUnknownTags)', () => {
  const input = {
    taxonomyCsv: 'kind,slug,name\ncategory,home,Home\nsentiment,love,Love',
    productsCsv: [
      'slug,name,description,price,type,stock,category,sentiments',
      'mug,Mug,A lovely ceramic mug for tea,1200,physical,5,home,love|just-because',
      'candle,Candle,A lovely soy candle for evenings,900,physical,5,home,just-because',
      'frame,Frame,A lovely wooden photo frame,1500,physical,5,home,love',
    ].join('\n'),
    extraCodes: [],
  };
  it('is an error by default (the command-line import stays strict)', () => {
    const r = buildCatalogue(input);
    expect(r.errors).toHaveLength(2);
    expect(r.errors[0]).toMatch(
      /sentiment "just-because" is not in taxonomy\.csv/,
    );
  });
  it('adds the gifts without the missing tag and says so once', () => {
    const r = buildCatalogue({ ...input, dropUnknownTags: true });
    expect(r.errors).toEqual([]);
    expect(r.products.map((p) => p.sentiments)).toEqual([
      ['love'],
      [],
      ['love'],
    ]);
    expect(r.warnings.filter((w) => /added without it/.test(w))).toEqual([
      'sentiment "just-because" is not in your shop, so 2 gifts were added without it (Mug, Candle)',
    ]);
  });
  it('still refuses a missing category', () => {
    const r = buildCatalogue({
      ...input,
      productsCsv:
        'slug,name,description,price,type,stock,category\nmug,Mug,A lovely ceramic mug for tea,1200,physical,5,nowhere',
      dropUnknownTags: true,
    });
    expect(r.errors[0]).toMatch(/category "nowhere" is not in taxonomy\.csv/);
  });
});

describe('choosing the wrong file', () => {
  const taxonomyCsv = 'kind,slug,name\ncategory,home,Home';
  it('gives one clear message, not an error for every row', () => {
    const r = buildCatalogue({
      taxonomyCsv,
      productsCsv:
        'slug,name,main photo file name,second photo file name\nmug,Mug,mug_1.jpg,mug_2.jpg\ncandle,Candle,candle_1.jpg,candle_2.jpg',
      extraCodes: [],
    });
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(
      /not the right kind of file.*missing: description, price, category/,
    );
    expect(r.errors[0]).toMatch(/new-gifts\.csv/);
    expect(r.products).toEqual([]);
  });

  it('does the same for a groups file', () => {
    const r = buildCatalogue({
      taxonomyCsv: 'slug,title\nhome,Home',
      productsCsv: 'slug,name,description,price,category\n',
      extraCodes: [],
    });
    expect(r.errors[0]).toMatch(/taxonomy\.csv: .*missing: kind, name/);
  });
});

describe('catalogue import', () => {
  it('turns a valid row into a gift, with the numbers and lists read correctly', () => {
    const r = run([
      row({
        price: 'Rs 3,500',
        offerPrice: '2,900',
        sentiments: 'miss',
        allowedExtras: 'premium_wrap|keepsake_box',
        isMadeToOrder: 'yes',
        leadTimeMinDays: '5',
        leadTimeMaxDays: '7',
        isPerishable: 'no',
      }),
    ]);
    expect(r.errors).toEqual([]);
    expect(r.products[0]).toMatchObject({
      id: 'p-a-gift',
      slug: 'a-gift',
      price: 3500,
      offerPrice: 2900,
      category: 'home',
      sentiments: ['miss'],
      allowedExtras: ['premium_wrap', 'keepsake_box'],
      isMadeToOrder: true,
      leadTimeMinDays: 5,
      leadTimeMaxDays: 7,
      isPerishable: false,
      isActive: true,
      stock: 5,
      imageUrls: ['/i.jpg'],
    });
    expect(r.taxonomy.map((t) => t.id)).toEqual([
      'sentiment-miss',
      'category-home',
    ]);
  });

  it('reports every bad row with its line number, and builds nothing it cannot trust', () => {
    const r = run([
      row({ slug: 'Bad Slug' }),
      row({ slug: 'dup' }),
      row({ slug: 'dup' }),
      row({ slug: 'p3', price: 'cheap' }),
      row({ slug: 'p4', price: '100', offerPrice: '100' }),
      row({ slug: 'p5', type: 'virtual' }),
      row({ slug: 'p6', type: 'digital' }),
      row({ slug: 'p7', category: 'nowhere', sentiments: 'ghost' }),
      row({ slug: 'p8', allowedExtras: 'gold' }),
      row({ slug: 'p9', isMadeToOrder: 'yes' }),
      row({
        slug: 'p10',
        isMadeToOrder: 'yes',
        leadTimeMinDays: '9',
        leadTimeMaxDays: '3',
      }),
      row({ slug: 'p11', imageUrls: 'not a url' }),
      row({ slug: 'p12', stock: '-1' }),
    ]);
    const joined = r.errors.join('\n');
    expect(joined).toContain('line 2: slug "Bad Slug"');
    expect(joined).toContain('line 4: slug "dup" appears twice');
    expect(joined).toContain('line 5: price must be a whole number');
    expect(joined).toContain('line 6: offerPrice must be lower than price');
    expect(joined).toContain('line 7: type must be physical or digital');
    expect(joined).toContain('line 8: a digital gift needs digitalKind');
    expect(joined).toContain('category "nowhere" is not in taxonomy.csv');
    expect(joined).toContain('sentiment "ghost" is not in taxonomy.csv');
    expect(joined).toContain('extra "gold" does not exist');
    expect(joined).toContain(
      'line 11: a made-to-order gift needs leadTimeMaxDays',
    );
    expect(joined).toContain(
      'line 12: leadTimeMinDays is greater than leadTimeMaxDays',
    );
    expect(joined).toContain('line 13: image "not a url"');
    expect(joined).toContain('line 14: stock must be a whole number');
  });

  it('checks the groups too', () => {
    const r = run(
      [row()],
      'kind,slug,name\nweather,sun,Sun\nsentiment,Miss Me,\nsentiment,miss,Miss\nsentiment,miss,Miss again\ncategory,home,Home\n',
    );
    const joined = r.errors.join('\n');
    expect(joined).toContain(
      'kind must be sentiment, occasion, recipient or category (got "weather")',
    );
    expect(joined).toContain('slug "Miss Me"');
    expect(joined).toContain('name is required');
    expect(joined).toContain('sentiment/miss appears twice');
  });

  it('is repeatable: the same files give the same ids, and ratings of existing gifts survive', () => {
    const first = run([row()]);
    const existing = [
      {
        ...first.products[0],
        rating: 4.8,
        reviewCount: 12,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ] as never[];
    const again = run([row({ price: '1200' })], TAXONOMY, existing);
    expect(again.products[0]).toMatchObject({
      id: 'p-a-gift',
      price: 1200,
      rating: 4.8,
      reviewCount: 12,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('warns about empty groups, missing images, short text and counts that differ from the plan', () => {
    const r = run(
      [row({ imageUrls: '', description: 'Short.' })],
      `${TAXONOMY}occasion,eid,Eid\n`,
    );
    const joined = r.warnings.join('\n');
    expect(joined).toContain(
      'The plan lists 14 sentiment groups; this file has 1',
    );
    expect(joined).toContain('occasion "eid" has no gifts yet');
    expect(joined).toContain('no image for "a-gift"');
    expect(joined).toContain('description is very short');
    expect(r.errors).toEqual([]);
  });

  it('the sample spreadsheets are valid', () => {
    const r = buildCatalogue({
      taxonomyCsv: sample('taxonomy.sample.csv'),
      productsCsv: sample('products.sample.csv'),
      extraCodes: EXTRAS,
    });
    expect(r.errors).toEqual([]);
    expect(r.products).toHaveLength(6);
    expect(
      r.products.find((p) => p.slug === 'sample-scented-candle')?.description,
    ).toBe('Hand-poured, soy wax.\nBurns for about 40 hours.');
    expect(
      r.products.find((p) => p.slug === 'sample-egift-card'),
    ).toMatchObject({ type: 'digital', digitalKind: 'egift' });
  });

  it('the blank templates have exactly the columns the importer reads', () => {
    const header = (f: string) =>
      parseCsv(
        readFileSync(join(__dirname, '../../samples/templates', f), 'utf8'),
      )[0];
    expect(header('products.template.csv')).toEqual(HEADER.split(','));
    expect(header('taxonomy.template.csv')).toEqual([
      'kind',
      'slug',
      'name',
      'blurb',
      'image',
      'sortOrder',
    ]);
  });
});
