import { createTransport } from 'nodemailer';

function getEmailConfig() {
  const host = process.env.EMAIL_SERVER_HOST;
  const port = process.env.EMAIL_SERVER_PORT ? Number(process.env.EMAIL_SERVER_PORT) : undefined;
  const user = process.env.EMAIL_SERVER_USER;
  const pass = process.env.EMAIL_SERVER_PASSWORD;
  const from = process.env.EMAIL_FROM;

  if (!host || !port || !user || !pass || !from) {
    return null;
  }

  return {
    host,
    port,
    user,
    pass,
    from,
  };
}

export function isEmailDeliveryConfigured(): boolean {
  return getEmailConfig() !== null;
}

export function getEmailDeliveryDiagnostics() {
  const rawPort = process.env.EMAIL_SERVER_PORT;
  const parsedPort = rawPort ? Number(rawPort) : undefined;

  return {
    hasHost: Boolean(process.env.EMAIL_SERVER_HOST),
    hasPort: Boolean(rawPort),
    portIsNumber: typeof parsedPort === 'number' && Number.isFinite(parsedPort),
    hasUser: Boolean(process.env.EMAIL_SERVER_USER),
    hasPassword: Boolean(process.env.EMAIL_SERVER_PASSWORD),
    hasFrom: Boolean(process.env.EMAIL_FROM),
  };
}

export async function sendPasswordResetEmail(input: {
  to: string;
  resetUrl: string;
  expiresInMinutes?: number;
}): Promise<void> {
  const config = getEmailConfig();
  if (!config) {
    throw new Error('Email delivery is not configured.');
  }

  const transport = createTransport({
    host: config.host,
    port: config.port,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  const expiryLine =
    typeof input.expiresInMinutes === 'number' && Number.isFinite(input.expiresInMinutes)
      ? `This link expires in ${input.expiresInMinutes} minutes.`
      : 'This link will expire soon for security reasons.';

  await transport.sendMail({
    from: config.from,
    to: input.to,
    subject: 'Reset your LensQuery password',
    text: [
      'Lens password reset',
      '',
      'We received a request to reset the password for your Lens account.',
      '',
      `Reset your password: ${input.resetUrl}`,
      '',
      expiryLine,
      'If you did not request this email, you can ignore it.',
      '',
      'Lens',
    ].join('\n'),
    html: `
      <div style="margin:0;padding:0;background-color:#f5f7fb;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f5f7fb;padding:24px 0;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;margin:0 auto;">
                <tr>
                  <td style="padding:0 20px 16px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;color:#64748b;">
                    Lens
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 20px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#ffffff;border:1px solid #dbe4f0;border-radius:16px;">
                      <tr>
                        <td style="padding:32px 32px 12px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
                          <h1 style="margin:0;font-size:24px;line-height:1.2;font-weight:600;color:#0f172a;">Reset your password</h1>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:0 32px 12px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.7;color:#334155;">
                          We received a request to reset the password for your Lens account.
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 32px 8px 32px;">
                          <a
                            href="${input.resetUrl}"
                            style="display:inline-block;padding:12px 18px;border-radius:10px;background-color:#0b6bcb;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;font-weight:600;text-decoration:none;"
                          >
                            Reset password
                          </a>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 32px 0 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.7;color:#64748b;">
                          ${expiryLine}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:16px 32px 0 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.7;color:#334155;">
                          If the button does not open correctly, use this link:
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 32px 0 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;line-height:1.7;word-break:break-word;">
                          <a href="${input.resetUrl}" style="color:#0b6bcb;text-decoration:underline;">${input.resetUrl}</a>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:16px 32px 32px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.7;color:#64748b;">
                          If you did not request this email, you can ignore it. No changes will be made to your account.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `,
  });
}
