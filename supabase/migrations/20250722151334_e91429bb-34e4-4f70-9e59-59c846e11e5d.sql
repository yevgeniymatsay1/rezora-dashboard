
-- Add status column to user_agents table
ALTER TABLE public.user_agents 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft' 
CHECK (status IN ('draft', 'deployed', 'archived'));

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_user_agents_user_status_template 
ON public.user_agents(user_id, status, template_id);

-- Update existing agents to be 'deployed' status
UPDATE public.user_agents 
SET status = 'deployed' 
WHERE status IS NULL OR status = 'draft';
