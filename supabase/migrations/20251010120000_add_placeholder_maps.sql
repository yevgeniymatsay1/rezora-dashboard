-- Add placeholderMap to existing agent templates
-- This enables data-driven placeholder resolution instead of hardcoded mapping functions

-- Update Wholesaler template with complete placeholderMap
UPDATE public.agent_templates
SET default_settings = default_settings || jsonb_build_object(
  'placeholderMap', jsonb_build_array(
    -- Identity placeholders
    jsonb_build_object(
      'canonical_key', 'ai_agent_name',
      'alias', 'AIAgentName',
      'scope', 'config_time',
      'ui_group', 'identity',
      'source_path', 'identity.agentName',
      'frontend_label', 'AI Agent Name',
      'required', true,
      'default_value', 'Sarah',
      'validation', 'string|min:2|max:50'
    ),
    jsonb_build_object(
      'canonical_key', 'representative_name',
      'alias', 'InvestorName',
      'scope', 'config_time',
      'ui_group', 'identity',
      'source_path', 'conversationFlow.InvestorName',
      'frontend_label', 'Investor Name',
      'required', true,
      'default_value', '',
      'validation', 'string|min:2'
    ),
    jsonb_build_object(
      'canonical_key', 'representative_title',
      'alias', 'InvestorTitle',
      'scope', 'config_time',
      'ui_group', 'identity',
      'source_path', 'conversationFlow.InvestorTitle',
      'frontend_label', 'Investor Title',
      'required', false,
      'default_value', 'acquisition specialist',
      'validation', 'string'
    ),
    jsonb_build_object(
      'canonical_key', 'personality_traits',
      'alias', 'personalitytraits',
      'scope', 'config_time',
      'ui_group', 'personality',
      'source_path', 'identity.personalityTraits',
      'frontend_label', 'Personality Traits',
      'required', true,
      'default_value', 'Professional, Friendly',
      'frontend_component', 'trait_selector',
      'validation', 'array|min:1'
    ),

    -- Company information
    jsonb_build_object(
      'canonical_key', 'company_name',
      'alias', 'CompanyName',
      'scope', 'config_time',
      'ui_group', 'identity',
      'source_path', 'conversationFlow.CompanyName',
      'frontend_label', 'Company Name',
      'required', true,
      'default_value', '',
      'validation', 'string|min:2'
    ),
    jsonb_build_object(
      'canonical_key', 'company_location',
      'alias', 'CompanyLocation',
      'scope', 'config_time',
      'ui_group', 'identity',
      'source_path', 'conversationFlow.CompanyLocation',
      'frontend_label', 'Company Location',
      'required', false,
      'default_value', '',
      'validation', 'string'
    ),
    jsonb_build_object(
      'canonical_key', 'years_in_business',
      'alias', 'YearsInBusiness',
      'scope', 'config_time',
      'ui_group', 'identity',
      'source_path', 'conversationFlow.YearsInBusiness',
      'frontend_label', 'Years in Business',
      'required', false,
      'default_value', '10',
      'validation', 'string'
    ),
    jsonb_build_object(
      'canonical_key', 'properties_purchased',
      'alias', 'PropertiesPurchased',
      'scope', 'config_time',
      'ui_group', 'identity',
      'source_path', 'conversationFlow.PropertiesPurchased',
      'frontend_label', 'Properties Purchased',
      'required', false,
      'default_value', '500+',
      'validation', 'string'
    ),
    jsonb_build_object(
      'canonical_key', 'service_areas',
      'alias', 'ServiceAreas',
      'scope', 'config_time',
      'ui_group', 'identity',
      'source_path', 'conversationFlow.ServiceAreas',
      'frontend_label', 'Service Areas',
      'required', false,
      'default_value', '',
      'validation', 'string'
    ),

    -- Timeframes
    jsonb_build_object(
      'canonical_key', 'cash_offer_timeframe',
      'alias', 'CashOfferTimeframe',
      'scope', 'config_time',
      'ui_group', 'conversation_flow',
      'source_path', 'conversationFlow.CashOfferTimeframe',
      'frontend_label', 'Cash Offer Timeframe',
      'required', false,
      'default_value', '24-48 hour',
      'validation', 'string'
    ),
    jsonb_build_object(
      'canonical_key', 'offer_delivery_timeframe',
      'alias', 'OfferDeliveryTimeframe',
      'scope', 'config_time',
      'ui_group', 'conversation_flow',
      'source_path', 'conversationFlow.OfferDeliveryTimeframe',
      'frontend_label', 'Offer Delivery Timeframe',
      'required', false,
      'default_value', '24 hours',
      'validation', 'string'
    ),
    jsonb_build_object(
      'canonical_key', 'typical_closing_timeframe',
      'alias', 'TypicalClosingTimeframe',
      'scope', 'config_time',
      'ui_group', 'conversation_flow',
      'source_path', 'conversationFlow.TypicalClosingTimeframe',
      'frontend_label', 'Typical Closing Timeframe',
      'required', false,
      'default_value', '7-14 days',
      'validation', 'string'
    ),
    jsonb_build_object(
      'canonical_key', 'business_hours',
      'alias', 'BusinessHours',
      'scope', 'config_time',
      'ui_group', 'conversation_flow',
      'source_path', 'conversationFlow.BusinessHours',
      'frontend_label', 'Business Hours',
      'required', false,
      'default_value', 'Monday to Friday 9am-6pm',
      'validation', 'string'
    ),

    -- Value propositions
    jsonb_build_object(
      'canonical_key', 'cash_offer_benefit_1',
      'alias', 'CashOfferBenefit1',
      'scope', 'config_time',
      'ui_group', 'value_props',
      'source_path', 'conversationFlow.CashOfferBenefit1',
      'frontend_label', 'Cash Offer Benefit 1',
      'required', false,
      'default_value', 'No repairs needed - we buy as-is',
      'validation', 'string'
    ),
    jsonb_build_object(
      'canonical_key', 'cash_offer_benefit_2',
      'alias', 'CashOfferBenefit2',
      'scope', 'config_time',
      'ui_group', 'value_props',
      'source_path', 'conversationFlow.CashOfferBenefit2',
      'frontend_label', 'Cash Offer Benefit 2',
      'required', false,
      'default_value', 'Fast closing - typically 7-14 days',
      'validation', 'string'
    ),
    jsonb_build_object(
      'canonical_key', 'cash_offer_benefit_3',
      'alias', 'CashOfferBenefit3',
      'scope', 'config_time',
      'ui_group', 'value_props',
      'source_path', 'conversationFlow.CashOfferBenefit3',
      'frontend_label', 'Cash Offer Benefit 3',
      'required', false,
      'default_value', 'No commissions or fees',
      'validation', 'string'
    ),
    jsonb_build_object(
      'canonical_key', 'cash_offer_benefit_4',
      'alias', 'CashOfferBenefit4',
      'scope', 'config_time',
      'ui_group', 'value_props',
      'source_path', 'conversationFlow.CashOfferBenefit4',
      'frontend_label', 'Cash Offer Benefit 4',
      'required', false,
      'default_value', 'Close on your timeline',
      'validation', 'string'
    ),

    -- Specialty situations
    jsonb_build_object(
      'canonical_key', 'specialty_situation_1',
      'alias', 'SpecialtySituation1',
      'scope', 'config_time',
      'ui_group', 'conversation_flow',
      'source_path', 'conversationFlow.SpecialtySituation1',
      'frontend_label', 'Specialty Situation 1',
      'required', false,
      'default_value', 'Inherited properties',
      'validation', 'string'
    ),
    jsonb_build_object(
      'canonical_key', 'specialty_situation_2',
      'alias', 'SpecialtySituation2',
      'scope', 'config_time',
      'ui_group', 'conversation_flow',
      'source_path', 'conversationFlow.SpecialtySituation2',
      'frontend_label', 'Specialty Situation 2',
      'required', false,
      'default_value', 'Pre-foreclosure',
      'validation', 'string'
    ),
    jsonb_build_object(
      'canonical_key', 'specialty_situation_3',
      'alias', 'SpecialtySituation3',
      'scope', 'config_time',
      'ui_group', 'conversation_flow',
      'source_path', 'conversationFlow.SpecialtySituation3',
      'frontend_label', 'Specialty Situation 3',
      'required', false,
      'default_value', 'Divorce situations',
      'validation', 'string'
    ),
    jsonb_build_object(
      'canonical_key', 'specialty_situation_4',
      'alias', 'SpecialtySituation4',
      'scope', 'config_time',
      'ui_group', 'conversation_flow',
      'source_path', 'conversationFlow.SpecialtySituation4',
      'frontend_label', 'Specialty Situation 4',
      'required', false,
      'default_value', 'Downsizing',
      'validation', 'string'
    ),
    jsonb_build_object(
      'canonical_key', 'specialty_situation_5',
      'alias', 'SpecialtySituation5',
      'scope', 'config_time',
      'ui_group', 'conversation_flow',
      'source_path', 'conversationFlow.SpecialtySituation5',
      'frontend_label', 'Specialty Situation 5',
      'required', false,
      'default_value', 'Relocation',
      'validation', 'string'
    ),

    -- Social proof and credibility
    jsonb_build_object(
      'canonical_key', 'proof_of_funds_statement',
      'alias', 'ProofOfFundsStatement',
      'scope', 'config_time',
      'ui_group', 'conversation_flow',
      'source_path', 'conversationFlow.ProofOfFundsStatement',
      'frontend_label', 'Proof of Funds Statement',
      'required', false,
      'default_value', 'We have proof of funds and can close quickly',
      'validation', 'string'
    ),
    jsonb_build_object(
      'canonical_key', 'similar_situation_example',
      'alias', 'SimilarSituationExample',
      'scope', 'config_time',
      'ui_group', 'conversation_flow',
      'source_path', 'conversationFlow.SimilarSituationExample',
      'frontend_label', 'Similar Situation Example',
      'required', false,
      'default_value', 'a homeowner in a similar situation last month',
      'validation', 'string'
    ),
    jsonb_build_object(
      'canonical_key', 'market_condition_statement',
      'alias', 'MarketConditionStatement',
      'scope', 'config_time',
      'ui_group', 'conversation_flow',
      'source_path', 'conversationFlow.MarketConditionStatement',
      'frontend_label', 'Market Condition Statement',
      'required', false,
      'default_value', 'With current market conditions, cash offers are closing faster',
      'validation', 'string'
    ),

    -- Objection handling
    jsonb_build_object(
      'canonical_key', 'think_about_it_response',
      'alias', 'ThinkAboutItResponse',
      'scope', 'config_time',
      'ui_group', 'conversation_flow',
      'source_path', 'conversationFlow.ThinkAboutItResponse',
      'frontend_label', 'Think About It Response',
      'required', false,
      'default_value', 'I understand. What specific concerns do you have that I can address?',
      'validation', 'string'
    ),

    -- Voice style
    jsonb_build_object(
      'canonical_key', 'voice_style_sample',
      'alias', 'VoiceStyleSample',
      'scope', 'config_time',
      'ui_group', 'conversation_flow',
      'source_path', 'voiceStyle.styleSample',
      'frontend_label', 'Voice Style Sample',
      'required', false,
      'default_value', '',
      'validation', 'string'
    ),

    -- System/runtime placeholders
    jsonb_build_object(
      'canonical_key', 'user_background_section',
      'alias', 'USER_BACKGROUND_SECTION',
      'scope', 'runtime',
      'ui_group', 'system',
      'source_path', null,
      'frontend_label', null,
      'required', false,
      'default_value', '',
      'validation', null
    ),

    -- Runtime contact field placeholders (used in state prompts)
    jsonb_build_object(
      'canonical_key', 'contact_first_name',
      'alias', 'first_name',
      'scope', 'runtime',
      'ui_group', 'system',
      'source_path', null,
      'frontend_label', null,
      'required', false,
      'default_value', '',
      'validation', null
    ),
    jsonb_build_object(
      'canonical_key', 'contact_property_address',
      'alias', 'property_address',
      'scope', 'runtime',
      'ui_group', 'system',
      'source_path', null,
      'frontend_label', null,
      'required', false,
      'default_value', '',
      'validation', null
    ),

    -- System token placeholders (Retell runtime tokens)
    jsonb_build_object(
      'canonical_key', 'system_current_time',
      'alias', 'current_time_America/New_York',
      'scope', 'runtime',
      'ui_group', 'system',
      'source_path', null,
      'frontend_label', null,
      'required', false,
      'default_value', '',
      'validation', null
    )
  )
)
WHERE template_type = 'wholesaler';

-- Update Expired Listing template with placeholderMap (similar structure, different aliases)
UPDATE public.agent_templates
SET default_settings = default_settings || jsonb_build_object(
  'placeholderMap', jsonb_build_array(
    -- Identity placeholders (note: uses "RealtorName" instead of "InvestorName")
    jsonb_build_object(
      'canonical_key', 'ai_agent_name',
      'alias', 'AIAgentName',
      'scope', 'config_time',
      'ui_group', 'identity',
      'source_path', 'identity.agentName',
      'frontend_label', 'AI Agent Name',
      'required', true,
      'default_value', 'Sarah',
      'validation', 'string|min:2|max:50'
    ),
    jsonb_build_object(
      'canonical_key', 'representative_name',
      'alias', 'RealtorName',
      'scope', 'config_time',
      'ui_group', 'identity',
      'source_path', 'conversationFlow.RealtorName',
      'frontend_label', 'Realtor Name',
      'required', true,
      'default_value', '',
      'validation', 'string|min:2'
    ),
    jsonb_build_object(
      'canonical_key', 'personality_traits',
      'alias', 'personalitytraits',
      'scope', 'config_time',
      'ui_group', 'personality',
      'source_path', 'identity.personalityTraits',
      'frontend_label', 'Personality Traits',
      'required', true,
      'default_value', 'Professional, Empathetic',
      'frontend_component', 'trait_selector',
      'validation', 'array|min:1'
    ),

    -- Company information
    jsonb_build_object(
      'canonical_key', 'company_name',
      'alias', 'CompanyName',
      'scope', 'config_time',
      'ui_group', 'identity',
      'source_path', 'conversationFlow.CompanyName',
      'frontend_label', 'Company Name',
      'required', true,
      'default_value', '',
      'validation', 'string|min:2'
    ),
    jsonb_build_object(
      'canonical_key', 'company_location',
      'alias', 'CompanyLocation',
      'scope', 'config_time',
      'ui_group', 'identity',
      'source_path', 'conversationFlow.CompanyLocation',
      'frontend_label', 'Company Location',
      'required', false,
      'default_value', '',
      'validation', 'string'
    ),
    jsonb_build_object(
      'canonical_key', 'years_experience',
      'alias', 'YearsExperience',
      'scope', 'config_time',
      'ui_group', 'identity',
      'source_path', 'conversationFlow.YearsExperience',
      'frontend_label', 'Years of Experience',
      'required', false,
      'default_value', '10',
      'validation', 'string'
    ),
    jsonb_build_object(
      'canonical_key', 'homes_sold',
      'alias', 'HomesSold',
      'scope', 'config_time',
      'ui_group', 'identity',
      'source_path', 'conversationFlow.HomesSold',
      'frontend_label', 'Homes Sold',
      'required', false,
      'default_value', '500+',
      'validation', 'string'
    ),
    jsonb_build_object(
      'canonical_key', 'service_areas',
      'alias', 'ServiceAreas',
      'scope', 'config_time',
      'ui_group', 'identity',
      'source_path', 'conversationFlow.ServiceAreas',
      'frontend_label', 'Service Areas',
      'required', false,
      'default_value', '',
      'validation', 'string'
    ),

    -- System/runtime placeholders
    jsonb_build_object(
      'canonical_key', 'user_background_section',
      'alias', 'USER_BACKGROUND_SECTION',
      'scope', 'runtime',
      'ui_group', 'system',
      'source_path', null,
      'frontend_label', null,
      'required', false,
      'default_value', '',
      'validation', null
    ),

    -- Runtime contact field placeholders (used in state prompts)
    jsonb_build_object(
      'canonical_key', 'contact_first_name',
      'alias', 'first_name',
      'scope', 'runtime',
      'ui_group', 'system',
      'source_path', null,
      'frontend_label', null,
      'required', false,
      'default_value', '',
      'validation', null
    ),
    jsonb_build_object(
      'canonical_key', 'contact_property_address',
      'alias', 'property_address',
      'scope', 'runtime',
      'ui_group', 'system',
      'source_path', null,
      'frontend_label', null,
      'required', false,
      'default_value', '',
      'validation', null
    ),

    -- System token placeholders (Retell runtime tokens)
    jsonb_build_object(
      'canonical_key', 'system_current_time',
      'alias', 'current_time_America/New_York',
      'scope', 'runtime',
      'ui_group', 'system',
      'source_path', null,
      'frontend_label', null,
      'required', false,
      'default_value', '',
      'validation', null
    )
  )
)
WHERE template_type = 'expired-listing';

-- Add comment documenting the schema
COMMENT ON COLUMN agent_templates.default_settings IS 'Template configuration including states, tools, and placeholderMap. PlaceholderMap schema: [{canonical_key, alias, scope (config_time|runtime), ui_group, source_path, frontend_label, required, default_value, validation}]';
