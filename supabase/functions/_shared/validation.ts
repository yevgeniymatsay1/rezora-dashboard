import { z } from "https://esm.sh/zod@3.23.8";

// Sanitization helpers
export const sanitizeHtml = (input: string): string => {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

export const sanitizeForSql = (input: string): string => {
  return input.replace(/['";\\]/g, '');
};

// Common patterns
const phoneRegex = /^\+?[1-9]\d{1,14}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const urlRegex = /^https?:\/\/.+/;
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Validation schemas for Edge Functions

export const createAgentSchema = z.object({
  name: z.string().min(1).max(100).transform(sanitizeHtml),
  template_id: z.string().uuid().optional(),
  voice_id: z.string().min(1),
  system_prompt: z.string().max(5000).transform(sanitizeHtml).optional(),
  greeting_message: z.string().max(500).transform(sanitizeHtml).optional(),
  temperature: z.number().min(0).max(2).default(0.7),
  max_tokens: z.number().min(1).max(4096).default(2048),
  response_delay: z.number().min(0).max(10000).default(500),
  interruption_sensitivity: z.number().min(0).max(1).default(0.5)
});

export const updateAgentSchema = createAgentSchema.partial();

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(100).transform(sanitizeHtml),
  agent_id: z.string().uuid(),
  contact_group_id: z.string().uuid(),
  timezone: z.string().min(1),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  daily_start_time: z.string().regex(/^\d{2}:\d{2}$/),
  daily_end_time: z.string().regex(/^\d{2}:\d{2}$/),
  max_concurrent_calls: z.number().min(1).max(20).default(5),
  retry_attempts: z.number().min(0).max(5).default(2),
  retry_interval: z.number().min(60).max(86400).default(3600),
  active_days: z.array(z.number().min(0).max(6)).default([1,2,3,4,5])
});

export const importContactsSchema = z.object({
  group_name: z.string().min(1).max(100).transform(sanitizeHtml),
  contacts: z.array(z.object({
    first_name: z.string().max(50).transform(sanitizeHtml).optional(),
    last_name: z.string().max(50).transform(sanitizeHtml).optional(),
    phone: z.string().regex(phoneRegex),
    email: z.string().email().optional(),
    address: z.string().max(200).transform(sanitizeHtml).optional(),
    city: z.string().max(50).transform(sanitizeHtml).optional(),
    state: z.string().max(50).transform(sanitizeHtml).optional(),
    zip: z.string().regex(/^\d{5}(-\d{4})?$/).optional(),
    custom_fields: z.record(z.string().transform(sanitizeHtml)).optional()
  })).min(1).max(10000) // Max 10k contacts per import
});

export const purchaseCreditsSchema = z.object({
  amount_cents: z.number().min(500).max(100000).multipleOf(100),
  payment_method_id: z.string().min(1)
});

export const purchasePhoneSchema = z.object({
  area_code: z.string().length(3).regex(/^\d{3}$/),
  agent_id: z.string().uuid().optional()
});

export const createWebCallSchema = z.object({
  agent_id: z.string().uuid(),
  metadata: z.record(z.any()).optional()
});

export const bindPhoneSchema = z.object({
  phone_number_id: z.string().uuid(),
  agent_id: z.string().uuid()
});

export const deleteAgentSchema = z.object({
  agent_id: z.string().uuid()
});

export const deletePhoneSchema = z.object({
  phone_number_id: z.string().uuid()
});

// Validation middleware
export async function validateRequest<T>(
  req: Request,
  schema: z.ZodSchema<T>
): Promise<{ data: T | null; error: Response | null }> {
  try {
    const body = await req.json();
    const validated = schema.parse(body);
    return { data: validated, error: null };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message
      }));
      
      return {
        data: null,
        error: new Response(
          JSON.stringify({ 
            error: 'Validation failed',
            details: formattedErrors 
          }),
          { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      };
    }
    
    return {
      data: null,
      error: new Response(
        JSON.stringify({ error: 'Invalid request body' }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    };
  }
}

// SQL injection prevention
export function sanitizeSqlIdentifier(identifier: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error('Invalid SQL identifier');
  }
  return identifier;
}

// UUID validation
export function isValidUuid(uuid: string): boolean {
  return uuidRegex.test(uuid);
}

// Phone number validation
export function isValidPhoneNumber(phone: string): boolean {
  return phoneRegex.test(phone);
}

// Email validation
export function isValidEmail(email: string): boolean {
  return emailRegex.test(email);
}

// URL validation
export function isValidUrl(url: string): boolean {
  return urlRegex.test(url);
}

// Prevent XSS in JSON responses
export function sanitizeJsonResponse(obj: any): any {
  if (typeof obj === 'string') {
    return sanitizeHtml(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeJsonResponse);
  }
  if (obj !== null && typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeJsonResponse(value);
    }
    return sanitized;
  }
  return obj;
}