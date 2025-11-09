-- Add per-user API key support
-- This migration adds the ability for users to have their own Retell API keys

-- Add retell_api_key column to profiles table
ALTER TABLE public.profiles ADD COLUMN retell_api_key TEXT;

-- Add audit fields for API key management
ALTER TABLE public.profiles ADD COLUMN retell_api_key_updated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.profiles ADD COLUMN retell_api_key_updated_by UUID REFERENCES auth.users(id);

-- Create function for admins to update user API keys
CREATE OR REPLACE FUNCTION public.update_user_retell_api_key(
  target_user_id UUID,
  new_api_key TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  current_user_role public.app_role;
BEGIN
  -- Get current user's role
  SELECT role INTO current_user_role 
  FROM public.profiles 
  WHERE id = auth.uid();
  
  -- Only admins can update other users' API keys
  IF current_user_role != 'admin' AND auth.uid() != target_user_id THEN
    RAISE EXCEPTION 'Insufficient permissions to update API key';
  END IF;
  
  -- Update the API key
  UPDATE public.profiles 
  SET 
    retell_api_key = new_api_key,
    retell_api_key_updated_at = NOW(),
    retell_api_key_updated_by = auth.uid()
  WHERE id = target_user_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get user's API key (for edge functions)
CREATE OR REPLACE FUNCTION public.get_user_retell_api_key(user_id UUID)
RETURNS TEXT AS $$
DECLARE
  user_api_key TEXT;
BEGIN
  SELECT retell_api_key INTO user_api_key
  FROM public.profiles
  WHERE id = user_id;
  
  RETURN user_api_key;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add RLS policy for API key column
-- Users can only view their own API key, admins can view all
CREATE POLICY "Users can view own API key" ON public.profiles 
  FOR SELECT 
  USING (
    auth.uid() = id OR 
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- Users can update their own API key, admins can update any
CREATE POLICY "API key update policy" ON public.profiles 
  FOR UPDATE 
  USING (
    auth.uid() = id OR 
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    auth.uid() = id OR 
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION public.update_user_retell_api_key(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_retell_api_key(UUID) TO service_role;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.retell_api_key IS 'User-specific Retell API key. Falls back to global RETELL_API_KEY if null.';
COMMENT ON FUNCTION public.update_user_retell_api_key(UUID, TEXT) IS 'Updates a user''s Retell API key. Requires admin role or self-update.';
COMMENT ON FUNCTION public.get_user_retell_api_key(UUID) IS 'Retrieves a user''s Retell API key for use in edge functions.';