import { join } from 'node:path';
import { findSeedDir } from './file.driver';

describe('findSeedDir', () => {
  const has =
    (...dirs: string[]) =>
    (p: string) =>
      dirs.some((d) => p === join(d, 'storeConfig.json'));

  it('uses DATA_DIR when it is set', () => {
    expect(
      findSeedDir({ DATA_DIR: '/custom' }, '/app', '/app/dist/storage', has()),
    ).toBe('/custom');
  });

  it('uses ./data when it exists', () => {
    expect(
      findSeedDir({}, '/app', '/app/dist/storage', has(join('/app', 'data'))),
    ).toBe(join('/app', 'data'));
  });

  it('falls back to the copy next to the compiled code when ./data is not deployed', () => {
    const dist = join('/var/task', 'dist', 'data');
    expect(
      findSeedDir(
        {},
        '/var/task',
        join('/var/task', 'dist', 'storage'),
        has(dist),
      ),
    ).toBe(dist);
  });

  it('prefers ./data over the compiled copy', () => {
    const seed = join('/app', 'data');
    expect(
      findSeedDir(
        {},
        '/app',
        join('/app', 'dist', 'storage'),
        has(seed, join('/app', 'dist', 'data')),
      ),
    ).toBe(seed);
  });

  it('still returns ./data when nothing is found, so the problem is a visible empty shop, not a crash', () => {
    expect(findSeedDir({}, '/app', '/app/dist/storage', has())).toBe(
      join('/app', 'data'),
    );
  });
});
