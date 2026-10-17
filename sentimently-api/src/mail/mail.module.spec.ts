import { ConsoleMailer, HttpMailer } from './mailer';
import { MailAdminController } from './mail.module';

const ok = (async () =>
  new Response('{}', { status: 201 })) as unknown as typeof fetch;
const refused = (async () =>
  new Response('{"message":"Sender not valid"}', {
    status: 400,
  })) as unknown as typeof fetch;
const cfg = {
  provider: 'brevo' as const,
  apiKey: 'xkeysib-secret',
  from: 'shop@gmail.com',
  fromName: 'Bloomora',
};

describe('the admin test-email tool', () => {
  it('says plainly when no email service is set up', async () => {
    const res = await new MailAdminController(new ConsoleMailer()).test({
      to: 'a@b.pk',
    });
    expect(res.sent).toBe(false);
    expect(res.provider).toBe('console');
    expect(res.message).toMatch(/No email service is set up/);
  });

  it('sends a real test email through the service in use', async () => {
    const res = await new MailAdminController(new HttpMailer(cfg, ok)).test({
      to: 'a@b.pk',
    });
    expect(res).toMatchObject({ sent: true, provider: 'brevo' });
  });

  it('reports why the service refused, never leaking the key', async () => {
    const res = await new MailAdminController(
      new HttpMailer(cfg, refused),
    ).test({ to: 'a@b.pk' });
    expect(res.sent).toBe(false);
    expect(res.message).toMatch(/refused the email \(400\)/);
    expect(JSON.stringify(res)).not.toContain('xkeysib-secret');
  });
});
