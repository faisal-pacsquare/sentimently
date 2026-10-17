import {
  Body,
  Controller,
  Get,
  HttpCode,
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
import { AdminNotifier } from '../mail/admin-notifier';
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
  constructor(
    private readonly store: JsonStore,
    private readonly notifier: AdminNotifier,
  ) {}

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
    const label = TOPIC_LABEL[m.topic] ?? m.topic;
    await this.notifier.notify({
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
