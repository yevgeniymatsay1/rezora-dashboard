-- Add caching columns to user_agents table for dynamic prompt building
ALTER TABLE user_agents 
ADD COLUMN dynamic_prompt TEXT,
ADD COLUMN prompt_cache_key TEXT,
ADD COLUMN prompt_updated_at TIMESTAMP WITH TIME ZONE;

-- Create index for fast cache key lookups
CREATE INDEX idx_user_agents_prompt_cache_key ON user_agents(prompt_cache_key);

-- Create index for prompt updated timestamp
CREATE INDEX idx_user_agents_prompt_updated_at ON user_agents(prompt_updated_at);