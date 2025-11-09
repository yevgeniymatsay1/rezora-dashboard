-- Fix security warnings: Set search_path for functions

-- Fix handle_updated_at function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at = NOW();
  return NEW;
END;
$function$;

-- Fix handle_new_user function  
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'first_name', NEW.raw_user_meta_data ->> 'last_name');
  RETURN NEW;
END;
$function$;

-- Fix update_contact_group_total function
CREATE OR REPLACE FUNCTION public.update_contact_group_total()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = ''
AS $$
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
$$;