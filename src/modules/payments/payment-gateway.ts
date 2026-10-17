import { createHmac } from 'crypto';
import { AppError } from '../../common/errors/app-error';
import { safeEqual } from '../../common/crypto';
import type { PaymentStatus } from '../../common/types/domain';

export interface CreateIntentInput {
  paymentId: string;
  amount: string;
  currency: string;
  subscriptionId: string;
}

export interface PaymentIntentResult {
  provider: string;
  providerReference: string | null;
  clientSecret: string | null;
}

export interface WebhookEvent {
  paymentId: string;
  status: Extract<PaymentStatus, 'completed' | 'failed'>;
  providerReference?: string;
}

export interface PaymentGateway {
  readonly provider: string;
  createIntent(input: CreateIntentInput): Promise<PaymentIntentResult>;
  parseWebhook(headers: Record<string, string | string[] | undefined>, rawBody: Buffer): Promise<WebhookEvent>;
}

export class ManualGateway implements PaymentGateway {
  readonly provider = 'manual';

  constructor(private readonly webhookSecret: string) {}

  async createIntent(input: CreateIntentInput): Promise<PaymentIntentResult> {
    return {
      provider: this.provider,
      providerReference: `manual_${input.paymentId}`,
      clientSecret: null,
    };
  }

  async parseWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer,
  ): Promise<WebhookEvent> {
    if (!this.webhookSecret) {
      throw new AppError(503, 'WEBHOOK_NOT_CONFIGURED', 'WEBHOOK_SECRET is not configured');
    }
    const header = headers['x-gym-signature'];
    const signature = Array.isArray(header) ? header[0] : header;
    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    if (!signature || !safeEqual(signature, expected)) {
      throw new AppError(401, 'INVALID_SIGNATURE', 'Invalid webhook signature');
    }
    let body: { paymentId?: string; status?: string; providerReference?: string };
    try {
      body = JSON.parse(rawBody.toString('utf8')) as typeof body;
    } catch {
      throw new AppError(400, 'INVALID_JSON', 'Malformed JSON body');
    }
    if (!body.paymentId || (body.status !== 'completed' && body.status !== 'failed')) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Webhook payload is invalid');
    }
    return {
      paymentId: body.paymentId,
      status: body.status,
      ...(body.providerReference ? { providerReference: body.providerReference } : {}),
    };
  }
}

export class StripeGateway implements PaymentGateway {
  readonly provider = 'stripe';

  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string,
  ) {}

  async createIntent(): Promise<PaymentIntentResult> {
    if (!this.secretKey) {
      throw new AppError(501, 'GATEWAY_NOT_CONFIGURED', 'Stripe is not configured');
    }
    throw new AppError(
      501,
      'GATEWAY_NOT_CONFIGURED',
      'StripeGateway.createIntent is the adapter boundary. The Stripe SDK call belongs here.',
    );
  }

  async parseWebhook(): Promise<WebhookEvent> {
    if (!this.webhookSecret) {
      throw new AppError(501, 'GATEWAY_NOT_CONFIGURED', 'Stripe webhooks are not configured');
    }
    throw new AppError(
      501,
      'GATEWAY_NOT_CONFIGURED',
      'StripeGateway.parseWebhook is the adapter boundary. Signature verification belongs here.',
    );
  }
}

export class PaymentGatewayRegistry {
  constructor(private readonly gateways: PaymentGateway[]) {}

  get(provider: string): PaymentGateway {
    const gateway = this.gateways.find((item) => item.provider === provider);
    if (!gateway) throw new AppError(404, 'UNKNOWN_PROVIDER', `Unknown payment provider ${provider}`);
    return gateway;
  }
}
