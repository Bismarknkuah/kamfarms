import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { SettingsService, SETTING_KEYS } from '../settings/settings.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
  ) {}

  /** Built lazily, once, on first actual send attempt - not in the
   * constructor - so a deployment with no SMTP configured at all
   * (EMAIL_HOST unset) never even tries to construct a transporter,
   * and every other part of the app that doesn't touch email is
   * completely unaffected by whether this is configured. */
  private getTransporter(): nodemailer.Transporter | null {
    if (this.transporter) return this.transporter;
    const host = this.config.get<string>('EMAIL_HOST');
    if (!host) return null;
    const port = parseInt(this.config.get<string>('EMAIL_PORT', '587'), 10);
    const user = this.config.get<string>('EMAIL_USER');
    const password = this.config.get<string>('EMAIL_PASSWORD');
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && password ? { user, pass: password } : undefined,
    });
    return this.transporter;
  }

  /** The actual sender identity shown to recipients - the email
   * address itself (EMAIL_USER, since that's what the SMTP account is
   * actually authenticated as and able to send as) never changes
   * without redeploying, but the display name and the phone number
   * shown alongside it for SMS/WhatsApp are Admin-editable via
   * SystemSetting, exactly the capability this was built for. */
  private async getFromAddress(): Promise<string> {
    const configuredName = await this.settings.get(SETTING_KEYS.NOTIFICATION_FROM_NAME);
    const fromEmail = this.config.get<string>('EMAIL_USER', 'noreply@kam-roms.local');
    return configuredName ? `"${configuredName}" <${fromEmail}>` : fromEmail;
  }

  async sendPasswordReset(toEmail: string, resetUrl: string): Promise<void> {
    const transporter = this.getTransporter();
    if (!transporter) {
      // Deliberately not silent - this is exactly the failure mode
      // that made the reset flow unusable before: nobody ever
      // actually got the link. Logging it clearly, at warn level, so
      // it's visible in deploy logs as a genuine configuration gap
      // that still needs an SMTP provider connected, not merely
      // recorded as ordinary info-level noise.
      this.logger.warn(`EMAIL_HOST is not configured - password reset link for ${toEmail} was not sent: ${resetUrl}`);
      return;
    }
    const from = await this.getFromAddress();
    try {
      await transporter.sendMail({
        from,
        to: toEmail,
        subject: 'Reset your KAM-ROMS password',
        text: `Someone requested a password reset for your KAM-ROMS account.\n\nReset your password here (valid for 1 hour): ${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
        html: `<p>Someone requested a password reset for your KAM-ROMS account.</p><p><a href="${resetUrl}">Reset your password</a> (valid for 1 hour).</p><p>If you didn't request this, you can safely ignore this email.</p>`,
      });
    } catch (err) {
      // A failed send should never break the password-reset request
      // itself - the person still gets the same "if that account
      // exists..." response either way. Logging the reset url here
      // too, not just the error - confirmed directly that without
      // this, a misconfigured SMTP account (wrong app password, etc.)
      // would silently lose the only copy of the link entirely,
      // rather than falling back to the same visible-in-logs recovery
      // path as the "not configured at all" case above.
      this.logger.error(`Failed to send password reset email to ${toEmail}: ${(err as Error).message}. Reset link: ${resetUrl}`);
    }
  }
}
