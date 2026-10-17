import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/auth/password';
import { setupApp } from '../src/setup';
import { MemoryDriver } from '../src/storage/memory.driver';
import { Doc, STORAGE_DRIVER } from '../src/storage/storage.types';
// supertest is CommonJS and the e2e jest config has no esModuleInterop
// eslint-disable-next-line @typescript-eslint/no-require-imports
import request = require('supertest');

const run = promisify(execFile);
const T = '2026-11-01T00:00:00.000Z';
const doc = (o: Record<string, unknown>) =>
  ({ createdAt: T, updatedAt: T, ...o }) as Doc;
const png = (n: number) =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(64, n),
  ]);

/** Runs scripts/upload-photos.mjs for real, against a real listening API. */
describe('The bulk photo upload script (e2e)', () => {
  let app: INestApplication;
  let api = '';
  let uploads: string;
  let photos: string;
  let staff = '';

  const gift = (id: string, slug: string, imageUrls: string[]) =>
    doc({
      id,
      slug,
      name: `Gift ${slug}`,
      description: 'A gift',
      price: 1000,
      type: 'physical',
      stock: 5,
      category: 'home',
      isActive: true,
      imageUrls,
    });

  beforeEach(async () => {
    uploads = await mkdtemp(join(tmpdir(), 'bloomora-up-'));
    photos = await mkdtemp(join(tmpdir(), 'bloomora-photos-'));
    Object.assign(process.env, {
      UPLOAD_DIR: uploads,
      JWT_SECRET: 'test-secret',
      RATE_LIMIT_MAX: '1000',
      AUTH_RATE_LIMIT: '1000',
    });
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.VERCEL;
    const pw = await hashPassword('staff-password-1');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(STORAGE_DRIVER)
      .useValue(
        new MemoryDriver({
          taxonomy: [
            doc({ id: 't1', kind: 'category', slug: 'home', name: 'Home' }),
          ],
          extras: [],
          products: [
            gift('p1', 'mug', ['/images/demo/mug.svg']),
            gift('p2', 'candle-3', ['/images/demo/candle.svg']),
            gift('p3', 'frame', ['https://example.com/mine.jpg']),
          ],
          customers: [
            doc({
              id: 's1',
              email: 'staff@x.pk',
              role: 'staff',
              authProvider: 'email',
              isGuest: false,
              passwordHash: pw,
              emailVerified: true,
            }),
          ],
        }),
      )
      .compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    await app.listen(0, '127.0.0.1');
    const url = new URL(await app.getUrl());
    api = `http://127.0.0.1:${url.port}/api/v1`;
    staff = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'staff@x.pk', password: 'staff-password-1' })
        .expect(200)
    ).body.accessToken as string;
  });

  afterEach(async () => {
    await app.close();
    await rm(uploads, { recursive: true, force: true });
    await rm(photos, { recursive: true, force: true });
    delete process.env.UPLOAD_DIR;
  });

  const script = (extra: string[], env: Record<string, string> = {}) =>
    run(
      process.execPath,
      [
        join(__dirname, '..', 'scripts', 'upload-photos.mjs'),
        '--api',
        api,
        ...extra,
      ],
      {
        env: {
          ...process.env,
          STUDIO_EMAIL: 'staff@x.pk',
          STUDIO_PASSWORD: 'staff-password-1',
          ...env,
        },
      },
    );
  const urls = async (slug: string) =>
    (
      (
        await request(app.getHttpServer())
          .get('/api/v1/admin/products')
          .set({ Authorization: `Bearer ${staff}` })
          .expect(200)
      ).body as {
        slug: string;
        imageUrls: string[];
      }[]
    ).find((p) => p.slug === slug)!.imageUrls;

  it('matches photos to gifts by name, in order, and replaces the placeholder picture', async () => {
    await writeFile(join(photos, 'mug_2.png'), png(2));
    await writeFile(join(photos, 'mug_1.png'), png(1));
    await writeFile(join(photos, 'candle-3.png'), png(3)); // the slug itself ends in -3
    await mkdir(join(photos, 'frame'));
    await writeFile(join(photos, 'frame', '1.png'), png(4));
    await writeFile(join(photos, 'frame', '2.png'), png(5));
    await writeFile(join(photos, 'stray.png'), png(6));
    await writeFile(join(photos, 'notes.txt'), 'not a photo');

    const { stdout, stderr } = await script(['--folder', photos]);
    expect(stdout).toMatch(/Done: 3 gifts updated, 0 failed/);
    expect(stderr).toMatch(/skipped stray\.png/);

    const mug = await urls('mug');
    expect(mug).toHaveLength(2);
    expect(mug.every((u) => u.startsWith('/api/v1/uploads/'))).toBe(true);
    expect(
      (await request(app.getHttpServer()).get(mug[0]).expect(200)).body,
    ).toEqual(png(1)); // _1 first
    expect(
      (await request(app.getHttpServer()).get(mug[1]).expect(200)).body,
    ).toEqual(png(2));
    expect(await urls('candle-3')).toHaveLength(1);
    expect(await urls('frame')).toHaveLength(2);
  });

  it('a dry run changes nothing', async () => {
    await writeFile(join(photos, 'mug.png'), png(1));
    const { stdout } = await script(['--folder', photos, '--dry-run']);
    expect(stdout).toMatch(/Gift mug \(mug\): 1 photo/);
    expect(stdout).toMatch(/Dry run: nothing was uploaded/);
    expect(await urls('mug')).toEqual(['/images/demo/mug.svg']);
  });

  it('add mode keeps the current photos and puts the new ones after them', async () => {
    await writeFile(join(photos, 'frame.png'), png(1));
    await script(['--folder', photos, '--mode', 'add']);
    const frame = await urls('frame');
    expect(frame).toHaveLength(2);
    expect(frame[0]).toBe('https://example.com/mine.jpg');
  });

  it('writes a list of the gifts that still have no real photo', async () => {
    const out = join(photos, 'needed.csv');
    await script(['--checklist', out]);
    const csv = await readFile(out, 'utf8');
    expect(csv).toContain('mug,"Gift mug",mug_1.jpg');
    expect(csv).toContain('candle-3,"Gift candle-3",candle-3_1.jpg');
    expect(csv).not.toContain('frame,'); // already has a photo of its own
  });

  it('says so and fails when no file matches a gift, or the sign-in is wrong', async () => {
    await writeFile(join(photos, 'unknown.png'), png(1));
    await expect(script(['--folder', photos])).rejects.toMatchObject({
      code: 1,
    });
    await expect(
      script(['--folder', photos], { STUDIO_PASSWORD: 'wrong-password' }),
    ).rejects.toMatchObject({
      stderr: expect.stringMatching(/401/),
    });
  });

  it('reports a photo the server refuses and carries on with the others', async () => {
    await writeFile(
      join(photos, 'mug.png'),
      Buffer.from('this is not an image at all'),
    );
    await writeFile(join(photos, 'frame.png'), png(1));
    await expect(script(['--folder', photos])).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringMatching(/1 gift updated, 1 failed/),
      stderr: expect.stringMatching(/FAILED mug/),
    });
    expect(await urls('frame')).toHaveLength(1);
    expect(await urls('mug')).toEqual(['/images/demo/mug.svg']);
  });
});
