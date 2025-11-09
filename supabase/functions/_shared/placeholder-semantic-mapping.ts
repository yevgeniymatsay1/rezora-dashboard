/**
 * Placeholder Semantic Mapping
 *
 * Defines the semantic types of placeholders and provides guidance for
 * the Generator LLM on when and how to create them.
 */

export interface PlaceholderSemanticType {
  purpose: string;
  examples?: string[];
  fixed_name?: string;
  naming_strategy?: string;
  llm_should_generate: boolean;
  frontend_component?: string;
  notes?: string;
  flexible_count?: boolean;
  pattern?: string;
}

export const PLACEHOLDER_SEMANTIC_MAPPING: Record<string, PlaceholderSemanticType> = {
  // User identity placeholders
  user_identity: {
    purpose: "The name of the person or entity the AI represents",
    examples: ["{InvestorName}", "{RealtorName}", "{AgentName}", "{RepresentativeName}"],
    naming_strategy: "Match to user's role or industry (e.g., {InvestorName} for wholesalers, {RealtorName} for agents)",
    llm_should_generate: true,
    notes: "This placeholder name should adapt based on the type of business/agent being created"
  },

  ai_agent_identity: {
    purpose: "The name the AI agent will use to introduce itself",
    examples: ["{AIAgentName}"],
    fixed_name: "{AIAgentName}",
    llm_should_generate: true,
    notes: "Standard name across all agents"
  },

  // Personality - SPECIAL: comes from frontend
  personality: {
    purpose: "Personality traits that users select from a predefined list in the frontend",
    fixed_name: "{personalitytraits}",
    llm_should_generate: false,
    frontend_component: "trait_selector",
    notes: "CRITICAL: The LLM should NEVER generate personality descriptions. This is selected by users from options like 'Professional', 'Friendly', 'Assertive', etc. in the agent configuration UI. Just include the placeholder."
  },

  // Company information
  company_info: {
    purpose: "Basic company details users will customize",
    examples: ["{CompanyName}", "{CompanyLocation}", "{YearsInBusiness}", "{PropertiesPurchased}", "{ServiceAreas}"],
    llm_should_generate: true,
    notes: "Generate placeholders appropriate for the business type"
  },

  // Timeframes and durations
  timeframes: {
    purpose: "Time-related values that vary by business",
    examples: ["{TypicalClosingTimeframe}", "{OfferDeliveryTimeframe}", "{CashOfferTimeframe}", "{BusinessHours}"],
    llm_should_generate: true,
    notes: "Adapt timeframe placeholder names to the specific process (e.g., closing, offer delivery, callback time)"
  },

  // Value propositions and benefits
  value_props: {
    purpose: "Key benefits or features the user wants to highlight",
    pattern: "{[BenefitName][1-4]}",
    examples: ["{CashOfferBenefit1}", "{CashOfferBenefit2}", "{ValueProposition1}"],
    llm_should_generate: true,
    flexible_count: true,
    notes: "Usually 3-5 numbered benefits. Adapt naming to the specific offering (CashOfferBenefit vs ServiceBenefit vs OfferAdvantage)"
  },

  // Specialty situations or use cases
  specialties: {
    purpose: "Specific situations or scenarios the business handles",
    pattern: "{[SpecialtyName][1-5]}",
    examples: ["{SpecialtySituation1}", "{SpecialtySituation2}"],
    llm_should_generate: true,
    flexible_count: true,
    notes: "List of scenarios relevant to the business (e.g., 'Inherited properties', 'Pre-foreclosure', 'Divorce situations')"
  },

  // Titles and roles
  roles_titles: {
    purpose: "Titles used to refer to key people in the process",
    examples: ["{InvestorTitle}", "{ExpertTitle}", "{SpecialistTitle}"],
    naming_strategy: "Use terminology appropriate for the industry (Investor, Realtor, Specialist, Expert, etc.)",
    llm_should_generate: true,
    notes: "Match title terminology to the business type"
  },

  // Proof and credibility
  credibility: {
    purpose: "Statements or facts that establish credibility and trust",
    examples: ["{ProofOfFundsStatement}", "{CredibilityStatement}", "{TrackRecordStatement}"],
    llm_should_generate: true,
    notes: "Business-specific credibility indicators"
  },

  // Market conditions and context
  market_context: {
    purpose: "Statements about current market conditions or situational factors",
    examples: ["{MarketConditionStatement}", "{TimingSensitivity}"],
    llm_should_generate: true,
    notes: "Can be used to create urgency or context"
  },

  // Examples and social proof
  social_proof: {
    purpose: "Reference examples or past client situations",
    examples: ["{SimilarSituationExample}", "{RecentSuccessExample}"],
    llm_should_generate: true,
    notes: "Helps with relatability and trust-building"
  },

  // Objection responses
  objection_handling: {
    purpose: "Pre-crafted responses to common objections",
    examples: ["{ThinkAboutItResponse}", "{PriceObjectionResponse}", "{TimingObjectionResponse}"],
    llm_should_generate: true,
    notes: "Allows users to customize how specific objections are handled"
  },

  // Voice and style customization
  voice_style: {
    purpose: "Sample text that demonstrates the desired voice and communication style",
    examples: ["{VoiceStyleSample}"],
    llm_should_generate: true,
    notes: "Users provide a sample of how they want the AI to sound"
  },

  // User background section (optional)
  user_background: {
    purpose: "Section for contextual information about the lead/prospect",
    examples: ["{USER_BACKGROUND_SECTION}"],
    llm_should_generate: true,
    notes: "Optional section that can contain variables like {{first_name}}, {{property_address}}, etc."
  }
};

/**
 * Get guidance text for the Generator LLM about placeholder usage
 */
export function getPlaceholderGuidance(): string {
  return `
## PLACEHOLDER SYSTEM GUIDANCE

Placeholders allow users to customize their AI agent without editing the full prompt. Use curly braces: {PlaceholderName}

### CRITICAL RULES:

1. **{personalitytraits} is SPECIAL**: This comes from a frontend trait selector where users pick from options like "Professional", "Friendly", "Assertive", etc. NEVER write out personality descriptions - just include the {personalitytraits} placeholder.

2. **Adapt placeholder names to the business**:
   - For real estate investors: {InvestorName}, {InvestorTitle}
   - For real estate agents: {RealtorName}, {AgentName}
   - Match the terminology to how that industry refers to roles

3. **Flexible vs Fixed names**:
   - Fixed: {AIAgentName}, {personalitytraits} - use these exact names
   - Flexible: Value props, company info, specialties - adapt names to context
   - Example: {CashOfferBenefit1} for wholesalers, {ServiceBenefit1} for service providers

4. **Numbered placeholders**: When you need multiple similar items (benefits, specialties, situations), use numbered suffixes: {Benefit1}, {Benefit2}, etc. Usually 3-5 items.

5. **Users fill these on the frontend**: All placeholders become form fields in the agent configuration UI. Make placeholder names clear and self-explanatory.

6. **Balance**: Provide enough placeholders for customization but not so many it becomes overwhelming. Aim for 10-15 total.

### EXAMPLES OF GOOD PLACEHOLDER USAGE:

For a real estate wholesaler:
- {InvestorName} - the investor's name
- {InvestorTitle} - how to refer to them (acquisition specialist, investor, etc.)
- {personalitytraits} - COMES FROM FRONTEND, don't generate
- {CashOfferTimeframe} - how quickly they make offers
- {TypicalClosingTimeframe} - usual closing time
- {CashOfferBenefit1}, {CashOfferBenefit2}, etc. - key benefits

For a SaaS sales agent:
- {RepresentativeName} - the person's name
- {CompanyName} - company name
- {personalitytraits} - COMES FROM FRONTEND, don't generate
- {ProductName} - what they're selling
- {KeyFeature1}, {KeyFeature2}, etc. - main features
- {PricingStructure} - pricing info

### WHAT NOT TO DO:
❌ Generate personality trait descriptions (use {personalitytraits} placeholder instead)
❌ Use generic names like {Variable1}, {Field2} (be descriptive)
❌ Create too many placeholders (keep it manageable)
❌ Use inconsistent naming within same prompt (pick a style and stick to it)
  `.trim();
}

/**
 * Check if a placeholder name is a fixed/standard placeholder
 */
export function isFixedPlaceholder(name: string): boolean {
  const fixed = ["{AIAgentName}", "{personalitytraits}"];
  return fixed.includes(name);
}

/**
 * Get semantic type for a placeholder name
 */
export function getPlaceholderSemanticType(name: string): string | null {
  // Remove braces
  const cleaned = name.replace(/[{}]/g, "").toLowerCase();

  if (cleaned.includes("personality") || cleaned.includes("trait")) return "personality";
  if (cleaned.includes("name") && !cleaned.includes("company")) return "user_identity";
  if (cleaned.includes("aiagent") || cleaned.includes("agentname")) return "ai_agent_identity";
  if (cleaned.includes("company") || cleaned.includes("business") || cleaned.includes("years")) return "company_info";
  if (cleaned.includes("timeframe") || cleaned.includes("hours") || cleaned.includes("time")) return "timeframes";
  if (cleaned.includes("benefit") || cleaned.includes("value") || cleaned.includes("advantage")) return "value_props";
  if (cleaned.includes("specialty") || cleaned.includes("situation") || cleaned.includes("scenario")) return "specialties";
  if (cleaned.includes("title") || cleaned.includes("role")) return "roles_titles";
  if (cleaned.includes("proof") || cleaned.includes("credibility") || cleaned.includes("track")) return "credibility";
  if (cleaned.includes("market") || cleaned.includes("timing")) return "market_context";
  if (cleaned.includes("example") || cleaned.includes("success")) return "social_proof";
  if (cleaned.includes("response") || cleaned.includes("objection")) return "objection_handling";
  if (cleaned.includes("voice") || cleaned.includes("style") || cleaned.includes("sample")) return "voice_style";
  if (cleaned.includes("background") || cleaned.includes("user_")) return "user_background";

  return null;
}
