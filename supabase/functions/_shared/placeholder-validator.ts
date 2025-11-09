/**
 * Placeholder Validation Middleware
 *
 * Validates that:
 * 1. All placeholders in a prompt are defined in the placeholderMap
 * 2. Placeholders are used in the correct scope (config_time vs runtime)
 * 3. Required placeholders have values
 */

import type { PlaceholderSchema, PlaceholderScope } from './placeholder-types.ts';

export interface PlaceholderValidationError {
  type: 'unknown' | 'wrong_scope' | 'missing_required';
  placeholder: string;
  message: string;
  expected_scope?: PlaceholderScope;
  actual_scope?: PlaceholderScope;
}

/**
 * Extract all placeholders from a prompt string
 * @param prompt Prompt text with placeholders
 * @returns Array of unique placeholder names (without braces)
 */
function extractPlaceholders(prompt: string): string[] {
  // Match both single braces {placeholder} and double braces {{placeholder}}
  const matches = prompt.match(/\{\{?[^}]+\}?\}/g) || [];

  // Extract the placeholder name (remove braces)
  const placeholders = matches.map(match => {
    // Remove outer braces
    let cleaned = match.slice(1, -1);
    // If it was double braces, remove one more layer
    if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
      cleaned = cleaned.slice(1, -1);
    }
    return cleaned;
  });

  // Return unique placeholders
  return [...new Set(placeholders)];
}

/**
 * Determine the scope of a placeholder based on brace count
 * @param placeholder Placeholder string (with braces)
 * @returns Scope or undefined
 */
function getPlaceholderScope(placeholder: string): PlaceholderScope | undefined {
  if (placeholder.startsWith('{{') && placeholder.endsWith('}}')) {
    return 'runtime'; // Double braces = runtime
  } else if (placeholder.startsWith('{') && placeholder.endsWith('}')) {
    return 'config_time'; // Single braces = config_time
  }
  return undefined;
}

/**
 * Validate placeholders in a prompt against a template's placeholderMap
 *
 * @param prompt Prompt text to validate
 * @param placeholderMap Template's placeholder schema
 * @param expectedScope Expected scope for this context (config_time | runtime | 'both')
 * @returns Array of validation errors (empty if valid)
 */
export function validatePlaceholderScopes(
  prompt: string,
  placeholderMap: PlaceholderSchema[],
  expectedScope: PlaceholderScope | 'both' = 'both'
): PlaceholderValidationError[] {
  const errors: PlaceholderValidationError[] = [];

  if (!prompt || typeof prompt !== 'string') {
    return errors;
  }

  if (!Array.isArray(placeholderMap)) {
    return errors;
  }

  // Extract all placeholders from prompt
  const placeholdersInPrompt = extractPlaceholders(prompt);

  for (const placeholderName of placeholdersInPrompt) {
    // Find schema for this placeholder
    const schema = placeholderMap.find(p => p.alias === placeholderName);

    if (!schema) {
      // Unknown placeholder
      errors.push({
        type: 'unknown',
        placeholder: placeholderName,
        message: `Unknown placeholder "{${placeholderName}}" is not defined in template placeholderMap`
      });
      continue;
    }

    // Check scope if expectedScope is specified
    if (expectedScope !== 'both') {
      if (schema.scope !== expectedScope) {
        // Special case: USER_BACKGROUND_SECTION is allowed in config_time context
        // because it gets replaced at runtime
        if (schema.canonical_key === 'user_background_section' && expectedScope === 'config_time') {
          continue;
        }

        errors.push({
          type: 'wrong_scope',
          placeholder: placeholderName,
          message: `Placeholder "{${placeholderName}}" has scope "${schema.scope}" ` +
                   `but is being used in "${expectedScope}" context`,
          expected_scope: expectedScope,
          actual_scope: schema.scope
        });
      }
    }
  }

  return errors;
}

/**
 * Validate that all required placeholders have values
 *
 * @param placeholderMap Template's placeholder schema
 * @param customizations User's customizations JSONB
 * @param scope Scope to validate (config_time | runtime)
 * @returns Array of validation errors (empty if valid)
 */
export function validateRequiredPlaceholders(
  placeholderMap: PlaceholderSchema[],
  customizations: Record<string, any>,
  scope: PlaceholderScope
): PlaceholderValidationError[] {
  const errors: PlaceholderValidationError[] = [];

  if (!Array.isArray(placeholderMap)) {
    return errors;
  }

  // Helper to extract value by path
  function extractByPath(obj: any, path: string): any {
    if (!obj || !path) return undefined;
    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
      if (current === null || current === undefined) return undefined;
      current = current[key];
    }
    return current;
  }

  for (const placeholder of placeholderMap) {
    // Skip if not in this scope or not required
    if (placeholder.scope !== scope || !placeholder.required) {
      continue;
    }

    // Skip system placeholders (no source_path)
    if (!placeholder.source_path) {
      continue;
    }

    // Extract value
    const value = extractByPath(customizations, placeholder.source_path);

    // Check if value is missing or empty
    const isEmpty = value === undefined ||
                    value === null ||
                    value === '' ||
                    (Array.isArray(value) && value.length === 0);

    if (isEmpty) {
      errors.push({
        type: 'missing_required',
        placeholder: placeholder.alias,
        message: `Required placeholder "{${placeholder.alias}}" ` +
                 `(${placeholder.frontend_label || placeholder.alias}) is missing or empty. ` +
                 `Source: ${placeholder.source_path}`
      });
    }
  }

  return errors;
}

/**
 * Format validation errors into a human-readable message
 *
 * @param errors Array of validation errors
 * @returns Formatted error message
 */
export function formatValidationErrors(errors: PlaceholderValidationError[]): string {
  if (errors.length === 0) {
    return '';
  }

  const grouped = {
    unknown: errors.filter(e => e.type === 'unknown'),
    wrong_scope: errors.filter(e => e.type === 'wrong_scope'),
    missing_required: errors.filter(e => e.type === 'missing_required')
  };

  const messages: string[] = [];

  if (grouped.unknown.length > 0) {
    messages.push(
      `Unknown placeholders (${grouped.unknown.length}):\n` +
      grouped.unknown.map(e => `  - ${e.placeholder}: ${e.message}`).join('\n')
    );
  }

  if (grouped.wrong_scope.length > 0) {
    messages.push(
      `Scope violations (${grouped.wrong_scope.length}):\n` +
      grouped.wrong_scope.map(e => `  - ${e.placeholder}: ${e.message}`).join('\n')
    );
  }

  if (grouped.missing_required.length > 0) {
    messages.push(
      `Missing required values (${grouped.missing_required.length}):\n` +
      grouped.missing_required.map(e => `  - ${e.placeholder}: ${e.message}`).join('\n')
    );
  }

  return messages.join('\n\n');
}
