-- Create test_agents table for sandbox testing
-- This table stores temporary test agents created for prompt testing on Retell

CREATE TABLE IF NOT EXISTS test_agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt_version_id UUID NOT NULL REFERENCES prompt_versions(id) ON DELETE CASCADE,

  -- Retell integration IDs for cleanup
  retell_llm_id TEXT NOT NULL,
  retell_agent_id TEXT NOT NULL,

  -- Metadata
  test_name TEXT,
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ -- Soft delete - set when agent is removed
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_test_agents_user_id ON test_agents(user_id);
CREATE INDEX IF NOT EXISTS idx_test_agents_prompt_version ON test_agents(prompt_version_id);
CREATE INDEX IF NOT EXISTS idx_test_agents_created_at ON test_agents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_agents_deleted_at ON test_agents(deleted_at) WHERE deleted_at IS NULL; -- Active agents only

-- Enable RLS
ALTER TABLE test_agents ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can only see their own test agents
CREATE POLICY "Users can view own test agents"
  ON test_agents
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create test agents
CREATE POLICY "Users can create test agents"
  ON test_agents
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update own test agents (for soft delete)
CREATE POLICY "Users can update own test agents"
  ON test_agents
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete own test agents
CREATE POLICY "Users can delete own test agents"
  ON test_agents
  FOR DELETE
  USING (auth.uid() = user_id);

-- Comment on table
COMMENT ON TABLE test_agents IS 'Stores temporary test agents created on Retell for sandbox testing of generated prompts';
COMMENT ON COLUMN test_agents.retell_llm_id IS 'Retell LLM ID for cleanup via API';
COMMENT ON COLUMN test_agents.retell_agent_id IS 'Retell Agent ID for cleanup via API';
COMMENT ON COLUMN test_agents.deleted_at IS 'Soft delete timestamp - agent removed from Retell and marked as deleted';
