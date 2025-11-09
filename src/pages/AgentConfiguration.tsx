import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm, FormProvider } from 'react-hook-form';
import {
  ArrowLeft,
  Question,
  FloppyDisk,
  RocketLaunch,
  Phone,
  Microphone,
  CaretDown,
  Plus,
  X,
  Play,
  Pause,
  Gear,
  Calendar,
  Link,
  ChartBar,
  User,
  ChatCircle,
  Upload,
  CircleNotch,
  Trophy,
  Smiley
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

// Types
import { AgentIdentityForm, getDefaultFormValues } from '@/features/agents/types/agent.types';

// Hooks
import { useAgentTemplate } from '@/features/agents/hooks/useAgentTemplate';
import { useAgentManagement } from '@/features/agents/hooks/useAgentManagement';
import { usePhoneNumbers } from '@/features/agents/hooks/usePhoneNumbers';
import { useVoiceSettings } from '@/features/agents/hooks/useVoiceSettings';
import { useDraftAgent } from '@/features/agents/hooks/useDraftAgent';

// Services
import { deployAgent } from '@/features/agents/services/agentDeployment';
import { updateExistingAgent } from '@/features/agents/services/agentUpdate';

// Components
import { TestCallButton } from '@/components/TestCallButton';
import { PhoneNumberSelector } from '@/components/PhoneNumberSelector';

type PlaceholderComponentType = "text" | "textarea" | "number" | "trait_selector";

interface TemplatePlaceholderField {
  alias: string;
  sectionId: string;
  label: string;
  helperText: string;
  component: PlaceholderComponentType;
  placeholderText?: string;
  required: boolean;
  defaultValue: string;
  sourcePath: string;
  order: number;
}

interface DynamicPlaceholderSection {
  id: string;
  title: string;
  subtitle?: string;
  fields: TemplatePlaceholderField[];
}

const traits = ['Professional', 'Friendly', 'Assertive', 'Consultative', 'Empathetic', 'Enthusiastic', 'Patient', 'Direct', 'Confident', 'Warm', 'Persuasive', 'Analytical'];

type SectionPresentation = {
  icon: React.ComponentType<{ className?: string }>;
  description: string;
};

const sectionPresentation: Record<string, SectionPresentation> = {
  agent_identity: {
    icon: User,
    description: "Define how your AI introduces itself and references your business when speaking with leads.",
  },
  value_props: {
    icon: Trophy,
    description: "Share the proof points your AI should highlight without relying on the default talking points.",
  },
  conversation_flow: {
    icon: ChatCircle,
    description: "Guide the AI through key beats in the conversation. Leave any step blank to keep the factory default.",
  },
  personality: {
    icon: Smiley,
    description: "Pick the traits and tone guidelines that should shape how your AI speaks.",
  },
};

type SavedConfigRecord = Record<string, any>;

type VoiceModelOption = {
  value: string;
  label: string;
  description: string;
  recommended?: boolean;
};

const voiceModelOptions: ReadonlyArray<VoiceModelOption> = [
  {
    value: 'eleven_turbo_v2',
    label: 'Auto (Elevenlabs Turbo V2)',
    description: 'English only • fast • high quality',
    recommended: true
  },
  {
    value: 'eleven_flash_v2',
    label: 'Elevenlabs Flash V2',
    description: 'English only • fastest • medium quality'
  },
  {
    value: 'eleven_turbo_v2_5',
    label: 'Elevenlabs Turbo V2.5',
    description: 'Multilingual • fast • high quality'
  },
  {
    value: 'eleven_flash_v2_5',
    label: 'Elevenlabs Flash V2.5',
    description: 'Multilingual • fastest • medium quality'
  },
  {
    value: 'eleven_multilingual_v2',
    label: 'Elevenlabs Multilingual V2',
    description: 'Multilingual • slow • high quality'
  }
];

const valuePointKeys: Array<'valuePoint1' | 'valuePoint2' | 'valuePoint3' | 'valuePoint4'> = [
  'valuePoint1',
  'valuePoint2',
  'valuePoint3',
  'valuePoint4'
];

const getFirstFilledValue = (
  ...values: Array<string | number | null | undefined>
): string => {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const stringValue = String(value).trim();
    if (stringValue !== '') {
      return stringValue;
    }
  }

  return '';
};

const AgentConfiguration: React.FC = () => {
  const { templateId, agentId } = useParams<{ templateId?: string; agentId?: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Local UI state
  const [expandedWidgets, setExpandedWidgets] = useState<Set<string>>(new Set());
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [showVoiceGear, setShowVoiceGear] = useState(false);
  const [showNewNumberModal, setShowNewNumberModal] = useState(false);
  const [showCustomTraitInput, setShowCustomTraitInput] = useState(false);
  const [customTrait, setCustomTrait] = useState('');
  const [conversationExpanded, setConversationExpanded] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const formInitializedRef = useRef(false);

  // Custom hooks
  const { isEditMode, existingAgent } = useAgentManagement(agentId);
  const effectiveTemplateId = templateId || existingAgent?.template_id || null;
  const { template } = useAgentTemplate(effectiveTemplateId || undefined);
  const { hasPhoneNumber, selectedPhoneNumberId, setSelectedPhoneNumberId } = usePhoneNumbers();
  const { voices, voicesLoading } = useVoiceSettings();
  const {
    draftAgent,
    isDraftLoading,
    updateDraftAgent
  } = useDraftAgent(templateId, agentId);

  // Form setup with React Hook Form
  const methods = useForm<AgentIdentityForm>({
    defaultValues: getDefaultFormValues()
  });

  const { watch, setValue, reset } = methods;
  const formData = watch();

  const templateType = template?.template_type || existingAgent?.template?.template_type || null;
  const templateTypeNormalized = templateType ? templateType.trim().toLowerCase() : null;
  const isWholesalerTemplate = templateTypeNormalized === 'wholesaler';
  const isLegacyTemplate = templateTypeNormalized === 'wholesaler' || templateTypeNormalized === 'expired-listing';

  const dynamicSectionConfigs: DynamicPlaceholderSection[] | null = useMemo(() => {
    const sectionsMeta = template?.default_settings?.placeholderSections as
      | Record<string, { title: string; subtitle?: string; order?: number }>
      | undefined;
    const placeholderEntries = Array.isArray(template?.default_settings?.placeholderMap)
      ? (template?.default_settings?.placeholderMap as Array<any>)
      : null;

    if (!sectionsMeta || !placeholderEntries) {
      return null;
    }

    const grouped: Record<string, TemplatePlaceholderField[]> = {};

    placeholderEntries
      .filter((entry) => entry.scope === 'config_time' && entry.source_path)
      .forEach((entry) => {
        const ui = entry.ui ?? {};
        const sectionId = ui.section_id ?? entry.ui_group ?? 'agent_identity';
        const field: TemplatePlaceholderField = {
          alias: entry.alias,
          sectionId,
          label: entry.frontend_label ?? entry.alias,
          helperText: ui.helper_text ?? '',
          component: (ui.component ?? 'text') as PlaceholderComponentType,
          placeholderText: ui.placeholder_text ?? '',
          required: Boolean(entry.required),
          defaultValue: entry.default_value ?? '',
          sourcePath: entry.source_path,
          order: ui.order ?? 0,
        };
        grouped[sectionId] = grouped[sectionId] ?? [];
        grouped[sectionId].push(field);
      });

    const orderedSections = Object.entries(sectionsMeta)
      .sort((a, b) => (a[1]?.order ?? 0) - (b[1]?.order ?? 0))
      .map(([id, meta]) => ({
        id,
        title: meta?.title ?? id,
        subtitle: meta?.subtitle ?? '',
        fields: (grouped[id] ?? []).sort((a, b) => a.order - b.order),
      }))
      .filter((section) => section.fields.length > 0);

    return orderedSections.length > 0 ? orderedSections : null;
  }, [template]);

  const hasDynamicPlaceholderSections = Boolean(dynamicSectionConfigs && dynamicSectionConfigs.length > 0);
  const dynamicSectionsById = useMemo(() => {
    if (!dynamicSectionConfigs) return new Map<string, DynamicPlaceholderSection>();
    return new Map(dynamicSectionConfigs.map((section) => [section.id, section]));
  }, [dynamicSectionConfigs]);
  const agentIdentitySection = dynamicSectionsById.get("agent_identity");
  const valuePropsSection = dynamicSectionsById.get("value_props");
  const conversationSection = dynamicSectionsById.get("conversation_flow");
  const dynamicHasTraitSelector = useMemo(
    () => (dynamicSectionConfigs || []).some((section) => section.fields.some((field) => field.component === 'trait_selector')),
    [dynamicSectionConfigs]
  );
  const additionalDynamicSections =
    (dynamicSectionConfigs || []).filter(
      (section) => section.id !== "agent_identity" && section.id !== "value_props" && section.id !== "conversation_flow"
    );

  const templateDefaults = template?.default_settings?.defaults;

  const currentVoiceModel = formData.voiceModel || 'eleven_turbo_v2';
  const selectedVoiceModel =
    voiceModelOptions.find((option) => option.value === currentVoiceModel) || voiceModelOptions[0];

  // Track previous form data for auto-save
  const previousFormDataRef = useRef(formData);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout>();

  const getValueAtPath = (obj: any, path: string): any => {
    if (!obj || !path) return undefined;
    return path.split('.').reduce((acc: any, key: string) => {
      if (acc === undefined || acc === null) return undefined;
      return acc[key];
    }, obj);
  };

  const setValueAtPath = (obj: Record<string, any>, path: string, value: any) => {
    if (!path) return;
    const parts = path.split('.');
    let current = obj;
    for (let i = 0; i < parts.length; i++) {
      const key = parts[i];
      if (i === parts.length - 1) {
        current[key] = value;
      } else {
        current[key] = current[key] ?? {};
        current = current[key];
      }
    }
  };

  const deepMerge = (target: any, source: any): any => {
    if (typeof target !== 'object' || target === null) return source;
    if (typeof source !== 'object' || source === null) return target;
    const merged: any = Array.isArray(target) ? [...target] : { ...target };
    for (const key of Object.keys(source)) {
      const sourceValue = source[key];
      if (sourceValue === undefined) continue;
      if (typeof sourceValue === 'object' && sourceValue !== null && !Array.isArray(sourceValue)) {
        merged[key] = deepMerge(merged[key] ?? {}, sourceValue);
      } else {
        merged[key] = sourceValue;
      }
    }
    return merged;
  };

  const buildDynamicDefaults = useCallback(
    (savedConfig?: any) => {
      if (!hasDynamicPlaceholderSections || !dynamicSectionConfigs) {
        return {} as Record<string, Record<string, string>>;
      }

      // PRIORITY 1: If dynamic object exists in savedConfig, use it directly
      // This is how data is saved during deployment
      if (savedConfig?.dynamic && typeof savedConfig.dynamic === 'object') {
        console.log('Loading dynamic fields from savedConfig.dynamic:', savedConfig.dynamic);
        return savedConfig.dynamic as Record<string, Record<string, string>>;
      }

      // PRIORITY 2: Build from individual fields using sourcePath (legacy/fallback)
      console.log('Building dynamic fields from sourcePath (legacy)');
      const values: Record<string, Record<string, string>> = {};

      dynamicSectionConfigs.forEach((section) => {
        values[section.id] = {};
        section.fields.forEach((field) => {
          const savedValue = getValueAtPath(savedConfig, field.sourcePath);
          const defaultValue =
            getValueAtPath(templateDefaults, field.sourcePath) ?? field.defaultValue ?? '';

          if (field.component === "trait_selector") {
            const base = savedValue ?? defaultValue ?? [];
            let normalized: string[] = [];
            if (Array.isArray(base)) {
              normalized = base.filter((item) => typeof item === "string" && item.trim().length > 0);
            } else if (typeof base === "string") {
              const trimmed = base.trim();
              if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
                try {
                  const parsed = JSON.parse(trimmed);
                  if (Array.isArray(parsed)) {
                    normalized = parsed.filter((item) => typeof item === "string" && item.trim().length > 0);
                  }
                } catch (_error) {
                  normalized = trimmed.split(",").map((value) => value.trim()).filter(Boolean);
                }
              } else if (trimmed.length > 0) {
                normalized = trimmed.split(",").map((value) => value.trim()).filter(Boolean);
              }
            }
            values[section.id][field.alias] = JSON.stringify(normalized);
          } else {
            values[section.id][field.alias] = savedValue ?? defaultValue ?? '';
          }
        });
      });

      return values;
    },
    [dynamicSectionConfigs, hasDynamicPlaceholderSections, templateDefaults]
  );

  const dynamicValues = (formData.dynamic || {}) as Record<string, Record<string, string>>;

  const getDynamicFieldValue = (sectionId: string, alias: string) =>
    dynamicValues?.[sectionId]?.[alias] ?? '';

  const updateDynamicFieldValue = (sectionId: string, alias: string, value: string) => {
    setValue(`dynamic.${sectionId}.${alias}`, value, { shouldDirty: true, shouldTouch: true });
  };

  const renderDynamicFieldControl = useCallback((sectionId: string, field: TemplatePlaceholderField, options?: { hideLabel?: boolean; suppressHelperText?: boolean }) => {
    const fieldValue = getDynamicFieldValue(sectionId, field.alias) ?? "";
    const showLabel = !options?.hideLabel;

    const updateValue = (value: string) => {
      updateDynamicFieldValue(sectionId, field.alias, value);
    };

    if (field.component === "trait_selector") {
      const selectedTraits = formData.personalityTraits || [];

      const handleTraitToggle = (trait: string) => {
        const current = formData.personalityTraits || [];
        if (current.includes(trait)) {
          const next = current.filter((t) => t !== trait);
          setValue("personalityTraits", next, { shouldDirty: true });
          updateValue(JSON.stringify(next));
        } else if (current.length < 5) {
          const next = [...current, trait];
          setValue("personalityTraits", next, { shouldDirty: true });
          updateValue(JSON.stringify(next));
        }
      };

      const handleCustomTraitAdd = () => {
        if (!customTrait.trim()) return;
        const normalized = customTrait.trim();
        if (!selectedTraits.includes(normalized) && selectedTraits.length < 5) {
          const next = [...selectedTraits, normalized];
          setValue("personalityTraits", next, { shouldDirty: true });
          updateValue(JSON.stringify(next));
        }
        setCustomTrait("");
        setShowCustomTraitInput(false);
      };

      return (
        <div className="space-y-3">
          {showLabel && (
            <label className="text-sm font-medium text-foreground flex items-center gap-1">
              {field.label}
              {field.required && <span className="text-destructive">*</span>}
            </label>
          )}
          {!options?.suppressHelperText && (
            <p className="text-xs text-muted-foreground">
              {field.helperText || "Pick up to five traits to steer tone—we blend them with your value points in the prompt."}
            </p>
          )}
          {(selectedTraits.length > 0) && (
            <div className="flex flex-wrap gap-2 pb-3 border-b">
              {selectedTraits.map((trait) => (
                <Badge key={trait} variant="secondary" className="px-3 py-1">
                  {trait}
                  <button
                    className="ml-2 hover:text-destructive"
                    onClick={() => handleTraitToggle(trait)}
                    type="button"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <span className="text-xs text-muted-foreground self-center">
                {selectedTraits.length}/5 selected
              </span>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {traits.map((trait) => (
              <Button
                key={trait}
                variant={selectedTraits.includes(trait) ? "default" : "outline"}
                size="sm"
                className="h-8 px-3"
                disabled={!selectedTraits.includes(trait) && selectedTraits.length >= 5}
                onClick={() => handleTraitToggle(trait)}
                type="button"
              >
                {trait}
              </Button>
            ))}
          </div>
          {!showCustomTraitInput ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setShowCustomTraitInput(true)}
                  className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                >
                  <Plus className="h-4 w-4" weight="bold" />
                  Add custom trait
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" align="start">
                Add a unique descriptive trait (e.g., “calmly confident”). Counts toward the five trait limit.
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                value={customTrait}
                onChange={(e) => setCustomTrait(e.target.value)}
                placeholder="e.g., Calmly confident"
                className="h-9"
              />
              <Button type="button" onClick={handleCustomTraitAdd} disabled={!customTrait.trim()}>
                Add
              </Button>
              <Button type="button" variant="ghost" onClick={() => { setShowCustomTraitInput(false); setCustomTrait(''); }}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {showLabel && (
          <label className="text-sm font-medium text-foreground flex items-center gap-1">
            {field.label}
            {field.required && <span className="text-destructive">*</span>}
          </label>
        )}
        {field.component === "textarea" ? (
          <Textarea
            value={fieldValue}
            onChange={(e) => updateValue(e.target.value)}
            placeholder={field.placeholderText}
            rows={3}
            className="text-sm"
          />
        ) : field.component === "number" ? (
          <Input
            type="number"
            value={fieldValue}
            onChange={(e) => updateValue(e.target.value)}
            placeholder={field.placeholderText}
            className="h-10"
          />
        ) : (
          <Input
            value={fieldValue}
            onChange={(e) => updateValue(e.target.value)}
            placeholder={field.placeholderText}
            className="h-10"
          />
        )}
        {field.helperText && !options?.suppressHelperText && <p className="text-xs text-muted-foreground">{field.helperText}</p>}
      </div>
    );
  }, [customTrait, formData.personalityTraits, getDynamicFieldValue, setCustomTrait, setShowCustomTraitInput, setValue, showCustomTraitInput, updateDynamicFieldValue]);

  const dynamicAgentNameField = useMemo(() => {
    if (!dynamicSectionConfigs) return null;
    for (const section of dynamicSectionConfigs) {
      const match = section.fields.find((field) => field.sourcePath === 'identity.agentName');
      if (match) {
        return { sectionId: section.id, alias: match.alias };
      }
    }
    return null;
  }, [dynamicSectionConfigs]);

  const dynamicAgentNameValue = dynamicAgentNameField
    ? getDynamicFieldValue(dynamicAgentNameField.sectionId, dynamicAgentNameField.alias)
    : '';

  const effectiveAgentName = (dynamicAgentNameValue || formData.agentName || '').trim();

  const renderDynamicSectionCard = useCallback(
    (section: DynamicPlaceholderSection) => {
      const meta = sectionPresentation[section.id] ?? {
        icon: Gear,
        description: "Customize the template-provided fields for this agent.",
      };
      const IconComponent = meta.icon;
      const description = section.subtitle || meta.description;

      return (
        <Card key={section.id} className="shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconComponent className="h-5 w-5 text-primary" />
              {section.title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {section.fields.map((field) => (
              <React.Fragment key={`${section.id}-${field.alias}`}>
                {renderDynamicFieldControl(section.id, field)}
              </React.Fragment>
            ))}
          </CardContent>
        </Card>
      );
    },
    [renderDynamicFieldControl]
  );

  const renderDynamicIdentitySection = useCallback(() => {
    if (!agentIdentitySection) return null;
    const identityFields = agentIdentitySection.fields.filter((field) => field.component !== 'trait_selector');
    const presentation = sectionPresentation[agentIdentitySection.id] ?? {
      icon: User,
      description: agentIdentitySection.subtitle || 'Define how the AI represents your business.',
    };
    const IconComponent = presentation.icon;

    return (
      <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconComponent className="h-5 w-5 text-primary" />
            {agentIdentitySection.title}
          </CardTitle>
          <CardDescription>{agentIdentitySection.subtitle || presentation.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {identityFields.map((field) => (
              <div key={`${field.sectionId}-${field.alias}`} className="space-y-2">
                {renderDynamicFieldControl(field.sectionId, field)}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Leave any field blank to keep the factory default copy. You can reference placeholders like {'{CompanyName}'} or {'{InvestorName}'} inside your responses.
          </p>
        </CardContent>
      </Card>
    );
  }, [agentIdentitySection, renderDynamicFieldControl]);

  const renderDynamicValuePropsSection = useCallback(() => {
    if (!valuePropsSection) return null;
    const IconComponent = sectionPresentation[valuePropsSection.id]?.icon ?? Trophy;

    return (
      <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconComponent className="h-5 w-5 text-primary" />
            {valuePropsSection.title || 'Value Propositions'}
          </CardTitle>
          <CardDescription>
            {valuePropsSection.subtitle || 'Share compelling proof points that the AI can rotate through in conversation.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {valuePropsSection.fields.map((field, index) => (
              <div key={`${field.sectionId}-${field.alias}`} className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-semibold">
                    {index + 1}
                  </span>
                  {field.label}
                  {field.required && <span className="text-destructive">*</span>}
                </Label>
                {renderDynamicFieldControl(field.sectionId, field, { hideLabel: true })}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Aim for different angles—speed, pricing, service, or credibility. The AI selects the best match for each lead.
          </p>
        </CardContent>
      </Card>
    );
  }, [renderDynamicFieldControl, valuePropsSection]);

  const renderDynamicTraitCard = useCallback(() => {
    const traitField = agentIdentitySection?.fields.find((field) => field.component === 'trait_selector');
    if (!traitField) return null;

    return (
      <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smiley className="h-5 w-5 text-primary" />
            {traitField.label || 'Personality'}
          </CardTitle>
          <CardDescription>
            {traitField.helperText || 'Pick up to five traits to shape tone. We blend these with your value points automatically.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {renderDynamicFieldControl(traitField.sectionId, traitField, { hideLabel: true, suppressHelperText: true })}
          <div className="space-y-2">
            <Label htmlFor="voice-style" className="text-sm font-medium">Voice Style Sample</Label>
            <Textarea
              id="voice-style"
              placeholder="Provide a sample sentence that captures how you want your agent to speak..."
              rows={3}
              value={formData.voiceStyleSample || ''}
              onChange={(e) => setValue('voiceStyleSample', e.target.value)}
              className="resize-none transition-all focus:ring-2 focus:ring-primary/20 hover:border-primary/50"
            />
            <p className="text-xs text-muted-foreground">
              Optional. Write 1–2 sentences in the tone you want the AI to imitate (e.g., casual, formal); we match style, not the exact words. {(formData.voiceStyleSample || '').length}/500 characters
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }, [agentIdentitySection, formData.voiceStyleSample, renderDynamicFieldControl, setValue]);

  const renderDynamicConversationSection = useCallback(() => {
    if (!conversationSection) return null;
    const IconComponent = sectionPresentation[conversationSection.id]?.icon ?? ChatCircle;

    return (
      <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors rounded-t-lg" onClick={() => setConversationExpanded(!conversationExpanded)}>
          <CardTitle className="flex items-center gap-2">
            <IconComponent className="h-5 w-5 text-primary" />
            <span>{conversationSection.title || 'Conversation Script'}</span>
            <CaretDown
              className={cn('h-4 w-4 ml-auto transition-transform duration-200', conversationExpanded && 'rotate-180')}
            />
          </CardTitle>
          {!conversationExpanded && (
            <CardDescription className="mt-2">
              {conversationSection.subtitle || 'Customize how the AI progresses through each stage. Leave fields blank to keep the defaults.'}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {!conversationExpanded ? (
            <div className="relative">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 w-full">
                  {conversationSection.fields.slice(0, 5).map((field, index) => (
                    <React.Fragment key={`${field.sectionId}-${field.alias}-preview`}>
                      <div className="flex items-center gap-1 flex-1">
                        <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold shrink-0">
                          {index + 1}
                        </div>
                        <span className="text-xs font-medium hidden sm:inline truncate">{field.label}</span>
                      </div>
                      {index < Math.min(4, conversationSection.fields.length - 1) && (
                        <div className="flex-1 h-[2px] bg-primary/30 max-w-[2rem]" />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 p-4 text-sm text-muted-foreground">
                Customize the moments that matter. The AI keeps your intent but may lightly paraphrase to stay natural. Reference placeholders like {'{InvestorName}'} or {'{CompanyName}'} where helpful.
              </div>
              <div className="space-y-3">
                {conversationSection.fields.map((field, index) => (
                  <div key={`${field.sectionId}-${field.alias}`} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">{index + 1}</div>
                      <span className="font-medium">{field.label}</span>
                      {field.required && <span className="text-destructive text-sm">*</span>}
                    </div>
                    {renderDynamicFieldControl(field.sectionId, field, { hideLabel: true })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }, [conversationExpanded, conversationSection, renderDynamicFieldControl, setConversationExpanded]);

  // Load existing agent data in edit mode
  useEffect(() => {
    // Only initialize once when entering edit mode with a loaded template
    if (existingAgent && isEditMode && template && !formInitializedRef.current) {
      console.log('🔵 EDIT MODE: Initializing form', {
        agentId: existingAgent.id,
        agentName: existingAgent.name,
        hasTemplate: !!template,
        templateId: template.id,
        templateType: template.template_type,
        flagWasFalse: !formInitializedRef.current,
        customizationsKeys: Object.keys(existingAgent.customizations || {}),
        hasDynamic: !!(existingAgent.customizations as any)?.dynamic,
        dynamicKeys: Object.keys((existingAgent.customizations as any)?.dynamic || {})
      });

      const savedConfig = (existingAgent.customizations || existingAgent.settings || {}) as SavedConfigRecord;
      const savedIdentity = (savedConfig.identity || {}) as SavedConfigRecord;
      const savedRealtorProfile = (savedConfig.realtorProfile || {}) as SavedConfigRecord;
      const savedConversationFlow = (savedConfig.conversationFlow || {}) as SavedConfigRecord;

      const yearsExperienceValue = getFirstFilledValue(
        savedRealtorProfile.yearsExperience,
        savedConfig.yearsExperience,
        savedConfig.YearsInBusiness,
        savedConversationFlow.YearsInBusiness,
        savedIdentity.YearsInBusiness
      );

      const homesSoldValue = getFirstFilledValue(
        savedRealtorProfile.homesSold,
        savedConfig.homesSold,
        savedConfig.PropertiesPurchased,
        savedConversationFlow.PropertiesPurchased,
        savedIdentity.PropertiesPurchased
      );

      console.log('Loading existing agent config:', {
        hasVoiceConfig: !!savedConfig.voice,
        voiceConfig: savedConfig.voice,
        savedConfig: savedConfig
      });

      const dynamicDefaults = buildDynamicDefaults(savedConfig);

      let personalityTraitsValue = savedConfig.personalityTraits || [];
      if ((!personalityTraitsValue || personalityTraitsValue.length === 0) && dynamicDefaults?.agent_identity?.personalitytraits) {
        try {
          const parsed = JSON.parse(dynamicDefaults.agent_identity.personalitytraits);
          if (Array.isArray(parsed)) {
            personalityTraitsValue = parsed;
          }
        } catch (_error) {
          const maybeList = dynamicDefaults.agent_identity.personalitytraits;
          if (typeof maybeList === 'string' && maybeList.trim().length > 0) {
            personalityTraitsValue = maybeList.split(',').map((value) => value.trim()).filter(Boolean);
          }
        }
      }

      const formValues = {
        ...getDefaultFormValues(),
        // Identity fields - Handle both nested and flat structure
        agentName: existingAgent.name || savedConfig.identity?.agentName || savedConfig.agentName || '',
        companyName: savedConfig.identity?.brokerageName || savedConfig.companyName || '',
        agentTimezone: savedConfig.identity?.agentTimezone || savedConfig.agentTimezone || 'America/New_York',
        businessStartDay: savedConfig.identity?.businessHours?.startDay || savedConfig.businessStartDay || 'Monday',
        businessEndDay: savedConfig.identity?.businessHours?.endDay || savedConfig.businessEndDay || 'Friday',
        businessStartTime: savedConfig.identity?.businessHours?.startTime || savedConfig.businessStartTime || '9am',
        businessEndTime: savedConfig.identity?.businessHours?.endTime || savedConfig.businessEndTime || '5pm',

        // Realtor profile - Handle both nested and flat structure (for expired listing)
        realtorName: savedConfig.realtorProfile?.realtorName || savedConfig.realtorName || '',

        // Wholesaler specific fields
        InvestorName: savedConfig.InvestorName || savedConfig.conversationFlow?.InvestorName || '',
        InvestorTitle: savedConfig.InvestorTitle || savedConfig.conversationFlow?.InvestorTitle || '',
        CompanyLocation: savedConfig.CompanyLocation || savedConfig.conversationFlow?.CompanyLocation || '',
        realtorLocation: savedConfig.realtorProfile?.brokerageLocation || savedConfig.realtorLocation || '',
        yearsExperience: yearsExperienceValue,
        homesSold: homesSoldValue,
        YearsInBusiness: getFirstFilledValue(
          savedConfig.YearsInBusiness,
          savedConversationFlow.YearsInBusiness,
          savedIdentity.YearsInBusiness,
          yearsExperienceValue
        ),
        PropertiesPurchased: getFirstFilledValue(
          savedConfig.PropertiesPurchased,
          savedConversationFlow.PropertiesPurchased,
          savedIdentity.PropertiesPurchased,
          homesSoldValue
        ),
        areasServiced: savedConfig.realtorProfile?.areasServiced || savedConfig.areasServiced || '',

        // Key value points - Handle both nested and flat structure
        valuePoint1: savedConfig.keyValuePoints?.valuePoint1 || savedConfig.valuePoint1 || '',
        valuePoint2: savedConfig.keyValuePoints?.valuePoint2 || savedConfig.valuePoint2 || '',
        valuePoint3: savedConfig.keyValuePoints?.valuePoint3 || savedConfig.valuePoint3 || '',
        valuePoint4: savedConfig.keyValuePoints?.valuePoint4 || savedConfig.valuePoint4 || '',

        // Personality and voice - Handle both nested and flat structure
        personalityTraits: personalityTraitsValue || [],
        voiceStyleSample: savedConfig.voiceStyle?.styleSample || savedConfig.voiceStyleSample || '',
        voiceId: savedConfig.voice?.selectedVoice || savedConfig.voiceId || '11labs-Adrian',
        voiceModel: savedConfig.voice?.voiceModel || savedConfig.voiceModel || 'eleven_turbo_v2',
        voiceSpeed: savedConfig.voice?.speed ?? savedConfig.voiceSpeed ?? 0.92,
        voiceTemperature: savedConfig.voice?.temperature ?? savedConfig.voiceTemperature ?? 1,
        volume: savedConfig.voice?.volume ?? savedConfig.volume ?? 1,

        // Speech settings - Handle both voice and speech sections
        responsiveness: savedConfig.voice?.responsiveness ?? savedConfig.speech?.responsiveness ?? savedConfig.responsiveness ?? 0.8,
        interruptionSensitivity: savedConfig.voice?.interruptionSensitivity ?? savedConfig.speech?.interruptionSensitivity ?? savedConfig.interruptionSensitivity ?? 0.7,
        enableBackchannel: savedConfig.voice?.enableBackchannel ?? savedConfig.speech?.enableBackchannel ?? savedConfig.enableBackchannel ?? true,
        ambientSound: savedConfig.speech?.ambientSound || 'none',
        ambientVolume: savedConfig.speech?.ambientVolume ?? 0.5,
        normalizeForSpeech: savedConfig.speech?.normalizeForSpeech ?? true,

        // Call settings - Handle both nested and flat structure
        reminderTriggerMs: savedConfig.callSettings?.reminderTriggerMs || savedConfig.reminderTriggerMs || 10000,
        reminderMaxCount: savedConfig.callSettings?.reminderMaxCount || savedConfig.reminderMaxCount || 2,
        beginMessageDelayMs: savedConfig.callSettings?.beginMessageDelayMs || savedConfig.beginMessageDelayMs || 1000,
        endCallAfterSilenceMs: savedConfig.callSettings?.endCallAfterSilenceMs || savedConfig.endCallAfterSilenceMs || 600000,
        maxCallDurationMs: savedConfig.callSettings?.maxCallDurationMs || savedConfig.maxCallDurationMs || 3600000,
        voicemailDetection: savedConfig.callSettings?.voicemailDetection ?? savedConfig.voicemailDetection ?? false,
        voicemailAction: savedConfig.callSettings?.voicemailAction || savedConfig.voicemailAction || 'hangup',
        voicemailMessage: savedConfig.callSettings?.voicemailMessage || savedConfig.voicemailMessage || '',

        // Conversation flow - Handle both nested and flat structure
        introductionLine: savedConfig.conversationFlow?.introductionLine || savedConfig.introductionLine || '',
        permissionLine: savedConfig.conversationFlow?.permissionLine || savedConfig.permissionLine || '',
        marketInsights: savedConfig.conversationFlow?.marketInsights || savedConfig.marketInsights || '',
        offerPresentation: savedConfig.conversationFlow?.offerPresentation || savedConfig.offerPresentation || '',
        scarcityLine: savedConfig.conversationFlow?.scarcityLine || savedConfig.scarcityLine || '',
        revivalAttempt: savedConfig.conversationFlow?.revivalAttempt || savedConfig.revivalAttempt || '',
        previousExperience: savedConfig.conversationFlow?.previousExperience || savedConfig.previousExperience || '',
        hesitationHandling: savedConfig.conversationFlow?.hesitationHandling || savedConfig.hesitationHandling || '',
        alternativeApproach: savedConfig.conversationFlow?.alternativeApproach || savedConfig.alternativeApproach || '',
        followUpOffer: savedConfig.conversationFlow?.followUpOffer || savedConfig.followUpOffer || '',

        // Integrations
        enableTransfer: savedConfig.integrations?.enableTransfer || false,
        transferPhoneNumber: savedConfig.integrations?.transferPhoneNumber || '',
        enableCalCom: savedConfig.integrations?.enableCalCom || false,
        calComApiKey: savedConfig.integrations?.calComApiKey || '',
        calComEventTypeId: savedConfig.integrations?.calComEventTypeId || '',
        calComTimezone: savedConfig.integrations?.calComTimezone || 'America/New_York',

        // Advanced - Handle both nested and flat structure
        beginMessage: savedConfig.advanced?.beginMessage || savedConfig.beginMessage || '',
        postCallAnalysis: savedConfig.postCallAnalysis || [],
        dynamic: dynamicDefaults,
      };

      console.log('Setting form values from saved config:', {
        identity: {
          agentName: formValues.agentName,
          companyName: formValues.companyName,
          realtorName: formValues.realtorName,
          realtorLocation: formValues.realtorLocation,
          yearsExperience: formValues.yearsExperience,
          homesSold: formValues.homesSold,
          areasServiced: formValues.areasServiced
        },
        valuePropositions: {
          valuePoint1: formValues.valuePoint1,
          valuePoint2: formValues.valuePoint2,
          valuePoint3: formValues.valuePoint3,
          valuePoint4: formValues.valuePoint4
        },
        voice: {
          voiceId: formValues.voiceId,
          voiceModel: formValues.voiceModel,
          voiceSpeed: formValues.voiceSpeed,
          voiceStyleSample: formValues.voiceStyleSample
        },
        callSettings: {
          maxCallDurationMs: formValues.maxCallDurationMs,
          voicemailDetection: formValues.voicemailDetection,
          voicemailMessage: formValues.voicemailMessage
        }
      });

      reset(formValues);
      console.log('🔵 EDIT MODE: Form values set', {
        dynamicKeys: Object.keys(formValues.dynamic || {}),
        dynamicSections: formValues.dynamic,
        agentName: formValues.agentName,
        personalityTraits: formValues.personalityTraits,
        voiceId: formValues.voiceId
      });
      formInitializedRef.current = true; // Mark as initialized
    }
    // Include template?.id so effect re-runs when template finishes loading
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingAgent?.id, isEditMode, template?.id, reset]);

  // Reset initialization flag when changing agents or leaving edit mode
  useEffect(() => {
    // Always reset the flag - let the main effect decide when to initialize
    formInitializedRef.current = false;
  }, [isEditMode, existingAgent?.id]);

  useEffect(() => {
    if (!hasDynamicPlaceholderSections || isEditMode) return;

    const hasValues = Object.values(dynamicValues).some((section) =>
      section && Object.values(section).some((value) => value && value.trim().length > 0)
    );

    if (hasValues) return;

    const savedConfig = (draftAgent?.customizations || draftAgent?.settings) as SavedConfigRecord | undefined;
    const dynamicDefaults = buildDynamicDefaults(savedConfig);
    if (Object.keys(dynamicDefaults).length > 0) {
      setValue('dynamic', dynamicDefaults, { shouldDirty: false });
    }
    // Note: buildDynamicDefaults is intentionally omitted from deps to prevent infinite loops
    // We include its actual dependencies instead
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftAgent, dynamicValues, hasDynamicPlaceholderSections, isEditMode, setValue, dynamicSectionConfigs, templateDefaults]);

  useEffect(() => {
    if (!hasDynamicPlaceholderSections) return;
    if (!dynamicAgentNameValue) return;
    if (formData.agentName === dynamicAgentNameValue) return;
    setValue('agentName', dynamicAgentNameValue, { shouldDirty: false });
  }, [dynamicAgentNameValue, formData.agentName, hasDynamicPlaceholderSections, setValue]);

  // Debounced auto-save function
  const debouncedAutoSave = useCallback(() => {
    if (!isEditMode && draftAgent && !isDraftLoading &&
        draftAgent.retell_llm_id && draftAgent.retell_agent_id) {

      const hasChanges = JSON.stringify(previousFormDataRef.current) !== JSON.stringify(formData);

      if (hasChanges) {
        console.log('Auto-saving draft with voice settings:', {
          voiceId: formData.voiceId,
          voiceModel: formData.voiceModel,
          voiceSpeed: formData.voiceSpeed,
          voiceTemperature: formData.voiceTemperature,
          volume: formData.volume,
          responsiveness: formData.responsiveness,
          interruptionSensitivity: formData.interruptionSensitivity,
          enableBackchannel: formData.enableBackchannel
        });
        updateDraftAgent({
          customizations: formData,
          settings: formData,
          name: effectiveAgentName || `Draft Agent - ${new Date().toLocaleDateString()}`
        });
        previousFormDataRef.current = formData;
      }
    }
  }, [formData, isEditMode, draftAgent, isDraftLoading, updateDraftAgent]);

  // Auto-save with debouncing
  useEffect(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      debouncedAutoSave();
    }, 5000);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [formData, debouncedAutoSave]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Save configuration for test call
  const handleSaveForTest = async (): Promise<boolean> => {
    try {
      if (isEditMode && existingAgent) {
        const resolvedPhoneNumberId = selectedPhoneNumberId ?? existingAgent.phone_number_id;
        if (!resolvedPhoneNumberId) {
          throw new Error('No phone number selected for update');
        }
        // When editing an existing agent, update it
        await updateExistingAgent(existingAgent.id, formData, resolvedPhoneNumberId, template ?? null);
      } else if (draftAgent) {
        // When creating a new agent, update the draft
        const result = await updateDraftAgent({
          customizations: formData,
          settings: formData,
          name: effectiveAgentName || `Test Agent - ${new Date().toLocaleDateString()}`
        });

        console.log('Draft agent update result for test:', result);

        if (!result) {
          throw new Error('Failed to update draft agent');
        }
      } else {
        throw new Error('No agent to update');
      }

      console.log('Agent configuration saved successfully for test');
      return true; // Success
    } catch (error) {
      console.error('Failed to save configuration for test:', error);
      toast({
        title: "Configuration Save Failed",
        description: "Failed to save agent configuration. Please try again.",
        variant: "destructive"
      });
      return false; // Failure
    }
  };

  const handleDeploy = async () => {
    if (!hasPhoneNumber) {
      toast({
        title: "Phone Number Required",
        description: "Please purchase a phone number before deploying your agent.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedPhoneNumberId) {
      toast({
        title: "Phone Number Required",
        description: "Please select a phone number for your agent.",
        variant: "destructive",
      });
      return;
    }

    setDeploying(true);

    try {
      if (isEditMode && agentId) {
        await updateExistingAgent(agentId, formData, selectedPhoneNumberId, template ?? null);
        toast({
          title: "Agent Updated",
          description: "Your agent has been successfully updated.",
        });
      } else {
        await deployAgent(
          formData,
          template ?? null,
          selectedPhoneNumberId,
          draftAgent?.id
        );
        toast({
          title: "Agent Deployed!",
          description: "Your AI agent has been successfully deployed and is ready to make calls.",
        });
      }

      setTimeout(() => navigate('/agents'), 2000);
    } catch (error) {
      toast({
        title: "Deployment Failed",
        description: error instanceof Error ? error.message : "Failed to deploy agent. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeploying(false);
    }
  };

  const handlePlayPause = (e: React.MouseEvent, voice: any) => {
    e.stopPropagation(); // Prevent row selection

    if (playingVoiceId === voice.voice_id) {
      // Stop current audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setPlayingVoiceId(null);
    } else {
      // Start new audio
      if (audioRef.current) {
        audioRef.current.pause();
      }

      if (voice.preview_audio_url || voice.sample_url) {
        const audioUrl = voice.preview_audio_url || voice.sample_url;
        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.onended = () => setPlayingVoiceId(null);
        audio.onerror = () => {
          console.error('Failed to play voice preview');
          setPlayingVoiceId(null);
        };

        audio.play().catch(console.error);
        setPlayingVoiceId(voice.voice_id);
      }
    }
  };

  // Clean up audio when modal closes
  useEffect(() => {
    if (!showVoiceModal && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlayingVoiceId(null);
    }
  }, [showVoiceModal]);

  const toggleWidget = (widget: string) => {
    const newExpanded = new Set(expandedWidgets);
    if (newExpanded.has(widget)) {
      newExpanded.delete(widget);
    } else {
      newExpanded.add(widget);
    }
    setExpandedWidgets(newExpanded);
  };

  return (
    <FormProvider {...methods}>
      <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Header */}
      <div className="border-b bg-card/95 backdrop-blur-sm px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" className="hover:bg-accent/50 transition-colors" onClick={() => navigate('/agents')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Agents
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="hover:bg-accent/50 transition-colors">
              <Question className="h-4 w-4 mr-2" />
              Help
            </Button>
            <Button variant="outline" size="sm" className="hover:bg-accent transition-all hover:shadow-sm">
              <FloppyDisk className="h-4 w-4 mr-2" />
              Save
            </Button>
          </div>
        </div>
        
        {/* Status Bar */}
        <div className="mt-4 flex items-center justify-between bg-gradient-to-r from-red-900/10 to-red-800/5 rounded-lg p-4 border border-border/50">
          <div>
            <h1 className="text-lg font-semibold">{template?.name || 'Agent Configuration'}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
              <Badge variant="outline">Draft</Badge>
              <span>• Auto-saving...</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <PhoneNumberSelector
              selectedPhoneNumberId={selectedPhoneNumberId}
              onPhoneNumberSelect={setSelectedPhoneNumberId}
            />
            <Button
              className="bg-primary hover:bg-primary/90 shadow-sm hover:shadow-md transition-all"
              size="sm"
              onClick={handleDeploy}
              disabled={deploying || !effectiveAgentName}
            >
              {deploying ? (
                <>
                  <CircleNotch className="h-4 w-4 mr-2 animate-spin" />
                  {isEditMode ? 'Updating...' : 'Deploying...'}
                </>
              ) : (
                <>
                  <RocketLaunch className="h-4 w-4 mr-2" />
                  {isEditMode ? 'Update Agent' : 'Deploy Agent'}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col lg:flex-row gap-6 p-6 max-w-[1600px] mx-auto">
        {/* Left Panel - Main Configuration (70%) */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* Agent Identity */}
          {(!isLegacyTemplate && agentIdentitySection) ? (
            renderDynamicIdentitySection()
          ) : (
          <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Agent Identity
              </CardTitle>
              <CardDescription>
                Define how your AI introduces itself and references your business when speaking with leads.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="agent-name" className="text-sm font-medium flex items-center gap-1">
                    Agent Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="agent-name"
                    placeholder="e.g., Sarah"
                    className="h-10 transition-all focus:ring-2 focus:ring-primary/20 hover:border-primary/50"
                    value={formData.agentName || ''}
                    onChange={(e) => setValue('agentName', e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">The AI introduces itself with this name on every call.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company" className="text-sm font-medium">Company</Label>
                  <Input
                    id="company"
                    placeholder={isWholesalerTemplate ? "e.g., ABC Home Buyers" : "e.g., ABC Realty"}
                    className="h-10 transition-all focus:ring-2 focus:ring-primary/20 hover:border-primary/50"
                    value={formData.companyName || ''}
                    onChange={(e) => setValue('companyName', e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Mentioned when the AI explains which company or brokerage is calling.</p>
                </div>
                {isWholesalerTemplate ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="investor-name" className="text-sm font-medium flex items-center gap-1">
                        Investor Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="investor-name"
                        placeholder="e.g., John Smith"
                        className="h-10 transition-all focus:ring-2 focus:ring-primary/20 hover:border-primary/50"
                        value={formData.InvestorName || ''}
                        onChange={(e) => setValue('InvestorName', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">Your name (or teammate) the AI references when booking the appointment.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="investor-title" className="text-sm font-medium">Investor Title</Label>
                      <Input
                        id="investor-title"
                        placeholder="e.g., Acquisition Specialist"
                        className="h-10 transition-all focus:ring-2 focus:ring-primary/20 hover:border-primary/50"
                        value={formData.InvestorTitle || ''}
                        onChange={(e) => setValue('InvestorTitle', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">Spoken during handoff lines (e.g., "I'll have our Acquisition Specialist follow up").</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="company-location" className="text-sm font-medium">Company Location</Label>
                      <Input
                        id="company-location"
                        placeholder="e.g., Dallas, Texas"
                        className="h-10 transition-all focus:ring-2 focus:ring-primary/20 hover:border-primary/50"
                        value={formData.CompanyLocation || ''}
                        onChange={(e) => setValue('CompanyLocation', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">Grounds the conversation in your market when sellers ask where you operate.</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="realtor" className="text-sm font-medium flex items-center gap-1">
                        Realtor <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="realtor"
                        placeholder="e.g., John Smith"
                        className="h-10 transition-all focus:ring-2 focus:ring-primary/20 hover:border-primary/50"
                        value={formData.realtorName || ''}
                        onChange={(e) => setValue('realtorName', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">Your name (or teammate) the AI references when scheduling the appointment.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="location" className="text-sm font-medium">Location</Label>
                      <Input
                        id="location"
                        placeholder="e.g., Austin, Texas"
                        className="h-10 transition-all focus:ring-2 focus:ring-primary/20 hover:border-primary/50"
                        value={formData.realtorLocation || ''}
                        onChange={(e) => setValue('realtorLocation', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">Helps the AI highlight your local expertise when speaking with homeowners.</p>
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <Label htmlFor="experience" className="text-sm font-medium">
                    {isWholesalerTemplate ? 'Years in Business' : 'Years Experience'}
                  </Label>
                  <Input
                    id="experience"
                    type="number"
                    placeholder={isWholesalerTemplate ? 'e.g., 12' : 'e.g., 10'}
                    className="h-10 transition-all focus:ring-2 focus:ring-primary/20 hover:border-primary/50"
                    value={formData.yearsExperience || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      setValue('yearsExperience', value, { shouldDirty: true, shouldTouch: true });
                      if (isWholesalerTemplate) {
                        setValue('YearsInBusiness', value, { shouldDirty: true, shouldTouch: true });
                      }
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    {isWholesalerTemplate
                      ? 'Helps sellers trust your longevity—use a rounded whole number.'
                      : 'Shared as a credibility stat—use a rounded whole number.'}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="homes-sold" className="text-sm font-medium">
                    {isWholesalerTemplate ? 'Properties Purchased' : 'Homes Sold'}
                  </Label>
                  <Input
                    id="homes-sold"
                    type="number"
                    placeholder={isWholesalerTemplate ? 'e.g., 120' : 'e.g., 250'}
                    className="h-10 transition-all focus:ring-2 focus:ring-primary/20 hover:border-primary/50"
                    value={formData.homesSold || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      setValue('homesSold', value, { shouldDirty: true, shouldTouch: true });
                      if (isWholesalerTemplate) {
                        setValue('PropertiesPurchased', value, { shouldDirty: true, shouldTouch: true });
                      }
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    {isWholesalerTemplate
                      ? 'Signals your track record purchasing homes—rounded milestones sound best.'
                      : 'Sounds best as a rounded milestone (e.g., 250 homes sold).'}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="areas" className="text-sm font-medium">Service Areas</Label>
                <Input
                  id="areas"
                  placeholder="e.g., Downtown, Westlake, Cedar Park"
                  className="h-10 transition-all focus:ring-2 focus:ring-primary/20 hover:border-primary/50"
                  value={formData.areasServiced || ''}
                  onChange={(e) => setValue('areasServiced', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Separate neighborhoods with commas—the AI repeats them verbatim.</p>
              </div>
            </CardContent>
          </Card>
          )}

          {/* Value Propositions */}
          {(!isLegacyTemplate && valuePropsSection) ? (
            renderDynamicValuePropsSection()
          ) : (
          <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-primary" />
                Value Propositions
              </CardTitle>
              <CardDescription>
                Share up to four selling points—your AI picks the most relevant one in each conversation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {valuePointKeys.map((key, index) => (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={`value-${index + 1}`} className="text-sm font-medium flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-semibold">
                        {index + 1}
                      </span>
                      Value Point {index + 1}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex items-center justify-center rounded-sm bg-transparent p-0.5 text-primary/70 transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                            aria-label={`Value point ${index + 1} help`}
                          >
                            <Question className="h-4 w-4" weight="bold" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" align="start">
                          Write one concise benefit (~120 characters). Leave blank to keep our default talking point.
                        </TooltipContent>
                      </Tooltip>
                    </Label>
                    <Input
                      id={`value-${index + 1}`}
                      placeholder={[
                        "e.g., Proven track record of selling homes 20% above asking price",
                        "e.g., Average days on market is just 14 days",
                        "e.g., Full-service marketing including professional photography",
                        "e.g., Extensive network of qualified cash buyers"
                      ][index]}
                      value={(formData[key] as string) || ''}
                      onChange={(e) => setValue(key, e.target.value)}
                      className="h-10 transition-all focus:ring-2 focus:ring-primary/20 hover:border-primary/50"
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Aim for different angles (speed, price, service). The AI rotates through these and selects what fits the conversation.</p>
            </CardContent>
          </Card>
          )}

          {/* Personality */}
          {isLegacyTemplate || !dynamicHasTraitSelector ? (
            <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Smiley className="h-5 w-5 text-primary" />
                  Personality
                </CardTitle>
                <CardDescription>
                  Pick up to five traits to steer tone—we blend them with your value points in the prompt.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">You can choose up to five traits total. Deselect one to try a different mix.</p>
                  {(formData.personalityTraits || []).length > 0 && (
                    <div className="flex flex-wrap gap-2 pb-3 border-b">
                      {(formData.personalityTraits || []).map(trait => (
                        <Badge key={trait} variant="secondary" className="px-3 py-1">
                          {trait}
                          <button
                            className="ml-2 hover:text-destructive"
                            onClick={() => {
                              const current = formData.personalityTraits || [];
                              setValue('personalityTraits', current.filter(t => t !== trait));
                            }}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                      <span className="text-xs text-muted-foreground self-center">
                        {(formData.personalityTraits || []).length}/5 selected
                      </span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {traits.map(trait => (
                      <Button
                        key={trait}
                        variant={(formData.personalityTraits || []).includes(trait) ? "default" : "outline"}
                        size="sm"
                        className="h-8 px-3"
                        disabled={!(formData.personalityTraits || []).includes(trait) && (formData.personalityTraits || []).length >= 5}
                        onClick={() => {
                          const current = formData.personalityTraits || [];
                          if (current.includes(trait)) {
                            setValue('personalityTraits', current.filter(t => t !== trait));
                          } else if (current.length < 5) {
                            setValue('personalityTraits', [...current, trait]);
                          }
                        }}
                      >
                        {trait}
                      </Button>
                    ))}
                  </div>
                </div>
                {!showCustomTraitInput ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="link"
                        className="mt-3 p-0"
                        onClick={() => setShowCustomTraitInput(true)}
                      >
                        + Select more traits
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="start">
                      Add your own descriptors—the AI reads them literally when matching tone (e.g., "laid-back", "high-energy").
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <div className="flex gap-2 mt-3">
                    <Input
                      placeholder="Enter custom trait..."
                      value={customTrait}
                      onChange={(e) => setCustomTrait(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && customTrait.trim()) {
                          const current = formData.personalityTraits || [];
                          if (current.length < 5) {
                            setValue('personalityTraits', [...current, customTrait.trim()]);
                            setCustomTrait('');
                            setShowCustomTraitInput(false);
                          }
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        const current = formData.personalityTraits || [];
                        if (customTrait.trim() && current.length < 5) {
                          setValue('personalityTraits', [...current, customTrait.trim()]);
                          setCustomTrait('');
                          setShowCustomTraitInput(false);
                        }
                      }}
                    >
                      Add
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setShowCustomTraitInput(false);
                        setCustomTrait('');
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                <div className="mt-4 space-y-2">
                  <Label htmlFor="voice-style" className="text-sm font-medium">Voice Style Sample</Label>
                  <Textarea
                    id="voice-style"
                    placeholder="Provide a sample sentence that captures how you want your agent to speak..."
                    rows={3}
                    value={formData.voiceStyleSample || ''}
                    onChange={(e) => setValue('voiceStyleSample', e.target.value)}
                    className="resize-none transition-all focus:ring-2 focus:ring-primary/20 hover:border-primary/50"
                  />
                  <p className="text-xs text-muted-foreground">
                    Optional. Write 1–2 sentences in the tone you want the AI to imitate (e.g., casual, formal); we match style, not the exact words. {(formData.voiceStyleSample || '').length}/500 characters
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            renderDynamicTraitCard()
          )}

          {/* Conversation Script */}
          {(!isLegacyTemplate && conversationSection) ? (
            renderDynamicConversationSection()
          ) : (
          <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
            <CardHeader
              className="cursor-pointer hover:bg-accent/50 transition-colors rounded-t-lg"
              onClick={() => setConversationExpanded(!conversationExpanded)}
            >
              <CardTitle className="flex items-center gap-2">
                <ChatCircle className="h-5 w-5 text-primary" />
                <span>Conversation Script</span>
                <CaretDown className={cn(
                  "h-4 w-4 ml-auto transition-transform duration-200",
                  conversationExpanded && "rotate-180"
                )} />
              </CardTitle>
              {!conversationExpanded && (
                <CardDescription className="mt-2">
                  Customize how your AI handles each part of the conversation. Default instructions work well for most users.
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {!conversationExpanded ? (
                <div className="relative">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 w-full">
                      {[
                        { num: 1, label: 'Introduction' },
                        { num: 2, label: 'Value Prop' },
                        { num: 3, label: 'Assessment' },
                        { num: 4, label: 'Appointment' },
                        { num: 5, label: 'Follow-up' }
                      ].map((step, index) => (
                        <React.Fragment key={step.num}>
                          <div className="flex items-center gap-1 flex-1">
                            <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold shrink-0">
                              {step.num}
                            </div>
                            <span className="text-xs font-medium hidden sm:inline">{step.label}</span>
                          </div>
                          {index < 4 && (
                            <div className="flex-1 h-[2px] bg-primary/30 max-w-[2rem]" />
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 p-4 text-sm text-muted-foreground">
                    Customize specific beats of the call. Leave any field blank to keep our tested default, and feel free to reference placeholders like {'{InvestorTitle}'} or {'{CompanyName}'} where they already appear.
                  </div>
                  <div className="space-y-3">
                    {isWholesalerTemplate ? (
                      <>
                        {/* Wholesaler-specific conversation flow */}
                        {/* Step 1: Initial Approach */}
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-4">
                            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">1</div>
                            <span className="font-medium">Initial Approach</span>
                          </div>
                          <div className="space-y-4">
                            <div>
                              <label className="text-sm font-medium text-foreground mb-2 block">
                                How should your AI introduce the cash offer opportunity?
                              </label>
                              <Textarea
                                value={formData.initialOfferQuestion || ''}
                                onChange={(e) => setValue('initialOfferQuestion', e.target.value)}
                                placeholder="e.g., Ask if they are open to receiving a cash offer for their property"
                                rows={2}
                                className="text-sm"
                              />
                              <p className="text-xs text-muted-foreground mt-1">Opens the call within the first few seconds. The AI paraphrases slightly to keep the greeting natural.</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-foreground mb-2 block">
                                How should your AI present the value proposition?
                              </label>
                              <Textarea
                                value={formData.valueProposition || ''}
                                onChange={(e) => setValue('valueProposition', e.target.value)}
                                placeholder="e.g., Share briefly the core value for sellers in their area"
                                rows={2}
                                className="text-sm"
                              />
                              <p className="text-xs text-muted-foreground mt-1">Follows the intro to explain why selling to you helps. The AI keeps the key benefit and may smooth the wording.</p>
                            </div>
                          </div>
                        </div>

                        {/* Step 2: Discovery & Qualification */}
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-4">
                            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">2</div>
                            <span className="font-medium">Discovery & Qualification</span>
                          </div>
                          <div className="space-y-4">
                            <div>
                              <label className="text-sm font-medium text-foreground mb-2 block">
                                How should your AI identify their main motivation?
                              </label>
                              <Textarea
                                value={formData.qualifyingQuestion || ''}
                                onChange={(e) => setValue('qualifyingQuestion', e.target.value)}
                                placeholder="e.g., Ask about the single biggest factor that would make them consider selling"
                                rows={2}
                                className="text-sm"
                              />
                              <p className="text-xs text-muted-foreground mt-1">Asked once the seller engages so you can capture motivation. The AI delivers this question almost verbatim.</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-foreground mb-2 block">
                                How should your AI handle initial resistance?
                              </label>
                              <Textarea
                                value={formData.revivalAttempt || ''}
                                onChange={(e) => setValue('revivalAttempt', e.target.value)}
                                placeholder="e.g., Note that we've helped many homeowners in similar situations"
                                rows={2}
                                className="text-sm"
                              />
                              <p className="text-xs text-muted-foreground mt-1">Used when the seller hesitates or says "not interested." The AI keeps the sentiment and adapts tone to match the lead.</p>
                            </div>
                          </div>
                        </div>

                        {/* Step 3: Appointment Setting */}
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-4">
                            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">3</div>
                            <span className="font-medium">Appointment Setting</span>
                          </div>
                          <div className="space-y-4">
                            <div>
                              <label className="text-sm font-medium text-foreground mb-2 block">
                                How should your AI position the appointment?
                              </label>
                              <Textarea
                                value={formData.appointmentTransition || ''}
                                onChange={(e) => setValue('appointmentTransition', e.target.value)}
                                placeholder="e.g., Position a brief call with acquisition specialist"
                                rows={2}
                                className="text-sm"
                              />
                              <p className="text-xs text-muted-foreground mt-1">Delivered when the seller shows interest. Mention placeholders like {'{InvestorTitle}'} to personalize the handoff.</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-foreground mb-2 block">
                                First objection handler
                              </label>
                              <Textarea
                                value={formData.hesitationResponse1 || ''}
                                onChange={(e) => setValue('hesitationResponse1', e.target.value)}
                                placeholder="e.g., Emphasize the clarity they'll get from a direct offer call"
                                rows={2}
                                className="text-sm"
                              />
                              <p className="text-xs text-muted-foreground mt-1">Used on the first sign of hesitation. The AI follows your structure but may soften wording to stay conversational.</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-foreground mb-2 block">
                                Second objection handler
                              </label>
                              <Textarea
                                value={formData.hesitationResponse2 || ''}
                                onChange={(e) => setValue('hesitationResponse2', e.target.value)}
                                placeholder="e.g., Emphasize no-obligation nature of the call"
                                rows={2}
                                className="text-sm"
                              />
                              <p className="text-xs text-muted-foreground mt-1">Triggered if the seller still pushes back. The AI keeps the core reassurance while trimming any repetition.</p>
                            </div>
                          </div>
                        </div>

                        {/* Step 4: Alternative Close */}
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-4">
                            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">4</div>
                            <span className="font-medium">Alternative Close</span>
                          </div>
                          <div className="space-y-4">
                            <div>
                              <label className="text-sm font-medium text-foreground mb-2 block">
                                Scale down the commitment
                              </label>
                              <Textarea
                                value={formData.hesitationResponse3 || ''}
                                onChange={(e) => setValue('hesitationResponse3', e.target.value)}
                                placeholder="e.g., Offer a scaled-down alternative"
                                rows={2}
                                className="text-sm"
                              />
                              <p className="text-xs text-muted-foreground mt-1">Used when the appointment feels too heavy. The AI keeps this nearly verbatim to make the alternative clear.</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-foreground mb-2 block">
                                Future follow-up option
                              </label>
                              <Textarea
                                value={formData.followUpOffer || ''}
                                onChange={(e) => setValue('followUpOffer', e.target.value)}
                                placeholder="e.g., Offer a light check-in window"
                                rows={2}
                                className="text-sm"
                              />
                              <p className="text-xs text-muted-foreground mt-1">Presented if they still decline the appointment. The AI paraphrases softly to keep the door open.</p>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Default expired listing conversation flow */}
                        {/* Step 1: Introduction & Permission */}
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-4">
                            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">1</div>
                            <span className="font-medium">Introduction & Permission</span>
                          </div>
                          <div className="space-y-4">
                            <div>
                              <label className="text-sm font-medium text-foreground mb-2 block">
                                How should your AI introduce itself?
                              </label>
                              <Textarea
                                value={formData.introductionLine || ''}
                                onChange={(e) => setValue('introductionLine', e.target.value)}
                                placeholder="e.g., State only your name"
                                rows={2}
                                className="text-sm"
                              />
                              <p className="text-xs text-muted-foreground mt-1">First sentence after the greeting. The AI delivers this almost word-for-word to set the tone.</p>
                              {formData.introductionLine === '' && (
                                <p className="text-xs text-muted-foreground mt-1">Using default instruction</p>
                              )}
                            </div>
                            <div>
                              <label className="text-sm font-medium text-foreground mb-2 block">
                                How should your AI ask for permission?
                              </label>
                              <Textarea
                                value={formData.permissionLine || ''}
                                onChange={(e) => setValue('permissionLine', e.target.value)}
                                placeholder="e.g., State that you were wondering to ask them a quick question, if that's okay"
                                rows={2}
                                className="text-sm"
                              />
                              <p className="text-xs text-muted-foreground mt-1">Used right after the intro to secure a quick chat. The AI keeps the structure but smooths the phrasing.</p>
                              {formData.permissionLine === '' && (
                                <p className="text-xs text-muted-foreground mt-1">Using default instruction</p>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Step 2: Value Proposition & Interest Check */}
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-4">
                            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">2</div>
                            <span className="font-medium">Value Proposition & Interest Check</span>
                          </div>
                          <div className="space-y-4">
                            <div>
                              <label className="text-sm font-medium text-foreground mb-2 block">
                                How should your AI present market insights?
                              </label>
                              <Textarea
                                value={formData.marketInsights || ''}
                                onChange={(e) => setValue('marketInsights', e.target.value)}
                                placeholder="e.g., Share briefly current market insight about buyers we are working with in their area"
                                rows={2}
                                className="text-sm"
                              />
                              <p className="text-xs text-muted-foreground mt-1">Shared once you have permission to continue. The AI paraphrases to fit the flow while keeping the data intact.</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-foreground mb-2 block">
                                How should your AI present the offer?
                              </label>
                              <Textarea
                                value={formData.offerPresentation || ''}
                                onChange={(e) => setValue('offerPresentation', e.target.value)}
                                placeholder="e.g., Present the possibility of showing our buyers their home"
                                rows={2}
                                className="text-sm"
                              />
                              <p className="text-xs text-muted-foreground mt-1">Explains the service once interest is confirmed. The AI sticks to your structure but may tighten the sentence.</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-foreground mb-2 block">
                                How should your AI create urgency (scarcity)?
                              </label>
                              <Textarea
                                value={formData.scarcityLine || ''}
                                onChange={(e) => setValue('scarcityLine', e.target.value)}
                                placeholder="e.g., Mention limited motivated buyers in the area this week"
                                rows={2}
                                className="text-sm"
                              />
                              <p className="text-xs text-muted-foreground mt-1">Used after the offer pitch to nudge action. The AI keeps this nearly verbatim so the urgency stays clear.</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-foreground mb-2 block">
                                How should your AI handle "not interested" responses?
                              </label>
                              <Textarea
                                value={formData.revivalAttempt || ''}
                                onChange={(e) => setValue('revivalAttempt', e.target.value)}
                                placeholder="e.g., Make one revival attempt by asking about their main concern"
                                rows={2}
                                className="text-sm"
                              />
                              <p className="text-xs text-muted-foreground mt-1">Triggered when the lead turns down the offer. The AI mirrors your sentiment and adapts tone based on their response.</p>
                            </div>
                          </div>
                        </div>

                        {/* Step 3: Experience Assessment */}
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-4">
                            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">3</div>
                            <span className="font-medium">Experience Assessment</span>
                          </div>
                          <div className="space-y-4">
                            <div>
                              <label className="text-sm font-medium text-foreground mb-2 block">
                                How should your AI ask about their previous experience?
                              </label>
                              <Textarea
                                value={formData.previousExperience || ''}
                                onChange={(e) => setValue('previousExperience', e.target.value)}
                                placeholder="e.g., Ask about their biggest challenge during the previous listing"
                                rows={2}
                                className="text-sm"
                              />
                              <p className="text-xs text-muted-foreground mt-1">Asked once rapport is established to surface pain points. The AI paraphrases the question to sound conversational.</p>
                              {formData.previousExperience === '' && (
                                <p className="text-xs text-muted-foreground mt-1">Using default instruction</p>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Step 4: Appointment Setting */}
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-4">
                            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">4</div>
                            <span className="font-medium">Appointment Setting</span>
                          </div>
                          <div className="space-y-4">
                            <div>
                              <label className="text-sm font-medium text-foreground mb-2 block">
                                How should your AI handle hesitation?
                              </label>
                              <Textarea
                                value={formData.hesitationHandling || ''}
                                onChange={(e) => setValue('hesitationHandling', e.target.value)}
                                placeholder="e.g., Emphasize no-obligation nature of meeting"
                                rows={2}
                                className="text-sm"
                              />
                              <p className="text-xs text-muted-foreground mt-1">This is your primary reassurance when they hesitate to meet. The AI keeps the meaning but tailors the tone to their concern.</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-foreground mb-2 block">
                                Alternative approach if still hesitant
                              </label>
                              <Textarea
                                value={formData.alternativeApproach || ''}
                                onChange={(e) => setValue('alternativeApproach', e.target.value)}
                                placeholder="e.g., Focus on valuable market insights they'll receive"
                                rows={2}
                                className="text-sm"
                              />
                              <p className="text-xs text-muted-foreground mt-1">Only used if hesitation continues. The AI shares this nearly verbatim so the alternative feels clear and actionable.</p>
                            </div>
                          </div>
                        </div>

                        {/* Step 5: Follow-up Alternative */}
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-4">
                            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">5</div>
                            <span className="font-medium">Follow-up Alternative</span>
                          </div>
                          <div className="space-y-4">
                            <div>
                              <label className="text-sm font-medium text-foreground mb-2 block">
                                How should your AI offer a follow-up?
                              </label>
                              <Textarea
                                value={formData.followUpOffer || ''}
                                onChange={(e) => setValue('followUpOffer', e.target.value)}
                                placeholder="e.g., Offer to have {Realtor'sName} call when in their area"
                                rows={2}
                                className="text-sm"
                              />
                              <p className="text-xs text-muted-foreground mt-1">Shared when the seller declines the appointment. The AI keeps this line nearly word-for-word to close the conversation gracefully.</p>
                              {formData.followUpOffer === '' && (
                                <p className="text-xs text-muted-foreground mt-1">Using default instruction</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          )}

          {!isLegacyTemplate && hasDynamicPlaceholderSections && additionalDynamicSections.length > 0 &&
            additionalDynamicSections.map((section) => renderDynamicSectionCard(section))}
        </div>

        {/* Right Panel - Quick Settings (30%) */}
        <div className="w-full lg:w-96 space-y-4">
          {/* Test Agent Widget - Always First */}
          <Card className="overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 border-primary/20">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Microphone className="h-5 w-5 text-primary" />
                  <span className="font-medium">Test Agent</span>
                </div>
              </div>

              {/* Test Call Button */}
              {(draftAgent || existingAgent) ? (
                <TestCallButton
                  draftAgent={draftAgent || { id: existingAgent?.id }}
                  onSaveConfig={handleSaveForTest}
                  disabled={deploying || !effectiveAgentName}
                />
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground">Configure your agent to enable testing</p>
                </div>
              )}
              
            </CardContent>
          </Card>

          {/* Voice Widget */}
          <Card className="overflow-visible shadow-sm hover:shadow-md transition-all duration-200">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Microphone className="h-5 w-5 text-primary" />
                  <span className="font-medium">Voice</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 relative">
                  <div className="flex items-center bg-muted rounded-lg px-3 py-1.5 border">
                    <span className="font-medium text-foreground">
                      {(() => {
                        const selectedVoice = (voices || []).find(v => v.voice_id === formData.voiceId);
                        if (selectedVoice) {
                          return selectedVoice.name || selectedVoice.voice_id;
                        }
                        // If voice not found in list, still show the saved voice ID
                        if (formData.voiceId) {
                          // Try to extract a readable name from the voice ID (e.g., "11labs-Adrian" -> "Adrian")
                          const voiceName = formData.voiceId.split('-').pop() || formData.voiceId;
                          return voiceName;
                        }
                        return 'Adrian'; // Final fallback
                      })()}
                    </span>
                    <span className="text-sm text-muted-foreground ml-2">
                      {(() => {
                        const selectedVoice = (voices || []).find(v => v.voice_id === formData.voiceId);
                        if (selectedVoice) {
                          return `(${selectedVoice.gender || 'Male'}, ${selectedVoice.age || 'Young'})`;
                        }
                        return '(Male, Young)'; // Default properties
                      })()}
                    </span>
                    <div className="h-4 w-px bg-border mx-2" />
                    <button
                      className="hover:bg-accent-foreground/10 rounded p-1 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowVoiceGear(!showVoiceGear);
                      }}
                    >
                      <Gear className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Voice Settings Floating Popup */}
                  {showVoiceGear && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowVoiceGear(false)} />
                      <div className="absolute z-50 top-full right-0 mt-2 transition-opacity duration-200">
                        <div className="bg-card rounded-lg shadow-xl border w-[320px] p-4">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-semibold flex items-center gap-2">
                              <Gear className="h-4 w-4" />
                              Voice Settings
                            </h3>
                            <button
                              className="hover:bg-accent rounded p-1"
                              onClick={() => setShowVoiceGear(false)}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>

                          <div className="space-y-4">
                            {/* Voice Model Selection */}
                            <div className="space-y-1">
                              <Label className="text-xs">Voice Model</Label>
                              <Select
                                value={currentVoiceModel}
                                onValueChange={(value) => setValue('voiceModel', value)}
                              >
                                <SelectTrigger className="h-auto min-h-[3.25rem] items-start py-2 text-left text-xs">
                                  <SelectValue asChild placeholder="Select model">
                                    <div className="flex w-full items-start justify-between gap-2">
                                      <div className="flex flex-col text-left gap-0.5">
                                        <span className="text-xs font-semibold leading-tight">
                                          {selectedVoiceModel.label}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground leading-tight">
                                          {selectedVoiceModel.description}
                                        </span>
                                      </div>
                                      {selectedVoiceModel.recommended && (
                                        <Badge variant="secondary" className="text-[10px] whitespace-nowrap self-start">
                                          Recommended
                                        </Badge>
                                      )}
                                    </div>
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  {voiceModelOptions.map((option) => (
                                    <SelectItem
                                      key={option.value}
                                      value={option.value}
                                      className="items-start"
                                    >
                                      <div className="flex w-full items-start justify-between gap-3">
                                        <div className="flex flex-col text-left">
                                          <span className="text-sm font-medium">{option.label}</span>
                                          <span className="text-xs text-muted-foreground">{option.description}</span>
                                        </div>
                                        {option.recommended && (
                                          <Badge variant="secondary" className="text-[10px] whitespace-nowrap self-start">
                                            Recommended
                                          </Badge>
                                        )}
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Speed Slider */}
                            <div className="space-y-1">
                              <div className="flex justify-between">
                                <Label className="text-xs">Speed</Label>
                                <span className="text-xs text-muted-foreground">{formData.voiceSpeed || 0.92}x</span>
                              </div>
                              <Slider
                                value={[formData.voiceSpeed || 0.92]}
                                onValueChange={([value]) => setValue('voiceSpeed', value)}
                                min={0.5}
                                max={2}
                                step={0.1}
                                className="w-full"
                              />
                              <p className="text-xs text-muted-foreground">Controls how fast the agent speaks.</p>
                            </div>

                            {/* Temperature Slider */}
                            <div className="space-y-1">
                              <div className="flex justify-between">
                                <Label className="text-xs">Temperature</Label>
                                <span className="text-xs text-muted-foreground">{formData.voiceTemperature || 1}</span>
                              </div>
                              <Slider
                                value={[formData.voiceTemperature || 1]}
                                onValueChange={([value]) => setValue('voiceTemperature', value)}
                                min={0}
                                max={2}
                                step={0.1}
                                className="w-full"
                              />
                              <p className="text-xs text-muted-foreground">Controls how expressive the voice is. Higher settings reduce monotone but can introduce distortion.</p>
                            </div>

                            {/* Volume Slider */}
                            <div className="space-y-1">
                              <div className="flex justify-between">
                                <Label className="text-xs">Volume</Label>
                                <span className="text-xs text-muted-foreground">{Math.round((formData.volume || 1) * 100)}%</span>
                              </div>
                              <Slider
                                value={[(formData.volume || 1) * 100]}
                                onValueChange={([value]) => setValue('volume', value / 100)}
                                min={0}
                                max={100}
                                step={10}
                                className="w-full"
                              />
                              <p className="text-xs text-muted-foreground">Controls the agent's voice volume.</p>
                            </div>

                            {/* Responsiveness Slider */}
                            <div className="space-y-1">
                              <div className="flex justify-between">
                                <Label className="text-xs">Responsiveness</Label>
                                <span className="text-xs text-muted-foreground">{formData.responsiveness || 0.8}</span>
                              </div>
                              <Slider
                                value={[formData.responsiveness || 0.8]}
                                onValueChange={([value]) => setValue('responsiveness', value)}
                                min={0}
                                max={1}
                                step={0.1}
                                className="w-full"
                              />
                              <p className="text-xs text-muted-foreground">How quickly the agent responds after the lead finishes speaking.</p>
                            </div>

                            {/* Interruption Sensitivity */}
                            <div className="space-y-1">
                              <div className="flex justify-between">
                                <Label className="text-xs">Interruption Sensitivity</Label>
                                <span className="text-xs text-muted-foreground">{formData.interruptionSensitivity || 0.7}</span>
                              </div>
                              <Slider
                                value={[formData.interruptionSensitivity || 0.7]}
                                onValueChange={([value]) => setValue('interruptionSensitivity', value)}
                                min={0}
                                max={1}
                                step={0.1}
                                className="w-full"
                              />
                              <p className="text-xs text-muted-foreground">How easily the agent pauses when the lead starts speaking. Higher values make interruptions easier.</p>
                            </div>

                            {/* Enable Backchannel */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <Label className="text-xs">Backchanneling</Label>
                                <Switch
                                  checked={formData.enableBackchannel ?? true}
                                  onCheckedChange={(checked) => setValue('enableBackchannel', checked)}
                                />
                              </div>
                              <p className="text-xs text-muted-foreground">Adds short acknowledgments while the lead is speaking (e.g., "yeah", "uh-huh").</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full hover:bg-accent hover:shadow-sm transition-all"
                onClick={() => setShowVoiceModal(true)}
              >
                Change Voice
              </Button>
            </CardContent>
          </Card>

          {/* Availability Widget */}
          <Card className="overflow-hidden shadow-sm hover:shadow-md transition-all duration-200">
            <CardContent className="p-4 space-y-3">
              <div
                className="flex items-center justify-between cursor-pointer hover:text-primary transition-colors"
                onClick={() => toggleWidget('availability')}
              >
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  <span className="font-medium">Availability</span>
                </div>
                <CaretDown className={cn(
                  "h-4 w-4 transition-transform",
                  expandedWidgets.has('availability') && "rotate-180"
                )} />
              </div>
              {!expandedWidgets.has('availability') ? (
                <div className="mt-2 text-sm text-gray-600">
                  {formData.businessStartDay || 'Monday'}-{formData.businessEndDay || 'Friday'}, {formData.businessStartTime || '9am'}-{formData.businessEndTime || '5pm'} {(formData.agentTimezone || 'America/New_York').split('/')[1]}
                </div>
              ) : (
                <div className="space-y-3 mt-3">
                  <div>
                    <Label className="text-xs">Timezone</Label>
                    <Select value={formData.agentTimezone || 'America/New_York'} onValueChange={v => setValue('agentTimezone', v)}>
                      <SelectTrigger className="h-8 text-sm mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="America/New_York">Eastern (EST)</SelectItem>
                        <SelectItem value="America/Chicago">Central (CST)</SelectItem>
                        <SelectItem value="America/Denver">Mountain (MST)</SelectItem>
                        <SelectItem value="America/Los_Angeles">Pacific (PST)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Start Day</Label>
                      <Select value={formData.businessStartDay || 'Monday'} onValueChange={v => setValue('businessStartDay', v)}>
                        <SelectTrigger className="h-8 text-sm mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => (
                            <SelectItem key={day} value={day}>{day}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">End Day</Label>
                      <Select value={formData.businessEndDay || 'Friday'} onValueChange={v => setValue('businessEndDay', v)}>
                        <SelectTrigger className="h-8 text-sm mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => (
                            <SelectItem key={day} value={day}>{day}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Start Time</Label>
                      <Select value={formData.businessStartTime || '9am'} onValueChange={v => setValue('businessStartTime', v)}>
                        <SelectTrigger className="h-8 text-sm mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {['6am', '7am', '8am', '9am', '10am', '11am', '12pm', '1pm', '2pm', '3pm', '4pm', '5pm', '6pm', '7pm', '8pm', '9pm'].map(time => (
                            <SelectItem key={time} value={time}>{time}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">End Time</Label>
                      <Select value={formData.businessEndTime || '5pm'} onValueChange={v => setValue('businessEndTime', v)}>
                        <SelectTrigger className="h-8 text-sm mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {['6am', '7am', '8am', '9am', '10am', '11am', '12pm', '1pm', '2pm', '3pm', '4pm', '5pm', '6pm', '7pm', '8pm', '9pm'].map(time => (
                            <SelectItem key={time} value={time}>{time}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Call Behavior Widget */}
          <Card className="overflow-hidden shadow-sm hover:shadow-md transition-all duration-200">
            <CardContent className="p-4 space-y-3">
              <div
                className="flex items-center justify-between cursor-pointer hover:text-primary transition-colors"
                onClick={() => toggleWidget('call-behavior')}
              >
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-primary" />
                  <span className="font-medium">Call Behavior</span>
                </div>
                <CaretDown className={cn(
                  "h-4 w-4 transition-transform",
                  expandedWidgets.has('call-behavior') && "rotate-180"
                )} />
              </div>
              {!expandedWidgets.has('call-behavior') ? (
                <div className="mt-2 text-sm text-gray-600">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Max Duration:</span>
                    <span className="font-medium text-foreground">{Math.round((formData.maxCallDurationMs || 3600000) / 1000)}s</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Voicemail:</span>
                    <span className="font-medium text-foreground">{formData.voicemailDetection ? 'Enabled' : 'Disabled'}</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 mt-3">
                  {/* Call Configuration */}
                  <div className="space-y-3">
                    <div className="text-sm font-medium">Call Configuration</div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label className="text-xs">Max Call Duration</Label>
                        <span className="text-xs font-medium">{Math.round((formData.maxCallDurationMs || 3600000) / 1000)}s</span>
                      </div>
                      <Slider
                        value={[Math.round((formData.maxCallDurationMs || 3600000) / 1000)]}
                        onValueChange={([value]) => setValue('maxCallDurationMs', value * 1000)}
                        min={30}
                        max={3600}
                        step={30}
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground">Maximum duration before call ends</p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label className="text-xs">Begin Message Delay</Label>
                        <span className="text-xs font-medium">{formData.beginMessageDelayMs || 1000}ms</span>
                      </div>
                      <Slider
                        value={[formData.beginMessageDelayMs || 1000]}
                        onValueChange={([value]) => setValue('beginMessageDelayMs', value)}
                        min={0}
                        max={5000}
                        step={500}
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground">Delay before agent speaks first message</p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label className="text-xs">End Call After Silence</Label>
                        <span className="text-xs font-medium">{Math.round((formData.endCallAfterSilenceMs || 600000) / 1000)}s</span>
                      </div>
                      <Slider
                        value={[Math.round((formData.endCallAfterSilenceMs || 600000) / 1000)]}
                        onValueChange={([value]) => setValue('endCallAfterSilenceMs', value * 1000)}
                        min={30}
                        max={1200}
                        step={30}
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground">Duration of silence before ending call</p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label className="text-xs">Reminder Trigger</Label>
                        <span className="text-xs font-medium">{(formData.reminderTriggerMs || 10000) / 1000}s</span>
                      </div>
                      <Slider
                        value={[(formData.reminderTriggerMs || 10000) / 1000]}
                        onValueChange={([value]) => setValue('reminderTriggerMs', value * 1000)}
                        min={5}
                        max={30}
                        step={5}
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground">Time before reminding caller to respond</p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label className="text-xs">Max Reminder Count</Label>
                        <span className="text-xs font-medium">{formData.reminderMaxCount || 2}</span>
                      </div>
                      <Slider
                        value={[formData.reminderMaxCount || 2]}
                        onValueChange={([value]) => setValue('reminderMaxCount', value)}
                        min={0}
                        max={5}
                        step={1}
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground">Maximum number of reminders to send</p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Language</Label>
                      <Select
                        value={formData.language || 'en-US'}
                        onValueChange={(value) => setValue('language', value)}
                      >
                        <SelectTrigger className="text-xs h-8">
                          <SelectValue placeholder="Select language" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="en-US">English (US)</SelectItem>
                          <SelectItem value="en-GB">English (UK)</SelectItem>
                          <SelectItem value="es-ES">Spanish</SelectItem>
                          <SelectItem value="fr-FR">French</SelectItem>
                          <SelectItem value="de-DE">German</SelectItem>
                          <SelectItem value="it-IT">Italian</SelectItem>
                          <SelectItem value="pt-BR">Portuguese (Brazil)</SelectItem>
                          <SelectItem value="zh-CN">Chinese (Simplified)</SelectItem>
                          <SelectItem value="ja-JP">Japanese</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Voicemail Detection */}
                  <div className="space-y-3 border-t pt-3">
                    <div className="text-sm font-medium">Voicemail Detection</div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Voicemail Detection</Label>
                        <Switch
                          checked={formData.voicemailDetection || false}
                          onCheckedChange={(checked) => setValue('voicemailDetection', checked)}
                        />
                      </div>
                      {formData.voicemailDetection && (
                        <div className="space-y-2">
                          <Label className="text-xs">Voicemail Action</Label>
                          <Select
                            value={formData.voicemailAction || 'hangup'}
                            onValueChange={(value) => setValue('voicemailAction', value as 'hangup' | 'leave_message')}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="leave_message">Leave message</SelectItem>
                              <SelectItem value="hangup">Hang up</SelectItem>
                            </SelectContent>
                          </Select>
                          {formData.voicemailAction === 'leave_message' && (
                            <div className="space-y-2 mt-2">
                              <Label className="text-xs">Voicemail Message</Label>
                              <Textarea
                                value={formData.voicemailMessage || ''}
                                onChange={(e) => setValue('voicemailMessage', e.target.value)}
                                placeholder="Enter the message your AI agent should leave on voicemail..."
                                className="text-sm min-h-[80px]"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Integrations Widget */}
          <Card className="overflow-hidden shadow-sm hover:shadow-md transition-all duration-200">
            <CardContent className="p-4 space-y-3">
              <div
                className="flex items-center justify-between cursor-pointer hover:text-primary transition-colors"
                onClick={() => toggleWidget('integrations')}
              >
                <div className="flex items-center gap-2">
                  <Link className="h-4 w-4 text-primary" />
                  <span className="font-medium">Integrations</span>
                </div>
                <CaretDown className={cn(
                  "h-4 w-4 transition-transform",
                  expandedWidgets.has('integrations') && "rotate-180"
                )} />
              </div>
              {expandedWidgets.has('integrations') && (
                <div className="mt-3 space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="transfer"
                        checked={formData.enableTransfer || false}
                        onCheckedChange={(checked) => setValue('enableTransfer', checked as boolean)}
                      />
                      <label htmlFor="transfer" className="text-sm font-medium">Call Transfer</label>
                    </div>
                    {formData.enableTransfer && (
                      <div className="ml-6 space-y-2">
                        <Input
                          placeholder="+1234567890"
                          className="text-sm"
                          value={formData.transferPhoneNumber || ''}
                          onChange={(e) => setValue('transferPhoneNumber', e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">Phone number to transfer calls to (E.164 format)</p>
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="calendar"
                        checked={formData.enableCalCom || false}
                        onCheckedChange={(checked) => setValue('enableCalCom', checked as boolean)}
                      />
                      <label htmlFor="calendar" className="text-sm font-medium">Cal.com Booking</label>
                    </div>
                    {formData.enableCalCom && (
                      <div className="ml-6 space-y-2">
                        <Input
                          placeholder="cal_live_..."
                          type="password"
                          className="text-sm"
                          value={formData.calComApiKey || ''}
                          onChange={(e) => setValue('calComApiKey', e.target.value)}
                        />
                        <Input
                          placeholder="Event Type ID"
                          className="text-sm"
                          value={formData.calComEventTypeId || ''}
                          onChange={(e) => setValue('calComEventTypeId', e.target.value)}
                        />
                        <Select
                          value={formData.calComTimezone || 'America/New_York'}
                          onValueChange={(value) => setValue('calComTimezone', value)}
                        >
                          <SelectTrigger className="text-sm">
                            <SelectValue placeholder="Select timezone" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="America/New_York">Eastern Time</SelectItem>
                            <SelectItem value="America/Chicago">Central Time</SelectItem>
                            <SelectItem value="America/Denver">Mountain Time</SelectItem>
                            <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                            <SelectItem value="America/Phoenix">Arizona Time</SelectItem>
                            <SelectItem value="America/Anchorage">Alaska Time</SelectItem>
                            <SelectItem value="Pacific/Honolulu">Hawaii Time</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">Timezone for scheduling appointments</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Post-Call Analysis Widget */}
          <Card className="overflow-hidden shadow-sm hover:shadow-md transition-all duration-200">
            <CardContent className="p-4 space-y-3">
              <div
                className="flex items-center justify-between cursor-pointer hover:text-primary transition-colors"
                onClick={() => toggleWidget('analysis')}
              >
                <div className="flex items-center gap-2">
                  <ChartBar className="h-4 w-4 text-primary" />
                  <span className="font-medium">Post-Call Analysis</span>
                </div>
                <CaretDown className={cn(
                  "h-4 w-4 transition-transform",
                  expandedWidgets.has('analysis') && "rotate-180"
                )} />
              </div>
              {expandedWidgets.has('analysis') && (
                <div className="mt-3 space-y-3">
                  {(formData.postCallAnalysis || []).map((item, index) => (
                    <div key={index} className="space-y-2 p-3 border rounded-md bg-accent/30">
                      <div className="flex justify-between items-start">
                        <div className="flex-1 space-y-2">
                          <Input
                            placeholder="Field name (e.g., Interest Level)"
                            className="text-sm"
                            value={item.name || ''}
                            onChange={(e) => {
                              const newAnalysis = [...(formData.postCallAnalysis || [])];
                              newAnalysis[index] = { ...newAnalysis[index], name: e.target.value };
                              setValue('postCallAnalysis', newAnalysis);
                            }}
                          />
                          <Textarea
                            placeholder="Description (what to extract)"
                            className="text-sm min-h-[60px]"
                            value={item.description || ''}
                            onChange={(e) => {
                              const newAnalysis = [...(formData.postCallAnalysis || [])];
                              newAnalysis[index] = { ...newAnalysis[index], description: e.target.value };
                              setValue('postCallAnalysis', newAnalysis);
                            }}
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-2"
                          onClick={() => {
                            const newAnalysis = formData.postCallAnalysis?.filter((_, i) => i !== index) || [];
                            setValue('postCallAnalysis', newAnalysis);
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      const newAnalysis = [...(formData.postCallAnalysis || []), { name: '', description: '' }];
                      setValue('postCallAnalysis', newAnalysis);
                    }}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Add Analysis Field
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Voice Selection Modal */}
      {showVoiceModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card rounded-lg shadow-xl border w-[800px] max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold">Select Agent Voice</h2>
            </div>
            <div className="flex-1 overflow-y-auto">
              {voicesLoading ? (
                <div className="flex items-center justify-center h-64">
                  <CircleNotch className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : voices && voices.length > 0 ? (
                <table className="w-full">
                  <thead className="bg-muted/30 sticky top-0 border-b">
                    <tr className="text-sm">
                      <th className="text-left p-4 w-12"></th>
                      <th className="text-left p-4 font-medium">Voice</th>
                      <th className="text-left p-4 font-medium">Properties</th>
                      <th className="text-left p-4 font-medium">Provider</th>
                      <th className="text-center p-4 font-medium">Preview</th>
                    </tr>
                  </thead>
                  <tbody>
                    {voices.map(voice => (
                    <tr
                      key={voice.voice_id || voice.name}
                      className={cn(
                        "border-b hover:bg-muted/50 cursor-pointer transition-colors",
                        formData.voiceId === voice.voice_id && "bg-primary/5 border-l-2 border-l-primary"
                      )}
                      onClick={() => {
                        console.log('Selecting voice:', {
                          voiceId: voice.voice_id,
                          voiceName: voice.name,
                          voice: voice
                        });
                        setValue('voiceId', voice.voice_id);
                        setShowVoiceModal(false);
                      }}
                    >
                      <td className="p-4">
                        <div className={cn(
                          "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                          formData.voiceId === voice.voice_id ? "border-primary bg-primary/10" : "border-muted-foreground/50"
                        )}>
                          {formData.voiceId === voice.voice_id && (
                            <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                            <span className="text-sm font-semibold">{(voice.name || voice.voice_id || 'V')[0]}</span>
                          </div>
                          <div>
                            <p className="font-medium">{voice.name || voice.voice_id}</p>
                            <p className="text-xs text-muted-foreground">{voice.accent || 'American'} accent</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">{voice.gender || 'Male'}</Badge>
                          <Badge variant="outline" className="text-xs">{voice.age || 'Young'}</Badge>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="text-sm text-muted-foreground">{voice.provider || 'ElevenLabs'}</span>
                      </td>
                      <td className="p-4 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="hover:bg-primary/10"
                          onClick={(e) => handlePlayPause(e, voice)}
                          disabled={!voice.preview_audio_url && !voice.sample_url}
                        >
                          {playingVoiceId === voice.voice_id ? (
                            <Pause className="h-4 w-4" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                      </td>
                    </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <p>No voices available</p>
                  <p className="text-sm mt-2">Please check your connection and try again</p>
                </div>
              )}
            </div>
            <div className="p-6 border-t flex justify-between">
              <Button variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                Upload Custom Voice
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowVoiceModal(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setShowVoiceModal(false)}>
                  Select Voice
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Get New Number Modal */}
      {showNewNumberModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity duration-200">
          <div className="bg-card rounded-lg shadow-xl border w-[500px] p-6 transition-opacity duration-150">
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2">Get New Phone Number</h2>
              <p className="text-sm text-muted-foreground">Purchase a new phone number for your agent</p>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="area-code">Area Code</Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    id="area-code"
                    placeholder="e.g., 415"
                    maxLength={3}
                    className="w-32"
                  />
                  <Button className="flex-1">
                    <Phone className="h-4 w-4 mr-2" />
                    Search Available Numbers
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Enter a 3-digit area code to search for available numbers
                </p>
              </div>

              <div className="p-4 bg-muted/30 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Monthly Cost</span>
                  <span className="font-semibold">$5.00/month</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Number will be purchased immediately if available
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setShowNewNumberModal(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      </div>
    </FormProvider>
  );
};

export default AgentConfiguration;
