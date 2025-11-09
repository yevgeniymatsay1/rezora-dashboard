/**
 * Placeholder System Types
 *
 * Defines the schema for template-driven placeholder resolution.
 * Replaces hardcoded mapping functions with data-driven configuration.
 */

export type PlaceholderScope = 'config_time' | 'runtime';

export type UIGroup =
  | 'identity'
  | 'value_props'
  | 'conversation_flow'
  | 'personality'
  | 'system';

export interface PlaceholderSchema {
  /**
   * Backend canonical identifier (e.g., "representative_name")
   * Used for cross-template consistency
   */
  canonical_key: string;

  /**
   * Template-specific placeholder name (e.g., "InvestorName", "RealtorName")
   * This is what appears in the prompt as {InvestorName}
   */
  alias: string;

  /**
   * When this placeholder is resolved:
   * - config_time: During agent configuration (replaced by update-draft-agent)
   * - runtime: During campaign execution (replaced by build-prompt)
   */
  scope: PlaceholderScope;

  /**
   * Frontend UI grouping for form organization
   */
  ui_group: UIGroup;

  /**
   * JSONPath to extract value from customizations JSONB
   * e.g., "conversationFlow.InvestorName" or "identity.agentName"
   * null for system placeholders
   */
  source_path: string | null;

  /**
   * User-facing label in Agent Config UI
   * null for non-user-editable placeholders
   */
  frontend_label: string | null;

  /**
   * Is this field required?
   */
  required: boolean;

  /**
   * Default value if not provided
   */
  default_value: string;

  /**
   * Validation rules (optional)
   * Format: "type|rule1:param|rule2:param"
   * Examples: "string|min:2|max:100", "array|min:1"
   */
  validation?: string | null;

  /**
   * Special frontend component to render (optional)
   * e.g., "trait_selector" for personality traits
   */
  frontend_component?: string | null;
}

/**
 * Template placeholder configuration
 */
export interface TemplatePlaceholderConfig {
  placeholderMap: PlaceholderSchema[];
}
