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

  await transport.sendMail({
    from: config.from,
    to: input.to,
    subject: 'Reset your password',
    text: `You requested a password reset for your AI Search account.\n\nReset your password: ${input.resetUrl}\n\nIf you did not request this, you can ignore this email.`,
    html: `
      <p>You requested a password reset for your AI Search account.</p>
      <p><a href="${input.resetUrl}">Reset your password</a></p>
      <p>If you did not request this, you can ignore this email.</p>
    `,
  });
}
