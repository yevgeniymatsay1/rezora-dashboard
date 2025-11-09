/**
 * Campaign state machine for validating state transitions
 */

export type CampaignStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'completed' | 'failed';

interface StateTransition {
  from: CampaignStatus[];
  to: CampaignStatus;
  condition?: (campaign: any) => boolean;
}

// Valid state transitions
const VALID_TRANSITIONS: StateTransition[] = [
  // Draft can become scheduled or active
  { from: ['draft'], to: 'scheduled' },
  { from: ['draft'], to: 'active' },
  
  // Scheduled can become active or be cancelled back to draft
  { from: ['scheduled'], to: 'active' },
  { from: ['scheduled'], to: 'draft' },
  
  // Active can be paused or completed
  { from: ['active'], to: 'paused' },
  { from: ['active'], to: 'completed' },
  { from: ['active'], to: 'failed' },
  
  // Paused can be resumed or completed
  { from: ['paused'], to: 'active' },
  { from: ['paused'], to: 'completed' },
  
  // Failed campaigns can be retried
  { from: ['failed'], to: 'draft' },
  { from: ['failed'], to: 'active' },
  
  // Completed is terminal state (no transitions out)
];

/**
 * Check if a state transition is valid
 */
export function isValidTransition(
  fromStatus: CampaignStatus, 
  toStatus: CampaignStatus,
  campaign?: any
): boolean {
  const transition = VALID_TRANSITIONS.find(
    t => t.from.includes(fromStatus) && t.to === toStatus
  );
  
  if (!transition) {
    return false;
  }
  
  // Check additional conditions if any
  if (transition.condition && campaign) {
    return transition.condition(campaign);
  }
  
  return true;
}

/**
 * Get allowed next states for a given status
 */
export function getAllowedTransitions(fromStatus: CampaignStatus): CampaignStatus[] {
  return VALID_TRANSITIONS
    .filter(t => t.from.includes(fromStatus))
    .map(t => t.to);
}

/**
 * Validate campaign state before transition
 */
export function validateCampaignTransition(
  campaign: { 
    status: CampaignStatus; 
    agent_id?: string; 
    contact_group_id?: string;
    total_contacts?: number;
  },
  newStatus: CampaignStatus
): { valid: boolean; error?: string } {
  // Check if transition is allowed
  if (!isValidTransition(campaign.status, newStatus)) {
    return {
      valid: false,
      error: `Invalid state transition from ${campaign.status} to ${newStatus}`
    };
  }
  
  // Additional validation for activating campaigns
  if (newStatus === 'active') {
    if (!campaign.agent_id) {
      return {
        valid: false,
        error: 'Cannot activate campaign without an agent'
      };
    }
    
    if (!campaign.contact_group_id) {
      return {
        valid: false,
        error: 'Cannot activate campaign without a contact group'
      };
    }
    
    if (!campaign.total_contacts || campaign.total_contacts === 0) {
      return {
        valid: false,
        error: 'Cannot activate campaign with no contacts'
      };
    }
  }
  
  return { valid: true };
}

/**
 * Check if campaign can be edited in current state
 */
export function canEditCampaign(status: CampaignStatus): boolean {
  // Only draft and scheduled campaigns can be edited
  return ['draft', 'scheduled'].includes(status);
}

/**
 * Check if campaign can be deleted in current state  
 */
export function canDeleteCampaign(status: CampaignStatus): boolean {
  // Active campaigns cannot be deleted
  return status !== 'active';
}