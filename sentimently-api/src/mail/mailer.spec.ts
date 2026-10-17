import { ConsoleMailer, createMailer, HttpMailer } from './mailer';

interface Call {
  url: string;
  headers: Record<string, string>;
  body: any;
}

function fakeService(status = 200, text = '{"messageId":"m1"}') {
  const calls: Call[] = [];
  const http = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      headers: init.headers as Record<string, string>,
      body: JSON.parse(String(init.body)),
    });
    return new Response(text, { status });
  }) as unknown as typeof fetch;
  return { http, calls };
}

const mail = {
  to: 'owner@bloomora.pk',
  subject: 'Hello',
  text: 'Body',
  replyTo: 'zara@example.pk',
};

describe('HttpMailer', () => {
  it('sends through Brevo with the key in the api-key header, the verified sender, and a reply-to', async () => {
    const { http, calls } = fakeService(201);
    await new HttpMailer(
      {
        provider: 'brevo',
        apiKey: 'xkeysib-secret',
        from: 'shop@bloomora.pk',
        fromName: 'Bloomora',
      },
      http,
    ).send(mail);
    expect(calls[0].url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(calls[0].headers['api-key']).toBe('xkeysib-secret');
    expect(calls[0].body).toEqual({
      sender: { name: 'Bloomora', email: 'shop@bloomora.pk' },
      to: [{ email: 'owner@bloomora.pk' }],
      subject: 'Hello',
      textContent: 'Body',
      replyTo: { email: 'zara@example.pk' },
    });
  });

  it('sends through Resend with a bearer key, a "Name <address>" sender, and reply_to', async () => {
    const { http, calls } = fakeService(200);
    await new HttpMailer(
      {
        provider: 'resend',
        apiKey: 're_secret',
        from: 'onboarding@resend.dev',
        fromName: 'Bloomora',
      },
      http,
    ).send(mail);
    expect(calls[0].url).toBe('https://api.resend.com/emails');
    expect(calls[0].headers.Authorization).toBe('Bearer re_secret');
    expect(calls[0].body).toEqual({
      from: 'Bloomora <onboarding@resend.dev>',
      to: ['owner@bloomora.pk'],
      subject: 'Hello',
      text: 'Body',
      reply_to: 'zara@example.pk',
    });
  });

  it('leaves out reply-to when there is none, and flattens line breaks in the subject', async () => {
    const { http, calls } = fakeService(201);
    await new HttpMailer(
      { provider: 'brevo', apiKey: 'k', from: 'a@b.pk', fromName: 'Bloomora' },
      http,
    ).send({
      to: 'x@y.pk',
      subject: 'One\r\nBcc: attacker@evil.test',
      text: 't',
    });
    expect(calls[0].body.replyTo).toBeUndefined();
    expect(calls[0].body.subject).toBe('One Bcc: attacker@evil.test');
  });

  it('throws when the service refuses (for example an unverified sender), without putting the key in the error', async () => {
    const { http } = fakeService(400, '{"message":"Sender not valid"}');
    const mailer = new HttpMailer(
      {
        provider: 'brevo',
        apiKey: 'xkeysib-secret',
        from: 'a@b.pk',
        fromName: 'Bloomora',
      },
      http,
    );
    const err = await mailer.send(mail).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/refused the email \(400\)/);
    expect((err as Error).message).not.toContain('xkeysib-secret');
  });

  it('throws when the service cannot be reached', async () => {
    const down = (async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    await expect(
      new HttpMailer(
        { provider: 'resend', apiKey: 'k', from: 'a@b.pk', fromName: 'B' },
        down,
      ).send(mail),
    ).rejects.toThrow(/could not be reached/);
  });
});

describe('createMailer', () => {
  it('only logs emails when no service is set up', () => {
    expect(createMailer({})).toBeInstanceOf(ConsoleMailer);
  });

  it('uses Brevo or Resend when their key and a sender are present', () => {
    const brevo = createMailer({ BREVO_API_KEY: 'k', MAIL_FROM: 'a@b.pk' });
    expect(brevo).toBeInstanceOf(HttpMailer);
    expect((brevo as HttpMailer).provider).toBe('brevo');
    const resend = createMailer({ RESEND_API_KEY: 'k', MAIL_FROM: 'a@b.pk' });
    expect((resend as HttpMailer).provider).toBe('resend');
  });

  it('lets MAIL_PROVIDER choose when both keys exist', () => {
    const both = {
      BREVO_API_KEY: 'k',
      RESEND_API_KEY: 'k',
      MAIL_FROM: 'a@b.pk',
    };
    expect((createMailer(both) as HttpMailer).provider).toBe('brevo');
    expect(
      (createMailer({ ...both, MAIL_PROVIDER: 'resend' }) as HttpMailer)
        .provider,
    ).toBe('resend');
  });

  it('falls back to logging, instead of failing, when the sender address is missing', () => {
    expect(createMailer({ BREVO_API_KEY: 'k' })).toBeInstanceOf(ConsoleMailer);
  });
});
