const nodemailer = require('nodemailer');
const { getConfig } = require('./store');

function getTransporter() {
  const config = getConfig();
  const { smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, smtp_secure } = config;

  if (!smtp_host) {
    throw new Error('SMTP not configured. Go to Settings → Email / SMTP to set up outbound email.');
  }

  return nodemailer.createTransport({
    host: smtp_host,
    port: parseInt(smtp_port || '587', 10),
    secure: smtp_secure === 'true',
    auth: (smtp_user && smtp_pass) ? {
      user: smtp_user,
      pass: smtp_pass,
    } : undefined,
    tls: { rejectUnauthorized: false },
  });
}

async function sendPasswordResetEmail(toEmail, userName, resetUrl) {
  const config = getConfig();
  const fromAddress = config.smtp_from || config.smtp_user || 'noreply@ringsense-dashboard.com';
  const appName = 'RingSense Dashboard';

  const transporter = getTransporter();

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="color: #1a1a1a; font-size: 20px; margin: 0;">Password Reset</h2>
        <p style="color: #666; font-size: 14px; margin-top: 8px;">${appName}</p>
      </div>
      <p style="color: #333; font-size: 14px; line-height: 1.6;">
        Hi ${userName || 'there'},
      </p>
      <p style="color: #333; font-size: 14px; line-height: 1.6;">
        We received a request to reset your password. Click the button below to choose a new password. This link expires in 1 hour.
      </p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${resetUrl}" style="display: inline-block; padding: 12px 32px; background: #F47920; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
          Reset Password
        </a>
      </div>
      <p style="color: #999; font-size: 12px; line-height: 1.5;">
        If you didn't request this, you can safely ignore this email. Your password won't be changed.
      </p>
      <p style="color: #999; font-size: 12px; line-height: 1.5;">
        Link not working? Copy and paste this URL into your browser:<br/>
        <span style="color: #666; word-break: break-all;">${resetUrl}</span>
      </p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
      <p style="color: #bbb; font-size: 11px; text-align: center;">
        ${appName} • Sent automatically, do not reply
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: `"${appName}" <${fromAddress}>`,
    to: toEmail,
    subject: `Password Reset — ${appName}`,
    html,
    text: `Hi ${userName || 'there'},\n\nWe received a request to reset your password. Visit this link within 1 hour:\n\n${resetUrl}\n\nIf you didn't request this, ignore this email.`,
  });

  console.log(`[EMAIL] Password reset sent to ${toEmail}`);
}

async function testSmtpConnection() {
  const transporter = getTransporter();
  await transporter.verify();
  return { success: true, message: 'SMTP connection verified.' };
}

module.exports = { sendPasswordResetEmail, testSmtpConnection };
