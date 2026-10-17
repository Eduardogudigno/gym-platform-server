import { logger } from '../../config/logger';

export interface Mailer {
  send(input: { to: string; subject: string; text: string }): Promise<void>;
}

export class LogMailer implements Mailer {
  async send(input: { to: string; subject: string; text: string }): Promise<void> {
    logger.info({ to: input.to, subject: input.subject, text: input.text }, 'email dispatched');
  }
}
