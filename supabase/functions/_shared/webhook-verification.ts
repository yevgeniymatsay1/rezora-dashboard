import { createHmac } from "https://deno.land/std@0.190.0/node/crypto.ts";

/**
 * Verifies webhook signature using HMAC-SHA256
 * @param payload - The raw webhook payload as string
 * @param signature - The signature from the webhook headers
 * @param secret - The webhook secret key
 * @returns boolean indicating if signature is valid
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature || !secret) {
    console.error('Missing signature or secret for webhook verification');
    return false;
  }

  // Generate expected signature
  const hmac = createHmac('sha256', secret);
  hmac.update(payload);
  const expectedSignature = hmac.digest('hex');

  // Compare signatures (timing-safe comparison)
  const signatureToCompare = signature.replace(/^sha256=/, ''); // Remove prefix if present
  
  if (expectedSignature.length !== signatureToCompare.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < expectedSignature.length; i++) {
    result |= expectedSignature.charCodeAt(i) ^ signatureToCompare.charCodeAt(i);
  }
  
  return result === 0;
}

/**
 * Verifies webhook signature with timestamp to prevent replay attacks
 * @param payload - The raw webhook payload as string
 * @param signature - The signature from the webhook headers
 * @param timestamp - The timestamp from the webhook headers
 * @param secret - The webhook secret key
 * @param toleranceSeconds - Maximum age of webhook in seconds (default 5 minutes)
 * @returns boolean indicating if signature is valid and not expired
 */
export function verifyWebhookSignatureWithTimestamp(
  payload: string,
  signature: string | null,
  timestamp: string | null,
  secret: string,
  toleranceSeconds: number = 300
): boolean {
  if (!signature || !timestamp || !secret) {
    console.error('Missing signature, timestamp, or secret for webhook verification');
    return false;
  }

  // Check timestamp to prevent replay attacks
  const webhookTimestamp = parseInt(timestamp);
  const currentTimestamp = Math.floor(Date.now() / 1000);
  
  if (isNaN(webhookTimestamp)) {
    console.error('Invalid webhook timestamp');
    return false;
  }
  
  if (currentTimestamp - webhookTimestamp > toleranceSeconds) {
    console.error(`Webhook timestamp too old: ${currentTimestamp - webhookTimestamp} seconds`);
    return false;
  }

  // Create signed payload with timestamp
  const signedPayload = `${timestamp}.${payload}`;
  
  // Generate expected signature
  const hmac = createHmac('sha256', secret);
  hmac.update(signedPayload);
  const expectedSignature = hmac.digest('hex');

  // Compare signatures
  const signatureToCompare = signature.replace(/^sha256=/, '');
  
  if (expectedSignature.length !== signatureToCompare.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < expectedSignature.length; i++) {
    result |= expectedSignature.charCodeAt(i) ^ signatureToCompare.charCodeAt(i);
  }
  
  return result === 0;
}

/**
 * Middleware to verify webhook signatures
 * @param req - The incoming request
 * @param secret - The webhook secret key
 * @param headerName - The header name containing the signature (default 'x-webhook-signature')
 * @returns Response if verification fails, null if successful
 */
export async function webhookVerificationMiddleware(
  req: Request,
  secret: string,
  headerName: string = 'x-webhook-signature'
): Promise<Response | null> {
  const signature = req.headers.get(headerName);
  const timestamp = req.headers.get('x-webhook-timestamp');
  
  const body = await req.text();

  // Use timestamp verification if timestamp header is present
  const isValid = timestamp 
    ? verifyWebhookSignatureWithTimestamp(body, signature, timestamp, secret)
    : verifyWebhookSignature(body, signature, secret);

  if (!isValid) {
    console.error('Webhook signature verification failed');
    return new Response(
      JSON.stringify({ error: 'Invalid webhook signature' }), 
      { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  // Return null to indicate verification passed
  return null;
}