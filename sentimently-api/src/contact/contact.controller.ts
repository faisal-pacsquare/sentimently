import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Logger,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Public, Roles } from '../auth/auth.decorators';
import { MAILER, Mailer } from '../mail/mailer';
import { JsonStore } from '../storage/json-store.service';
import { Doc } from '../storage/storage.types';

/** The prototype's form has 6 topics; the exact names were not captured, so these are assumed. */
export const TOPICS = [
  'order',
  'delivery',
  'payment',
  'personalisation',
  'bulk_gifting',
  'other',
] as const;

export class ContactDto {
  @IsString() @MaxLength(100) name!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(40) orderNumber?: string;
  @IsIn(TOPICS) topic!: (typeof TOPICS)[number];
  @IsString() @MaxLength(150) subject!: string;
  @IsString() @MaxLength(5000) message!: string;
}

export class ContactStatusDto {
  @IsIn(['new', 'in_progress', 'closed']) status!:
    'new' | 'in_progress' | 'closed';
}

interface ContactMessage extends Doc, Omit<ContactDto, 'topic'> {
  topic: string;
  status: string;
}

const TOPIC_LABEL: Record<string, string> = {
  order: 'My order',
  delivery: 'Delivery',
  payment: 'Payment',
  personalisation: 'Personalising a gift',
  bulk_gifting: 'Bulk or corporate gifting',
  other: 'Something else',
};

@Controller()
export class ContactController {
  private readonly logger = new Logger('Contact');

  constructor(
    private readonly store: JsonStore,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  /** Who is told about a new message: CONTACT_TO, else ALERT_EMAIL, else the shop email in Settings, else the admin. */
  private async recipient(): Promise<string | undefined> {
    const config = await this.store.get<Doc & { contactEmail?: string | null }>(
      'storeConfig',
      'main',
    );
    return (
      process.env.CONTACT_TO ||
      process.env.ALERT_EMAIL ||
      config?.contactEmail ||
      process.env.ADMIN_EMAIL ||
      undefined
    );
  }

  /** The message is already safe in the studio inbox; an email is a nudge, so a failure never fails the form. */
  private async notify(m: ContactMessage) {
    try {
      const to = await this.recipient();
      if (!to) {
        this.logger.warn(
          'No address to email new messages to (set CONTACT_TO)',
        );
        return;
      }
      const label = TOPIC_LABEL[m.topic] ?? m.topic;
      await this.mailer.send({
        to,
        replyTo: m.email,
        subject: `${m.topic === 'bulk_gifting' ? '[Bulk enquiry]' : '[Contact]'} ${label}: ${m.subject}`,
        text: [
          `A new message from the shop's contact form.`,
          ``,
          `From:    ${m.name} <${m.email}>`,
          m.phone ? `Phone:   ${m.phone}` : undefined,
          m.orderNumber ? `Order:   ${m.orderNumber}` : undefined,
          `Topic:   ${label}`,
          `Subject: ${m.subject}`,
          ``,
          m.message,
          ``,
          `Reply to this email to answer ${m.name}. The message is also in the studio inbox.`,
        ]
          .filter((l) => l !== undefined)
          .join('\n'),
      });
    } catch (e) {
      this.logger.error(`Could not email the new message: ${String(e)}`);
    }
  }

  /** Contact form and bulk-gifting enquiries (topic bulk_gifting). Tight limit: it is a public write. */
  @Post('contact')
  @Public()
  @HttpCode(201)
  @Throttle({
    default: {
      limit: () => Number(process.env.CONTACT_RATE_LIMIT ?? 5),
      ttl: () => 60_000,
    },
  })
  async create(@Body() dto: ContactDto) {
    const m = await this.store.insert<ContactMessage>('contactMessages', {
      ...dto,
      email: dto.email.toLowerCase(),
      status: 'new',
    });
    await this.notify(m);
    return { id: m.id, message: 'Thank you. We will get back to you soon.' };
  }

  @Get('admin/contact')
  @Roles('staff', 'admin')
  list() {
    return this.store.all<ContactMessage>('contactMessages');
  }

  @Patch('admin/contact/:id')
  @Roles('staff', 'admin')
  async setStatus(@Param('id') id: string, @Body() dto: ContactStatusDto) {
    const m = await this.store.update<ContactMessage>('contactMessages', id, {
      status: dto.status,
    });
    if (!m) throw new NotFoundException('Message not found');
    return m;
  }
}

@Module({ controllers: [ContactController] })
export class ContactModule {}
