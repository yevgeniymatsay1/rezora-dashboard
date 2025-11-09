import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { VersionComparisonModal } from "@/components/VersionComparisonModal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  PanelGroup,
  Panel,
  PanelResizeHandle,
} from "react-resizable-panels";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  Sparkle,
  ChatCircle,
  Database,
  GitBranch,
  Eye,
  Upload,
  CheckCircle,
  Check,
  ArrowRight,
  Cpu,
  CaretDown,
  CaretRight,
  ArrowsOut,
  ArrowsClockwise,
  Copy,
  Code,
  Clock,
  ListChecks,
  Trash
} from "@phosphor-icons/react";

// See SETUP_COMPLETE.md for full API documentation
const API_BASE = `${supabase.supabaseUrl}/functions/v1`;

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface PromptVersion {
  id: string;
  version_number: number;
  base_prompt: string;
  states: any[];
  generation_context: any;
  created_at: string;
  markdown_source?: string; // Original markdown before compilation (null for legacy versions)
  session_id?: string;
}

interface Evaluation {
  id: string;
  transcript: string;
  user_rating: number;
  user_notes?: string;
  automated_analysis?: any;
  improvement_suggestions?: string[];
  created_at: string;
}

interface ProgressEvent {
  phase: string;
  status: string;
  detail?: string;
  timestamp: string;
}

interface GenerationConfidence {
  overall_confidence?: number;
  lead_type?: string;
  primary_goal?: string;
  audience?: string;
}

interface RagContexts {
  [key: string]: string;
}

interface FeedbackActivityItem {
  id: string;
  created_at: string;
  rating: number;
  patterns: any[];
  summary?: string;
  ingestion?: {
    success: boolean;
    attempts: number;
    status?: string;
    job_id?: string;
  };
}

interface SessionSummary {
  session_id: string;
  agent_type_name: string;
  status: string;
  created_at: string;
  updated_at: string;
  version_count: number;
  latest_version_number?: number;
  has_test_agent: boolean;
  test_agent_id?: string;
  retell_agent_id?: string;
}

type PlaceholderComponentType = "text" | "textarea" | "number" | "trait_selector";

interface PlaceholderSuggestionsPayload {
  placeholder_suggestions_id: string | null;
  suggested_placeholders: any[];
  suggested_editable_guidelines?: any[];
  total_count?: number;
}

interface PlaceholderFieldConfig {
  id: string;
  alias: string;
  configPath: string;
  label: string;
  helperText: string;
  component: PlaceholderComponentType;
  placeholderText: string;
  required: boolean;
  defaultValue: string;
}

interface PlaceholderSectionConfig {
  id: string;
  title: string;
  subtitle: string;
  fields: PlaceholderFieldConfig[];
}

const PLACEHOLDER_SECTION_PRESETS: Array<{ id: string; title: string; subtitle: string }> = [
  {
    id: "agent_identity",
    title: "Agent Identity",
    subtitle: "Define how the AI introduces itself and references your business.",
  },
  {
    id: "value_props",
    title: "Value Propositions",
    subtitle: "Highlight the selling points your AI should mention.",
  },
  {
    id: "conversation_flow",
    title: "Conversation Script",
    subtitle: "Control the guidance for each stage of the conversation.",
  },
];

const generateFieldId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const PLACEHOLDER_STORAGE_PREFIX = "pf-placeholder-mapping";

export default function AdminPromptGenerator() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Session & Chat State
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [agentTypeName, setAgentTypeName] = useState("");
  const [exampleScripts, setExampleScripts] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<"conversation" | "ready_to_generate" | "generated">("conversation");
  const [restoringSession, setRestoringSession] = useState(false);

  // Generated Prompts
  const [promptVersionId, setPromptVersionId] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<PromptVersion | null>(null);
  const [allVersions, setAllVersions] = useState<PromptVersion[]>([]);

  // Feedback & Evaluation
  const [transcript, setTranscript] = useState("");
  const [rating, setRating] = useState(0);
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);

  // Sandbox Testing
  const [testAgent, setTestAgent] = useState<{
    test_agent_id: string;
    retell_agent_id: string;
    retell_llm_id: string;
    test_name: string;
    prompt_version_id?: string;
    created_at?: string;
  } | null>(null);
  const [refinedVersion, setRefinedVersion] = useState<{
    new_version_id: string;
    version_number: number;
    changes_summary: string;
    automated_analysis: any;
  } | null>(null);

  // Placeholders & Publishing
  const [placeholders, setPlaceholders] = useState<PlaceholderSuggestionsPayload>({
    placeholder_suggestions_id: null,
    suggested_placeholders: [],
    suggested_editable_guidelines: [],
    total_count: 0,
  });
  const [placeholderSections, setPlaceholderSections] = useState<PlaceholderSectionConfig[]>(
    PLACEHOLDER_SECTION_PRESETS.map((preset) => ({
      ...preset,
      fields: [],
    }))
  );
  const [templateName, setTemplateName] = useState("");
  const [templateType, setTemplateType] = useState("");

  // System Info (Admin View)
  const [showSystemInfo, setShowSystemInfo] = useState(false);
  const [ragEnabled, setRagEnabled] = useState(false);
  const [expandedPrompts, setExpandedPrompts] = useState<Record<string, boolean>>({});
  const [systemPrompts, setSystemPrompts] = useState<any>(null);
  const [loadingPrompts, setLoadingPrompts] = useState(false);

  // Dialog States
  const [basePromptDialogOpen, setBasePromptDialogOpen] = useState(false);
  const [statePromptDialogOpen, setStatePromptDialogOpen] = useState<string | null>(null);

  // Markdown Source Editing State
  const [editedMarkdown, setEditedMarkdown] = useState("");
  const [compiledPreview, setCompiledPreview] = useState<{base_prompt: string; states: any[]} | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [recompiling, setRecompiling] = useState(false);
  const [confidenceMeta, setConfidenceMeta] = useState<GenerationConfidence>({});
  const [progressEvents, setProgressEvents] = useState<ProgressEvent[]>([]);
  const [flowAnalysis, setFlowAnalysis] = useState<any>(null);
  const [qualityValidation, setQualityValidation] = useState<any>(null);
  const [generationError, setGenerationError] = useState<any>(null);
  const [ragContexts, setRagContexts] = useState<RagContexts | null>(null);
  const [feedbackActivity, setFeedbackActivity] = useState<FeedbackActivityItem[]>([]);

  // Load Prompt Feature
  const [loadPromptId, setLoadPromptId] = useState("");
  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const [recentSessions, setRecentSessions] = useState<SessionSummary[]>([]);
  const [showLoadPrompt, setShowLoadPrompt] = useState(false);
  const [loadedFromSource, setLoadedFromSource] = useState<string | null>(null);

  // Version Comparison
  const [showVersionComparison, setShowVersionComparison] = useState(false);
  const [comparisonVersions, setComparisonVersions] = useState<{
    original: PromptVersion;
    compared: PromptVersion;
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  const placeholderStorageKey = useMemo(() => {
    if (!promptVersionId) return null;
    return `${PLACEHOLDER_STORAGE_PREFIX}-${promptVersionId}`;
  }, [promptVersionId]);

  const placeholderSuggestionOptions = useMemo(() => {
    if (!placeholders?.suggested_placeholders) return [];
    return (placeholders.suggested_placeholders as Array<any>).map((ph) => ({
      token: ph.token,
      alias: (ph.token || "").replace(/\{|\}/g, "").trim(),
      frontendLabel: ph.frontend_label ?? "",
      description: ph.description ?? "",
      defaultValue: ph.default_value ?? "",
    }));
  }, [placeholders]);

  const assignedPlaceholderAliases = useMemo(() => {
    const aliases = new Set<string>();
    placeholderSections.forEach((section) =>
      section.fields.forEach((field) => {
        if (field.alias) aliases.add(field.alias);
      })
    );
    return aliases;
  }, [placeholderSections]);

  const unassignedPlaceholderOptions = useMemo(
    () =>
      placeholderSuggestionOptions.filter(
        (option) => option.alias && !assignedPlaceholderAliases.has(option.alias)
      ),
    [placeholderSuggestionOptions, assignedPlaceholderAliases]
  );

  const resetPlaceholderSections = () =>
    setPlaceholderSections(
      PLACEHOLDER_SECTION_PRESETS.map((preset) => ({
        ...preset,
        fields: [],
      }))
    );

  const restorePlaceholderSectionsFromStorage = useCallback(
    (suggestionsId?: string | null) => {
      if (!placeholderStorageKey) return false;
      try {
        const raw = localStorage.getItem(placeholderStorageKey);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return false;
        if (suggestionsId && parsed.suggestions_id && parsed.suggestions_id !== suggestionsId) {
          return false;
        }
        if (!Array.isArray(parsed.sections)) return false;
        setPlaceholderSections(parsed.sections as PlaceholderSectionConfig[]);
        if (parsed.placeholders) {
          setPlaceholders(parsed.placeholders);
        }
        return true;
      } catch (error) {
        console.warn("Failed to restore placeholder mapping from storage", error);
        return false;
      }
    },
    [placeholderStorageKey]
  );

  const restoredFromStorageRef = useRef(false);
  const sessionRestoredRef = useRef(false);
  const pageLoadTimeRef = useRef(Date.now());

  useEffect(() => {
    if (!placeholderStorageKey || restoredFromStorageRef.current) return;
    try {
      const raw = localStorage.getItem(placeholderStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.sections)) {
        return;
      }
      setPlaceholderSections(parsed.sections as PlaceholderSectionConfig[]);
      if (parsed.placeholders) {
        setPlaceholders({
          placeholder_suggestions_id: parsed.placeholders.placeholder_suggestions_id ?? null,
          suggested_placeholders: parsed.placeholders.suggested_placeholders ?? [],
          suggested_editable_guidelines: parsed.placeholders.suggested_editable_guidelines ?? [],
          total_count: parsed.placeholders.total_count ?? parsed.sections.reduce((acc: number, section: any) => acc + (section.fields?.length ?? 0), 0),
        });
      }
      restoredFromStorageRef.current = true;
    } catch (error) {
      console.warn("Failed to restore placeholder mapping from storage", error);
    }
  }, [placeholderStorageKey, placeholders]);

  useEffect(() => {
    if (!placeholderStorageKey) return;
    try {
      const payload = {
        placeholders,
        sections: placeholderSections,
        suggestions_id: placeholders.placeholder_suggestions_id,
        saved_at: Date.now(),
      };
      localStorage.setItem(placeholderStorageKey, JSON.stringify(payload));
    } catch (error) {
      console.warn("Failed to persist placeholder mapping", error);
    }
  }, [placeholderSections, placeholders, placeholderStorageKey]);

  const createFieldConfig = (sectionId: string): PlaceholderFieldConfig => ({
    id: generateFieldId(),
    alias: "",
    configPath: "",
    label: "",
    helperText: "",
    component: sectionId === "conversation_flow" ? "textarea" : "text",
    placeholderText: "",
    required: false,
    defaultValue: "",
  });

  const addFieldToSection = (sectionId: string) => {
    setPlaceholderSections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              fields: [...section.fields, createFieldConfig(sectionId)],
            }
          : section
      )
    );
  };

  const removeFieldFromSection = (sectionId: string, fieldId: string) => {
    setPlaceholderSections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              fields: section.fields.filter((field) => field.id !== fieldId),
            }
          : section
      )
    );
  };

  const updateFieldInSection = (
    sectionId: string,
    fieldId: string,
    updates: Partial<PlaceholderFieldConfig>
  ) => {
    setPlaceholderSections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              fields: section.fields.map((field) =>
                field.id === fieldId ? { ...field, ...updates } : field
              ),
            }
          : section
      )
    );
  };

  const updateSectionMeta = (
    sectionId: string,
    updates: Partial<Omit<PlaceholderSectionConfig, "id" | "fields">>
  ) => {
    setPlaceholderSections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              ...updates,
            }
          : section
      )
    );
  };

  const handleFieldValueChange = <K extends keyof PlaceholderFieldConfig>(
    sectionId: string,
    fieldId: string,
    key: K,
    value: PlaceholderFieldConfig[K]
  ) => {
    updateFieldInSection(sectionId, fieldId, { [key]: value } as Partial<PlaceholderFieldConfig>);
  };

  const handleAliasChange = (
    sectionId: string,
    field: PlaceholderFieldConfig,
    rawValue: string
  ) => {
    const normalizedAlias = rawValue.replace(/\{|\}/g, "").trim();
    const suggestion = placeholderSuggestionOptions.find((opt) => opt.alias === normalizedAlias);

    const updates: Partial<PlaceholderFieldConfig> = {
      alias: normalizedAlias,
    };

    if ((!field.label || field.label === field.alias) && suggestion) {
      updates.label = suggestion.frontendLabel || normalizedAlias;
    } else if (!field.label) {
      updates.label = normalizedAlias;
    }

    if ((!field.defaultValue || field.defaultValue === field.alias) && suggestion?.defaultValue) {
      updates.defaultValue = suggestion.defaultValue;
    }

    updateFieldInSection(sectionId, field.id, updates);
  };

  const togglePrompt = (key: string, value?: boolean) => {
    setExpandedPrompts(prev => ({ ...prev, [key]: value ?? !prev[key] }));
  };

  const toggleStatePrompt = (stateName: string, open: boolean) => {
    setExpandedPrompts(prev => ({ ...prev, [`state_${stateName}`]: open }));
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `Copied ${label} to clipboard` });
    } catch (error) {
      toast({
        title: "Failed to copy",
        description: "Please select and copy manually",
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // RAG is enabled by default (we know from setup)
  useEffect(() => {
    setRagEnabled(true);
  }, []);

  // Fetch system prompts when System Info is shown
  useEffect(() => {
    const fetchSystemPrompts = async () => {
      if (showSystemInfo && !systemPrompts) {
        setLoadingPrompts(true);
        try {
          const { data, error } = await supabase.functions.invoke("get-system-prompts");

          if (error) throw error;

          setSystemPrompts(data);
        } catch (error: any) {
          console.error("Failed to fetch system prompts:", error);
          toast({
            title: "Failed to load system prompts",
            description: error.message,
            variant: "destructive"
          });
        } finally {
          setLoadingPrompts(false);
        }
      }
    };

    fetchSystemPrompts();
  }, [showSystemInfo]);

  // Load evaluations when prompt version changes
  useEffect(() => {
    if (promptVersionId) {
      loadEvaluations(promptVersionId);
    } else {
      setEvaluations([]);
    }
  }, [promptVersionId]);

  useEffect(() => {
    if (currentVersion?.session_id) {
      loadTestAgent(currentVersion.session_id);
    } else if (!currentVersion) {
      setTestAgent(null);
    }
  }, [currentVersion?.session_id]);

  // Check for existing session on mount (prevent restoration on tab visibility change)
  useEffect(() => {
    // Only restore once per page load, not on tab switches
    if (sessionRestoredRef.current) return;

    const savedSessionId = localStorage.getItem("prompt_generator_session_id");
    if (savedSessionId && !sessionId) {
      sessionRestoredRef.current = true;
      restoreSession(savedSessionId);
    }
  }, []);

  // Prevent unwanted reloads on tab visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      // Do nothing - just log for debugging
      if (document.visibilityState === 'visible') {
        console.log('[Prompt Factory] Tab became visible - no reload triggered');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Initialize markdown editor when version changes
  useEffect(() => {
    if (currentVersion) {
      if (currentVersion.markdown_source) {
        // Use existing markdown source
        setEditedMarkdown(currentVersion.markdown_source);
      } else {
        // Decompile from JSON (legacy version) - using a simple formatter
        const markdown = `# BASE_PROMPT\n\n${currentVersion.base_prompt}\n\n${
          currentVersion.states.map((state: any) =>
            `# ${state.name.toUpperCase().replace(/_/g, ' ')}\n\n${state.state_prompt}`
          ).join('\n\n')
        }`;
        setEditedMarkdown(markdown);
      }
      setCompiledPreview(null);
      setCompileError(null);
    }
  }, [currentVersion?.id]);

  const restoreSession = async (savedSessionId: string) => {
    setRestoringSession(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate_prompts_chat", {
        body: {
          action: "get_session",
          session_id: savedSessionId
        }
      });

      if (error) throw error;

      setSessionId(data.session_id);
      setMessages(data.conversation_history || []);
      setSessionStatus(data.status);
      if (data.metadata) {
        setConfidenceMeta({
          overall_confidence: data.metadata.overall_confidence,
          lead_type: data.metadata.lead_type,
          primary_goal: data.metadata.primary_goal,
          audience: data.metadata.audience,
        });
      }
      if (data.progress_events) {
        setProgressEvents(data.progress_events);
      }
      if (data.rag_contexts) {
        setRagContexts(data.rag_contexts);
      }
      if (data.flow_analysis) {
        setFlowAnalysis(data.flow_analysis);
      }
      if (data.quality_validation) {
        setQualityValidation(data.quality_validation);
      }

      // Restore generated prompts if they exist
      if (data.generated_prompts && data.prompt_version_id) {
        setCurrentVersion({
          id: data.prompt_version_id,
          version_number: data.version_number || 1,
          base_prompt: data.generated_prompts.base_prompt,
          states: data.generated_prompts.states,
          generation_context: {},
          created_at: new Date().toISOString(),
          session_id: savedSessionId,
        });
        setPromptVersionId(data.prompt_version_id);
        loadTestAgent(savedSessionId);
        if (data.progress_events) {
          setProgressEvents(data.progress_events);
        }

        // Load all versions for this session
        loadVersions(savedSessionId);

        toast({
          title: "Session restored",
          description: "Your generated prompts have been restored"
        });
      } else {
        toast({
          title: "Session restored",
          description: "Continuing from where you left off"
        });
      }
    } catch (error: any) {
      console.error("Failed to restore session:", error);
      // Clear invalid session
      localStorage.removeItem("prompt_generator_session_id");
    } finally {
      setRestoringSession(false);
    }
  };

  const startSession = async () => {
    if (!agentTypeName.trim()) {
      toast({ title: "Agent type required", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const body: Record<string, string> = {
        action: "start",
        agent_type_name: agentTypeName.trim()
      };

      // Include example scripts if provided
      if (exampleScripts.trim().length > 0) {
        body.example_scripts = exampleScripts.trim();
      }

      const { data, error } = await supabase.functions.invoke("generate_prompts_chat", {
        body
      });

      if (error) throw error;

      setSessionId(data.session_id);
      setMessages(data.conversation_history || []);
      setSessionStatus(data.status);

      // Save session to localStorage for persistence
      localStorage.setItem("prompt_generator_session_id", data.session_id);

      toast({ title: "Session started" });
    } catch (error: any) {
      console.error("Failed to start session:", error);
      toast({
        title: "Failed to start session",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const clearSession = () => {
    setSessionId(null);
    setMessages([]);
    setSessionStatus("conversation");
    setCurrentVersion(null);
    setPromptVersionId(null);
    setConfidenceMeta({});
    setProgressEvents([]);
    setGenerationError(null);
    setRagContexts(null);
    setFeedbackActivity([]);
    localStorage.removeItem("prompt_generator_session_id");
    toast({ title: "Session cleared", description: "Ready to start a new session" });
  };

  const sendMessage = async () => {
    if (!sessionId || !userInput.trim()) return;

    setLoading(true);
    const userMsg: Message = {
      role: "user",
      content: userInput.trim(),
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMsg]);
    setUserInput("");

    try {
      const { data, error } = await supabase.functions.invoke("generate_prompts_chat", {
        body: {
          action: "message",
          session_id: sessionId,
          message: userInput.trim()
        }
      });

      if (error) throw error;

      if (data.assistant_message) {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: data.assistant_message,
          timestamp: new Date().toISOString()
        }]);
      }

      setSessionStatus(data.status);
      if (data.metadata) {
        setConfidenceMeta({
          overall_confidence: data.metadata.overall_confidence,
          lead_type: data.metadata.lead_type,
          primary_goal: data.metadata.primary_goal,
          audience: data.metadata.audience,
        });
      }
      if (data.progress_events) {
        setProgressEvents(data.progress_events);
      }
      setGenerationError(null);
    } catch (error: any) {
      console.error("Failed to send message:", error);
      toast({
        title: "Failed to send message",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const generatePrompts = async () => {
    if (!sessionId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate_prompts_chat", {
        body: {
          action: "generate",
          session_id: sessionId
        }
      });

      if (error) {
        console.error("Generate error details:", error);
        throw error;
      }

      if (data?.error) {
        console.error("Backend error:", data.error);
        throw new Error(data.error);
      }

      setCurrentVersion({
        id: data.prompt_version_id,
        version_number: data.version_number || 1,
        base_prompt: data.generated_prompts.base_prompt,
        states: data.generated_prompts.states,
        generation_context: {
          metadata: data.metadata,
          rag_contexts: data.rag_contexts,
          progress_events: data.progress_events,
          flow_analysis: data.flow_analysis,
        },
        created_at: new Date().toISOString(),
        session_id: sessionId ?? currentVersion?.session_id,
      });

      setPromptVersionId(data.prompt_version_id);
      setSessionStatus("generated");
      setFlowAnalysis(data.flow_analysis || null);
      setQualityValidation(data.quality_validation || null);

      if (data.metadata) {
        setConfidenceMeta({
          overall_confidence: data.metadata.overall_confidence,
          lead_type: data.metadata.lead_type,
          primary_goal: data.metadata.primary_goal,
          audience: data.metadata.audience,
        });
      }
      if (data.progress_events) {
        setProgressEvents(data.progress_events);
      } else {
        setProgressEvents([]);
      }
      if (data.rag_contexts) {
        setRagContexts(data.rag_contexts);
      } else {
        setRagContexts(null);
      }
      setGenerationError(null);

      loadVersions(sessionId);

      toast({ title: "✨ Prompts generated!" });
    } catch (error: any) {
      console.error("Failed to generate prompts:", error);
      let parsed: any = null;
      if (error?.message) {
        try {
          parsed = JSON.parse(error.message);
        } catch (parseError) {
          // message was not JSON, ignore
        }
      }

      if (parsed?.metadata) {
        setConfidenceMeta({
          overall_confidence: parsed.metadata.overall_confidence,
          lead_type: parsed.metadata.lead_type,
          primary_goal: parsed.metadata.primary_goal,
          audience: parsed.metadata.audience,
        });
      }

      if (parsed?.progress_events) {
        setProgressEvents(parsed.progress_events);
      }

      setGenerationError(
        parsed
          ? parsed
          : {
              message: error.message || "Failed to generate prompts",
            }
      );

      toast({
        title: "Generation failed",
        description: parsed?.error || error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadVersions = async (sessId: string) => {
    try {
      const { data, error } = await supabase
        .from("prompt_versions")
        .select("*")
        .eq("session_id", sessId)
        .order("version_number", { ascending: false });

      if (!error && data) {
        setAllVersions(data);
      }
    } catch (e) {
      console.error("Failed to load versions:", e);
    }
  };

  const analyzeFeedback = async () => {
    if (!promptVersionId || !transcript || rating === 0) {
      toast({ title: "Please provide transcript and rating", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze_feedback", {
        body: {
          prompt_version_id: promptVersionId,
          transcript: transcript,
          user_rating: rating,
          user_notes: feedbackNotes || undefined
        }
      });

      if (error) throw error;

      toast({
        title: "✓ Feedback analyzed",
        description: `${data.patterns_extracted} patterns extracted, ${data.patterns_written_to_s3} synced to RAG`
      });

      if (data.extracted_patterns) {
        setFeedbackActivity(prev => [
          {
            id: data.evaluation_id,
            created_at: new Date().toISOString(),
            rating,
            patterns: data.extracted_patterns,
            summary: data.improvement_suggestions?.slice(0, 2).join("; ") || "",
            ingestion: data.ingestion_result,
          },
          ...prev,
        ]);
      }

      // Reload evaluations
      loadEvaluations(promptVersionId);

      // Clear form
      setTranscript("");
      setRating(0);
      setFeedbackNotes("");
    } catch (error: any) {
      console.error("Feedback analysis failed:", error);
      toast({
        title: "Analysis failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadEvaluations = async (versionId: string) => {
    try {
      const { data, error } = await supabase
        .from("prompt_evaluations")
        .select("*")
        .eq("prompt_version_id", versionId)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setEvaluations(data);
      }
    } catch (e) {
      console.error("Failed to load evaluations:", e);
    }
  };

  const loadTestAgent = async (sessionMatch: string | null) => {
    if (!user) {
      setTestAgent(null);
      return;
    }

    const baseSelect = "id, retell_agent_id, retell_llm_id, test_name, created_at, prompt_version_id";

    const fetchForSession = async () => {
      if (!sessionMatch) return null;
      const { data, error } = await supabase
        .from("test_agents")
        .select(`${baseSelect}, prompt_versions!inner(session_id)`.trim())
        .eq("user_id", user.id)
        .eq("prompt_versions.session_id", sessionMatch)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) return null;
      return data;
    };

    const fetchLatest = async () => {
      const { data, error } = await supabase
        .from("test_agents")
        .select(baseSelect)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) return null;
      return data;
    };

    try {
      let record = await fetchForSession();
      if (!record) {
        record = await fetchLatest();
      }

      if (record) {
        setTestAgent({
          test_agent_id: record.id,
          retell_agent_id: record.retell_agent_id,
          retell_llm_id: record.retell_llm_id,
          test_name: record.test_name,
          prompt_version_id: record.prompt_version_id ?? undefined,
          created_at: record.created_at,
        });
      } else {
        setTestAgent(null);
      }
    } catch (e) {
      console.error("Failed to load test agent:", e);
      setTestAgent(null);
    }
  };

  const refinePrompts = async (evaluationId: string) => {
    if (!promptVersionId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("refine_prompts", {
        body: {
          prompt_version_id: promptVersionId,
          evaluation_id: evaluationId
        }
      });

      if (error) throw error;

      // Load the refined version data
      const refinedVersion: PromptVersion = {
        id: data.new_version_id,
        version_number: data.version_number,
        base_prompt: data.base_prompt,
        states: data.states,
        generation_context: {
          changes_summary: data.changes_summary,
          quality_validation: data.quality_score ? {
            score: data.quality_score
          } : undefined
        },
        created_at: new Date().toISOString(),
        session_id: currentVersion?.session_id,
      };

      // Phase 5.3d: Check for quality regression
      if (data.quality_regressed && currentVersion) {
        console.warn(`[Quality Regression] Refined version scored ${data.quality_score}, original scored ${data.original_version?.quality_score}`);

        // Reload versions to get the new one
        if (sessionId) await loadVersions(sessionId);

        // Trigger comparison modal
        setComparisonVersions({
          original: currentVersion,
          compared: refinedVersion
        });
        setShowVersionComparison(true);

        toast({
          title: "⚠ Quality Regression Detected",
          description: `Version ${data.version_number} scored ${data.quality_score}/100 (down from ${data.original_version?.quality_score}/100). Review both versions to choose which to use.`,
          variant: "destructive"
        });
      } else {
        // No regression - proceed normally
        setCurrentVersion(refinedVersion);
        setProgressEvents([]);
        setRagContexts(null);
        setGenerationError(null);
        setPromptVersionId(data.new_version_id);

        toast({
          title: `✨ Version ${data.version_number} created`,
          description: data.changes_summary + (data.quality_score ? ` (Score: ${data.quality_score}/100)` : '')
        });

        if (sessionId) loadVersions(sessionId);
      }
    } catch (error: any) {
      console.error("Refinement failed:", error);
      toast({
        title: "Refinement failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const suggestPlaceholders = async (force = false) => {
    if (!promptVersionId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("suggest_placeholders", {
        body: {
          prompt_version_id: promptVersionId,
          force_reanalyze: force
        }
      });

      if (error) throw error;

      resetPlaceholderSections();
      const restored = restorePlaceholderSectionsFromStorage(data.placeholder_suggestions_id);

      setPlaceholders(data);

      if (!restored) {
        resetPlaceholderSections();
      }

      toast({
        title: "✓ Placeholders suggested",
        description: `${data.total_count} customizable fields identified`
      });
    } catch (error: any) {
      console.error("Placeholder suggestion failed:", error);
      toast({
        title: "Suggestion failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReanalyzePlaceholders = async () => {
    if (placeholderStorageKey) {
      localStorage.removeItem(placeholderStorageKey);
    }
    setPlaceholders(null);
    resetPlaceholderSections();
    await suggestPlaceholders(true);
  };

  const publishTemplate = async () => {
    if (!promptVersionId || !templateName || !templateType) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }

    const mappedFields = placeholderSections.flatMap((section) => section.fields);

    if (mappedFields.length === 0) {
      toast({
        title: "Configure placeholders",
        description: "Map at least one placeholder before publishing.",
        variant: "destructive",
      });
      return;
    }

    const duplicateCheck = new Set<string>();
    for (const field of mappedFields) {
      const normalizedAlias = field.alias.trim();
      if (!normalizedAlias || !field.configPath.trim() || !field.label.trim()) {
        toast({
          title: "Missing field configuration",
          description: "Each placeholder needs an alias, config path, and label.",
          variant: "destructive",
        });
        return;
      }
      if (duplicateCheck.has(normalizedAlias)) {
        toast({
          title: "Duplicate placeholder",
          description: `Placeholder "${normalizedAlias}" is assigned more than once.`,
          variant: "destructive",
        });
        return;
      }
      duplicateCheck.add(normalizedAlias);
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("publish_agent_template", {
        body: {
          prompt_version_id: promptVersionId,
          placeholder_suggestions_id: placeholders.placeholder_suggestions_id,
          template_name: templateName,
          template_type: templateType,
          placeholder_sections: placeholderSections.map((section) => ({
            id: section.id,
            title: section.title,
            subtitle: section.subtitle,
            fields: section.fields.map((field) => ({
              alias: field.alias.replace(/\{|\}/g, "").trim(),
              config_path: field.configPath.trim(),
              label: field.label,
              helper_text: field.helperText,
              component: field.component,
              placeholder_text: field.placeholderText,
              required: field.required,
              default_value: field.defaultValue,
            })),
          })),
        }
      });

      if (error) throw error;

      toast({
        title: "🎉 Template published!",
        description: `${data.template_name} is now available to users`
      });
    } catch (error: any) {
      console.error("Publishing failed:", error);
      toast({
        title: "Publishing failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const recompileMarkdown = async () => {
    if (!editedMarkdown.trim()) {
      toast({ title: "Markdown source is empty", variant: "destructive" });
      return;
    }

    setRecompiling(true);
    setCompileError(null);

    try {
      // Call prompt-compiler via edge function
      const { data, error } = await supabase.functions.invoke("compile-markdown-prompt", {
        body: { markdown: editedMarkdown }
      });

      if (error) throw error;

      if (data.errors && data.errors.length > 0) {
        setCompileError(data.errors.join("; "));
        toast({
          title: "Compilation failed",
          description: "See error details below",
          variant: "destructive"
        });
        return;
      }

      setCompiledPreview({
        base_prompt: data.base_prompt,
        states: data.states
      });

      toast({ title: "✓ Markdown compiled successfully" });
    } catch (error: any) {
      console.error("Markdown compilation failed:", error);
      setCompileError(error.message);
      toast({
        title: "Compilation failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setRecompiling(false);
    }
  };

  const saveEditedVersion = async () => {
    if (!compiledPreview || !promptVersionId || !sessionId) {
      toast({ title: "Please recompile markdown first", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("save_prompt_version", {
        body: {
          session_id: sessionId,
          base_prompt: compiledPreview.base_prompt,
          states: compiledPreview.states,
          markdown_source: editedMarkdown,
          changes_summary: "Manual edit via markdown source editor"
        }
      });

      if (error) throw error;

      const savedVersion = data?.prompt_version;

      if (!savedVersion) {
        throw new Error("Failed to save prompt version");
      }

      const nextVersion = savedVersion.version_number || 1;

      setCurrentVersion(savedVersion);
      setPromptVersionId(savedVersion.id);
      setProgressEvents(savedVersion.generation_context?.progress_events || []);
      setRagContexts(savedVersion.generation_context?.rag_contexts || null);
      setGenerationError(null);
      loadVersions(sessionId);

      toast({
        title: `✨ Version ${nextVersion} created`,
        description: "Manually edited version saved"
      });
    } catch (error: any) {
      console.error("Failed to save version:", error);
      toast({
        title: "Save failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Sandbox Testing Handlers
  const handleCreateTestAgent = async () => {
    if (!promptVersionId) {
      toast({ title: "No prompt version to test", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("test-prompt-sandbox", {
        body: {
          action: "create",
          prompt_version_id: promptVersionId
        }
      });

      if (error) throw error;

      setTestAgent({
        test_agent_id: data.test_agent_id,
        retell_agent_id: data.retell_agent_id,
        retell_llm_id: data.retell_llm_id,
        test_name: data.test_name,
        prompt_version_id: promptVersionId || undefined,
        created_at: data.created_at
      });

      toast({
        title: "✓ Test agent created on Retell",
        description: "Use Retell dashboard to make test calls"
      });
    } catch (error: any) {
      console.error("Failed to create test agent:", error);
      toast({
        title: "Failed to create test agent",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTestAgent = async () => {
    if (!testAgent || !promptVersionId) {
      toast({ title: "No test agent or prompt version", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("test-prompt-sandbox", {
        body: {
          action: "update",
          test_agent_id: testAgent.test_agent_id,
          prompt_version_id: promptVersionId,
        },
      });

      if (error) throw error;

      toast({
        title: "✓ Test agent updated",
        description: "Retell agent now uses the current prompt version",
      });

      setTestAgent(prev => prev ? {
        ...prev,
        prompt_version_id: promptVersionId || prev.prompt_version_id,
      } : prev);
    } catch (error: any) {
      console.error("Failed to update test agent prompts:", error);
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefineWithFeedback = async () => {
    if (!promptVersionId || !transcript || rating === 0) {
      toast({ title: "Please provide transcript and rating", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("test-prompt-sandbox", {
        body: {
          action: "refine_with_feedback",
          prompt_version_id: promptVersionId,
          transcript: transcript,
          user_rating: rating,
          user_notes: feedbackNotes || ""
        }
      });

      if (error) throw error;

      setRefinedVersion({
        new_version_id: data.new_version_id,
        version_number: data.version_number,
        changes_summary: data.changes_summary,
        automated_analysis: data.automated_analysis
      });

      toast({
        title: `✨ Version ${data.version_number} created`,
        description: data.changes_summary
      });

      // Reload versions
      if (sessionId) loadVersions(sessionId);

      // Clear feedback form
      setTranscript("");
      setRating(0);
      setFeedbackNotes("");
    } catch (error: any) {
      console.error("Failed to refine with feedback:", error);
      toast({
        title: "Refinement failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTestRefinedVersion = async () => {
    if (!refinedVersion) return;

    // Delete old test agent first
    if (testAgent) {
      await handleDeleteTestAgent();
    }

    // Create new test agent with refined version
    setPromptVersionId(refinedVersion.new_version_id);
    setCurrentVersion({
      id: refinedVersion.new_version_id,
      version_number: refinedVersion.version_number,
      base_prompt: "",
      states: [],
      generation_context: { changes_summary: refinedVersion.changes_summary },
      created_at: new Date().toISOString(),
      session_id: currentVersion?.session_id,
    });
    setProgressEvents([]);
    setRagContexts(null);
    setGenerationError(null);

    // Wait a bit for state to update
    setTimeout(() => {
      handleCreateTestAgent();
    }, 500);
  };

  const handleDeleteTestAgent = async () => {
    if (!testAgent) return;

    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("test-prompt-sandbox", {
        body: {
          action: "delete",
          test_agent_id: testAgent.test_agent_id
        }
      });

      if (error) throw error;

      setTestAgent(null);
      setRefinedVersion(null);

      toast({
        title: "✓ Test agent deleted",
        description: "Removed from Retell and marked as deleted"
      });
    } catch (error: any) {
      console.error("Failed to delete test agent:", error);
      toast({
        title: "Failed to delete test agent",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Load recent sessions for dropdown
  const loadRecentSessions = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("list-user-sessions", {
        method: "GET"
      });

      if (error) throw error;

      if (data?.sessions) {
        setRecentSessions(data.sessions);
      }
    } catch (error: any) {
      console.error("Failed to load recent sessions:", error);
      toast({
        title: "Failed to load recent sessions",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  // Load prompt by ID (supports multiple ID types)
  const loadPromptById = async (id?: string) => {
    const idToLoad = id || loadPromptId.trim();
    if (!idToLoad) {
      toast({ title: "Please enter an ID", variant: "destructive" });
      return;
    }

    setLoadingPrompt(true);
    try {
      const { data, error } = await supabase.functions.invoke("load-prompt-by-id", {
        body: {
          id: idToLoad,
          id_type: "auto"
        }
      });

      if (error) throw error;

      // Restore the session state
      setSessionId(data.session_id);
      setMessages(data.conversation_history || []);
      setSessionStatus(data.status);
      setLoadedFromSource(data.loaded_from);

      if (data.metadata) {
        setConfidenceMeta({
          overall_confidence: data.metadata.overall_confidence,
          lead_type: data.metadata.lead_type,
          primary_goal: data.metadata.primary_goal,
          audience: data.metadata.audience,
        });
      }
      if (data.progress_events) {
        setProgressEvents(data.progress_events);
      }
      if (data.rag_contexts) {
        setRagContexts(data.rag_contexts);
      }
      if (data.flow_analysis) {
        setFlowAnalysis(data.flow_analysis);
      }
      if (data.quality_validation) {
        setQualityValidation(data.quality_validation);
      }

      // Restore generated prompts if they exist
      if (data.generated_prompts && data.prompt_version_id) {
        setCurrentVersion({
          id: data.prompt_version_id,
          version_number: data.version_number || 1,
          base_prompt: data.generated_prompts.base_prompt,
          states: data.generated_prompts.states,
          generation_context: {},
          created_at: new Date().toISOString(),
          session_id: data.session_id,
        });
        setPromptVersionId(data.prompt_version_id);
        loadTestAgent(data.session_id);
        loadVersions(data.session_id);
      }

      // Save to localStorage for persistence
      localStorage.setItem("prompt_generator_session_id", data.session_id);
      sessionRestoredRef.current = true;

      toast({
        title: "✓ Prompt loaded",
        description: `Loaded from ${data.loaded_from.replace(/_/g, " ")}`
      });

      setLoadPromptId("");
      setShowLoadPrompt(false);
    } catch (error: any) {
      console.error("Failed to load prompt:", error);
      toast({
        title: "Failed to load prompt",
        description: error.message || "Prompt not found",
        variant: "destructive"
      });
    } finally {
      setLoadingPrompt(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Sparkle className="text-primary" weight="fill" size={32} />
            AI Prompt Factory V2
          </h1>
          <div className="text-muted-foreground mt-1 flex items-center gap-2">
            <span>Conversational prompt generation with RAG-powered learning</span>
            {ragEnabled && <Badge variant="outline">RAG Enabled</Badge>}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowSystemInfo(!showSystemInfo)}
        >
          <Eye size={16} className="mr-2" />
          {showSystemInfo ? "Hide" : "Show"} System Info
        </Button>
      </div>

      {/* Load Existing Prompt Section */}
      <Card className="mb-6 border-blue-500/30 bg-blue-50/30 dark:bg-blue-950/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database size={20} className="text-blue-500" />
              <CardTitle className="text-sm">Load Existing Prompt</CardTitle>
              {loadedFromSource && (
                <Badge variant="secondary" className="text-xs">
                  Loaded from {loadedFromSource.replace(/_/g, " ")}
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowLoadPrompt(!showLoadPrompt);
                if (!showLoadPrompt && recentSessions.length === 0) {
                  loadRecentSessions();
                }
              }}
            >
              {showLoadPrompt ? <CaretDown size={16} /> : <CaretRight size={16} />}
              {showLoadPrompt ? "Hide" : "Show"}
            </Button>
          </div>
          <CardDescription className="text-xs">
            Load a prompt using any ID: Session ID, Prompt Version ID, Test Agent ID, or Retell Agent ID
          </CardDescription>
        </CardHeader>
        {showLoadPrompt && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Load by ID input */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Enter ID</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Paste any ID here..."
                    value={loadPromptId}
                    onChange={(e) => setLoadPromptId(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && loadPromptById()}
                    className="flex-1"
                  />
                  <Button
                    onClick={() => loadPromptById()}
                    disabled={loadingPrompt || !loadPromptId.trim()}
                  >
                    {loadingPrompt ? "Loading..." : "Load"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Supports: Session ID, Prompt Version ID, Test Agent ID, Retell Agent ID
                </p>
              </div>

              {/* Recent sessions dropdown */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Recent Sessions</label>
                {recentSessions.length === 0 ? (
                  <div className="text-center py-8 border rounded-md bg-secondary/20">
                    <p className="text-xs text-muted-foreground">Loading recent sessions...</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[200px] border rounded-md bg-background">
                    <div className="p-2 space-y-2">
                      {recentSessions.map((session) => (
                        <div
                          key={session.session_id}
                          className="p-3 border rounded hover:bg-secondary/50 cursor-pointer transition-colors"
                          onClick={() => loadPromptById(session.session_id)}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <p className="font-medium text-sm">{session.agent_type_name}</p>
                            <Badge variant="outline" className="text-xs">
                              {session.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>{new Date(session.updated_at).toLocaleDateString()}</span>
                            {session.version_count > 0 && (
                              <span>v{session.latest_version_number} ({session.version_count} versions)</span>
                            )}
                            {session.has_test_agent && (
                              <Badge variant="secondary" className="text-[10px]">
                                Test Agent
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {showSystemInfo && (
        <Card className="mb-6 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu size={20} />
                System Configuration & Prompts
              </div>
              {systemPrompts?.metadata?.last_updated && (
                <p className="text-xs text-muted-foreground font-normal">
                  Last updated: {new Date(systemPrompts.metadata.last_updated).toLocaleString()}
                </p>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingPrompts ? (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">Loading system prompts...</p>
              </div>
            ) : !systemPrompts ? (
              <div className="text-center py-8">
                <p className="text-sm text-destructive">Failed to load system prompts</p>
              </div>
            ) : (
              <>
                {/* LLM Configuration */}
                <div className="grid grid-cols-2 gap-4 font-mono text-sm">
                  <div>
                    <p className="text-muted-foreground">Generator LLM</p>
                    <p className="font-semibold">{systemPrompts.prompts.generator_markdown.model}</p>
                    <p className="text-xs text-muted-foreground">
                      Temperature: {systemPrompts.prompts.generator_markdown.temperature},
                      Max tokens: {systemPrompts.prompts.generator_markdown.max_tokens}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Critic LLM</p>
                    <p className="font-semibold">{systemPrompts.prompts.critic.model}</p>
                    <p className="text-xs text-muted-foreground">
                      Temperature: {systemPrompts.prompts.critic.temperature},
                      Max tokens: {systemPrompts.prompts.critic.max_tokens}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Placeholder Analyzer</p>
                    <p className="font-semibold">{systemPrompts.prompts.placeholder_analyzer.model}</p>
                    <p className="text-xs text-muted-foreground">
                      Temperature: {systemPrompts.prompts.placeholder_analyzer.temperature}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">RAG Embeddings</p>
                    <p className="font-semibold">Titan Embeddings G1 v2</p>
                    <p className="text-xs text-muted-foreground">Dimension: 1024</p>
                  </div>
                </div>

            <Separator />

            {/* Infrastructure */}
            <div className="space-y-2 text-sm">
              <div>
                <p className="text-muted-foreground mb-1">Knowledge Base ID</p>
                <code className="text-xs bg-secondary p-2 rounded block">SV7QRLWCSP</code>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">S3 Bucket</p>
                <code className="text-xs bg-secondary p-2 rounded block break-all">
                  s3://kw-ai-prompt-factory-kb-1759953147/prompt-factory-kb/
                </code>
              </div>
            </div>

            <Separator />

            {/* System Prompts */}
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">LLM System Prompts</h3>

              {/* Generator LLM - Question Generation */}
              <Collapsible open={expandedPrompts.generatorQuestion} onOpenChange={(open) => togglePrompt('generatorQuestion', open)}>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm hover:text-primary w-full text-left">
                  {expandedPrompts.generatorQuestion ? <CaretDown size={14} /> : <CaretRight size={14} />}
                  <span className="font-medium">Generator LLM - Next Question Prompt</span>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <ScrollArea className="h-[200px] w-full">
                    <pre className="text-xs bg-secondary p-3 rounded font-mono whitespace-pre-wrap">
                      {systemPrompts.prompts.generator_question.template}
                    </pre>
                  </ScrollArea>
                </CollapsibleContent>
              </Collapsible>

              {/* Generator LLM - Prompt Generation */}
              <Collapsible open={expandedPrompts.generatorPrompt} onOpenChange={(open) => togglePrompt('generatorPrompt', open)}>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm hover:text-primary w-full text-left">
                  {expandedPrompts.generatorPrompt ? <CaretDown size={14} /> : <CaretRight size={14} />}
                  <span className="font-medium">Generator LLM - Agent Prompt Generation (ENHANCED)</span>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <ScrollArea className="h-[400px] w-full">
                    <pre className="text-xs bg-secondary p-3 rounded font-mono whitespace-pre-wrap">
                      {systemPrompts.prompts.generator_markdown.template}
                    </pre>
                  </ScrollArea>
                </CollapsibleContent>
              </Collapsible>

              {/* Critic LLM */}
              <Collapsible open={expandedPrompts.critic} onOpenChange={(open) => togglePrompt('critic', open)}>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm hover:text-primary w-full text-left">
                  {expandedPrompts.critic ? <CaretDown size={14} /> : <CaretRight size={14} />}
                  <span className="font-medium">Critic LLM - Transcript Analysis</span>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <ScrollArea className="h-[300px] w-full">
                    <pre className="text-xs bg-secondary p-3 rounded font-mono whitespace-pre-wrap">
                      {systemPrompts.prompts.critic.template}
                    </pre>
                  </ScrollArea>
                </CollapsibleContent>
              </Collapsible>

              {/* Pattern Extractor */}
              <Collapsible open={expandedPrompts.extractor} onOpenChange={(open) => togglePrompt('extractor', open)}>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm hover:text-primary w-full text-left">
                  {expandedPrompts.extractor ? <CaretDown size={14} /> : <CaretRight size={14} />}
                  <span className="font-medium">Pattern Extractor LLM - RAG Learning</span>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <ScrollArea className="h-[300px] w-full">
                    <pre className="text-xs bg-secondary p-3 rounded font-mono whitespace-pre-wrap">
                      {systemPrompts.prompts.pattern_extractor.template}
                    </pre>
                  </ScrollArea>
                </CollapsibleContent>
              </Collapsible>

              {/* Placeholder Analyzer */}
              <Collapsible open={expandedPrompts.placeholder} onOpenChange={(open) => togglePrompt('placeholder', open)}>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm hover:text-primary w-full text-left">
                  {expandedPrompts.placeholder ? <CaretDown size={14} /> : <CaretRight size={14} />}
                  <span className="font-medium">Placeholder Analyzer LLM</span>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <ScrollArea className="h-[300px] w-full">
                    <pre className="text-xs bg-secondary p-3 rounded font-mono whitespace-pre-wrap">
                      {systemPrompts.prompts.placeholder_analyzer.template}
                    </pre>
                  </ScrollArea>
                </CollapsibleContent>
              </Collapsible>

              {/* Refinement LLM */}
              <Collapsible open={expandedPrompts.refinement} onOpenChange={(open) => togglePrompt('refinement', open)}>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm hover:text-primary w-full text-left">
                  {expandedPrompts.refinement ? <CaretDown size={14} /> : <CaretRight size={14} />}
                  <span className="font-medium">Refinement LLM - Iterative Improvement</span>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <ScrollArea className="h-[300px] w-full">
                    <pre className="text-xs bg-secondary p-3 rounded font-mono whitespace-pre-wrap">
                      {systemPrompts.prompts.refinement.template}
                    </pre>
                  </ScrollArea>
                </CollapsibleContent>
              </Collapsible>
            </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="generate" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="generate">
            <ChatCircle className="mr-2" size={16} />
            Generate
          </TabsTrigger>
          <TabsTrigger value="feedback" disabled={!currentVersion}>
            <Database className="mr-2" size={16} />
            Feedback
          </TabsTrigger>
          <TabsTrigger value="versions" disabled={!currentVersion}>
            <GitBranch className="mr-2" size={16} />
            Versions
          </TabsTrigger>
          <TabsTrigger value="source" disabled={!currentVersion}>
            <Code className="mr-2" size={16} />
            Source
          </TabsTrigger>
          <TabsTrigger value="publish" disabled={!currentVersion}>
            <CheckCircle className="mr-2" size={16} />
            Publish
          </TabsTrigger>
        </TabsList>

        {/* Generate Tab - Continued in next message due to length */}

        <TabsContent value="generate" className="space-y-4">
          {!sessionId ? (
            <Card>
              <CardHeader>
                <CardTitle>Start New Session</CardTitle>
                <CardDescription>
                  {restoringSession
                    ? "Restoring your previous session..."
                    : "Begin a conversational session to generate new AI agent prompts"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {restoringSession ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground">Loading session...</p>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-sm font-medium">Agent Type Name</label>
                      <Input
                        placeholder="e.g., Commercial Real Estate Investor"
                        value={agentTypeName}
                        onChange={(e) => setAgentTypeName(e.target.value)}
                        onKeyPress={(e) => e.key === "Enter" && !exampleScripts && startSession()}
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium">Example Scripts (Optional)</label>
                      <Textarea
                        placeholder="Paste 1-3 example conversation scripts here. The AI will analyze the conversational flow and style patterns (NOT copy content).&#10;&#10;Example:&#10;Agent: Hi, is this John?&#10;User: Yes, who's calling?&#10;Agent: This is Sarah with ABC Investments..."
                        value={exampleScripts}
                        onChange={(e) => setExampleScripts(e.target.value)}
                        rows={8}
                        className="font-mono text-xs"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        💡 Helps guide natural conversation flow, transition style, and tone. Analyzes HOW conversations flow, not WHAT content to use.
                      </p>
                    </div>

                    <Button onClick={startSession} disabled={loading}>
                      <Sparkle className="mr-2" size={16} />
                      Start Session{exampleScripts.trim() && " with Script Analysis"}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <PanelGroup
              direction="horizontal"
              className="gap-4"
              onLayout={(sizes) => {
                // Persist layout to localStorage
                localStorage.setItem('prompt-factory-layout', JSON.stringify(sizes));
              }}
            >
              <Panel
                defaultSize={60}
                minSize={40}
                maxSize={75}
              >
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>Conversation</span>
                      <div className="flex items-center gap-2">
                        <Badge>{sessionStatus}</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={clearSession}
                          className="text-xs"
                        >
                          Clear & Start Fresh
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {generationError && (
                      <Alert variant="destructive">
                        <AlertTitle>Generation blocked</AlertTitle>
                        <AlertDescription>
                          <div className="space-y-1 text-xs">
                            <p>{generationError.error || generationError.message || "Resolve the issues below to continue."}</p>
                            {generationError.missing_fields && generationError.missing_fields.length > 0 && (
                              <p>
                                Missing fields: <span className="font-medium">{generationError.missing_fields.join(", ")}</span>
                              </p>
                            )}
                            {generationError.required_confidence !== undefined && (
                              <p>
                                Confidence {Math.round((generationError.overall_confidence ?? 0) * 100)}% (needs {Math.round(generationError.required_confidence * 100)}%)
                              </p>
                            )}
                          </div>
                        </AlertDescription>
                      </Alert>
                    )}

                    {confidenceMeta.overall_confidence !== undefined && (
                      <div className="border border-primary/20 rounded-lg p-3 bg-primary/5 space-y-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Confidence</span>
                          <span className="font-semibold text-primary">
                            {Math.max(0, Math.min(100, Math.round((confidenceMeta.overall_confidence ?? 0) * 100)))}%
                          </span>
                        </div>
                        <Progress
                          value={Math.max(0, Math.min(100, Math.round((confidenceMeta.overall_confidence ?? 0) * 100)))}
                          className="h-2"
                        />
                        <div className="grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                          <div>
                            <span className="font-medium text-foreground block">Lead Type</span>
                            {confidenceMeta.lead_type || "—"}
                          </div>
                          <div>
                            <span className="font-medium text-foreground block">Goal</span>
                            {confidenceMeta.primary_goal || "—"}
                          </div>
                          <div>
                            <span className="font-medium text-foreground block">Audience</span>
                            {confidenceMeta.audience || "—"}
                          </div>
                        </div>
                      </div>
                    )}

                    <ScrollArea className="h-[400px] pr-4" ref={scrollRef}>
                      <div className="space-y-4">
                        {messages.map((msg, idx) => (
                          <div
                            key={idx}
                            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={`max-w-[80%] rounded-lg p-3 ${
                                msg.role === "user"
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-secondary"
                              }`}
                            >
                              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>

                    {!currentVersion && progressEvents.length > 0 && (
                      <div className="border rounded-lg p-2 bg-secondary/40 text-xs space-y-2">
                        <p className="font-medium text-muted-foreground flex items-center gap-1">
                          <Clock size={12} /> Latest progress
                        </p>
                        <div className="space-y-1">
                          {progressEvents.slice(-4).map((event, idx) => (
                            <div key={`${event.phase}-${idx}`} className="flex items-center justify-between">
                              <span>{event.phase}</span>
                              <span className="text-muted-foreground">
                                {(event.status || "").replace(/_/g, " ")}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {sessionStatus === "ready_to_generate" ? (
                      <Button onClick={generatePrompts} disabled={loading} className="w-full">
                        <Sparkle className="mr-2" size={16} />
                        Generate Prompts
                      </Button>
                    ) : sessionStatus === "conversation" ? (
                      <div className="flex gap-2">
                        <Input
                          placeholder="Type your answer..."
                          value={userInput}
                          onChange={(e) => setUserInput(e.target.value)}
                          onKeyPress={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                        />
                        <Button onClick={sendMessage} disabled={loading}>
                          <ArrowRight size={16} />
                        </Button>
                      </div>
                    ) : (
                      <div className="text-center text-sm text-muted-foreground">
                        ✓ Prompts generated! Check other tabs to analyze and publish.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Panel>

              <PanelResizeHandle className="mx-2" />

              {currentVersion && (
                <Panel
                  defaultSize={40}
                  minSize={25}
                  maxSize={60}
                >
                  <Card className="h-full">
                    <CardHeader>
                      <CardTitle className="text-sm">Generated Prompts</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-medium text-muted-foreground">Base Prompt Preview</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setBasePromptDialogOpen(true)}
                            className="h-7 px-2"
                          >
                            <ArrowsOut size={14} className="mr-1" />
                            <span className="text-xs">Expand</span>
                          </Button>
                        </div>
                        <div className="text-xs bg-secondary p-2 rounded max-h-[100px] overflow-hidden relative">
                          <p className="line-clamp-4">{currentVersion.base_prompt}</p>
                          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-secondary to-transparent pointer-events-none" />
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">States ({currentVersion.states.length})</p>
                        <div className="space-y-3">
                          {currentVersion.states.map((state: any) => {
                            const stateKey = `state_${state.name}`;
                            const isOpen = Boolean(expandedPrompts[stateKey]);
                            return (
                              <Collapsible
                                key={state.name}
                                open={isOpen}
                                onOpenChange={(open) => toggleStatePrompt(state.name, open)}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <CollapsibleTrigger className="flex items-center gap-2 text-sm hover:text-primary text-left">
                                    {isOpen ? <CaretDown size={14} /> : <CaretRight size={14} />}
                                    <Badge variant="outline" className="text-xs">
                                      {state.name}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                      ({state.state_prompt?.length || 0} chars)
                                    </span>
                                  </CollapsibleTrigger>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setStatePromptDialogOpen(state.name)}
                                    className="h-6 px-2"
                                  >
                                    <ArrowsOut size={12} />
                                  </Button>
                                </div>
                                <CollapsibleContent className="mt-1">
                                  <ScrollArea className="h-[200px] text-xs bg-secondary/50 p-3 rounded border">
                                    <pre className="whitespace-pre-wrap font-mono">
                                      {state.state_prompt || 'No content'}
                                    </pre>
                                  </ScrollArea>
                                </CollapsibleContent>
                              </Collapsible>
                            );
                          })}
                        </div>
                      </div>

                      {progressEvents.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                            <Clock size={12} /> Generation Progress
                          </p>
                          <ScrollArea className="h-[140px] border rounded bg-secondary/40 p-2">
                            <div className="space-y-2 text-xs">
                              {progressEvents.map((event, idx) => (
                                <div key={`${event.phase}-${event.timestamp}-${idx}`} className="space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium text-foreground">{event.phase}</span>
                                    <span className="text-muted-foreground">
                                      {event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : ""}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                    <Badge
                                      variant={event.status === "complete" || event.status === "done" || event.status === "saving" ? "secondary" : event.status === "failed" ? "destructive" : "outline"}
                                      className="text-[10px] uppercase tracking-wide"
                                    >
                                      {event.status}
                                    </Badge>
                                    {event.detail && <span>{event.detail}</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </div>
                      )}

                      {qualityValidation && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                            <Check size={12} /> Quality Validation
                          </p>
                          <div className="border rounded bg-secondary/40 p-3 space-y-3 text-xs">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-foreground">Quality Score:</span>
                                <Badge
                                  variant={
                                    qualityValidation.score >= 80 ? "default" :
                                    qualityValidation.score >= 60 ? "secondary" :
                                    "destructive"
                                  }
                                  className="text-sm font-semibold"
                                >
                                  {qualityValidation.score}/100 {qualityValidation.passed ? "✓" : "⚠"}
                                </Badge>
                              </div>
                              {qualityValidation.score < 80 && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={async () => {
                                    if (!sessionId) return;
                                    setLoading(true);
                                    try {
                                      const { data, error } = await supabase.functions.invoke("generate_prompts_chat", {
                                        body: {
                                          action: "generate",
                                          session_id: sessionId,
                                          quality_feedback: {
                                            previous_score: qualityValidation.score,
                                            issues_to_fix: qualityValidation.issues
                                              .filter((i: any) => i.severity === "critical" || i.severity === "high")
                                              .map((i: any) => i.message),
                                            suggestions: qualityValidation.suggestions
                                          }
                                        }
                                      });

                                      if (error) throw error;

                                      // Update with new generation
                                      if (data.generated_prompts) {
                                        setCurrentVersion({
                                          id: data.prompt_version_id,
                                          version_number: data.version_number,
                                          base_prompt: data.generated_prompts.base_prompt,
                                          states: data.generated_prompts.states,
                                          generation_context: {},
                                          created_at: new Date().toISOString(),
                                          session_id: sessionId,
                                        });
                                        setPromptVersionId(data.prompt_version_id);
                                        setQualityValidation(data.quality_validation || null);
                                        setProgressEvents(data.progress_events || []);

                                        toast({
                                          title: "Regenerated successfully",
                                          description: `New quality score: ${data.quality_validation?.score || 'N/A'}/100`
                                        });
                                      }
                                    } catch (error: any) {
                                      console.error("Regeneration failed:", error);
                                      toast({
                                        title: "Regeneration failed",
                                        description: error.message,
                                        variant: "destructive"
                                      });
                                    } finally {
                                      setLoading(false);
                                    }
                                  }}
                                  disabled={loading}
                                  className="h-7 text-xs"
                                >
                                  <ArrowsClockwise size={12} className="mr-1" />
                                  Regenerate
                                </Button>
                              )}
                            </div>

                            {qualityValidation.issues_count > 0 && (
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium text-foreground">Issues Found:</span>
                                  <div className="flex gap-1 text-[10px]">
                                    {qualityValidation.critical_issues > 0 && (
                                      <Badge variant="destructive" className="text-[9px]">
                                        {qualityValidation.critical_issues} Critical
                                      </Badge>
                                    )}
                                    {qualityValidation.high_severity > 0 && (
                                      <Badge variant="default" className="text-[9px] bg-orange-500">
                                        {qualityValidation.high_severity} High
                                      </Badge>
                                    )}
                                    {qualityValidation.medium_severity > 0 && (
                                      <Badge variant="secondary" className="text-[9px]">
                                        {qualityValidation.medium_severity} Medium
                                      </Badge>
                                    )}
                                    {qualityValidation.low_severity > 0 && (
                                      <Badge variant="outline" className="text-[9px]">
                                        {qualityValidation.low_severity} Low
                                      </Badge>
                                    )}
                                  </div>
                                </div>

                                <Collapsible className="mt-2">
                                  <CollapsibleTrigger className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                                    <CaretRight size={10} /> View All Issues ({qualityValidation.issues_count})
                                  </CollapsibleTrigger>
                                  <CollapsibleContent className="mt-2">
                                    <ScrollArea className="h-[150px] border rounded bg-background p-2">
                                      <div className="space-y-2">
                                        {qualityValidation.issues.map((issue: any, idx: number) => (
                                          <div key={idx} className="text-[11px] space-y-1 pb-2 border-b last:border-0">
                                            <div className="flex items-start gap-2">
                                              <Badge
                                                variant={
                                                  issue.severity === "critical" ? "destructive" :
                                                  issue.severity === "high" ? "default" :
                                                  issue.severity === "medium" ? "secondary" :
                                                  "outline"
                                                }
                                                className="text-[9px] uppercase mt-0.5"
                                              >
                                                {issue.severity}
                                              </Badge>
                                              <div className="flex-1">
                                                <p className="font-medium text-foreground">{issue.message}</p>
                                                {issue.location && (
                                                  <p className="text-muted-foreground mt-0.5">
                                                    Location: {issue.location.substring(0, 60)}...
                                                  </p>
                                                )}
                                                {issue.suggestion && (
                                                  <p className="text-blue-600 dark:text-blue-400 mt-1">
                                                    💡 {issue.suggestion}
                                                  </p>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </ScrollArea>
                                  </CollapsibleContent>
                                </Collapsible>
                              </div>
                            )}

                            {qualityValidation.suggestions && qualityValidation.suggestions.length > 0 && (
                              <div>
                                <span className="font-medium text-foreground block mb-1">Suggestions:</span>
                                <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                                  {qualityValidation.suggestions.map((suggestion: string, idx: number) => (
                                    <li key={idx}>{suggestion}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {flowAnalysis && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                            <Sparkle size={12} /> Flow Analysis from Example Scripts
                          </p>
                          <div className="border rounded bg-secondary/40 p-3 space-y-2 text-xs">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <span className="font-medium text-foreground">Structure:</span>
                                <span className="ml-2 text-muted-foreground">{flowAnalysis.structure_type}</span>
                              </div>
                              <div>
                                <span className="font-medium text-foreground">Confidence:</span>
                                <Badge variant={flowAnalysis.confidence >= 0.7 ? "default" : "secondary"} className="ml-2">
                                  {(flowAnalysis.confidence * 100).toFixed(0)}%
                                </Badge>
                              </div>
                              <div>
                                <span className="font-medium text-foreground">Tone:</span>
                                <span className="ml-2 text-muted-foreground">{flowAnalysis.tone_register}</span>
                              </div>
                              <div>
                                <span className="font-medium text-foreground">Cadence:</span>
                                <span className="ml-2 text-muted-foreground">{flowAnalysis.turn_taking_cadence}</span>
                              </div>
                            </div>
                            <div>
                              <span className="font-medium text-foreground">Avg Sentence Length:</span>
                              <span className="ml-2 text-muted-foreground">{flowAnalysis.avg_sentence_length?.toFixed(1) || 'N/A'}</span>
                            </div>
                            {flowAnalysis.linguistic_patterns && flowAnalysis.linguistic_patterns.length > 0 && (
                              <div>
                                <span className="font-medium text-foreground">Linguistic Patterns to Emulate:</span>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {flowAnalysis.linguistic_patterns.map((pattern: string, idx: number) => (
                                    <Badge key={idx} variant="secondary" className="text-[10px]">
                                      {pattern}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            {flowAnalysis.analysis_notes && (
                              <div className="pt-2 border-t">
                                <span className="font-medium text-foreground">Analysis:</span>
                                <p className="mt-1 text-[11px] text-muted-foreground">{flowAnalysis.analysis_notes}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {ragContexts && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                            <Database size={12} /> RAG Context Used
                          </p>
                          {(() => {
                            const entries = Object.entries(ragContexts).filter(([, value]) => value && value.trim().length > 0);
                            if (entries.length === 0) {
                              return <p className="text-[11px] text-muted-foreground">No knowledge base context was applied.</p>;
                            }
                            return (
                              <div className="space-y-2">
                                {entries.map(([key, value]) => {
                                  const ragKey = `rag_${key}`;
                                  const ragOpen = Boolean(expandedPrompts[ragKey]);
                                  return (
                                  <Collapsible
                                    key={key}
                                    open={ragOpen}
                                    onOpenChange={(open) => togglePrompt(ragKey, open)}
                                  >
                                    <div className="flex items-center gap-2 text-xs">
                                      <CollapsibleTrigger className="flex items-center gap-2 text-left hover:text-primary">
                                        {ragOpen ? <CaretDown size={12} /> : <CaretRight size={12} />}
                                        <span className="font-medium capitalize">{key.replace(/_/g, " ")}</span>
                                      </CollapsibleTrigger>
                                    </div>
                                    <CollapsibleContent className="mt-1">
                                      <ScrollArea className="h-[120px] text-[11px] bg-secondary/40 border rounded p-2">
                                        <pre className="whitespace-pre-wrap font-mono">
                                          {value}
                                        </pre>
                                      </ScrollArea>
                                    </CollapsibleContent>
                                  </Collapsible>);
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {/* Sandbox Testing Section */}
                      <Separator className="my-4" />
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-3">Sandbox Testing</p>

                        {!testAgent ? (
                          <Button
                            onClick={handleCreateTestAgent}
                            disabled={loading}
                            size="sm"
                            className="w-full"
                            variant="outline"
                          >
                            <Upload size={14} className="mr-2" />
                            Create Test Agent on Retell
                          </Button>
                        ) : (
                          <div className="space-y-3">
                            {(() => {
                              const currentVersionId = promptVersionId;
                              const isCurrent = currentVersionId && testAgent.prompt_version_id === currentVersionId;
                              return (
                            <div className="bg-primary/10 border border-primary/20 rounded p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-medium">Test Agent Active</p>
                                <div className="flex items-center gap-2">
                                  {!isCurrent && (
                                    <Button
                                      onClick={handleUpdateTestAgent}
                                      disabled={loading}
                                      size="sm"
                                      variant="outline"
                                      className="h-6 px-2 text-xs"
                                    >
                                      Update to Current Version
                                    </Button>
                                  )}
                                  <Button
                                    onClick={handleDeleteTestAgent}
                                    disabled={loading}
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-2 text-xs"
                                  >
                                    Delete
                                  </Button>
                                </div>
                              </div>
                              <div className="text-xs space-y-1">
                                <p className="font-mono text-muted-foreground">
                                  Agent: {testAgent.retell_agent_id}
                                </p>
                                <p className="text-muted-foreground">
                                  {isCurrent
                                    ? "Using current prompt version"
                                    : `Using version ${testAgent.prompt_version_id ? testAgent.prompt_version_id.slice(0, 8) : "unknown"}. Update to sync with the version you're viewing.`}
                                </p>
                                <p className="text-muted-foreground">
                                  Use Retell dashboard to make test calls
                                </p>
                              </div>
                            </div>
                              );
                            })()}

                            {/* Feedback Form */}
                            <div className="space-y-2">
                              <label className="text-xs font-medium">Test Call Transcript</label>
                              <Textarea
                                placeholder="Paste transcript from test call..."
                                value={transcript}
                                onChange={(e) => setTranscript(e.target.value)}
                                rows={4}
                                className="font-mono text-xs"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-xs font-medium">Rating</label>
                                <div className="flex gap-1 mt-1">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <button
                                      key={star}
                                      onClick={() => setRating(star)}
                                      className={`text-lg transition-colors ${
                                        star <= rating ? "text-yellow-500" : "text-gray-300"
                                      }`}
                                    >
                                      ★
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <label className="text-xs font-medium">Notes</label>
                                <Input
                                  placeholder="Issues found..."
                                  value={feedbackNotes}
                                  onChange={(e) => setFeedbackNotes(e.target.value)}
                                  className="text-xs h-8"
                                />
                              </div>
                            </div>

                            <Button
                              onClick={handleRefineWithFeedback}
                              disabled={loading || !transcript || rating === 0}
                              size="sm"
                              className="w-full"
                            >
                              <Sparkle size={14} className="mr-2" />
                              Refine with Feedback
                            </Button>

                            {/* Refined Version Display */}
                            {refinedVersion && (
                              <div className="bg-secondary/50 border rounded p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                  <Badge variant="secondary">
                                    Version {refinedVersion.version_number}
                                  </Badge>
                                  <Button
                                    onClick={handleTestRefinedVersion}
                                    disabled={loading}
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 text-xs"
                                  >
                                    Test This Version
                                  </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {refinedVersion.changes_summary}
                                </p>
                                {refinedVersion.automated_analysis && (
                                  <div className="text-xs space-y-1">
                                    <p className="font-medium">Analysis:</p>
                                    <div className="bg-secondary p-2 rounded space-y-1">
                                      {Object.entries(refinedVersion.automated_analysis).slice(0, 3).map(([key, value]) => (
                                        <div key={key} className="flex justify-between">
                                          <span className="text-muted-foreground">{key}:</span>
                                          <span className="font-mono">{String(value)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Panel>
              )}
            </PanelGroup>
          )}
        </TabsContent>

        {/* Feedback Tab */}
        <TabsContent value="feedback" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Submit New Feedback */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database size={20} />
                  Analyze Transcript Feedback
                </CardTitle>
                <CardDescription>
                  Upload test call transcript for Critic LLM analysis
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Call Transcript</label>
                  <Textarea
                    placeholder="Paste the full conversation transcript from your test call..."
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    rows={8}
                    className="font-mono text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Overall Rating</label>
                    <div className="flex gap-2 mt-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => setRating(star)}
                          className={`text-2xl transition-colors ${
                            star <= rating ? "text-yellow-500" : "text-gray-300"
                          }`}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Critic LLM</label>
                    <p className="text-xs text-muted-foreground mt-2">
                      Claude Sonnet 4.5<br/>
                      Temp: 0.2, Max: 4096
                    </p>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Additional Notes (Optional)</label>
                  <Textarea
                    placeholder="Any specific issues or observations..."
                    value={feedbackNotes}
                    onChange={(e) => setFeedbackNotes(e.target.value)}
                    rows={3}
                  />
                </div>

                <Button onClick={analyzeFeedback} disabled={loading} className="w-full">
                  <Sparkle className="mr-2" size={16} />
                  Analyze with Critic LLM
                </Button>

                {ragEnabled && (
                  <p className="text-xs text-muted-foreground">
                    ✓ Patterns will be extracted and synced to RAG Knowledge Base
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Past Evaluations */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Evaluation History</CardTitle>
                <CardDescription>
                  Previous analyses and refinement opportunities
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  {evaluations.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No evaluations yet. Analyze a transcript to get started.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {evaluations.map((evaluation) => (
                        <Card key={evaluation.id} className="border-muted">
                          <CardContent className="pt-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="flex">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <span
                                      key={star}
                                      className={`text-sm ${
                                        star <= evaluation.user_rating
                                          ? "text-yellow-500"
                                          : "text-gray-300"
                                      }`}
                                    >
                                      ★
                                    </span>
                                  ))}
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(evaluation.created_at).toLocaleDateString()}
                                </span>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => refinePrompts(evaluation.id)}
                                disabled={loading}
                              >
                                <GitBranch size={14} className="mr-1" />
                                Refine
                              </Button>
                            </div>

                            {evaluation.automated_analysis && (
                              <div className="text-xs space-y-1">
                                <p className="font-medium">Automated Analysis:</p>
                                <div className="bg-secondary p-2 rounded space-y-1">
                                  {Object.entries(evaluation.automated_analysis).map(([key, value]) => (
                                    <div key={key} className="flex justify-between">
                                      <span className="text-muted-foreground">{key}:</span>
                                      <span className="font-mono">{String(value)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {evaluation.improvement_suggestions && evaluation.improvement_suggestions.length > 0 && (
                              <div className="text-xs space-y-1">
                                <p className="font-medium">Suggestions:</p>
                                <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                                  {evaluation.improvement_suggestions.map((suggestion, idx) => (
                                    <li key={idx}>{suggestion}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {evaluation.user_notes && (
                              <div className="text-xs">
                                <p className="font-medium">Your Notes:</p>
                                <p className="text-muted-foreground italic">{evaluation.user_notes}</p>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {feedbackActivity.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ListChecks size={18} />
              Feedback Activity
            </CardTitle>
            <CardDescription>
              Recent critic analyses, extracted patterns, and KB ingestion status
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[260px] pr-2">
              <div className="space-y-4">
                {feedbackActivity.map((item) => (
                  <div key={item.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{new Date(item.created_at).toLocaleString()}</span>
                      <Badge variant="secondary">Rating {item.rating}</Badge>
                    </div>
                    {item.summary && (
                      <p className="text-sm text-foreground">{item.summary}</p>
                    )}
                    {item.patterns.length > 0 && (
                      <div className="text-xs space-y-1">
                        <p className="font-medium">Patterns Extracted:</p>
                        <ul className="list-disc list-inside space-y-1">
                          {item.patterns.slice(0, 4).map((pattern: any, idx: number) => (
                            <li key={idx} className="text-muted-foreground">
                              <span className="font-medium text-foreground">{pattern.pattern_type}</span>: {pattern.pattern_summary || pattern.pattern_details}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {item.ingestion && (
                      <div className="text-[11px] text-muted-foreground">
                        KB Sync: {item.ingestion.success ? "Success" : "Pending"} • Attempts {item.ingestion.attempts}
                        {item.ingestion.status && ` • ${item.ingestion.status}`}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </TabsContent>

        {/* Versions Tab */}
        <TabsContent value="versions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitBranch size={20} />
                Version History
              </CardTitle>
              <CardDescription>
                All iterations of this prompt with refinement context
              </CardDescription>
            </CardHeader>
            <CardContent>
              {allVersions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No versions yet. Generate prompts to create the first version.
                </p>
              ) : (
                <div className="space-y-4">
                  {allVersions.map((version) => (
                    <Card
                      key={version.id}
                      className={`border-2 cursor-pointer transition-colors ${
                        version.id === currentVersion?.id
                          ? "border-primary"
                          : "border-muted hover:border-primary/50"
                      }`}
                      onClick={() => {
                        setCurrentVersion(version);
                        setPromptVersionId(version.id);
                        if (version.generation_context?.metadata) {
                          setConfidenceMeta({
                            overall_confidence: version.generation_context.metadata.overall_confidence,
                            lead_type: version.generation_context.metadata.lead_type,
                            primary_goal: version.generation_context.metadata.primary_goal,
                            audience: version.generation_context.metadata.audience,
                          });
                        }
                        setProgressEvents(version.generation_context?.progress_events || []);
                        setRagContexts(version.generation_context?.rag_contexts || null);
                        loadTestAgent(version.session_id ?? null);
                      }}
                    >
                      <CardContent className="pt-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant={version.id === currentVersion?.id ? "default" : "outline"}>
                              Version {version.version_number}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(version.created_at).toLocaleString()}
                            </span>
                            {version.generation_context?.quality_validation?.score && (
                              <Badge variant="outline" className="text-xs">
                                Score: {version.generation_context.quality_validation.score}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {version.id === currentVersion?.id && (
                              <Badge variant="secondary">Current</Badge>
                            )}
                            {version.version_number > 1 && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation(); // Prevent card click
                                  const previousVersion = allVersions.find(
                                    v => v.version_number === version.version_number - 1
                                  );
                                  if (previousVersion) {
                                    setComparisonVersions({
                                      original: previousVersion,
                                      compared: version
                                    });
                                    setShowVersionComparison(true);
                                  }
                                }}
                              >
                                <GitBranch size={12} className="mr-1" />
                                Compare with v{version.version_number - 1}
                              </Button>
                            )}
                          </div>
                        </div>

                        {version.generation_context?.changes_summary && (
                          <div className="text-xs">
                            <p className="font-medium">Changes:</p>
                            <p className="text-muted-foreground">{version.generation_context.changes_summary}</p>
                          </div>
                        )}

                        <div>
                          <p className="text-xs font-medium mb-2">Base Prompt Preview</p>
                          <ScrollArea className="h-[120px] text-xs bg-secondary p-2 rounded font-mono">
                            {version.base_prompt}
                          </ScrollArea>
                        </div>

                        <div>
                          <p className="text-xs font-medium mb-2">States</p>
                          <div className="space-y-2">
                            {version.states.map((state: any) => {
                              const stateKey = `version_${version.id}_${state.name}`;
                              const isOpen = Boolean(expandedPrompts[stateKey]);
                              return (
                                <Collapsible
                                  key={`${version.id}-${state.name}`}
                                  open={isOpen}
                                  onOpenChange={(open) => togglePrompt(stateKey, open)}
                                >
                                  <div className="flex items-center justify-between text-xs">
                                    <CollapsibleTrigger className="flex items-center gap-2 text-left hover:text-primary">
                                      {isOpen ? <CaretDown size={12} /> : <CaretRight size={12} />}
                                      <Badge variant="outline" className="text-[11px]">
                                        {state.name}
                                      </Badge>
                                      <span className="text-muted-foreground">
                                        ({state.state_prompt?.length || 0} chars)
                                      </span>
                                    </CollapsibleTrigger>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setStatePromptDialogOpen(state.name)}
                                      className="h-6 px-2 text-[11px]"
                                    >
                                      <ArrowsOut size={12} />
                                    </Button>
                                  </div>
                                  <CollapsibleContent className="mt-1">
                                    <ScrollArea className="h-[160px] text-[11px] bg-secondary/40 p-2 rounded border">
                                      <pre className="whitespace-pre-wrap font-mono">
                                        {state.state_prompt || "No content"}
                                      </pre>
                                    </ScrollArea>
                                  </CollapsibleContent>
                                </Collapsible>
                              );
                            })}
                          </div>
                        </div>

                        {version.generation_context && Object.keys(version.generation_context).length > 0 && (
                          <div>
                            <p className="text-xs font-medium mb-1">Generation Context</p>
                            <ScrollArea className="h-[80px] text-xs bg-secondary p-2 rounded">
                              <pre className="font-mono">
                                {JSON.stringify(version.generation_context, null, 2)}
                              </pre>
                            </ScrollArea>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Source Tab - Markdown Editor */}
        <TabsContent value="source" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code size={20} />
                Markdown Source Editor
              </CardTitle>
              <CardDescription>
                {currentVersion?.markdown_source
                  ? "Edit the original markdown source and recompile to JSON"
                  : "Legacy version (JSON only) - decompiled to markdown for editing"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {/* Left Panel: Markdown Editor */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Markdown Source</label>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(editedMarkdown, "markdown source")}
                      >
                        <Copy size={14} className="mr-1" />
                        Copy
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    value={editedMarkdown}
                    onChange={(e) => setEditedMarkdown(e.target.value)}
                    className="font-mono text-xs h-[500px] resize-none"
                    placeholder="# BASE_PROMPT&#10;&#10;Your agent prompt here...&#10;&#10;# WARM_INTRO&#10;&#10;State prompt here..."
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={recompileMarkdown}
                      disabled={recompiling || loading}
                      className="flex-1"
                    >
                      {recompiling ? "Compiling..." : "Recompile to JSON"}
                    </Button>
                    <Button
                      onClick={saveEditedVersion}
                      disabled={!compiledPreview || loading}
                      variant="secondary"
                      className="flex-1"
                    >
                      Save as New Version
                    </Button>
                  </div>
                  {compileError && (
                    <div className="bg-destructive/10 border border-destructive/20 rounded p-3">
                      <p className="text-xs font-medium text-destructive">Compilation Error:</p>
                      <p className="text-xs text-destructive/80 mt-1">{compileError}</p>
                    </div>
                  )}
                </div>

                {/* Right Panel: Compiled JSON Preview */}
                <div className="space-y-3">
                  <label className="text-sm font-medium">Compiled JSON Preview</label>
                  {compiledPreview ? (
                    <ScrollArea className="h-[500px] border rounded">
                      <pre className="text-xs font-mono p-3 whitespace-pre-wrap">
                        {JSON.stringify({
                          base_prompt: compiledPreview.base_prompt,
                          states: compiledPreview.states
                        }, null, 2)}
                      </pre>
                    </ScrollArea>
                  ) : (
                    <div className="h-[500px] border rounded flex items-center justify-center bg-secondary/20">
                      <div className="text-center text-sm text-muted-foreground space-y-2">
                        <Code size={32} className="mx-auto opacity-50" />
                        <p>Click "Recompile to JSON" to preview</p>
                      </div>
                    </div>
                  )}
                  {compiledPreview && (
                    <div className="bg-primary/10 border border-primary/20 rounded p-3">
                      <p className="text-xs font-medium">✓ Compilation successful</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Base prompt: {compiledPreview.base_prompt.length} chars, {compiledPreview.states.length} states
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Publish Tab */}
        <TabsContent value="publish" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Placeholder Suggestions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cpu size={20} />
                  Auto-Generate Placeholders
                </CardTitle>
                <CardDescription>
                  Let the Placeholder Analyzer LLM identify customizable fields
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!placeholders ? (
                  <div className="space-y-4">
                    <div className="bg-secondary p-3 rounded text-xs space-y-2">
                      <p className="font-medium">Analyzer LLM Settings:</p>
                      <div className="space-y-1 text-muted-foreground">
                        <p>Model: Claude Sonnet 4.5</p>
                        <p>Temperature: 0.1 (high precision)</p>
                        <p>Task: Identify 8-12 balanced customization points</p>
                      </div>
                    </div>

                    <Button onClick={() => suggestPlaceholders()} disabled={loading} className="w-full">
                      <Sparkle className="mr-2" size={16} />
                      Analyze & Suggest Placeholders
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">
                        {placeholders.total_count} Placeholders Identified
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={loading}
                        onClick={handleReanalyzePlaceholders}
                      >
                        Re-analyze
                      </Button>
                    </div>

                    <ScrollArea className="h-[400px]">
                      <div className="space-y-2">
                        {placeholders.suggested_placeholders?.map((ph: any, idx: number) => (
                          <Card key={idx} className="border-muted">
                            <CardContent className="pt-3 space-y-2">
                              <div className="flex items-start justify-between">
                                <p className="font-mono text-xs font-semibold">
                                  {ph.token}
                                </p>
                                <Badge variant="outline" className="text-xs">
                                  {ph.semantic_key}
                                </Badge>
                              </div>
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>{ph.frontend_label}</span>
                                <span>{ph.required ? "Required" : "Optional"}</span>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {ph.description}
                              </p>
                              {ph.default_value && (
                                <p className="text-xs">
                                  <span className="text-muted-foreground">Default:</span>{" "}
                                  {ph.default_value}
                                </p>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                        {placeholders.suggested_editable_guidelines?.length ? (
                          <>
                            <Separator className="my-3" />
                            <p className="text-xs font-medium text-muted-foreground">
                              Conversation flow edits suggested:
                            </p>
                            {placeholders.suggested_editable_guidelines.map(
                              (guideline: any, idx: number) => (
                                <Card key={`guideline-${idx}`} className="border-muted">
                                  <CardContent className="pt-3 space-y-2">
                                    <div className="flex items-start justify-between">
                                      <p className="font-mono text-xs font-semibold">
                                        {guideline.placeholder_token}
                                      </p>
                                      <Badge variant="outline" className="text-xs">
                                        {guideline.semantic_key}
                                      </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      {guideline.location}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {guideline.description}
                                    </p>
                                    {guideline.default_instruction && (
                                      <p className="text-xs">
                                        <span className="text-muted-foreground">Default:</span>{" "}
                                        {guideline.default_instruction}
                                      </p>
                                    )}
                                  </CardContent>
                                </Card>
                              )
                            )}
                          </>
                        ) : null}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Publish Template */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload size={20} />
                  Publish to Agent Templates
                </CardTitle>
                <CardDescription>
                  Deploy this prompt to make it available to users
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {currentVersion && (
                  <div className="flex items-center justify-between rounded-md border border-dashed border-muted-foreground/30 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                    <span>
                      Publishing from prompt version{" "}
                      <span className="font-semibold text-foreground">
                        #{currentVersion.version_number}
                      </span>
                    </span>
                    <span>
                      Saved{" "}
                      {new Date(currentVersion.created_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium">Template Name</label>
                  <Input
                    placeholder="e.g., Commercial Real Estate Investor"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Template Type</label>
                  <Input
                    placeholder="e.g., real-estate-investor"
                    value={templateType}
                    onChange={(e) => setTemplateType(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Lowercase with hyphens, used for API references
                  </p>
                </div>

                <Separator />

                <div className="space-y-6">
                  {placeholderSections.map((section) => (
                    <div key={section.id} className="border rounded-lg p-4 space-y-4 bg-muted/20">
                      <div className="flex flex-col md:flex-row gap-3">
                        <div className="flex-1 space-y-1">
                          <label className="text-sm font-medium">Section Title</label>
                          <Input
                            value={section.title}
                            onChange={(e) =>
                              updateSectionMeta(section.id, { title: e.target.value })
                            }
                          />
                        </div>
                        <div className="flex-1 space-y-1">
                          <label className="text-sm font-medium">Section Subtitle</label>
                          <Input
                            value={section.subtitle}
                            onChange={(e) =>
                              updateSectionMeta(section.id, { subtitle: e.target.value })
                            }
                          />
                        </div>
                      </div>

                      <div className="space-y-3">
                        {section.fields.map((field) => {
                          const suggestion = placeholderSuggestionOptions.find(
                            (opt) => opt.alias === field.alias
                          );
                          return (
                            <div
                              key={field.id}
                              className="border rounded-md bg-secondary/20 p-3 space-y-3"
                            >
                              <div className="grid md:grid-cols-3 gap-3">
                                <div className="space-y-1">
                                  <label className="text-sm font-medium">
                                    Placeholder Alias
                                  </label>
                                  <Input
                                    list="placeholder-aliases"
                                    value={field.alias}
                                    onChange={(e) =>
                                      handleAliasChange(section.id, field, e.target.value)
                                    }
                                    placeholder="e.g., AIAgentName"
                                  />
                                  {suggestion?.description && (
                                    <p className="text-xs text-muted-foreground">
                                      {suggestion.description}
                                    </p>
                                  )}
                                </div>
                                <div className="space-y-1">
                                  <label className="text-sm font-medium">Config Path</label>
                                  <Input
                                    value={field.configPath}
                                    onChange={(e) =>
                                      handleFieldValueChange(
                                        section.id,
                                        field.id,
                                        "configPath",
                                        e.target.value
                                      )
                                    }
                                    placeholder="identity.agentName"
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    Path within agent configuration where this value is stored.
                                  </p>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-sm font-medium">Input Type</label>
                                  <select
                                    value={field.component}
                                    onChange={(e) =>
                                      handleFieldValueChange(
                                        section.id,
                                        field.id,
                                        "component",
                                        e.target.value as PlaceholderComponentType
                                      )
                                    }
                                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                  >
                                    <option value="text">Text (single-line)</option>
                                    <option value="textarea">Textarea (multi-line)</option>
                                    <option value="number">Number</option>
                                    <option value="trait_selector">Trait Selector</option>
                                  </select>
                                </div>
                              </div>

                              <div className="grid md:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <label className="text-sm font-medium">Field Label</label>
                                  <Input
                                    value={field.label}
                                    onChange={(e) =>
                                      handleFieldValueChange(
                                        section.id,
                                        field.id,
                                        "label",
                                        e.target.value
                                      )
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-sm font-medium">Helper Text</label>
                                  <Textarea
                                    value={field.helperText}
                                    onChange={(e) =>
                                      handleFieldValueChange(
                                        section.id,
                                        field.id,
                                        "helperText",
                                        e.target.value
                                      )
                                    }
                                    rows={2}
                                  />
                                </div>
                              </div>

                              <div className="grid md:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <label className="text-sm font-medium">Placeholder Text</label>
                                  <Input
                                    value={field.placeholderText}
                                    onChange={(e) =>
                                      handleFieldValueChange(
                                        section.id,
                                        field.id,
                                        "placeholderText",
                                        e.target.value
                                      )
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-sm font-medium">
                                    Default Value (used if config empty)
                                  </label>
                                  <Textarea
                                    value={field.defaultValue}
                                    onChange={(e) =>
                                      handleFieldValueChange(
                                        section.id,
                                        field.id,
                                        "defaultValue",
                                        e.target.value
                                      )
                                    }
                                    rows={3}
                                  />
                                </div>
                              </div>

                              <div className="flex items-center justify-between">
                                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <input
                                    type="checkbox"
                                    checked={field.required}
                                    onChange={(e) =>
                                      handleFieldValueChange(
                                        section.id,
                                        field.id,
                                        "required",
                                        e.target.checked
                                      )
                                    }
                                  />
                                  Required field
                                </label>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeFieldFromSection(section.id, field.id)}
                                  className="text-destructive hover:text-destructive flex items-center gap-1"
                                >
                                  <Trash size={14} />
                                  Remove
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => addFieldToSection(section.id)}
                        >
                          Add Placeholder
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {unassignedPlaceholderOptions.length > 0 && (
                  <Alert>
                    <AlertTitle>Unassigned placeholders</AlertTitle>
                    <AlertDescription>
                      {unassignedPlaceholderOptions.map((option) => option.alias).join(", ")}
                    </AlertDescription>
                  </Alert>
                )}

                {placeholderSuggestionOptions.length > 0 && (
                  <datalist id="placeholder-aliases">
                    {placeholderSuggestionOptions.map((option) => (
                      <option key={option.alias} value={option.alias}>
                        {option.alias}
                      </option>
                    ))}
                  </datalist>
                )}

                <Button
                  onClick={publishTemplate}
                  disabled={loading || !templateName || !templateType}
                  className="w-full"
                >
                  <CheckCircle className="mr-2" size={16} />
                  Publish Template
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Current Version Summary */}
          {currentVersion && (
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle className="text-sm">Current Version Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Version</p>
                    <p className="font-semibold">{currentVersion.version_number}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">States</p>
                    <p className="font-semibold">{currentVersion.states.length}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Created</p>
                    <p className="font-semibold text-xs">
                      {new Date(currentVersion.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Base Prompt Preview</p>
                  <ScrollArea className="h-[100px] text-xs bg-secondary p-2 rounded font-mono">
                    {currentVersion.base_prompt}
                  </ScrollArea>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Base Prompt Expand Dialog */}
      <Dialog open={basePromptDialogOpen} onOpenChange={setBasePromptDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Base Prompt</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(currentVersion?.base_prompt || "", "base prompt")}
              >
                <Copy size={14} className="mr-1" />
                Copy
              </Button>
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[70vh] mt-4">
            <pre className="text-sm font-mono whitespace-pre-wrap bg-secondary p-4 rounded">
              {currentVersion?.base_prompt}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* State Prompt Expand Dialog */}
      {statePromptDialogOpen && (
        <Dialog open={!!statePromptDialogOpen} onOpenChange={() => setStatePromptDialogOpen(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <span>State: {statePromptDialogOpen}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const state = currentVersion?.states.find(s => s.name === statePromptDialogOpen);
                    copyToClipboard(state?.state_prompt || "", `${statePromptDialogOpen} state`);
                  }}
                >
                  <Copy size={14} className="mr-1" />
                  Copy
                </Button>
              </DialogTitle>
            </DialogHeader>
            <ScrollArea className="h-[70vh] mt-4">
              <pre className="text-sm font-mono whitespace-pre-wrap bg-secondary p-4 rounded">
                {currentVersion?.states.find(s => s.name === statePromptDialogOpen)?.state_prompt}
              </pre>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      )}

      {/* Version Comparison Modal */}
      {showVersionComparison && comparisonVersions && (
        <VersionComparisonModal
          open={showVersionComparison}
          onOpenChange={setShowVersionComparison}
          originalVersion={comparisonVersions.original}
          comparedVersion={comparisonVersions.compared}
          onSelectVersion={(versionId) => {
            // Find and set the selected version as current
            const selectedVersion = allVersions.find(v => v.id === versionId);
            if (selectedVersion) {
              setCurrentVersion(selectedVersion);
              setPromptVersionId(selectedVersion.id);
              if (selectedVersion.generation_context?.metadata) {
                setConfidenceMeta({
                  overall_confidence: selectedVersion.generation_context.metadata.overall_confidence,
                  lead_type: selectedVersion.generation_context.metadata.lead_type,
                  primary_goal: selectedVersion.generation_context.metadata.primary_goal,
                  audience: selectedVersion.generation_context.metadata.audience,
                });
              }
              setProgressEvents(selectedVersion.generation_context?.progress_events || []);
              setRagContexts(selectedVersion.generation_context?.rag_contexts || null);
              setQualityValidation(selectedVersion.generation_context?.quality_validation || null);
              loadTestAgent(selectedVersion.session_id ?? null);
              toast({
                title: `Switched to Version ${selectedVersion.version_number}`,
                description: `Quality score: ${selectedVersion.generation_context?.quality_validation?.score || 'N/A'}/100`
              });
            }
          }}
        />
      )}
    </div>
  );
}
