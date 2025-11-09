-- Add description column to campaigns table to fix campaign launch failure
ALTER TABLE campaigns ADD COLUMN description TEXT;