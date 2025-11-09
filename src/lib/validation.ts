// @ts-nocheck
import { z } from 'zod';

// Sanitization helpers
const sanitizeHtml = (input: string): string => {
  // Basic HTML entity encoding to prevent XSS
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

const sanitizeForSql = (input: string): string => {
  // Basic SQL injection prevention (though parameterized queries should be used)
  return input.replace(/['";\\]/g, '');
};

// Common validation patterns
const phoneRegex = /^\+?[1-9]\d{1,14}$/; // E.164 format
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const urlRegex = /^https?:\/\/.+/;

// Reusable field schemas
export const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Invalid email address')
  .transform(val => val.toLowerCase().trim());

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(100, 'Password too long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export const phoneNumberSchema = z
  .string()
  .regex(phoneRegex, 'Invalid phone number format')
  .transform(val => val.replace(/\D/g, '')); // Remove non-digits

export const urlSchema = z
  .string()
  .regex(urlRegex, 'Invalid URL format')
  .max(2048, 'URL too long');

export const sanitizedStringSchema = z
  .string()
  .transform(val => sanitizeHtml(val.trim()))
  .refine(val => !/<script|javascript:|on\w+=/i.test(val), {
    message: 'Potentially malicious content detected'
  });

// Auth schemas
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required')
});

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string()
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
});

// Agent configuration schemas
export const agentNameSchema = sanitizedStringSchema
  .min(1, 'Agent name is required')
  .max(100, 'Agent name too long');

export const agentDescriptionSchema = sanitizedStringSchema
  .max(500, 'Description too long')
  .optional();

export const agentConfigSchema = z.object({
  name: agentNameSchema,
  description: agentDescriptionSchema,
  voice_id: z.string().min(1, 'Voice selection is required'),
  language: z.enum(['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'pl', 'hi', 'ja', 'ko', 'zh']),
  response_delay: z.number().min(0).max(10000),
  interruption_sensitivity: z.number().min(0).max(1),
  temperature: z.number().min(0).max(2),
  max_tokens: z.number().min(1).max(4096),
  greeting_message: sanitizedStringSchema.max(500).optional(),
  system_prompt: sanitizedStringSchema.max(5000).optional(),
  tools: z.array(z.string()).optional()
});

// Campaign schemas
export const campaignNameSchema = sanitizedStringSchema
  .min(1, 'Campaign name is required')
  .max(100, 'Campaign name too long');

export const campaignSchema = z.object({
  name: campaignNameSchema,
  agent_id: z.string().uuid('Invalid agent ID'),
  contact_group_id: z.string().uuid('Invalid contact group ID'),
  timezone: z.string().min(1, 'Timezone is required'),
  start_date: z.string().datetime('Invalid date format'),
  end_date: z.string().datetime('Invalid date format').optional(),
  daily_start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format'),
  daily_end_time: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format'),
  max_concurrent_calls: z.number().min(1).max(20),
  retry_attempts: z.number().min(0).max(5),
  retry_interval: z.number().min(60).max(86400), // 1 minute to 24 hours
  active_days: z.array(z.number().min(0).max(6))
}).refine(data => {
  if (data.end_date) {
    return new Date(data.end_date) > new Date(data.start_date);
  }
  return true;
}, {
  message: 'End date must be after start date',
  path: ['end_date']
});

// Contact import schemas
export const contactSchema = z.object({
  first_name: sanitizedStringSchema.max(50).optional(),
  last_name: sanitizedStringSchema.max(50).optional(),
  phone: phoneNumberSchema,
  email: emailSchema.optional(),
  address: sanitizedStringSchema.max(200).optional(),
  city: sanitizedStringSchema.max(50).optional(),
  state: sanitizedStringSchema.max(50).optional(),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code').optional(),
  custom_fields: z.record(sanitizedStringSchema).optional()
});

export const contactGroupSchema = z.object({
  name: sanitizedStringSchema.min(1).max(100),
  description: sanitizedStringSchema.max(500).optional(),
  contacts: z.array(contactSchema).min(1, 'At least one contact is required')
});

// CSV import schema
export const csvImportSchema = z.object({
  file: z.instanceof(File)
    .refine(file => file.size <= 10 * 1024 * 1024, 'File size must be less than 10MB')
    .refine(file => file.type === 'text/csv' || file.name.endsWith('.csv'), 'File must be CSV format'),
  group_name: sanitizedStringSchema.min(1).max(100),
  field_mappings: z.record(z.string())
});

// Credit purchase schema
export const creditPurchaseSchema = z.object({
  amount: z.number()
    .min(500, 'Minimum purchase is $5.00')
    .max(100000, 'Maximum purchase is $1,000.00')
    .multipleOf(100, 'Amount must be in whole cents'),
  payment_method_id: z.string().min(1, 'Payment method is required')
});

// Phone number purchase schema
export const phoneNumberPurchaseSchema = z.object({
  area_code: z.string()
    .length(3, 'Area code must be 3 digits')
    .regex(/^\d{3}$/, 'Area code must contain only digits'),
  agent_id: z.string().uuid('Invalid agent ID').optional()
});

// Settings schemas
export const userProfileSchema = z.object({
  full_name: sanitizedStringSchema.max(100).optional(),
  company_name: sanitizedStringSchema.max(100).optional(),
  phone: phoneNumberSchema.optional(),
  timezone: z.string().optional(),
  notification_preferences: z.object({
    email_notifications: z.boolean(),
    sms_notifications: z.boolean(),
    campaign_updates: z.boolean(),
    billing_alerts: z.boolean()
  }).optional()
});

export const apiKeySchema = z.object({
  retell_api_key: z.string()
    .min(1, 'API key is required')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid API key format')
    .transform(val => val.trim())
});

// File upload validation
export const fileUploadSchema = z.object({
  file: z.instanceof(File)
    .refine(file => file.size <= 50 * 1024 * 1024, 'File size must be less than 50MB')
    .refine(file => {
      const allowedTypes = [
        'text/csv',
        'application/pdf',
        'audio/mpeg',
        'audio/wav',
        'audio/mp3',
        'image/jpeg',
        'image/png',
        'image/gif'
      ];
      return allowedTypes.includes(file.type) || 
             file.name.match(/\.(csv|pdf|mp3|wav|jpg|jpeg|png|gif)$/i);
    }, 'File type not supported')
});

// Search/filter schemas
export const searchQuerySchema = sanitizedStringSchema
  .max(100, 'Search query too long')
  .transform(val => sanitizeForSql(val));

export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  sort_by: z.string().optional(),
  sort_order: z.enum(['asc', 'desc']).default('desc')
});

// Webhook payload validation (for incoming webhooks)
export const retellWebhookSchema = z.object({
  event: z.enum(['call_started', 'call_ended', 'call_analyzed']),
  call: z.object({
    call_id: z.string(),
    agent_id: z.string().optional(),
    call_type: z.string().optional(),
    from_number: z.string().optional(),
    to_number: z.string().optional(),
    metadata: z.record(z.any()).optional(),
    transcript: z.string().optional(),
    recording_url: urlSchema.optional(),
    duration_ms: z.number().optional(),
    disconnection_reason: z.string().optional(),
    call_cost: z.object({
      combined_cost: z.number(),
      total_duration_seconds: z.number()
    }).optional()
  })
});

// Validation middleware helper
export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message
      }));
      throw new Error(JSON.stringify(formattedErrors));
    }
    throw error;
  }
}

// SQL injection prevention helper
export function sanitizeSqlIdentifier(identifier: string): string {
  // Only allow alphanumeric characters and underscores
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error('Invalid SQL identifier');
  }
  return identifier;
}

// Export all schemas for easy access
export const schemas = {
  auth: { login: loginSchema, signup: signupSchema },
  agent: { config: agentConfigSchema },
  campaign: { create: campaignSchema },
  contact: { single: contactSchema, group: contactGroupSchema, import: csvImportSchema },
  payment: { credits: creditPurchaseSchema, phone: phoneNumberPurchaseSchema },
  user: { profile: userProfileSchema, apiKey: apiKeySchema },
  file: { upload: fileUploadSchema },
  search: { query: searchQuerySchema, pagination: paginationSchema },
  webhook: { retell: retellWebhookSchema }
};