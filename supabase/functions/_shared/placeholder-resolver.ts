/**
 * Generic Placeholder Resolver
 *
 * Replaces hardcoded placeholder mapping functions (like buildWholesalerReplacementMap)
 * with data-driven resolution based on template's placeholderMap schema.
 */

import type { PlaceholderSchema, PlaceholderScope } from './placeholder-types.ts';

/**
 * Extract value from nested object using dot notation path
 * @param obj Source object
 * @param path Dot-separated path (e.g., "conversationFlow.InvestorName")
 * @returns Value at path or undefined
 */
function extractByPath(obj: any, path: string): any {
  if (!obj || !path) return undefined;

  const keys = path.split('.');
  let current = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[key];
  }

  return current;
}

/**
 * Format array values (e.g., personality traits) to string
 * @param value Value to format
 * @returns Formatted string
 */
function formatValue(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (Array.isArray(value)) {
    // Join arrays with commas (e.g., personality traits)
    return value.filter(Boolean).join(', ');
  }

  if (typeof value === 'object') {
    // For objects, try to extract meaningful string
    return JSON.stringify(value);
  }

  return String(value);
}

/**
 * Resolve placeholders for a given scope
 *
 * @param placeholderMap Template's placeholder schema
 * @param customizations User's customizations JSONB (for config_time)
 * @param scope Which scope to resolve (config_time | runtime)
 * @param contactData Contact data (for runtime scope)
 * @returns Map of alias → resolved value
 */
export function resolvePlaceholders(
  placeholderMap: PlaceholderSchema[],
  customizations: Record<string, any>,
  scope: PlaceholderScope,
  contactData?: Record<string, any>
): Record<string, string> {
  const resolved: Record<string, string> = {};

  if (!Array.isArray(placeholderMap)) {
    console.error('placeholderMap is not an array:', placeholderMap);
    return resolved;
  }

  for (const placeholder of placeholderMap) {
    // Skip placeholders not in this scope
    if (placeholder.scope !== scope) {
      continue;
    }

    // Special case: USER_BACKGROUND_SECTION is handled separately
    if (placeholder.canonical_key === 'user_background_section') {
      continue;
    }

    let value: any;

    if (scope === 'runtime') {
      // Runtime: extract from contact data
      value = placeholder.source_path
        ? extractByPath(contactData, placeholder.source_path)
        : undefined;
    } else {
      // Config time: extract from customizations
      if (!placeholder.source_path) {
        console.warn(`No source_path for config_time placeholder: ${placeholder.alias}`);
        value = undefined;
      } else {
        value = extractByPath(customizations, placeholder.source_path);
      }
    }

    // Use default value if not found
    const finalValue = value !== undefined && value !== null && value !== ''
      ? formatValue(value)
      : placeholder.default_value || '';

    resolved[placeholder.alias] = finalValue;
  }

  return resolved;
}

/**
 * Apply placeholder replacements to a prompt string
 *
 * @param prompt Prompt with placeholders (e.g., {InvestorName})
 * @param replacements Map of placeholder alias → value
 * @returns Prompt with replacements applied
 */
export function applyReplacements(
  prompt: string,
  replacements: Record<string, string>
): string {
  let result = prompt;

  for (const [alias, value] of Object.entries(replacements)) {
    // Replace all occurrences of {alias} with value
    const regex = new RegExp(`\\{${escapeRegex(alias)}\\}`, 'g');
    result = result.replace(regex, value);
  }

  return result;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validate required placeholders are present
 *
 * @param placeholderMap Template's placeholder schema
 * @param customizations User's customizations
 * @param scope Scope to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateRequiredPlaceholders(
  placeholderMap: PlaceholderSchema[],
  customizations: Record<string, any>,
  scope: PlaceholderScope
): string[] {
  const errors: string[] = [];

  if (!Array.isArray(placeholderMap)) {
    errors.push('placeholderMap is not an array');
    return errors;
  }

  for (const placeholder of placeholderMap) {
    if (placeholder.scope !== scope || !placeholder.required) {
      continue;
    }

    if (!placeholder.source_path) {
      continue; // System placeholders
    }

    const value = extractByPath(customizations, placeholder.source_path);

    if (value === undefined || value === null || value === '') {
      errors.push(
        `Required placeholder "${placeholder.frontend_label || placeholder.alias}" is missing ` +
        `(source: ${placeholder.source_path})`
      );
    }
  }

  return errors;
}

/**
 * Get placeholder schema by alias
 *
 * @param placeholderMap Template's placeholder schema
 * @param alias Placeholder alias (e.g., "InvestorName")
 * @returns Placeholder schema or undefined
 */
export function getPlaceholderByAlias(
  placeholderMap: PlaceholderSchema[],
  alias: string
): PlaceholderSchema | undefined {
  if (!Array.isArray(placeholderMap)) {
    return undefined;
  }

  return placeholderMap.find(p => p.alias === alias);
}

/**
 * Get all placeholders for a specific scope
 *
 * @param placeholderMap Template's placeholder schema
 * @param scope Scope to filter by
 * @returns Array of placeholder schemas
 */
export function getPlaceholdersByScope(
  placeholderMap: PlaceholderSchema[],
  scope: PlaceholderScope
): PlaceholderSchema[] {
  if (!Array.isArray(placeholderMap)) {
    return [];
  }

  return placeholderMap.filter(p => p.scope === scope);
}
