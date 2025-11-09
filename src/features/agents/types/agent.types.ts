export interface AgentTemplate {
  id: string;
  name: string;
  description: string | null;
  template_type: string;
  base_prompt: string;
  default_settings: any;
  is_active: boolean;
}

export interface AgentIdentityForm {
  agentName: string;
  companyName: string;
  realtorName: string;
  realtorLocation: string;
  yearsExperience: string;
  homesSold: string;
  areasServiced: string;
  valuePoint1: string;
  valuePoint2: string;
  valuePoint3: string;
  valuePoint4: string;
  personalityTraits: string[];
  voiceStyleSample: string;
  agentTimezone: string;
  businessStartDay: string;
  businessEndDay: string;
  businessStartTime: string;
  businessEndTime: string;
  // Landlord-specific fields
  currentLocation: string;
  reasonForMoving: string;
  moveTimeline: string;
  jobField: string;
  // Landlord conversation flow fields
  reasonForCalling: string;
  vacancyTimeframe: string;
  propertyDetailsToGather: string;
  closingMessage: string;
  // Voice & Behavior settings
  voiceId: string;
  voiceModel: string;
  voiceSpeed: number;
  voiceTemperature: number;
  volume: number;
  responsiveness: number;
  interruptionSensitivity: number;
  enableBackchannel: boolean;
  voiceStyle: string;
  // Conversation Flow settings - Expired Listing
  introductionLine: string;
  permissionLine: string;
  marketInsights: string;
  offerPresentation: string;
  scarcityLine: string;
  revivalAttempt: string;
  previousExperience: string;
  hesitationHandling: string;
  alternativeApproach: string;
  followUpOffer: string;

  // Conversation Flow settings - Wholesaler
  initialOfferQuestion?: string;
  valueProposition?: string;
  qualifyingQuestion?: string;
  appointmentTransition?: string;
  hesitationResponse1?: string;
  hesitationResponse2?: string;
  hesitationResponse3?: string;

  // Wholesaler Identity fields
  InvestorName?: string;
  InvestorTitle?: string;
  CompanyLocation?: string;
  CashOfferTimeframe?: string;
  OfferDeliveryTimeframe?: string;
  TypicalClosingTimeframe?: string;
  YearsInBusiness?: string;
  PropertiesPurchased?: string;
  ProofOfFundsStatement?: string;
  SpecialtySituation1?: string;
  SpecialtySituation2?: string;
  SpecialtySituation3?: string;
  SpecialtySituation4?: string;
  SpecialtySituation5?: string;
  MarketConditionStatement?: string;
  SimilarSituationExample?: string;
  ThinkAboutItResponse?: string;
  // Advanced settings
  ambientSound?: string;
  ambientVolume?: number;
  normalizeForSpeech?: boolean;
  reminderTriggerMs?: number;
  reminderMaxCount?: number;
  beginMessageDelayMs?: number;
  endCallAfterSilenceMs?: number;
  maxCallDurationMs?: number;
  voicemailDetection?: boolean;
  voicemailAction?: "hangup" | "leave_message";
  voicemailMessage?: string;
  language?: string;
  // Integration settings
  enableTransfer?: boolean;
  transferPhoneNumber?: string;
  enableCalCom?: boolean;
  calComApiKey?: string;
  calComEventTypeId?: string;
  calComTimezone?: string;
  // Post-call analysis
  postCallAnalysis?: Array<{
    name: string;
    description: string;
  }>;
  // Advanced message
  beginMessage?: string;
  dynamic?: Record<string, Record<string, string>>;
}

export const personalityOptions = [
  "Professional", "Friendly", "Assertive", "Consultative", 
  "Empathetic", "Enthusiastic", "Patient", "Direct",
  "Confident", "Warm", "Persuasive", "Analytical"
];

export const getDefaultFormValues = (): AgentIdentityForm => ({
  agentName: "",
  companyName: "",
  realtorName: "",
  realtorLocation: "",
  yearsExperience: "",
  homesSold: "",
  areasServiced: "",
  valuePoint1: "",
  valuePoint2: "",
  valuePoint3: "",
  valuePoint4: "",
  personalityTraits: [],
  voiceStyleSample: "",
  agentTimezone: "America/New_York",
  businessStartDay: "Monday",
  businessEndDay: "Friday",
  businessStartTime: "9am",
  businessEndTime: "5pm",
  // Landlord defaults
  currentLocation: "",
  reasonForMoving: "",
  moveTimeline: "",
  jobField: "",
  reasonForCalling: "",
  vacancyTimeframe: "",
  propertyDetailsToGather: "",
  closingMessage: "",
  // Voice & Behavior defaults
  voiceId: "11labs-Adrian",
  voiceModel: "eleven_turbo_v2",
  voiceSpeed: 0.92,
  voiceTemperature: 1,
  volume: 1,
  responsiveness: 0.8,
  interruptionSensitivity: 0.7,
  enableBackchannel: true,
  voiceStyle: "",
  // Conversation Flow defaults  
  introductionLine: "",
  permissionLine: "",
  marketInsights: "",
  offerPresentation: "",
  scarcityLine: "",
  revivalAttempt: "",
  previousExperience: "",
  hesitationHandling: "",
  alternativeApproach: "",
  followUpOffer: "",
  // Wholesaler fields
  initialOfferQuestion: "",
  valueProposition: "",
  qualifyingQuestion: "",
  appointmentTransition: "",
  hesitationResponse1: "",
  hesitationResponse2: "",
  hesitationResponse3: "",
  InvestorName: "",
  InvestorTitle: "",
  CompanyLocation: "",
  CashOfferTimeframe: "",
  OfferDeliveryTimeframe: "",
  TypicalClosingTimeframe: "",
  YearsInBusiness: "",
  PropertiesPurchased: "",
  ProofOfFundsStatement: "",
  SpecialtySituation1: "",
  SpecialtySituation2: "",
  SpecialtySituation3: "",
  SpecialtySituation4: "",
  SpecialtySituation5: "",
  MarketConditionStatement: "",
  SimilarSituationExample: "",
  ThinkAboutItResponse: "",
  // Advanced defaults
  ambientSound: "none",
  ambientVolume: 0.5,
  normalizeForSpeech: true,
  reminderTriggerMs: 10000,
  reminderMaxCount: 2,
  beginMessageDelayMs: 1000,
  endCallAfterSilenceMs: 600000,
  maxCallDurationMs: 3600000,
  voicemailDetection: false,
  voicemailAction: "hangup",
  voicemailMessage: "",
  language: "en-US",
  // Integration defaults
  enableTransfer: false,
  transferPhoneNumber: "",
  enableCalCom: false,
  calComApiKey: "",
  calComEventTypeId: "",
  calComTimezone: "America/New_York",
  // Post-call analysis defaults
  postCallAnalysis: [],
  // Advanced message defaults
  beginMessage: "",
  dynamic: {}
});
