import { ConsoleMailer, Mail, Mailer } from '../mail/mailer';
import { ContactController, ContactDto } from './contact.controller';

const dto: ContactDto = {
  name: 'Zara Khan',
  email: 'Zara@Example.pk',
  phone: '0300 1234567',
  orderNumber: 'SN-ABC12345',
  topic: 'order',
  subject: 'Where is my order?',
  message: 'It was due yesterday.',
};

/** A store that remembers inserts and answers the shop-settings lookup. */
function fakeStore(contactEmail?: string | null) {
  const saved: unknown[] = [];
  return {
    saved,
    store: {
      insert: async (_c: string, doc: object) => {
        const row = { id: 'm1', ...doc };
        saved.push(row);
        return row;
      },
      get: async () =>
        contactEmail === undefined ? undefined : { id: 'main', contactEmail },
    },
  };
}

const withEnv = async (
  env: Record<string, string | undefined>,
  run: () => Promise<void>,
) => {
  const before = { ...process.env };
  for (const k of ['CONTACT_TO', 'ALERT_EMAIL', 'ADMIN_EMAIL'])
    delete process.env[k];
  Object.assign(process.env, env);
  try {
    await run();
  } finally {
    process.env = before;
  }
};

describe('contact form email', () => {
  it('emails the admin with the customer as reply-to, and saves the message', async () => {
    await withEnv({ CONTACT_TO: 'owner@bloomora.pk' }, async () => {
      const { store, saved } = fakeStore();
      const mailer = new ConsoleMailer();
      const res = await new ContactController(store as never, mailer).create(
        dto,
      );
      expect(res.message).toMatch(/Thank you/);
      expect(saved).toHaveLength(1);
      expect(mailer.outbox).toHaveLength(1);
      const m = mailer.outbox[0] as Mail;
      expect(m.to).toBe('owner@bloomora.pk');
      expect(m.replyTo).toBe('zara@example.pk');
      expect(m.subject).toBe('[Contact] My order: Where is my order?');
      expect(m.text).toContain('Zara Khan');
      expect(m.text).toContain('SN-ABC12345');
      expect(m.text).toContain('It was due yesterday.');
    });
  });

  it('marks bulk-gifting enquiries so they stand out', async () => {
    await withEnv({ CONTACT_TO: 'owner@bloomora.pk' }, async () => {
      const mailer = new ConsoleMailer();
      await new ContactController(fakeStore().store as never, mailer).create({
        ...dto,
        topic: 'bulk_gifting',
        subject: '50 boxes',
      });
      expect(mailer.outbox[0]?.subject).toBe(
        '[Bulk enquiry] Bulk or corporate gifting: 50 boxes',
      );
    });
  });

  it('chooses who to tell: CONTACT_TO, then ALERT_EMAIL, then the shop email in Settings, then the admin', async () => {
    const who = async (
      env: Record<string, string | undefined>,
      shopEmail?: string | null,
    ) => {
      let to: string | undefined;
      await withEnv(env, async () => {
        const mailer = new ConsoleMailer();
        await new ContactController(
          fakeStore(shopEmail).store as never,
          mailer,
        ).create(dto);
        to = mailer.outbox[0]?.to;
      });
      return to;
    };
    expect(
      await who(
        { CONTACT_TO: 'a@x.pk', ALERT_EMAIL: 'b@x.pk', ADMIN_EMAIL: 'd@x.pk' },
        'c@x.pk',
      ),
    ).toBe('a@x.pk');
    expect(
      await who({ ALERT_EMAIL: 'b@x.pk', ADMIN_EMAIL: 'd@x.pk' }, 'c@x.pk'),
    ).toBe('b@x.pk');
    expect(await who({ ADMIN_EMAIL: 'd@x.pk' }, 'c@x.pk')).toBe('c@x.pk');
    expect(await who({ ADMIN_EMAIL: 'd@x.pk' }, null)).toBe('d@x.pk');
    expect(await who({}, null)).toBeUndefined();
  });

  it('still accepts the message when the email cannot be sent', async () => {
    await withEnv({ CONTACT_TO: 'owner@bloomora.pk' }, async () => {
      const { store, saved } = fakeStore();
      const broken: Mailer = {
        send: async () => {
          throw new Error('brevo refused the email (401)');
        },
      };
      const res = await new ContactController(store as never, broken).create(
        dto,
      );
      expect(res.message).toMatch(/Thank you/);
      expect(saved).toHaveLength(1);
    });
  });

  it('still accepts the message when there is nobody to email', async () => {
    await withEnv({}, async () => {
      const mailer = new ConsoleMailer();
      const res = await new ContactController(
        fakeStore(null).store as never,
        mailer,
      ).create(dto);
      expect(res.id).toBe('m1');
      expect(mailer.outbox).toHaveLength(0);
    });
  });
});
