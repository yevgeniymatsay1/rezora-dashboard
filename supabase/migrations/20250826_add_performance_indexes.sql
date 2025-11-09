-- Performance optimization indexes for Epic #113 Issue #99

-- Campaigns table indexes
CREATE INDEX IF NOT EXISTS idx_campaigns_user_id_status 
  ON campaigns(user_id, status) 
  WHERE status IN ('active', 'paused', 'scheduled');

CREATE INDEX IF NOT EXISTS idx_campaigns_created_at_desc 
  ON campaigns(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_campaigns_status_started_at 
  ON campaigns(status, started_at) 
  WHERE status = 'active';

-- Calls table indexes
CREATE INDEX IF NOT EXISTS idx_calls_campaign_id_status 
  ON calls(campaign_id, status);

CREATE INDEX IF NOT EXISTS idx_calls_campaign_id_created_at 
  ON calls(campaign_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_calls_retell_call_id 
  ON calls(retell_call_id) 
  WHERE retell_call_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_calls_user_id_created_at 
  ON calls(user_id, created_at DESC);

-- Campaign contact attempts indexes  
CREATE INDEX IF NOT EXISTS idx_attempts_campaign_contact 
  ON campaign_contact_attempts(campaign_id, contact_id);

CREATE INDEX IF NOT EXISTS idx_attempts_campaign_status 
  ON campaign_contact_attempts(campaign_id, call_status);

CREATE INDEX IF NOT EXISTS idx_attempts_campaign_created 
  ON campaign_contact_attempts(campaign_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_attempts_next_attempt 
  ON campaign_contact_attempts(next_attempt_after) 
  WHERE next_attempt_after IS NOT NULL AND call_status != 'completed';

-- Contacts table indexes
CREATE INDEX IF NOT EXISTS idx_contacts_group_id 
  ON contacts(contact_group_id);

CREATE INDEX IF NOT EXISTS idx_contacts_phone_gin 
  ON contacts USING gin(phone_numbers) 
  WHERE phone_numbers IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_group_status 
  ON contacts(contact_group_id, status) 
  WHERE status = 'active';

-- Contact groups indexes
CREATE INDEX IF NOT EXISTS idx_contact_groups_user_id 
  ON contact_groups(user_id);

CREATE INDEX IF NOT EXISTS idx_contact_groups_created_at 
  ON contact_groups(created_at DESC);

-- User agents indexes
CREATE INDEX IF NOT EXISTS idx_user_agents_user_id 
  ON user_agents(user_id);

CREATE INDEX IF NOT EXISTS idx_user_agents_retell_agent_id 
  ON user_agents(retell_agent_id) 
  WHERE retell_agent_id IS NOT NULL;

-- Phone numbers indexes
CREATE INDEX IF NOT EXISTS idx_phone_numbers_user_id_status 
  ON phone_numbers(user_id, status);

CREATE INDEX IF NOT EXISTS idx_phone_numbers_retell_phone_id 
  ON phone_numbers(retell_phone_id) 
  WHERE retell_phone_id IS NOT NULL;

-- Credit transactions indexes
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id 
  ON credit_transactions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_type 
  ON credit_transactions(transaction_type, created_at DESC);

-- Appointments indexes
CREATE INDEX IF NOT EXISTS idx_appointments_user_id_date 
  ON appointments(user_id, start_time DESC);

CREATE INDEX IF NOT EXISTS idx_appointments_campaign_id 
  ON appointments(campaign_id) 
  WHERE campaign_id IS NOT NULL;

-- Webhook events tracking (for idempotency)
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB,
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id 
  ON webhook_events(event_id);

CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at 
  ON webhook_events(created_at DESC);

-- Partial indexes for common queries
CREATE INDEX IF NOT EXISTS idx_campaigns_active_user 
  ON campaigns(user_id, started_at DESC) 
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_calls_recent_completed 
  ON calls(campaign_id, ended_at DESC) 
  WHERE status = 'completed' AND ended_at > NOW() - INTERVAL '7 days';

-- Composite indexes for JOIN operations
CREATE INDEX IF NOT EXISTS idx_campaigns_agent_group 
  ON campaigns(agent_id, contact_group_id, status);

-- Text search indexes
CREATE INDEX IF NOT EXISTS idx_contacts_search 
  ON contacts USING gin(
    to_tsvector('english', 
      COALESCE(first_name, '') || ' ' || 
      COALESCE(last_name, '') || ' ' || 
      COALESCE(email, '')
    )
  );

-- Function to analyze index usage
CREATE OR REPLACE FUNCTION analyze_index_usage()
RETURNS TABLE(
  schemaname TEXT,
  tablename TEXT,
  indexname TEXT,
  index_size TEXT,
  idx_scan BIGINT,
  idx_tup_read BIGINT,
  idx_tup_fetch BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.schemaname::TEXT,
    s.tablename::TEXT,
    s.indexname::TEXT,
    pg_size_pretty(pg_relation_size(s.indexrelid))::TEXT as index_size,
    s.idx_scan,
    s.idx_tup_read,
    s.idx_tup_fetch
  FROM pg_stat_user_indexes s
  WHERE s.schemaname = 'public'
  ORDER BY s.idx_scan DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to identify missing indexes
CREATE OR REPLACE FUNCTION suggest_missing_indexes()
RETURNS TABLE(
  table_name TEXT,
  column_name TEXT,
  selectivity NUMERIC,
  suggestion TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH column_stats AS (
    SELECT 
      schemaname,
      tablename,
      attname,
      n_distinct,
      null_frac,
      avg_width
    FROM pg_stats
    WHERE schemaname = 'public'
  ),
  table_sizes AS (
    SELECT 
      schemaname,
      tablename,
      pg_relation_size(schemaname||'.'||tablename) as table_size
    FROM pg_tables
    WHERE schemaname = 'public'
  )
  SELECT 
    cs.tablename::TEXT as table_name,
    cs.attname::TEXT as column_name,
    CASE 
      WHEN cs.n_distinct > 0 THEN cs.n_distinct::NUMERIC
      WHEN cs.n_distinct = -1 THEN 1000000::NUMERIC
      ELSE ABS(cs.n_distinct * ts.table_size / 8192)::NUMERIC
    END as selectivity,
    CASE
      WHEN cs.n_distinct > 100 OR cs.n_distinct = -1 THEN 
        'Consider adding index on ' || cs.tablename || '(' || cs.attname || ')'
      ELSE 
        'Low cardinality - index may not be beneficial'
    END::TEXT as suggestion
  FROM column_stats cs
  JOIN table_sizes ts ON cs.tablename = ts.tablename
  WHERE cs.null_frac < 0.5
    AND cs.attname NOT IN (
      SELECT a.attname
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = (cs.schemaname||'.'||cs.tablename)::regclass
    )
  ORDER BY 
    ts.table_size DESC,
    selectivity DESC
  LIMIT 20;
END;
$$ LANGUAGE plpgsql;

-- Vacuum and analyze tables for query planner
VACUUM ANALYZE campaigns;
VACUUM ANALYZE calls;
VACUUM ANALYZE campaign_contact_attempts;
VACUUM ANALYZE contacts;
VACUUM ANALYZE contact_groups;