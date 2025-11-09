// Email service using Resend API for sending notifications
// https://resend.com/docs/api-reference/emails/send-email

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM_EMAIL = "Rezora <Rezora@updates.rezora.io>";
const RESEND_API_URL = "https://api.resend.com/emails";

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

/**
 * Base function to send email via Resend API
 */
async function sendEmail({ to, subject, html }: SendEmailParams): Promise<boolean> {
  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Resend API error:", error);
      return false;
    }

    const result = await response.json();
    console.log("Email sent successfully:", result.id);
    return true;
  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
}

/**
 * Send low balance warning (proactive, before billing is due)
 */
export async function sendLowBalanceWarning({
  user_email,
  current_balance,
  required_amount,
  billing_date,
  phone_numbers,
}: {
  user_email: string;
  current_balance: number;
  required_amount: number;
  billing_date: string;
  phone_numbers: string[];
}): Promise<boolean> {
  const currentBalanceDollars = `$${(current_balance / 100).toFixed(2)}`;
  const requiredAmountDollars = `$${(required_amount / 100).toFixed(2)}`;
  const billingDateFormatted = new Date(billing_date).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const phoneList = phone_numbers.map((num) => `<li style="margin: 4px 0;">${num}</li>`).join("");

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">💳 Low Balance Alert</h1>
        </div>

        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e9ecef;">
          <p style="font-size: 16px; margin-top: 0;">Your account balance is running low, and you have phone charges due soon.</p>

          <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #fbbf24; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; font-weight: 600;">Current Balance:</td>
                <td style="padding: 8px 0; text-align: right; color: #dc2626;">${currentBalanceDollars}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: 600;">Amount Needed:</td>
                <td style="padding: 8px 0; text-align: right; color: #16a34a;">${requiredAmountDollars}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: 600;">Billing Date:</td>
                <td style="padding: 8px 0; text-align: right;">${billingDateFormatted}</td>
              </tr>
            </table>
          </div>

          <p style="font-weight: 600; margin-bottom: 8px;">Phone numbers at risk:</p>
          <ul style="list-style: none; padding: 0; background: white; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            ${phoneList}
          </ul>

          <p style="font-weight: 600; margin-bottom: 12px;">Action needed:</p>
          <ol style="margin: 0 0 20px 20px; padding-left: 0;">
            <li style="margin: 8px 0;">Add credits to your account before ${billingDateFormatted}</li>
            <li style="margin: 8px 0;">Or set up auto-reload to prevent this in the future</li>
          </ol>

          <div style="text-align: center; margin-top: 30px;">
            <a href="https://rezora.io/billing" style="display: inline-block; background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 0 8px;">Add Credits</a>
            <a href="https://rezora.io/billing#auto-reload" style="display: inline-block; background: #10b981; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 0 8px;">Set Up Auto-Reload</a>
          </div>

          <p style="font-size: 14px; color: #6b7280; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            If you don't add credits before the billing date, your phone numbers will enter a 7-day grace period. After that, they will be permanently deleted.
          </p>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: user_email,
    subject: "💳 Low Balance Alert - Phone Billing Due Soon",
    html,
  });
}

/**
 * Send grace period started notification
 */
export async function sendGracePeriodStarted({
  user_email,
  phone_number,
  grace_period_expires,
  days_remaining,
}: {
  user_email: string;
  phone_number: string;
  grace_period_expires: string;
  days_remaining: number;
}): Promise<boolean> {
  const expiresFormatted = new Date(grace_period_expires).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #f59e0b 0%, #dc2626 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">⚠️ Phone Number at Risk</h1>
        </div>

        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e9ecef;">
          <p style="font-size: 16px; margin-top: 0;">Your phone number <strong>${phone_number}</strong> couldn't be charged due to insufficient balance.</p>

          <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #f59e0b; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; font-weight: 600;">Grace Period:</td>
                <td style="padding: 8px 0; text-align: right;">${days_remaining} days remaining</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: 600;">Expires On:</td>
                <td style="padding: 8px 0; text-align: right; color: #dc2626;">${expiresFormatted}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: 600;">Amount Needed:</td>
                <td style="padding: 8px 0; text-align: right;">$5.00</td>
              </tr>
            </table>
          </div>

          <div style="background: #fef3c7; border: 2px solid #fbbf24; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0; font-weight: 600; color: #92400e;">⏰ Important:</p>
            <p style="margin: 8px 0 0 0; color: #92400e;">If you don't add credits before <strong>${expiresFormatted}</strong>, your phone number will be permanently deleted and cannot be recovered.</p>
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <a href="https://rezora.io/billing" style="display: inline-block; background: #dc2626; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 0 8px;">Add Credits Now</a>
            <a href="https://rezora.io/billing#auto-reload" style="display: inline-block; background: #10b981; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 0 8px;">Set Up Auto-Reload</a>
          </div>

          <p style="font-size: 14px; color: #6b7280; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            We'll send you daily reminders until you add credits or the grace period expires.
          </p>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: user_email,
    subject: "⚠️ Phone Number at Risk - Add Credits Within 7 Days",
    html,
  });
}

/**
 * Send daily grace period reminder
 */
export async function sendGracePeriodReminder({
  user_email,
  phone_number,
  days_remaining,
  amount_needed,
}: {
  user_email: string;
  phone_number: string;
  days_remaining: number;
  amount_needed: number;
}): Promise<boolean> {
  const amountDollars = `$${(amount_needed / 100).toFixed(2)}`;
  const urgency = days_remaining <= 2 ? "🚨 URGENT" : "⚠️ Reminder";

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: ${days_remaining <= 2 ? '#dc2626' : '#f59e0b'}; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">${urgency}: ${days_remaining} ${days_remaining === 1 ? 'Day' : 'Days'} Left</h1>
        </div>

        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e9ecef;">
          <p style="font-size: 18px; margin-top: 0; font-weight: 600;">Your phone number <strong>${phone_number}</strong> will be deleted in ${days_remaining} ${days_remaining === 1 ? 'day' : 'days'}.</p>

          <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #dc2626; margin: 20px 0;">
            <p style="margin: 0; font-size: 16px;">Amount needed: <strong style="font-size: 24px; color: #dc2626;">${amountDollars}</strong></p>
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <a href="https://rezora.io/billing" style="display: inline-block; background: #dc2626; color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Add Credits Immediately</a>
          </div>

          <p style="font-size: 14px; color: #6b7280; margin-top: 30px; text-align: center;">
            Once deleted, phone numbers cannot be recovered.
          </p>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: user_email,
    subject: `${urgency}: Phone Number Will Be Deleted in ${days_remaining} ${days_remaining === 1 ? 'Day' : 'Days'}`,
    html,
  });
}

/**
 * Send auto-reload failed notification
 */
export async function sendAutoReloadFailed({
  user_email,
  error_message,
  phone_numbers_at_risk,
}: {
  user_email: string;
  error_message: string;
  phone_numbers_at_risk: string[];
}): Promise<boolean> {
  const phoneList = phone_numbers_at_risk.length > 0
    ? phone_numbers_at_risk.map((num) => `<li style="margin: 4px 0;">${num} (will be deleted in 7 days)</li>`).join("")
    : "<li>No phone numbers at risk</li>";

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">❌ Auto-Reload Failed</h1>
        </div>

        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e9ecef;">
          <p style="font-size: 16px; margin-top: 0;">Your automatic credit reload failed and needs your attention.</p>

          <div style="background: #fee2e2; border: 2px solid #dc2626; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0; font-weight: 600; color: #991b1b;">Error:</p>
            <p style="margin: 8px 0 0 0; color: #991b1b;">${error_message}</p>
          </div>

          ${phone_numbers_at_risk.length > 0 ? `
          <p style="font-weight: 600; margin-bottom: 8px;">Phone numbers at risk:</p>
          <ul style="list-style: none; padding: 0; background: white; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            ${phoneList}
          </ul>
          ` : ''}

          <p style="font-weight: 600; margin-bottom: 12px;">Please take action:</p>
          <ol style="margin: 0 0 20px 20px; padding-left: 0;">
            <li style="margin: 8px 0;">Update your payment method</li>
            <li style="margin: 8px 0;">Or add credits manually</li>
          </ol>

          <div style="text-align: center; margin-top: 30px;">
            <a href="https://rezora.io/billing#auto-reload" style="display: inline-block; background: #dc2626; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 0 8px;">Update Payment Method</a>
            <a href="https://rezora.io/billing" style="display: inline-block; background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 0 8px;">Add Credits</a>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: user_email,
    subject: "❌ Auto-Reload Failed - Update Payment Method",
    html,
  });
}

/**
 * Send phone deleted notification
 */
export async function sendPhoneDeleted({
  user_email,
  phone_number,
  deletion_reason,
}: {
  user_email: string;
  phone_number: string;
  deletion_reason: string;
}): Promise<boolean> {
  const reasonText = deletion_reason === "grace_period_expired"
    ? "The 7-day grace period expired without sufficient credits being added."
    : "Insufficient credits for monthly billing.";

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #6b7280 0%, #374151 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">📞 Phone Number Deleted</h1>
        </div>

        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e9ecef;">
          <p style="font-size: 16px; margin-top: 0;">Your phone number <strong>${phone_number}</strong> has been deleted from your account.</p>

          <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #6b7280; margin: 20px 0;">
            <p style="margin: 0; font-weight: 600;">Reason:</p>
            <p style="margin: 8px 0 0 0;">${reasonText}</p>
          </div>

          <p style="font-weight: 600; margin-bottom: 12px;">To get a new phone number:</p>
          <ol style="margin: 0 0 20px 20px; padding-left: 0;">
            <li style="margin: 8px 0;">Add credits to your account</li>
            <li style="margin: 8px 0;">Purchase a new phone number</li>
            <li style="margin: 8px 0;">Set up auto-reload to prevent this in the future</li>
          </ol>

          <div style="text-align: center; margin-top: 30px;">
            <a href="https://rezora.io/billing" style="display: inline-block; background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 0 8px;">Add Credits</a>
            <a href="https://rezora.io/agents" style="display: inline-block; background: #10b981; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 0 8px;">Browse Phone Numbers</a>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: user_email,
    subject: "📞 Phone Number Deleted",
    html,
  });
}
