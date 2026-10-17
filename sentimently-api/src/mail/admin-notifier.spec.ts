import { AdminNotifier } from './admin-notifier';
import { ConsoleMailer, HttpMailer, Mailer } from './mailer';

const store = (contactEmail?: string | null) =>
  ({
    get: async () =>
      contactEmail === undefined ? undefined : { id: 'main', contactEmail },
  }) as never;

describe('AdminNotifier', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });
  beforeEach(() => {
    for (const k of ['CONTACT_TO', 'ALERT_EMAIL', 'ADMIN_EMAIL'])
      delete process.env[k];
  });

  it('sends to the chosen person and says so', async () => {
    process.env.CONTACT_TO = 'owner@bloomora.pk';
    const mailer = new ConsoleMailer();
    expect(
      await new AdminNotifier(store(), mailer).notify({
        subject: 'S',
        text: 'T',
        replyTo: 'c@x.pk',
      }),
    ).toBe(true);
    expect(mailer.outbox[0]).toMatchObject({
      to: 'owner@bloomora.pk',
      subject: 'S',
      replyTo: 'c@x.pk',
    });
  });

  it('returns false, without throwing, when nobody is set up to receive', async () => {
    expect(
      await new AdminNotifier(store(null), new ConsoleMailer()).notify({
        subject: 'S',
        text: 'T',
      }),
    ).toBe(false);
  });

  it('returns false, without throwing, when the mail service refuses', async () => {
    process.env.CONTACT_TO = 'owner@bloomora.pk';
    const broken: Mailer = {
      send: async () => {
        throw new Error('refused (401)');
      },
    };
    expect(
      await new AdminNotifier(store(), broken).notify({
        subject: 'S',
        text: 'T',
      }),
    ).toBe(false);
  });
});

describe('mailers say whether they really deliver', () => {
  it('the console mailer does not, a real service does', () => {
    expect(new ConsoleMailer().delivers).toBe(false);
    expect(
      new HttpMailer({
        provider: 'brevo',
        apiKey: 'k',
        from: 'a@b.pk',
        fromName: 'B',
      }).delivers,
    ).toBe(true);
  });
});
