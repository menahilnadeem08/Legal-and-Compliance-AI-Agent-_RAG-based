import { logger } from './logger';
import nodemailer from 'nodemailer';

// Create transporter based on configuration
function createTransporter() {
  console.log('[EMAIL-CONFIG] Initializing email transporter...');
  
  // For custom SMTP (e.g., Office 365, custom domain, etc.)
  if (process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
    console.log('[EMAIL-CONFIG] ✓ Using custom SMTP configuration');
    console.log(`[EMAIL-CONFIG]   Host: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}`);
    console.log(`[EMAIL-CONFIG]   User: ${process.env.SMTP_USER}`);
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10),
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      }
    });
  }

  // Fallback to Gmail SMTP
  if (process.env.GMAIL_USER && process.env.GMAIL_PASSWORD) {
    console.log('[EMAIL-CONFIG] ✓ Using Gmail SMTP configuration');
    console.log(`[EMAIL-CONFIG]   User: ${process.env.GMAIL_USER}`);
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASSWORD
      }
    });
  }

  // Return null transporter if no config
  console.log('[EMAIL-CONFIG] ⚠️  No email configuration found!');
  console.log('[EMAIL-CONFIG]    Set GMAIL_USER + GMAIL_PASSWORD OR SMTP_HOST + SMTP_PORT + SMTP_USER + SMTP_PASSWORD');
  return null;
}

const transporter = createTransporter();

export interface EmailMessage {
  to: string;
  from: string;
  subject: string;
  html: string;
}

/**
 * Email service for sending transactional emails via Nodemailer
 * Supports both Gmail SMTP and custom SMTP (Office 365, custom domains, etc.)
 */
export class EmailService {
  /**
   * Send temporary password email for employee onboarding
   * @param email - Employee email address
   * @param username - Employee username
   * @param tempPassword - Temporary password for first login
   * @param name - Employee name
   * @param adminName - Admin name who created the account
   * @param expiresAt - When the temporary password expires
   */
  static async sendEmployeeTempPasswordEmail(
    email: string,
    username: string,
    tempPassword: string,
    name: string,
    adminName: string,
    expiresAt?: Date
  ): Promise<void> {
    const expiryTime = expiresAt ? expiresAt.toLocaleString() : 'in 2 hours';
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    
    const message: EmailMessage = {
      to: email,
      from: process.env.SMTP_USER || process.env.GMAIL_USER || 'noreply@yourdomain.com',
      subject: 'Legal Compliance RAG - Your Temporary Login Credentials',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px;">Welcome to Legal Compliance RAG</h2>
          
          <p>Hello <strong>${name}</strong>,</p>
          
          <p><strong>${adminName}</strong> has created an account for you at Legal Compliance RAG. Your account is ready to use with the temporary credentials below.</p>
          
          <div style="background-color: #f5f5f5; padding: 20px; border-left: 4px solid #4CAF50; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #333;">Your Login Credentials</h3>
            <p style="margin: 10px 0;">
              <strong>Username:</strong> <code style="background-color: #fff; padding: 5px 10px; border-radius: 3px;">${username}</code>
            </p>
            <p style="margin: 10px 0;">
              <strong>Temporary Password:</strong> <code style="background-color: #fff; padding: 5px 10px; border-radius: 3px; font-family: monospace;">${tempPassword}</code>
            </p>
            <p style="color: #d32f2f; font-weight: bold; margin: 10px 0;">
              ⏱️  This password is valid until: <strong>${expiryTime}</strong>
            </p>
          </div>
          
          <h3 style="color: #333;">First Time Login</h3>
          <ol style="line-height: 1.8; color: #555;">
            <li>Go to <a href="${appUrl}" style="color: #4CAF50; text-decoration: none;">${appUrl}</a></li>
            <li>Click <strong>"Login"</strong></li>
            <li>Enter your username and temporary password</li>
            <li>You will be immediately prompted to <strong>create a new password</strong></li>
            <li>Create a strong password and you're all set!</li>
          </ol>
          
          <p style="color: #d32f2f; font-weight: bold;">⚠️  Important Security Notes:</p>
          <ul style="line-height: 1.8; color: #555;">
            <li>Your temporary password will expire in 2 hours</li>
            <li>You must set a permanent password on your first login</li>
            <li>Never share your password with anyone</li>
            <li>Contact your administrator if you don't receive this email</li>
          </ul>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
            <p style="color: #666; font-size: 12px;">
              If you have any questions or encounter any issues, please contact ${adminName} or your support team.
            </p>
            <p style="color: #999; font-size: 11px;">
              This is an automated email, please do not reply. This temporary password was generated automatically for security purposes.
            </p>
          </div>
        </div>
      `
    };

    await this.sendEmail(message);
  }

  /**
   * Send OTP verification email for admin signup
   */
  static async sendOtpEmail(
    email: string,
    otp: string,
    name: string
  ): Promise<void> {
    const message: EmailMessage = {
      to: email,
      from: process.env.SMTP_USER || process.env.GMAIL_USER || 'noreply@yourdomain.com',
      subject: 'Legal Compliance RAG - Verify Your Email',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px;">Verify Your Email</h2>
          
          <p>Hello <strong>${name}</strong>,</p>
          
          <p>Thank you for registering on Legal Compliance RAG. Please use the verification code below to complete your registration:</p>
          
          <div style="background-color: #f5f5f5; padding: 20px; border-left: 4px solid #4CAF50; margin: 20px 0; text-align: center;">
            <p style="margin: 0 0 10px 0; color: #555;">Your verification code:</p>
            <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333; margin: 0; font-family: monospace;">${otp}</p>
          </div>
          
          <p style="color: #d32f2f; font-weight: bold;">This code expires in 10 minutes.</p>
          
          <p style="color: #555;">If you did not request this, please ignore this email.</p>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
            <p style="color: #999; font-size: 11px;">
              This is an automated email, please do not reply.
            </p>
          </div>
        </div>
      `
    };

    await this.sendEmail(message);
  }

  /**
   * Generic email sending method using Nodemailer
   * @param message - Email message to send
   */
  private static async sendEmail(message: EmailMessage): Promise<void> {
    try {
      console.log('[EMAIL-SEND] 📤 Attempting to send email...');
      console.log('[EMAIL-SEND] To:', message.to);
      console.log('[EMAIL-SEND] From:', message.from);
      console.log('[EMAIL-SEND] Subject:', message.subject);
      
      // Check if email is configured
      if (!transporter) {
        console.log('[EMAIL-SEND] ⚠️  Transporter not configured!');
        logger.info('EMAIL_SERVICE', '📧 Email would be sent (Email not configured)', {
          to: message.to,
          from: message.from,
          subject: message.subject,
          timestamp: new Date().toISOString()
        });
        console.log(
          `[EMAIL] From: ${message.from}, To: ${message.to}, Subject: ${message.subject}`
        );
        console.log('⚠️  Configure GMAIL_USER + GMAIL_PASSWORD (for Gmail)');
        console.log('   OR SMTP_HOST + SMTP_PORT + SMTP_USER + SMTP_PASSWORD (for custom domain)');
        return;
      }

      console.log('[EMAIL-SEND] ✓ Transporter available, sending...');

      // Send email
      const info = await transporter.sendMail({
        from: message.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        replyTo: message.from
      });

      console.log('[EMAIL-SEND] ✅ Email sent successfully!');
      console.log('[EMAIL-SEND] MessageID:', info.messageId);
      console.log('[EMAIL-SEND] Response:', info.response);

      logger.info('EMAIL_SERVICE', '✅ Email sent successfully', {
        to: message.to,
        from: message.from,
        subject: message.subject,
        messageId: info.messageId,
        timestamp: new Date().toISOString()
      });

      console.log(`[EMAIL ✓] From: ${message.from}, To: ${message.to}, MessageID: ${info.messageId}`);
    } catch (error) {
      // Log email failure but don't throw - email sending should be non-blocking
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : '';
      
      console.error('[EMAIL-SEND] ❌ Email sending FAILED!');
      console.error('[EMAIL-SEND] Error Message:', errorMsg);
      console.error('[EMAIL-SEND] Error Stack:', errorStack);
      console.error('[EMAIL-SEND] Full Error:', error);

      logger.error('EMAIL_SERVICE', 'Failed to send email', {
        to: message.to,
        from: message.from,
        subject: message.subject,
        error: errorMsg,
        stack: errorStack
      });

      console.error(`[EMAIL ✗] Failed to send to ${message.to}:`, error);

      // In production, implement retry logic here
      // throw error; // Only throw if email is critical to operation
    }
  }
}