import { Global, Logger, Module } from '@nestjs/common';

export interface TextMessage {
  to: string; // phone number
  text: string;
}

/** SMS / WhatsApp. A real provider is chosen in B5/B6; until then messages are only logged and kept in memory. */
export interface Messenger {
  send(message: TextMessage): Promise<void>;
}

export const MESSENGER = Symbol('MESSENGER');

export class ConsoleMessenger implements Messenger {
  readonly outbox: TextMessage[] = [];
  private readonly logger = new Logger('Messenger');

  async send(message: TextMessage) {
    this.outbox.push(message);
    this.logger.log(
      `to=${message.to}${process.env.NODE_ENV === 'production' ? '' : ` ${message.text}`}`,
    );
  }
}

@Global()
@Module({
  providers: [{ provide: MESSENGER, useClass: ConsoleMessenger }],
  exports: [MESSENGER],
})
export class MessagingModule {}
