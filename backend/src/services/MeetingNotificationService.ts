/**
 * MeetingNotificationService
 *
 * Handles email and SMS notifications for meetings:
 * - Invitation emails when participants are added
 * - Reminder emails/SMS before meetings
 * - Meeting update notifications
 * - Cancellation notifications
 */

import { Resend } from 'resend';
import Twilio from 'twilio';
import Meeting from '../models/Meeting';
import MeetingParticipant from '../models/MeetingParticipant';
import MarketplaceUser from '../models/MarketplaceUser';

// Initialize services
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const twilioClient =
  process.env.TWILIO_SID && process.env.TWILIO_AUTH_TOKEN
    ? Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM || 'noreply@dispotree.com';
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER;
const APP_NAME = process.env.APP_NAME || 'Dispotree';
const APP_URL = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000';

// =============================================================================
// TYPES
// =============================================================================

interface NotificationResult {
  success: boolean;
  channel: 'email' | 'sms';
  recipient: string;
  error?: string;
  messageId?: string;
}

interface MeetingEmailData {
  meeting: Meeting;
  participant: MeetingParticipant;
  organizer: { name: string; email: string };
  meetingUrl: string;
  rsvpUrl: string;
}

// =============================================================================
// SERVICE
// =============================================================================

class MeetingNotificationService {
  private initialized = false;

  async initialize(): Promise<void> {
    if (resend) {
      console.log('[MeetingNotification] Email service (Resend) initialized');
    } else {
      console.log('[MeetingNotification] Email service not configured (missing RESEND_API_KEY)');
    }

    if (twilioClient) {
      console.log('[MeetingNotification] SMS service (Twilio) initialized');
    } else {
      console.log('[MeetingNotification] SMS service not configured (missing TWILIO credentials)');
    }

    this.initialized = true;
  }

  isReady(): boolean {
    return this.initialized;
  }

  isEmailAvailable(): boolean {
    return resend !== null;
  }

  isSmsAvailable(): boolean {
    return twilioClient !== null && !!TWILIO_FROM_NUMBER;
  }

  // ===========================================================================
  // INVITATION NOTIFICATIONS
  // ===========================================================================

  /**
   * Send invitation to a newly added participant
   */
  async sendInvitation(
    meetingId: string,
    participantId: number,
    options?: { sendSms?: boolean }
  ): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];

    const meeting = await Meeting.findByPk(meetingId);
    if (!meeting) {
      return [{ success: false, channel: 'email', recipient: '', error: 'Meeting not found' }];
    }

    const participant = await MeetingParticipant.findByPk(participantId);
    if (!participant) {
      return [{ success: false, channel: 'email', recipient: '', error: 'Participant not found' }];
    }

    // Get organizer info
    const organizer = await MarketplaceUser.findByPk(meeting.createdById);
    const organizerName = organizer?.name || organizer?.email || 'Meeting Organizer';
    const organizerEmail = organizer?.email || FROM_EMAIL;

    const meetingUrl = `${APP_URL}/meetings/${meeting.id}`;
    const rsvpUrl = `${APP_URL}/meetings/${meeting.id}/rsvp?participant=${participantId}`;

    const emailData: MeetingEmailData = {
      meeting,
      participant,
      organizer: { name: organizerName, email: organizerEmail },
      meetingUrl,
      rsvpUrl,
    };

    // Send email invitation
    if (this.isEmailAvailable() && participant.email) {
      const emailResult = await this.sendInvitationEmail(emailData);
      results.push(emailResult);

      if (emailResult.success) {
        await participant.update({ emailInviteSent: true });
      }
    }

    // Send SMS invitation if requested and phone available
    if (options?.sendSms && this.isSmsAvailable() && participant.phone) {
      const smsResult = await this.sendInvitationSms(meeting, participant);
      results.push(smsResult);
    }

    return results;
  }

  /**
   * Send invitations to all participants who haven't received one
   */
  async sendPendingInvitations(meetingId: string): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];

    const participants = await MeetingParticipant.getNeedingInvites(meetingId);

    for (const participant of participants) {
      const participantResults = await this.sendInvitation(meetingId, participant.id);
      results.push(...participantResults);
    }

    return results;
  }

  // ===========================================================================
  // REMINDER NOTIFICATIONS
  // ===========================================================================

  /**
   * Send reminder to a participant
   */
  async sendReminder(
    meetingId: string,
    participantId: number,
    options?: { sendSms?: boolean }
  ): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];

    const meeting = await Meeting.findByPk(meetingId);
    if (!meeting) {
      return [{ success: false, channel: 'email', recipient: '', error: 'Meeting not found' }];
    }

    const participant = await MeetingParticipant.findByPk(participantId);
    if (!participant) {
      return [{ success: false, channel: 'email', recipient: '', error: 'Participant not found' }];
    }

    const meetingUrl = `${APP_URL}/meetings/${meeting.id}`;

    // Send email reminder
    if (this.isEmailAvailable() && participant.email) {
      const emailResult = await this.sendReminderEmail(meeting, participant, meetingUrl);
      results.push(emailResult);

      if (emailResult.success) {
        await participant.update({ emailReminderSent: true });
      }
    }

    // Send SMS reminder if requested
    if (options?.sendSms && this.isSmsAvailable() && participant.phone) {
      const smsResult = await this.sendReminderSms(meeting, participant);
      results.push(smsResult);
    }

    return results;
  }

  /**
   * Send reminders to all participants who need them
   */
  async sendPendingReminders(meetingId: string, options?: { sendSms?: boolean }): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];

    const participants = await MeetingParticipant.getNeedingReminders(meetingId);

    for (const participant of participants) {
      const participantResults = await this.sendReminder(meetingId, participant.id, options);
      results.push(...participantResults);
    }

    return results;
  }

  /**
   * Process all meetings needing reminders
   */
  async processScheduledReminders(): Promise<{ meetingsProcessed: number; notificationsSent: number }> {
    const meetings = await Meeting.getNeedingReminders();
    let notificationsSent = 0;

    for (const meeting of meetings) {
      const now = new Date();
      const meetingTime = new Date(meeting.scheduledAt);
      const reminderTime = new Date(meetingTime.getTime() - meeting.reminderMinutesBefore * 60000);

      // Check if it's time to send reminders
      if (now >= reminderTime && now < meetingTime) {
        const results = await this.sendPendingReminders(meeting.id, { sendSms: true });
        notificationsSent += results.filter(r => r.success).length;

        // Mark meeting as reminder sent
        await meeting.update({ reminderSent: true });
        console.log(`[MeetingNotification] Sent ${results.length} reminders for meeting ${meeting.id}`);
      }
    }

    return { meetingsProcessed: meetings.length, notificationsSent };
  }

  // ===========================================================================
  // UPDATE/CANCELLATION NOTIFICATIONS
  // ===========================================================================

  /**
   * Notify participants of meeting update
   */
  async sendUpdateNotification(
    meetingId: string,
    updateDetails: string
  ): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];

    const meeting = await Meeting.findByPk(meetingId);
    if (!meeting) return results;

    const participants = await MeetingParticipant.getForMeeting(meetingId);

    for (const participant of participants) {
      if (this.isEmailAvailable() && participant.email) {
        const result = await this.sendUpdateEmail(meeting, participant, updateDetails);
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Notify participants of meeting cancellation
   */
  async sendCancellationNotification(
    meetingId: string,
    reason?: string
  ): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];

    const meeting = await Meeting.findByPk(meetingId);
    if (!meeting) return results;

    const participants = await MeetingParticipant.getForMeeting(meetingId);

    for (const participant of participants) {
      if (this.isEmailAvailable() && participant.email) {
        const result = await this.sendCancellationEmail(meeting, participant, reason);
        results.push(result);
      }

      // Also send SMS for cancellations
      if (this.isSmsAvailable() && participant.phone) {
        const smsResult = await this.sendCancellationSms(meeting, participant, reason);
        results.push(smsResult);
      }
    }

    return results;
  }

  // ===========================================================================
  // EMAIL IMPLEMENTATIONS
  // ===========================================================================

  private async sendInvitationEmail(data: MeetingEmailData): Promise<NotificationResult> {
    if (!resend) {
      return { success: false, channel: 'email', recipient: data.participant.email, error: 'Email service not configured' };
    }

    const { meeting, participant, organizer, meetingUrl, rsvpUrl } = data;
    const formattedDate = this.formatMeetingDate(meeting.scheduledAt, meeting.timezone);
    const formattedDuration = this.formatDuration(meeting.duration);

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%); padding: 32px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Meeting Invitation</h1>
      </div>

      <!-- Content -->
      <div style="padding: 32px;">
        <p style="color: #374151; font-size: 16px; margin: 0 0 24px;">
          Hi ${participant.name},
        </p>

        <p style="color: #374151; font-size: 16px; margin: 0 0 24px;">
          <strong>${organizer.name}</strong> has invited you to a meeting:
        </p>

        <!-- Meeting Details Card -->
        <div style="background-color: #f9fafb; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
          <h2 style="color: #111827; font-size: 20px; margin: 0 0 16px; font-weight: 600;">
            ${meeting.title}
          </h2>

          <div style="color: #6b7280; font-size: 14px;">
            <p style="margin: 0 0 8px;">
              📅 <strong>Date:</strong> ${formattedDate}
            </p>
            <p style="margin: 0 0 8px;">
              ⏱️ <strong>Duration:</strong> ${formattedDuration}
            </p>
            ${meeting.location ? `<p style="margin: 0 0 8px;">📍 <strong>Location:</strong> ${meeting.location}</p>` : ''}
            ${meeting.meetingType === 'video' ? `<p style="margin: 0 0 8px;">🎥 <strong>Type:</strong> Video Call</p>` : ''}
          </div>

          ${meeting.description ? `
          <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 14px; margin: 0;">
              ${meeting.description}
            </p>
          </div>
          ` : ''}
        </div>

        <!-- Action Buttons -->
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${rsvpUrl}&response=accepted" style="display: inline-block; background-color: #10b981; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; margin: 0 8px 8px;">
            ✓ Accept
          </a>
          <a href="${rsvpUrl}&response=tentative" style="display: inline-block; background-color: #f59e0b; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; margin: 0 8px 8px;">
            ? Maybe
          </a>
          <a href="${rsvpUrl}&response=declined" style="display: inline-block; background-color: #ef4444; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; margin: 0 8px 8px;">
            ✕ Decline
          </a>
        </div>

        <div style="text-align: center;">
          <a href="${meetingUrl}" style="display: inline-block; background-color: #8b5cf6; color: #ffffff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 500;">
            View Meeting Details
          </a>
        </div>
      </div>

      <!-- Footer -->
      <div style="background-color: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">
          Sent via ${APP_NAME}
        </p>
      </div>
    </div>
  </div>
</body>
</html>
    `;

    try {
      const { data: emailData, error } = await resend.emails.send({
        from: `${organizer.name} via ${APP_NAME} <${FROM_EMAIL}>`,
        to: participant.email,
        subject: `Meeting Invitation: ${meeting.title}`,
        html,
        replyTo: organizer.email,
      });

      if (error) {
        return { success: false, channel: 'email', recipient: participant.email, error: error.message };
      }

      console.log(`[MeetingNotification] Sent invitation email to ${participant.email}`);
      return { success: true, channel: 'email', recipient: participant.email, messageId: emailData?.id };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, channel: 'email', recipient: participant.email, error };
    }
  }

  private async sendReminderEmail(
    meeting: Meeting,
    participant: MeetingParticipant,
    meetingUrl: string
  ): Promise<NotificationResult> {
    if (!resend) {
      return { success: false, channel: 'email', recipient: participant.email, error: 'Email service not configured' };
    }

    const formattedDate = this.formatMeetingDate(meeting.scheduledAt, meeting.timezone);
    const timeUntil = this.getTimeUntil(meeting.scheduledAt);

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 32px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">⏰ Meeting Reminder</h1>
      </div>

      <!-- Content -->
      <div style="padding: 32px;">
        <p style="color: #374151; font-size: 16px; margin: 0 0 24px;">
          Hi ${participant.name},
        </p>

        <p style="color: #374151; font-size: 16px; margin: 0 0 24px;">
          Your meeting <strong>"${meeting.title}"</strong> is starting ${timeUntil}.
        </p>

        <!-- Meeting Details -->
        <div style="background-color: #fef3c7; border-radius: 8px; padding: 24px; margin-bottom: 24px; border: 1px solid #f59e0b;">
          <p style="color: #92400e; font-size: 14px; margin: 0;">
            📅 ${formattedDate}
          </p>
        </div>

        <div style="text-align: center;">
          <a href="${meetingUrl}" style="display: inline-block; background-color: #f59e0b; color: #ffffff; padding: 14px 36px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
            Join Meeting
          </a>
        </div>
      </div>

      <!-- Footer -->
      <div style="background-color: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">
          Sent via ${APP_NAME}
        </p>
      </div>
    </div>
  </div>
</body>
</html>
    `;

    try {
      const { data: emailData, error } = await resend.emails.send({
        from: `${APP_NAME} <${FROM_EMAIL}>`,
        to: participant.email,
        subject: `Reminder: ${meeting.title} - ${timeUntil}`,
        html,
      });

      if (error) {
        return { success: false, channel: 'email', recipient: participant.email, error: error.message };
      }

      console.log(`[MeetingNotification] Sent reminder email to ${participant.email}`);
      return { success: true, channel: 'email', recipient: participant.email, messageId: emailData?.id };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, channel: 'email', recipient: participant.email, error };
    }
  }

  private async sendUpdateEmail(
    meeting: Meeting,
    participant: MeetingParticipant,
    updateDetails: string
  ): Promise<NotificationResult> {
    if (!resend) {
      return { success: false, channel: 'email', recipient: participant.email, error: 'Email service not configured' };
    }

    const meetingUrl = `${APP_URL}/meetings/${meeting.id}`;
    const formattedDate = this.formatMeetingDate(meeting.scheduledAt, meeting.timezone);

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background-color: #ffffff; border-radius: 12px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 32px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">📝 Meeting Updated</h1>
      </div>
      <div style="padding: 32px;">
        <p style="color: #374151; font-size: 16px;">Hi ${participant.name},</p>
        <p style="color: #374151; font-size: 16px;">The meeting <strong>"${meeting.title}"</strong> has been updated.</p>

        <div style="background-color: #dbeafe; border-radius: 8px; padding: 16px; margin: 24px 0;">
          <p style="color: #1e40af; margin: 0; font-size: 14px;"><strong>What changed:</strong></p>
          <p style="color: #1e40af; margin: 8px 0 0; font-size: 14px;">${updateDetails}</p>
        </div>

        <p style="color: #6b7280; font-size: 14px;">📅 ${formattedDate}</p>

        <div style="text-align: center; margin-top: 24px;">
          <a href="${meetingUrl}" style="display: inline-block; background-color: #3b82f6; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none;">View Details</a>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
    `;

    try {
      const { data: emailData, error } = await resend.emails.send({
        from: `${APP_NAME} <${FROM_EMAIL}>`,
        to: participant.email,
        subject: `Meeting Updated: ${meeting.title}`,
        html,
      });

      if (error) {
        return { success: false, channel: 'email', recipient: participant.email, error: error.message };
      }

      return { success: true, channel: 'email', recipient: participant.email, messageId: emailData?.id };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, channel: 'email', recipient: participant.email, error };
    }
  }

  private async sendCancellationEmail(
    meeting: Meeting,
    participant: MeetingParticipant,
    reason?: string
  ): Promise<NotificationResult> {
    if (!resend) {
      return { success: false, channel: 'email', recipient: participant.email, error: 'Email service not configured' };
    }

    const formattedDate = this.formatMeetingDate(meeting.scheduledAt, meeting.timezone);

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background-color: #ffffff; border-radius: 12px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 32px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Meeting Cancelled</h1>
      </div>
      <div style="padding: 32px;">
        <p style="color: #374151; font-size: 16px;">Hi ${participant.name},</p>
        <p style="color: #374151; font-size: 16px;">The following meeting has been cancelled:</p>

        <div style="background-color: #fef2f2; border-radius: 8px; padding: 16px; margin: 24px 0; border: 1px solid #fecaca;">
          <p style="color: #991b1b; margin: 0; font-size: 16px; font-weight: 600;">${meeting.title}</p>
          <p style="color: #991b1b; margin: 8px 0 0; font-size: 14px;">📅 Originally scheduled: ${formattedDate}</p>
          ${reason ? `<p style="color: #991b1b; margin: 8px 0 0; font-size: 14px;">💬 Reason: ${reason}</p>` : ''}
        </div>

        <p style="color: #6b7280; font-size: 14px;">We apologize for any inconvenience.</p>
      </div>
    </div>
  </div>
</body>
</html>
    `;

    try {
      const { data: emailData, error } = await resend.emails.send({
        from: `${APP_NAME} <${FROM_EMAIL}>`,
        to: participant.email,
        subject: `Meeting Cancelled: ${meeting.title}`,
        html,
      });

      if (error) {
        return { success: false, channel: 'email', recipient: participant.email, error: error.message };
      }

      return { success: true, channel: 'email', recipient: participant.email, messageId: emailData?.id };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, channel: 'email', recipient: participant.email, error };
    }
  }

  // ===========================================================================
  // SMS IMPLEMENTATIONS
  // ===========================================================================

  private async sendInvitationSms(meeting: Meeting, participant: MeetingParticipant): Promise<NotificationResult> {
    if (!twilioClient || !TWILIO_FROM_NUMBER || !participant.phone) {
      return { success: false, channel: 'sms', recipient: participant.phone || '', error: 'SMS not configured or no phone' };
    }

    const formattedDate = this.formatMeetingDateShort(meeting.scheduledAt, meeting.timezone);
    const message = `📅 Meeting Invite: "${meeting.title}" on ${formattedDate}. View details: ${APP_URL}/meetings/${meeting.id}`;

    try {
      const result = await twilioClient.messages.create({
        body: message,
        from: TWILIO_FROM_NUMBER,
        to: participant.phone,
      });

      console.log(`[MeetingNotification] Sent invitation SMS to ${participant.phone}`);
      return { success: true, channel: 'sms', recipient: participant.phone, messageId: result.sid };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, channel: 'sms', recipient: participant.phone, error };
    }
  }

  private async sendReminderSms(meeting: Meeting, participant: MeetingParticipant): Promise<NotificationResult> {
    if (!twilioClient || !TWILIO_FROM_NUMBER || !participant.phone) {
      return { success: false, channel: 'sms', recipient: participant.phone || '', error: 'SMS not configured or no phone' };
    }

    const timeUntil = this.getTimeUntil(meeting.scheduledAt);
    const message = `⏰ Reminder: "${meeting.title}" starts ${timeUntil}. Join: ${APP_URL}/meetings/${meeting.id}`;

    try {
      const result = await twilioClient.messages.create({
        body: message,
        from: TWILIO_FROM_NUMBER,
        to: participant.phone,
      });

      console.log(`[MeetingNotification] Sent reminder SMS to ${participant.phone}`);
      return { success: true, channel: 'sms', recipient: participant.phone, messageId: result.sid };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, channel: 'sms', recipient: participant.phone, error };
    }
  }

  private async sendCancellationSms(
    meeting: Meeting,
    participant: MeetingParticipant,
    reason?: string
  ): Promise<NotificationResult> {
    if (!twilioClient || !TWILIO_FROM_NUMBER || !participant.phone) {
      return { success: false, channel: 'sms', recipient: participant.phone || '', error: 'SMS not configured or no phone' };
    }

    const message = `❌ Meeting Cancelled: "${meeting.title}" has been cancelled.${reason ? ` Reason: ${reason}` : ''}`;

    try {
      const result = await twilioClient.messages.create({
        body: message,
        from: TWILIO_FROM_NUMBER,
        to: participant.phone,
      });

      return { success: true, channel: 'sms', recipient: participant.phone, messageId: result.sid };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, channel: 'sms', recipient: participant.phone, error };
    }
  }

  // ===========================================================================
  // UTILITY METHODS
  // ===========================================================================

  private formatMeetingDate(date: Date, timezone: string): string {
    try {
      return new Date(date).toLocaleString('en-US', {
        timeZone: timezone,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      });
    } catch {
      return new Date(date).toLocaleString();
    }
  }

  private formatMeetingDateShort(date: Date, timezone: string): string {
    try {
      return new Date(date).toLocaleString('en-US', {
        timeZone: timezone,
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return new Date(date).toLocaleString();
    }
  }

  private formatDuration(minutes: number): string {
    if (minutes < 60) return `${minutes} minutes`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
    return `${hours} hour${hours > 1 ? 's' : ''} ${mins} min`;
  }

  private getTimeUntil(date: Date): string {
    const now = new Date();
    const diff = new Date(date).getTime() - now.getTime();
    const minutes = Math.round(diff / 60000);

    if (minutes < 1) return 'now';
    if (minutes === 1) return 'in 1 minute';
    if (minutes < 60) return `in ${minutes} minutes`;

    const hours = Math.round(minutes / 60);
    if (hours === 1) return 'in 1 hour';
    if (hours < 24) return `in ${hours} hours`;

    const days = Math.round(hours / 24);
    if (days === 1) return 'tomorrow';
    return `in ${days} days`;
  }
}

export const meetingNotificationService = new MeetingNotificationService();
