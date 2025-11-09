import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';

/**
 * Custom error class for authentication errors
 */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Authentication service for centralizing auth operations
 */
export const authService = {
  /**
   * Get the current authenticated user
   * @throws {AuthError} If no user is authenticated
   */
  async requireAuth(): Promise<User> {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error) {
      throw new AuthError(`Authentication failed: ${error.message}`);
    }
    
    if (!user) {
      throw new AuthError('Authentication required. Please sign in to continue.');
    }
    
    return user;
  },

  /**
   * Get the current user without throwing if not authenticated
   */
  async getCurrentUser(): Promise<User | null> {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const user = await this.getCurrentUser();
    return !!user;
  },

  /**
   * Sign out the current user
   */
  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw new AuthError(`Sign out failed: ${error.message}`);
    }
  },

  /**
   * Get the current session
   */
  async getSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      throw new AuthError(`Failed to get session: ${error.message}`);
    }
    return session;
  }
};