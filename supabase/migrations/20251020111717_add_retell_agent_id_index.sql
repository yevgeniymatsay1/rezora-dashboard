-- Add index on test_agents.retell_agent_id for faster lookups
-- This supports loading prompts by Retell Agent ID in the Prompt Factory

CREATE INDEX IF NOT EXISTS idx_test_agents_retell_agent_id
  ON test_agents(retell_agent_id)
  WHERE deleted_at IS NULL;

COMMENT ON INDEX idx_test_agents_retell_agent_id IS 'Index for fast lookups by Retell Agent ID (only active agents)';
