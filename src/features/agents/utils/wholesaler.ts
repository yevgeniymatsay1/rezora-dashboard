import { AgentIdentityForm, getDefaultFormValues } from "../types/agent.types";

const coalesceStat = (
  ...values: Array<string | number | null | undefined>
) => {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const normalized = String(value).trim();
    if (normalized.length > 0) {
      return normalized;
    }
  }

  return "";
};

const CONVERSATION_DEFAULTS = {
  initialOfferQuestion: "Ask if they are open to receiving a cash offer for their property",
  valueProposition:
    "Share briefly the core value for sellers in their area (as-is purchase, no repairs needed, quick closing in {TypicalClosingTimeframe})",
  revivalAttempt:
    "Note that we've helped many homeowners in similar situations and ask what their main concern is about selling now",
  qualifyingQuestion:
    "Ask about the single biggest factor that would make them consider selling (timeline, repairs, payments, tenant issues, relocation, etc.)",
  appointmentTransition:
    "Position a brief call with {InvestorTitle} as the best way to confirm details and present their cash offer (remote; no in-person visit)",
  hesitationResponse1:
    "Emphasize the clarity they'll get from a direct offer call tailored to their situation",
  hesitationResponse2:
    "Emphasize no-obligation nature of the call and, if appropriate, note limited availability this week",
  hesitationResponse3:
    "Offer a scaled-down alternative (quick confirmation call with {InvestorTitle}) to lock the offer timing",
  followUpOffer: "Offer a light check-in window (2-4 weeks) if they prefer to pause"
} as const;

const DEFAULT_FORM_VALUES = getDefaultFormValues();
const DEFAULT_BUSINESS_HOURS = {
  startDay: DEFAULT_FORM_VALUES.businessStartDay,
  endDay: DEFAULT_FORM_VALUES.businessEndDay,
  startTime: DEFAULT_FORM_VALUES.businessStartTime,
  endTime: DEFAULT_FORM_VALUES.businessEndTime
};

function buildBusinessHoursString(formData: AgentIdentityForm): string {
  const startDay = formData.businessStartDay || "";
  const endDay = formData.businessEndDay || "";
  const startTime = formData.businessStartTime || "";
  const endTime = formData.businessEndTime || "";

  const matchesDefaults =
    startDay === DEFAULT_BUSINESS_HOURS.startDay &&
    endDay === DEFAULT_BUSINESS_HOURS.endDay &&
    startTime === DEFAULT_BUSINESS_HOURS.startTime &&
    endTime === DEFAULT_BUSINESS_HOURS.endTime;

  if (!startDay || !endDay || !startTime || !endTime || matchesDefaults) {
    return "";
  }

  return `${startDay} to ${endDay} ${startTime}-${endTime}`;
}

export function buildWholesalerConversationFlow(formData: AgentIdentityForm) {
  const businessHours = buildBusinessHoursString(formData);
  const yearsInBusiness = coalesceStat(formData.YearsInBusiness, formData.yearsExperience);
  const propertiesPurchased = coalesceStat(formData.PropertiesPurchased, formData.homesSold);

  return {
    initialOfferQuestion:
      formData.initialOfferQuestion || CONVERSATION_DEFAULTS.initialOfferQuestion,
    valueProposition:
      formData.valueProposition || CONVERSATION_DEFAULTS.valueProposition,
    revivalAttempt:
      formData.revivalAttempt || CONVERSATION_DEFAULTS.revivalAttempt,
    qualifyingQuestion:
      formData.qualifyingQuestion || CONVERSATION_DEFAULTS.qualifyingQuestion,
    appointmentTransition:
      formData.appointmentTransition || CONVERSATION_DEFAULTS.appointmentTransition,
    hesitationResponse1:
      formData.hesitationResponse1 || CONVERSATION_DEFAULTS.hesitationResponse1,
    hesitationResponse2:
      formData.hesitationResponse2 || CONVERSATION_DEFAULTS.hesitationResponse2,
    hesitationResponse3:
      formData.hesitationResponse3 || CONVERSATION_DEFAULTS.hesitationResponse3,
    followUpOffer: formData.followUpOffer || CONVERSATION_DEFAULTS.followUpOffer,
    AIAgentName: formData.agentName || "",
    CompanyName: formData.companyName || '',
    CompanyLocation: formData.CompanyLocation || formData.realtorLocation || '',
    InvestorTitle: formData.InvestorTitle || '',
    InvestorName: formData.InvestorName || '',
    CashOfferTimeframe: formData.CashOfferTimeframe || '',
    OfferDeliveryTimeframe: formData.OfferDeliveryTimeframe || '',
    TypicalClosingTimeframe: formData.TypicalClosingTimeframe || '',
    YearsInBusiness: yearsInBusiness,
    PropertiesPurchased: propertiesPurchased,
    ServiceAreas: formData.areasServiced || '',
    CashOfferBenefit1: formData.valuePoint1 || '',
    CashOfferBenefit2: formData.valuePoint2 || '',
    CashOfferBenefit3: formData.valuePoint3 || '',
    CashOfferBenefit4: formData.valuePoint4 || '',
    ProofOfFundsStatement: formData.ProofOfFundsStatement || '',
    SpecialtySituation1: formData.SpecialtySituation1 || '',
    SpecialtySituation2: formData.SpecialtySituation2 || '',
    SpecialtySituation3: formData.SpecialtySituation3 || '',
    SpecialtySituation4: formData.SpecialtySituation4 || '',
    SpecialtySituation5: formData.SpecialtySituation5 || '',
    MarketConditionStatement: formData.MarketConditionStatement || '',
    SimilarSituationExample: formData.SimilarSituationExample || '',
    ThinkAboutItResponse: formData.ThinkAboutItResponse || '',
    VoiceStyleSample: formData.voiceStyleSample || '',
    BusinessHours: businessHours,
    businessStartDay: formData.businessStartDay,
    businessEndDay: formData.businessEndDay,
    businessStartTime: formData.businessStartTime,
    businessEndTime: formData.businessEndTime,
    agentTimezone: formData.agentTimezone
  } as const;
}
