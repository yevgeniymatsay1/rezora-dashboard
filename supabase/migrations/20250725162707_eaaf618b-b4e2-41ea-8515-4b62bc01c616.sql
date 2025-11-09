-- Phase 1: Database Schema Updates for Enhanced Contacts Feature

-- Step 1: Add new columns to contact_groups table
ALTER TABLE public.contact_groups 
ADD COLUMN total_contacts integer DEFAULT 0,
ADD COLUMN csv_headers text[];

-- Step 2: Modify contacts table structure
-- First, rename group_id to contact_group_id
ALTER TABLE public.contacts 
RENAME COLUMN group_id TO contact_group_id;

-- Add new columns to contacts table
ALTER TABLE public.contacts 
ADD COLUMN data jsonb NOT NULL DEFAULT '{}',
ADD COLUMN status text DEFAULT 'active';

-- Add check constraint for status
ALTER TABLE public.contacts 
ADD CONSTRAINT contacts_status_check 
CHECK (status IN ('active', 'invalid', 'do_not_call'));

-- Migrate existing contact data to new structure
UPDATE public.contacts 
SET data = jsonb_build_object(
  'first_name', first_name,
  'last_name', last_name,
  'email', email,
  'address', address,
  'custom_fields', custom_fields
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON public.contacts(phone_number);
CREATE INDEX IF NOT EXISTS idx_contacts_group ON public.contacts(contact_group_id);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON public.contacts(status);

-- Step 3: Create campaign_contacts table
CREATE TABLE public.campaign_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  contact_group_id uuid NOT NULL REFERENCES public.contact_groups(id) ON DELETE CASCADE,
  selected_fields jsonb DEFAULT '[]',
  field_mappings jsonb DEFAULT '{}',
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(campaign_id, contact_group_id)
);

-- Enable RLS on campaign_contacts
ALTER TABLE public.campaign_contacts ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for campaign_contacts
CREATE POLICY "Users can manage own campaign contacts" 
ON public.campaign_contacts 
FOR ALL 
USING (
  campaign_id IN (
    SELECT id FROM public.campaigns WHERE user_id = auth.uid()
  )
);

-- Step 4: Create function to update total_contacts count
CREATE OR REPLACE FUNCTION public.update_contact_group_total()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.contact_groups 
    SET total_contacts = total_contacts + 1 
    WHERE id = NEW.contact_group_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.contact_groups 
    SET total_contacts = total_contacts - 1 
    WHERE id = OLD.contact_group_id;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    -- If contact moved to different group
    IF OLD.contact_group_id != NEW.contact_group_id THEN
      UPDATE public.contact_groups 
      SET total_contacts = total_contacts - 1 
      WHERE id = OLD.contact_group_id;
      
      UPDATE public.contact_groups 
      SET total_contacts = total_contacts + 1 
      WHERE id = NEW.contact_group_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic total_contacts updates
CREATE TRIGGER trigger_update_contact_group_total
  AFTER INSERT OR UPDATE OR DELETE ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_contact_group_total();

-- Step 5: Initialize total_contacts for existing groups
UPDATE public.contact_groups 
SET total_contacts = (
  SELECT COUNT(*) 
  FROM public.contacts 
  WHERE contact_group_id = contact_groups.id
);

-- Step 6: Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_contacts;