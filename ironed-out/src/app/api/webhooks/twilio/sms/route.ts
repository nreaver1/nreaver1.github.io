import { handleInboundSms } from '@/server/domain/notifications';
import { getEnv } from '@/server/env';
import { normalizePhone } from '@/server/phone';
import { validTwilioSignature } from '@/server/notify/sms';
import { getServices } from '@/web/services';

export const dynamic = 'force-dynamic';

const xml = (body: string, status = 200) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    status,
    headers: { 'Content-Type': 'text/xml' },
  });

const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** Inbound texts from Twilio: records STOP/START opt-outs and answers HELP (SPEC §5). */
export async function POST(req: Request) {
  const env = getEnv();
  if (!env.TWILIO_AUTH_TOKEN) return new Response('Not configured', { status: 404 });
  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form) if (typeof v === 'string') params[k] = v;

  // Twilio signs the public URL it called.
  const url = `${env.APP_URL.replace(/\/$/, '')}${new URL(req.url).pathname}`;
  if (!validTwilioSignature(env.TWILIO_AUTH_TOKEN, url, params, req.headers.get('x-twilio-signature'))) {
    return new Response('Forbidden', { status: 403 });
  }
  const from = normalizePhone(params.From ?? '');
  if (!from) return xml('');
  const { db } = await getServices();
  const { reply } = await handleInboundSms(db, from, params.Body ?? '');
  return xml(reply ? `<Message>${escapeXml(reply)}</Message>` : '');
}
