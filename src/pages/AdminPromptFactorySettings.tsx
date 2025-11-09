import { FloppyDisk as Save, CircleNotch as Loader2, ArrowCounterClockwise, Sliders } from "@phosphor-icons/react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useSuccessFeedback } from "@/hooks/useSuccessFeedback";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface PromptFactorySettings {
  generator_temperature: number;
  generator_system_prompt: string | null;
  question_generator_temperature: number;
  refinement_temperature: number;
  script_analyzer_temperature: number;
  critic_temperature: number;
  critic_system_prompt: string | null;
  pattern_extractor_temperature: number;
  pattern_extractor_system_prompt: string | null;
  placeholder_analyzer_temperature: number;
  placeholder_analyzer_system_prompt: string | null;
  metadata_assessor_temperature: number;
  metadata_assessor_system_prompt: string | null;
}

const DEFAULT_SETTINGS: PromptFactorySettings = {
  generator_temperature: 0.2,
  generator_system_prompt: null,
  question_generator_temperature: 0.2,
  refinement_temperature: 0.1,
  script_analyzer_temperature: 0.2,
  critic_temperature: 0.1,
  critic_system_prompt: null,
  pattern_extractor_temperature: 0.1,
  pattern_extractor_system_prompt: null,
  placeholder_analyzer_temperature: 0.1,
  placeholder_analyzer_system_prompt: null,
  metadata_assessor_temperature: 0.1,
  metadata_assessor_system_prompt: null,
};

const DEFAULT_SYSTEM_PROMPT = `You are an expert at creating AI voice sales agent prompts.

Your goal is to create natural, conversational, and effective prompts based on the patterns and examples provided from the Knowledge Base.

## CRITICAL STRUCTURAL PRINCIPLES

Your prompts MUST use flow-based guidance, NOT numbered steps.

✅ CORRECT Structure (Flow-Based):
# BASE_PROMPT
## Opening Move
- Greet naturally and confirm identity
- Ask if it's a good time to talk

## Discovery Phase
- Ask what sparked their interest
- Listen completely before responding

❌ WRONG Structure (Numbered Steps):
# BASE_PROMPT
## Initial Contact Flow
1. Correct User Check
   - Ask if you are speaking to {{first_name}}
   - If not correct user: ask if this is the owner
2. Quick Purpose Check
   - State your name
   - Ask if they are open to an offer

### What to NEVER Include:
- Pre-scripted "power phrases" or "pattern interrupts"
- Literal percentages ("40% rapport, 60% closing")
- Multiple overlapping instruction sections
- Instructions to "sound natural" without teaching HOW
- Numbered procedural steps (1. 2. 3.)

### Principle-Driven Instructions (Not Prescriptions):
✅ GOOD: "Only ask questions that advance the goal"
❌ BAD: "Ask one question at a time and wait for response"`;

const DEFAULT_CRITIC_PROMPT = `Analyze this AI voice sales agent call transcript:

{{TRANSCRIPT}}

Evaluate the following dimensions:

1. **Verbosity** - Response length per turn (count sentences)
   - 1 = Too brief/abrupt
   - 3 = Perfect (1-2 sentences)
   - 5 = Too verbose/overwhelming

2. **Closing Effectiveness** - How well agent moved toward goal
   - Count closing attempts
   - Rate success: 1 (weak) to 5 (excellent)

3. **Objection Handling** - Response to resistance
   - Quality: 1 (poor) to 5 (excellent)
   - Did agent acknowledge, address, and advance?

4. **Unnatural Phrases** - Robotic/scripted language
   - List specific phrases that sound artificial

5. **Specific Issues** - Problems that hurt performance
   - Be concrete and actionable

6. **Strengths** - What the agent did well
   - Highlight effective techniques

7. **Improvement Suggestions** - Specific, actionable fixes
   - Focus on highest impact changes

8. **Prompt Structure Issues** - Meta-analysis
   - Does transcript suggest prompt is too prescriptive/robotic?
   - Evidence of forced phrases or unnatural patterns repeated?
   - Signs agent is following a rigid script vs adapting naturally?

Return ONLY valid JSON with scores and arrays.`;

const DEFAULT_PATTERN_EXTRACTOR_PROMPT = `Extract learnable patterns from this AI agent evaluation:

{{EVALUATION_DATA}}

Identify 1-3 patterns that should inform future prompt generations:

Pattern Types:
- best_practice: Techniques that worked well
- anti_pattern: Things to avoid
- closing_technique: Effective closing strategies
- objection_handling: How to handle specific objections
- verbosity_rule: Response length guidelines
- tone_guidance: Tone/style recommendations
- conversation_flow: Structural improvements
- prompt_structure: Structural issues with prompt itself
  * Use when agent sounds mechanical/robotic due to prompt structure

For each pattern, provide:
- pattern_type: One of the above
- agent_type_category: "cold_call", "warm_lead", or "all"
- pattern_summary: One sentence summary
- pattern_details: 2-4 sentences with specific guidance

Return ONLY valid JSON array.`;

const DEFAULT_PLACEHOLDER_ANALYZER_PROMPT = `Analyze these finalized AI agent prompts to identify user-customizable placeholders:

{{PROMPT_DATA}}

Identify placeholders for:
1. Names (agent name, company name, expert name, etc.)
2. Timeframes (closing time, offer delivery, etc.)
3. Values/numbers (years in business, properties purchased, etc.)
4. Customizable copy (value propositions, specialties, etc.)

Also identify conversation flow instructions users should be able to edit:
- Opening approach
- Permission check language
- Objection responses
- Closing language

BALANCE: Target 8-12 placeholders total. Not overwhelming for non-technical users.

Return ONLY valid JSON with suggested_placeholders and suggested_editable_guidelines arrays.`;

const DEFAULT_METADATA_ASSESSOR_PROMPT = `Analyze this metadata extracted from a conversation about creating an AI agent:

{{CONVERSATION_AND_METADATA}}

For each field, rate its SPECIFICITY and ACTIONABILITY (0-1):

**Confidence Scoring Guide:**
- 0.0-0.3 = Too vague (e.g., "leads", "people", "customers", "sell")
- 0.4-0.6 = Somewhat specific (e.g., "property owners", "schedule calls")
- 0.7-0.9 = Specific (e.g., "commercial property owners facing foreclosure")
- 1.0 = Very specific with context

IMPORTANT: Set needs_clarification=true if confidence < 0.6

Return ONLY valid JSON with confidence scores for lead_type, primary_goal, and audience.`;

export default function AdminPromptFactorySettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const { toast } = useToast();
  const { showSuccess } = useSuccessFeedback();

  const [settings, setSettings] = useState<PromptFactorySettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('get-prompt-factory-settings');

      if (error) throw error;

      setSettings({
        generator_temperature: data.generator_temperature ?? DEFAULT_SETTINGS.generator_temperature,
        generator_system_prompt: data.generator_system_prompt ?? null,
        question_generator_temperature: data.question_generator_temperature ?? DEFAULT_SETTINGS.question_generator_temperature,
        refinement_temperature: data.refinement_temperature ?? DEFAULT_SETTINGS.refinement_temperature,
        script_analyzer_temperature: data.script_analyzer_temperature ?? DEFAULT_SETTINGS.script_analyzer_temperature,
        critic_temperature: data.critic_temperature ?? DEFAULT_SETTINGS.critic_temperature,
        critic_system_prompt: data.critic_system_prompt ?? null,
        pattern_extractor_temperature: data.pattern_extractor_temperature ?? DEFAULT_SETTINGS.pattern_extractor_temperature,
        pattern_extractor_system_prompt: data.pattern_extractor_system_prompt ?? null,
        placeholder_analyzer_temperature: data.placeholder_analyzer_temperature ?? DEFAULT_SETTINGS.placeholder_analyzer_temperature,
        placeholder_analyzer_system_prompt: data.placeholder_analyzer_system_prompt ?? null,
        metadata_assessor_temperature: data.metadata_assessor_temperature ?? DEFAULT_SETTINGS.metadata_assessor_temperature,
        metadata_assessor_system_prompt: data.metadata_assessor_system_prompt ?? null,
      });
    } catch (error: any) {
      console.error('Failed to fetch settings:', error);
      toast({
        title: "Load Failed",
        description: "Using default settings. " + (error.message || "Unknown error"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSettingChange = (field: keyof PromptFactorySettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('update-prompt-factory-settings', {
        body: settings
      });

      if (error) throw error;

      showSuccess("Settings saved", "Prompt Factory settings updated successfully");
      setHasChanges(false);
    } catch (error: any) {
      console.error('Save error:', error);
      toast({
        title: "Save Failed",
        description: error.message || "Failed to save settings. Please try again.",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefaults = () => {
    setSettings({
      ...DEFAULT_SETTINGS,
      generator_system_prompt: DEFAULT_SYSTEM_PROMPT,
    });
    setHasChanges(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Sliders className="h-8 w-8" />
            Prompt Factory Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure LLM parameters and system prompts for prompt generation
          </p>
        </div>
        <div className="flex gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline">
                <ArrowCounterClockwise className="h-4 w-4 mr-2" />
                Reset to Defaults
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset to default settings?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will reset all temperatures to their default values and restore the default system prompt.
                  You can save these changes or cancel.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleResetToDefaults}>
                  Reset
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {hasChanges && (
            <Button onClick={handleSaveSettings} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>LLM Temperature Settings</CardTitle>
          <CardDescription>
            Control the creativity and randomness of LLM outputs. Higher values (closer to 1.0) = more creative and varied. Lower values (closer to 0.0) = more deterministic and consistent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Generator Temperature */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-semibold">Generator LLM Temperature</Label>
                <p className="text-sm text-muted-foreground">
                  Controls creativity when generating agent prompts
                </p>
              </div>
              <div className="text-2xl font-bold text-primary">
                {settings.generator_temperature.toFixed(2)}
              </div>
            </div>
            <Slider
              value={[settings.generator_temperature]}
              onValueChange={([value]) => handleSettingChange('generator_temperature', value)}
              min={0}
              max={1}
              step={0.05}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0.0 (Deterministic)</span>
              <span className="text-primary font-medium">Default: 0.2</span>
              <span>1.0 (Creative)</span>
            </div>
          </div>

          <Separator />

          {/* Question Generator Temperature */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-semibold">Question Generator Temperature</Label>
                <p className="text-sm text-muted-foreground">
                  Controls variety in follow-up questions during metadata extraction
                </p>
              </div>
              <div className="text-2xl font-bold text-primary">
                {settings.question_generator_temperature.toFixed(2)}
              </div>
            </div>
            <Slider
              value={[settings.question_generator_temperature]}
              onValueChange={([value]) => handleSettingChange('question_generator_temperature', value)}
              min={0}
              max={1}
              step={0.05}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0.0 (Deterministic)</span>
              <span className="text-primary font-medium">Default: 0.2</span>
              <span>1.0 (Creative)</span>
            </div>
          </div>

          <Separator />

          {/* Refinement Temperature */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-semibold">Refinement LLM Temperature</Label>
                <p className="text-sm text-muted-foreground">
                  Controls creativity when improving prompts based on feedback
                </p>
              </div>
              <div className="text-2xl font-bold text-primary">
                {settings.refinement_temperature.toFixed(2)}
              </div>
            </div>
            <Slider
              value={[settings.refinement_temperature]}
              onValueChange={([value]) => handleSettingChange('refinement_temperature', value)}
              min={0}
              max={1}
              step={0.05}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0.0 (Deterministic)</span>
              <span className="text-primary font-medium">Default: 0.1</span>
              <span>1.0 (Creative)</span>
            </div>
          </div>

          <Separator />

          {/* Script Analyzer Temperature */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-semibold">Script Analyzer Temperature</Label>
                <p className="text-sm text-muted-foreground">
                  Controls analysis consistency when examining example conversation scripts
                </p>
              </div>
              <div className="text-2xl font-bold text-primary">
                {settings.script_analyzer_temperature.toFixed(2)}
              </div>
            </div>
            <Slider
              value={[settings.script_analyzer_temperature]}
              onValueChange={([value]) => handleSettingChange('script_analyzer_temperature', value)}
              min={0}
              max={1}
              step={0.05}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0.0 (Deterministic)</span>
              <span className="text-primary font-medium">Default: 0.2</span>
              <span>1.0 (Creative)</span>
            </div>
          </div>

          <Separator />

          {/* Critic LLM Temperature */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-semibold">Critic LLM Temperature</Label>
                <p className="text-sm text-muted-foreground">
                  Controls consistency when analyzing call transcripts for quality
                </p>
              </div>
              <div className="text-2xl font-bold text-primary">
                {settings.critic_temperature.toFixed(2)}
              </div>
            </div>
            <Slider
              value={[settings.critic_temperature]}
              onValueChange={([value]) => handleSettingChange('critic_temperature', value)}
              min={0}
              max={1}
              step={0.05}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0.0 (Deterministic)</span>
              <span className="text-primary font-medium">Default: 0.1</span>
              <span>1.0 (Creative)</span>
            </div>
          </div>

          <Separator />

          {/* Pattern Extractor Temperature */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-semibold">Pattern Extractor Temperature</Label>
                <p className="text-sm text-muted-foreground">
                  Controls consistency when extracting learning patterns from evaluations
                </p>
              </div>
              <div className="text-2xl font-bold text-primary">
                {settings.pattern_extractor_temperature.toFixed(2)}
              </div>
            </div>
            <Slider
              value={[settings.pattern_extractor_temperature]}
              onValueChange={([value]) => handleSettingChange('pattern_extractor_temperature', value)}
              min={0}
              max={1}
              step={0.05}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0.0 (Deterministic)</span>
              <span className="text-primary font-medium">Default: 0.1</span>
              <span>1.0 (Creative)</span>
            </div>
          </div>

          <Separator />

          {/* Placeholder Analyzer Temperature */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-semibold">Placeholder Analyzer Temperature</Label>
                <p className="text-sm text-muted-foreground">
                  Controls consistency when suggesting placeholders for prompts
                </p>
              </div>
              <div className="text-2xl font-bold text-primary">
                {settings.placeholder_analyzer_temperature.toFixed(2)}
              </div>
            </div>
            <Slider
              value={[settings.placeholder_analyzer_temperature]}
              onValueChange={([value]) => handleSettingChange('placeholder_analyzer_temperature', value)}
              min={0}
              max={1}
              step={0.05}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0.0 (Deterministic)</span>
              <span className="text-primary font-medium">Default: 0.1</span>
              <span>1.0 (Creative)</span>
            </div>
          </div>

          <Separator />

          {/* Metadata Assessor Temperature */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-semibold">Metadata Assessor Temperature</Label>
                <p className="text-sm text-muted-foreground">
                  Controls consistency when evaluating metadata quality during generation
                </p>
              </div>
              <div className="text-2xl font-bold text-primary">
                {settings.metadata_assessor_temperature.toFixed(2)}
              </div>
            </div>
            <Slider
              value={[settings.metadata_assessor_temperature]}
              onValueChange={([value]) => handleSettingChange('metadata_assessor_temperature', value)}
              min={0}
              max={1}
              step={0.05}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0.0 (Deterministic)</span>
              <span className="text-primary font-medium">Default: 0.1</span>
              <span>1.0 (Creative)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Generator System Prompt</CardTitle>
          <CardDescription>
            Customize the system prompt used by the Generator LLM. Leave empty to use the hardcoded default. This prompt includes critical structural principles for generating high-quality, flow-based agent prompts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="system-prompt">Custom System Prompt (Optional)</Label>
            <Textarea
              id="system-prompt"
              value={settings.generator_system_prompt || ""}
              onChange={(e) => handleSettingChange('generator_system_prompt', e.target.value || null)}
              placeholder="Leave empty to use default prompt with CRITICAL STRUCTURAL PRINCIPLES..."
              className="min-h-[400px] font-mono text-sm"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              {settings.generator_system_prompt
                ? `Custom prompt: ${settings.generator_system_prompt.length} characters`
                : "Using default system prompt"}
            </p>
          </div>

          {!settings.generator_system_prompt && (
            <div className="p-4 bg-muted rounded-lg border">
              <p className="text-sm font-medium mb-2">Default Prompt Preview:</p>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono max-h-[200px] overflow-y-auto">
                {DEFAULT_SYSTEM_PROMPT}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Critic LLM System Prompt</CardTitle>
          <CardDescription>
            Customize the system prompt used by the Critic LLM when analyzing call transcripts. Leave empty to use the hardcoded default.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="critic-prompt">Custom System Prompt (Optional)</Label>
            <Textarea
              id="critic-prompt"
              value={settings.critic_system_prompt || ""}
              onChange={(e) => handleSettingChange('critic_system_prompt', e.target.value || null)}
              placeholder="Leave empty to use default prompt for transcript analysis..."
              className="min-h-[300px] font-mono text-sm"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              {settings.critic_system_prompt
                ? `Custom prompt: ${settings.critic_system_prompt.length} characters`
                : "Using default system prompt"}
            </p>
          </div>

          {!settings.critic_system_prompt && (
            <div className="p-4 bg-muted rounded-lg border">
              <p className="text-sm font-medium mb-2">Default Prompt Preview:</p>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono max-h-[200px] overflow-y-auto">
                {DEFAULT_CRITIC_PROMPT}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pattern Extractor System Prompt</CardTitle>
          <CardDescription>
            Customize the system prompt used by the Pattern Extractor LLM when extracting learning patterns from evaluations. Leave empty to use the hardcoded default.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pattern-extractor-prompt">Custom System Prompt (Optional)</Label>
            <Textarea
              id="pattern-extractor-prompt"
              value={settings.pattern_extractor_system_prompt || ""}
              onChange={(e) => handleSettingChange('pattern_extractor_system_prompt', e.target.value || null)}
              placeholder="Leave empty to use default prompt for pattern extraction..."
              className="min-h-[300px] font-mono text-sm"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              {settings.pattern_extractor_system_prompt
                ? `Custom prompt: ${settings.pattern_extractor_system_prompt.length} characters`
                : "Using default system prompt"}
            </p>
          </div>

          {!settings.pattern_extractor_system_prompt && (
            <div className="p-4 bg-muted rounded-lg border">
              <p className="text-sm font-medium mb-2">Default Prompt Preview:</p>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono max-h-[200px] overflow-y-auto">
                {DEFAULT_PATTERN_EXTRACTOR_PROMPT}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Placeholder Analyzer System Prompt</CardTitle>
          <CardDescription>
            Customize the system prompt used by the Placeholder Analyzer LLM when suggesting placeholders. Leave empty to use the hardcoded default.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="placeholder-analyzer-prompt">Custom System Prompt (Optional)</Label>
            <Textarea
              id="placeholder-analyzer-prompt"
              value={settings.placeholder_analyzer_system_prompt || ""}
              onChange={(e) => handleSettingChange('placeholder_analyzer_system_prompt', e.target.value || null)}
              placeholder="Leave empty to use default prompt for placeholder analysis..."
              className="min-h-[300px] font-mono text-sm"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              {settings.placeholder_analyzer_system_prompt
                ? `Custom prompt: ${settings.placeholder_analyzer_system_prompt.length} characters`
                : "Using default system prompt"}
            </p>
          </div>

          {!settings.placeholder_analyzer_system_prompt && (
            <div className="p-4 bg-muted rounded-lg border">
              <p className="text-sm font-medium mb-2">Default Prompt Preview:</p>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono max-h-[200px] overflow-y-auto">
                {DEFAULT_PLACEHOLDER_ANALYZER_PROMPT}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Metadata Assessor System Prompt</CardTitle>
          <CardDescription>
            Customize the system prompt used by the Metadata Assessor LLM when evaluating metadata quality. Leave empty to use the hardcoded default.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="metadata-assessor-prompt">Custom System Prompt (Optional)</Label>
            <Textarea
              id="metadata-assessor-prompt"
              value={settings.metadata_assessor_system_prompt || ""}
              onChange={(e) => handleSettingChange('metadata_assessor_system_prompt', e.target.value || null)}
              placeholder="Leave empty to use default prompt for metadata assessment..."
              className="min-h-[300px] font-mono text-sm"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              {settings.metadata_assessor_system_prompt
                ? `Custom prompt: ${settings.metadata_assessor_system_prompt.length} characters`
                : "Using default system prompt"}
            </p>
          </div>

          {!settings.metadata_assessor_system_prompt && (
            <div className="p-4 bg-muted rounded-lg border">
              <p className="text-sm font-medium mb-2">Default Prompt Preview:</p>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono max-h-[200px] overflow-y-auto">
                {DEFAULT_METADATA_ASSESSOR_PROMPT}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      {hasChanges && (
        <div className="fixed bottom-6 right-6 z-50">
          <Card className="shadow-lg">
            <CardContent className="flex items-center gap-4 p-4">
              <div>
                <p className="font-medium">Unsaved Changes</p>
                <p className="text-sm text-muted-foreground">
                  You have unsaved changes to your settings
                </p>
              </div>
              <Button onClick={handleSaveSettings} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Now
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
