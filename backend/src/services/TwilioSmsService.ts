import Twilio from 'twilio';

/**
 * Twilio SMS Service
 *
 * Handles sending SMS messages via Twilio API.
 * Used for signature request links and other notifications.
 */
class TwilioSmsService {
  private client: Twilio.Twilio | null = null;
  private fromNumber: string | null = null;
  private initialized = false;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize Twilio client with credentials from environment
   */
  private initialize(): void {
    const accountSid = process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_FROM_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      console.warn('⚠️ TwilioSmsService: Missing Twilio credentials, SMS features will be disabled');
      return;
    }

    try {
      this.client = Twilio(accountSid, authToken);
      this.fromNumber = fromNumber;
      this.initialized = true;
      console.log('✅ TwilioSmsService: Initialized successfully');
    } catch (error) {
      console.error('❌ TwilioSmsService: Failed to initialize:', error);
    }
  }

  /**
   * Check if the service is ready to send SMS
   */
  isReady(): boolean {
    return this.initialized && this.client !== null && this.fromNumber !== null;
  }

  /**
   * Format phone number to E.164 format
   * Assumes US numbers if no country code provided
   */
  private formatPhoneNumber(phone: string): string {
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');

    // If already has country code (11 digits starting with 1), add +
    if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits}`;
    }

    // If 10 digits, assume US and add +1
    if (digits.length === 10) {
      return `+1${digits}`;
    }

    // Otherwise return as-is with + prefix
    return digits.startsWith('+') ? phone : `+${digits}`;
  }

  /**
   * Send an SMS message
   */
  async sendSms(to: string, body: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.isReady()) {
      return { success: false, error: 'Twilio SMS service is not configured' };
    }

    try {
      const formattedTo = this.formatPhoneNumber(to);

      const message = await this.client!.messages.create({
        body,
        from: this.fromNumber!,
        to: formattedTo,
      });

      console.log(`📱 SMS sent to ${formattedTo}: ${message.sid}`);

      return {
        success: true,
        messageId: message.sid,
      };
    } catch (error: any) {
      console.error('❌ Failed to send SMS:', error);
      return {
        success: false,
        error: error.message || 'Failed to send SMS',
      };
    }
  }

  /**
   * Send signature request SMS to a contact
   */
  async sendSignatureRequestSms(
    phoneNumber: string,
    signatureUrl: string,
    contactName?: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const message = `You've been asked to provide your signature on file. Please tap the link below to upload a photo of your signature:

${signatureUrl}

This link expires in 48 hours.`;

    return this.sendSms(phoneNumber, message);
  }

  /**
   * Send a reminder SMS for pending signature request
   */
  async sendSignatureReminderSms(
    phoneNumber: string,
    signatureUrl: string,
    hoursRemaining: number
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const message = `Reminder: You still need to provide your signature on file. Please tap the link below:

${signatureUrl}

This link expires in ${hoursRemaining} hours.`;

    return this.sendSms(phoneNumber, message);
  }
}

// Export singleton instance
export const twilioSmsService = new TwilioSmsService();
export default twilioSmsService;
