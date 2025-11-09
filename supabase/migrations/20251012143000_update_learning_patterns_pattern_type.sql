-- Allow prompt_structure pattern type
ALTER TABLE public.learning_patterns
DROP CONSTRAINT IF EXISTS learning_patterns_pattern_type_check;

ALTER TABLE public.learning_patterns
ADD CONSTRAINT learning_patterns_pattern_type_check
CHECK (pattern_type IN (
    'best_practice',
    'anti_pattern',
    'closing_technique',
    'objection_handling',
    'verbosity_rule',
    'tone_guidance',
    'conversation_flow',
    'prompt_structure',
    'other'
));
