import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const defaultCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ADMIN_ROLE_NAMES = ["admin", "service_role"];
const NORMALIZED_ADMIN_ROLES = ADMIN_ROLE_NAMES
  .map((role) => role.trim().toLowerCase())
  .filter((role) => role.length > 0);

export interface AuthUser {
  id: string;
  email: string;
  role?: string;
  app_metadata?: Record<string, any>;
  user_metadata?: Record<string, any>;
}

export interface AuthResult {
  user: AuthUser | null;
  error: Response | null;
}

function normalizeRole(role: unknown): string | null {
  if (!role) return null;
  if (typeof role === "string") {
    const normalized = role.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
  }
  return null;
}

function valueHasRole(value: unknown, normalizedRoles: string[]): boolean {
  if (!value) return false;

  const check = (candidate: unknown): boolean => {
    if (!candidate) return false;

    if (typeof candidate === "string") {
      const normalized = candidate.trim().toLowerCase();
      return normalizedRoles.includes(normalized);
    }

    if (Array.isArray(candidate)) {
      return candidate.some((item) => check(item));
    }

    if (typeof candidate === "object") {
      return Object.values(candidate as Record<string, unknown>).some((item) => check(item));
    }

    return false;
  };

  return check(value);
}

function userHasRoles(user: AuthUser, normalizedRoles: string[]): boolean {
  return (
    valueHasRole(user.role, normalizedRoles)
    || valueHasRole(user.app_metadata?.role, normalizedRoles)
    || valueHasRole(user.app_metadata?.roles, normalizedRoles)
    || valueHasRole(user.user_metadata?.role, normalizedRoles)
    || valueHasRole(user.user_metadata?.roles, normalizedRoles)
  );
}

async function userHasAdminProfileRole(userId: string): Promise<boolean> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.warn(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY when checking admin role fallback.",
    );
    return false;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("Failed to load profile during admin check:", error);
      return false;
    }

    return (
      valueHasRole(data?.role, NORMALIZED_ADMIN_ROLES)
    );
  } catch (error) {
    console.error("Error checking admin role via profile lookup:", error);
    return false;
  }
}

/**
 * Verifies the authorization token and returns the authenticated user
 * @param req - The incoming request
 * @param requireAuth - Whether authentication is required (default: true)
 * @returns AuthResult with user or error response
 */
export async function verifyAuth(
  req: Request,
  requireAuth: boolean = true
): Promise<AuthResult> {
  const authHeader = req.headers.get('Authorization');
  
  if (!authHeader) {
    if (requireAuth) {
      return {
        user: null,
        error: new Response(
          JSON.stringify({ error: 'Missing authorization header' }),
          {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
              ...defaultCorsHeaders,
            }
          }
        )
      };
    }
    return { user: null, error: null };
  }

  const token = authHeader.replace('Bearer ', '');
  
  if (!token) {
    if (requireAuth) {
      return {
        user: null,
        error: new Response(
          JSON.stringify({ error: 'Invalid authorization token' }),
          {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
              ...defaultCorsHeaders,
            }
          }
        )
      };
    }
    return { user: null, error: null };
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    if (requireAuth) {
      console.error('Auth verification failed:', error);
      return {
        user: null,
        error: new Response(
          JSON.stringify({ error: 'Invalid or expired token' }),
          {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
              ...defaultCorsHeaders,
            }
          }
        )
      };
    }
    return { user: null, error: null };
  }

  return {
    user: {
      id: user.id,
      email: user.email!,
      role: user.role,
      app_metadata: user.app_metadata,
      user_metadata: user.user_metadata
    },
    error: null
  };
}

/**
 * Checks if the user has a specific role
 * @param user - The authenticated user
 * @param requiredRole - The required role
 * @returns boolean indicating if user has the role
 */
export function hasRole(user: AuthUser, requiredRole: string): boolean {
  const normalizedRole = normalizeRole(requiredRole);
  if (!normalizedRole) return false;
  return userHasRoles(user, [normalizedRole]);
}

/**
 * Checks if the user is an admin
 * @param user - The authenticated user
 * @returns boolean indicating if user is an admin
 */
export function isAdmin(user: AuthUser): boolean {
  return userHasRoles(user, NORMALIZED_ADMIN_ROLES);
}

/**
 * Verifies the user owns a specific resource
 * @param supabase - Supabase client (with service role key)
 * @param userId - The authenticated user's ID
 * @param resourceTable - The table containing the resource
 * @param resourceId - The resource ID
 * @param ownerField - The field name containing the owner ID (default: 'user_id')
 * @returns boolean indicating if user owns the resource
 */
export async function verifyResourceOwnership(
  supabase: any,
  userId: string,
  resourceTable: string,
  resourceId: string,
  ownerField: string = 'user_id'
): Promise<boolean> {
  const { data, error } = await supabase
    .from(resourceTable)
    .select(ownerField)
    .eq('id', resourceId)
    .single();

  if (error || !data) {
    console.error(`Failed to verify ownership for ${resourceTable}:${resourceId}`, error);
    return false;
  }

  return data[ownerField] === userId;
}

/**
 * Verifies the user has access to a campaign
 * @param supabase - Supabase client (with service role key)
 * @param userId - The authenticated user's ID
 * @param campaignId - The campaign ID
 * @returns boolean indicating if user has access
 */
export async function verifyCampaignAccess(
  supabase: any,
  userId: string,
  campaignId: string
): Promise<boolean> {
  return verifyResourceOwnership(supabase, userId, 'campaigns', campaignId);
}

/**
 * Verifies the user has access to an agent
 * @param supabase - Supabase client (with service role key)
 * @param userId - The authenticated user's ID
 * @param agentId - The agent ID
 * @returns boolean indicating if user has access
 */
export async function verifyAgentAccess(
  supabase: any,
  userId: string,
  agentId: string
): Promise<boolean> {
  return verifyResourceOwnership(supabase, userId, 'user_agents', agentId);
}

/**
 * Verifies the user has access to a contact group
 * @param supabase - Supabase client (with service role key)
 * @param userId - The authenticated user's ID
 * @param groupId - The contact group ID
 * @returns boolean indicating if user has access
 */
export async function verifyContactGroupAccess(
  supabase: any,
  userId: string,
  groupId: string
): Promise<boolean> {
  return verifyResourceOwnership(supabase, userId, 'contact_groups', groupId);
}

/**
 * Verifies the user has access to a phone number
 * @param supabase - Supabase client (with service role key)
 * @param userId - The authenticated user's ID
 * @param phoneNumberId - The phone number ID
 * @returns boolean indicating if user has access
 */
export async function verifyPhoneNumberAccess(
  supabase: any,
  userId: string,
  phoneNumberId: string
): Promise<boolean> {
  return verifyResourceOwnership(supabase, userId, 'phone_numbers', phoneNumberId);
}

/**
 * Rate limiting check (simple in-memory implementation)
 * @param userId - The user ID
 * @param action - The action being performed
 * @param maxRequests - Maximum requests allowed
 * @param windowMs - Time window in milliseconds
 * @returns boolean indicating if rate limit is exceeded
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(
  userId: string,
  action: string,
  maxRequests: number = 60,
  windowMs: number = 60000 // 1 minute
): boolean {
  const key = `${userId}:${action}`;
  const now = Date.now();
  const limit = rateLimitStore.get(key);

  if (!limit || now > limit.resetTime) {
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + windowMs
    });
    return false; // Not rate limited
  }

  if (limit.count >= maxRequests) {
    return true; // Rate limited
  }

  limit.count++;
  return false; // Not rate limited
}

/**
 * Audit log for sensitive operations
 * @param supabase - Supabase client (with service role key)
 * @param userId - The user performing the action
 * @param action - The action being performed
 * @param resourceType - The type of resource
 * @param resourceId - The resource ID
 * @param metadata - Additional metadata
 */
export async function auditLog(
  supabase: any,
  userId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    await supabase.from('audit_logs').insert({
      user_id: userId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      metadata,
      ip_address: metadata?.ip_address,
      user_agent: metadata?.user_agent,
      created_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
    // Don't fail the operation if audit logging fails
  }
}

/**
 * Middleware to require authentication for Edge Functions
 * @param handler - The function handler
 * @returns Wrapped handler with auth check
 */
export function requireAuth(
  handler: (req: Request, user: AuthUser) => Promise<Response>
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const { user, error } = await verifyAuth(req, true);
    
    if (error) {
      return error;
    }

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { 
          status: 401,
          headers: { 
            'Content-Type': 'application/json',
            ...defaultCorsHeaders,
          }
        }
      );
    }

    return handler(req, user);
  };
}

/**
 * Middleware to require admin role
 * @param handler - The function handler
 * @returns Wrapped handler with admin check
 */
export function requireAdmin(
  handler: (req: Request, user: AuthUser) => Promise<Response>
): (req: Request) => Promise<Response> {
  return requireAuth(async (req: Request, user: AuthUser) => {
    const metadataAdmin = isAdmin(user);
    const profileAdmin = metadataAdmin ? true : await userHasAdminProfileRole(user.id);

    if (!profileAdmin) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            ...defaultCorsHeaders,
          }
        }
      );
    }

    return handler(req, user);
  });
}
