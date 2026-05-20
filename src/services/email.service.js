import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

class EmailService {
  /**
   * Send account activation email to doctor or receptionist
   * @param {string} email - Recipient email
   * @param {string} name - Recipient name
   * @param {string} role - User role (doctor/receptionist)
   * @param {string} activationToken - Activation token
   * @param {string} frontendUrl - Frontend base URL
   */
  static async sendActivationEmail(email, name, role, activationToken, frontendUrl) {
    try {
      const activationLink = `${frontendUrl}/setup-password?token=${activationToken}`;

      const { data, error } = await resend.emails.send({
        from: 'Pulse OPD <noreply@c7personal.fit>',
        to: [email],
        subject: 'Activate Your Pulse OPD Account',
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Activate Your Account</title>
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
              <div style="background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <div style="background: #7c3aed; padding: 30px; text-align: center;">
                  <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 600;">🏥 Pulse OPD</h1>
                </div>

                <div style="padding: 40px;">
                  <h2 style="color: #1f2937; margin-top: 0; font-size: 24px;">Welcome to Pulse OPD!</h2>

                  <p style="color: #4b5563; font-size: 16px;">Hello <strong>${name}</strong>,</p>

                  <p style="color: #4b5563; font-size: 16px;">An administrator has created a <strong>${role}</strong> account for you on Pulse OPD Hospital Management System.</p>

                  <p style="color: #4b5563; font-size: 16px;">To activate your account and set up your password, please click the button below:</p>

                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${activationLink}"
                       style="background: #7c3aed;
                              color: white;
                              padding: 14px 28px;
                              text-decoration: none;
                              border-radius: 8px;
                              display: inline-block;
                              font-weight: 600;
                              font-size: 16px;">
                      Activate Account & Set Password
                    </a>
                  </div>

                  <p style="font-size: 14px; color: #6b7280;">
                    Or copy and paste this link into your browser:<br>
                    <a href="${activationLink}" style="color: #7c3aed; word-break: break-all;">${activationLink}</a>
                  </p>

                  <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; border-left: 4px solid #7c3aed; margin: 24px 0;">
                    <p style="margin: 0; font-size: 14px; color: #374151;">
                      <strong>Account Details:</strong><br>
                      Email: ${email}<br>
                      Role: ${role.charAt(0).toUpperCase() + role.slice(1)}
                    </p>
                  </div>

                  <p style="font-size: 14px; color: #6b7280;">
                    This activation link will expire in <strong>48 hours</strong> for security reasons.
                  </p>

                  <p style="font-size: 14px; color: #6b7280;">
                    If you did not expect this email, please ignore it or contact your administrator.
                  </p>

                  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

                  <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
                    &copy; ${new Date().getFullYear()} Pulse OPD Hospital Management System<br>
                    This is an automated message, please do not reply to this email.
                  </p>
                </div>
              </div>
            </body>
          </html>
        `,
      });

      if (error) {
        console.error('Resend email error:', error);
        throw new Error('Failed to send activation email');
      }

      console.log('Activation email sent successfully:', data);
      return data;
    } catch (error) {
      console.error('Send activation email error:', error);
      throw error;
    }
  }

  /**
   * Send password reset email
   * @param {string} email - Recipient email
   * @param {string} name - Recipient name
   * @param {string} resetToken - Reset token
   * @param {string} frontendUrl - Frontend base URL
   */
  static async sendPasswordResetEmail(email, name, resetToken, frontendUrl) {
    try {
      const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

      const { data, error } = await resend.emails.send({
        from: 'Pulse OPD <noreply@c7personal.fit>',
        to: [email],
        subject: 'Reset Your Password - Pulse OPD',
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Reset Your Password</title>
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
              <div style="background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <div style="background: #7c3aed; padding: 30px; text-align: center;">
                  <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 600;">🏥 Pulse OPD</h1>
                </div>

                <div style="padding: 40px;">
                  <h2 style="color: #1f2937; margin-top: 0; font-size: 24px;">Password Reset Request</h2>

                  <p style="color: #4b5563; font-size: 16px;">Hello <strong>${name}</strong>,</p>

                  <p style="color: #4b5563; font-size: 16px;">We received a request to reset your password for your Pulse OPD account.</p>

                  <p style="color: #4b5563; font-size: 16px;">Click the button below to reset your password:</p>

                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${resetLink}"
                       style="background: #7c3aed;
                              color: white;
                              padding: 14px 28px;
                              text-decoration: none;
                              border-radius: 8px;
                              display: inline-block;
                              font-weight: 600;
                              font-size: 16px;">
                      Reset Password
                    </a>
                  </div>

                  <p style="font-size: 14px; color: #6b7280;">
                    Or copy and paste this link into your browser:<br>
                    <a href="${resetLink}" style="color: #7c3aed; word-break: break-all;">${resetLink}</a>
                  </p>

                  <div style="background: #fef3c7; padding: 16px; border-radius: 8px; border-left: 4px solid #f59e0b; margin: 24px 0;">
                    <p style="margin: 0; font-size: 14px; color: #92400e;">
                      <strong>⚠️ Security Notice:</strong><br>
                      This password reset link will expire in <strong>1 hour</strong>.<br>
                      If you did not request this, please ignore this email and your password will remain unchanged.
                    </p>
                  </div>

                  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

                  <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
                    &copy; ${new Date().getFullYear()} Pulse OPD Hospital Management System<br>
                    This is an automated message, please do not reply to this email.
                  </p>
                </div>
              </div>
            </body>
          </html>
        `,
      });

      if (error) {
        console.error('Resend email error:', error);
        throw new Error('Failed to send password reset email');
      }

      console.log('Password reset email sent successfully:', data);
      return data;
    } catch (error) {
      console.error('Send password reset email error:', error);
      throw error;
    }
  }
}

export default EmailService;
