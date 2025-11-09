/**
 * Test Prompt Sandbox - Rapid Testing & Iteration
 *
 * This edge function provides a sandbox environment for testing generated prompts:
 * 1. Create temporary test agents on Retell
 * 2. Submit feedback and automatically refine prompts
 * 3. Delete test agents when done
 *
 * Actions:
 * - create: Create test agent on Retell
 * - refine_with_feedback: Wrapper for analyze_feedback + refine_prompts
 * - delete: Remove test agent from Retell and mark as deleted
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.0";
import { requireAdmin } from "../_shared/authorization.ts";
import {
  createRetellLLM,
  createRetellAgent,
  deleteRetellAgent,
  deleteRetellLLM,
  updateRetellLLM,
  isRetellAvailable,
} from "../_shared/retell-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const developerEmail = Deno.env.get("DEVELOPER_EMAIL") ?? "yevgeniymatsay@kw.com";

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

type SandboxRequest =
  | {
      action: "create";
      prompt_version_id: string;
      test_name?: string;
    }
  | {
      action: "refine_with_feedback";
      prompt_version_id: string;
      transcript?: string;
      user_rating: number;
      user_notes: string;
    }
  | {
      action: "delete";
      test_agent_id: string;
    }
  | {
      action: "update";
      test_agent_id: string;
      prompt_version_id: string;
    };

const handler = requireAdmin(async (req, user) => {
  // Additional check: only developer can access
  if (user.email?.toLowerCase() !== developerEmail.toLowerCase()) {
    return new Response(
      JSON.stringify({ error: "Unauthorized. This tool is for developer use only." }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const requestBody: SandboxRequest = await req.json();

  // ============================================================================
  // ACTION: Create Test Agent
  // ============================================================================
  if (requestBody.action === "create") {
    const { prompt_version_id, test_name } = requestBody;

    if (!isRetellAvailable()) {
      return new Response(
        JSON.stringify({ error: "Retell API not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load prompt version
    const { data: promptVersion, error: versionError } = await supabase
      .from("prompt_versions")
      .select(`
        id,
        session_id,
        version_number,
        base_prompt,
        states,
        prompt_generation_sessions!inner(
          user_id,
          agent_type_name
        )
      `)
      .eq("id", prompt_version_id)
      .single();

    if (versionError || !promptVersion) {
      console.error("Prompt version not found:", versionError);
      return new Response(
        JSON.stringify({ error: "Prompt version not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // @ts-ignore - Type inference issue
    if (promptVersion.prompt_generation_sessions.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "Unauthorized to test this prompt version" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // @ts-ignore
    const agentTypeName = promptVersion.prompt_generation_sessions.agent_type_name;
    const displayName = test_name || `[TEST] ${agentTypeName} v${promptVersion.version_number} - ${user.email}`;

    console.log("Creating test agent on Retell:", displayName);

    try {
      // Step 1: Create Retell LLM
      const { llm_id } = await createRetellLLM(
        promptVersion.base_prompt,
        promptVersion.states
      );

      // Step 2: Create Retell Agent
      const { agent_id } = await createRetellAgent(llm_id, displayName);

      // Step 3: Store in database
      const { data: testAgent, error: insertError } = await supabase
        .from("test_agents")
        .insert({
          user_id: user.id,
          prompt_version_id,
          retell_llm_id: llm_id,
          retell_agent_id: agent_id,
          test_name: displayName,
        })
        .select("id, retell_agent_id, retell_llm_id, created_at")
        .single();

      if (insertError || !testAgent) {
        console.error("Failed to store test agent:", insertError);
        // Try to clean up Retell resources
        await deleteRetellAgent(agent_id).catch(console.error);
        await deleteRetellLLM(llm_id).catch(console.error);

        return new Response(
          JSON.stringify({ error: "Failed to store test agent" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          test_agent_id: testAgent.id,
          retell_agent_id: testAgent.retell_agent_id,
          retell_llm_id: testAgent.retell_llm_id,
          test_name: displayName,
          created_at: testAgent.created_at,
          message: "Test agent created! Use Retell dashboard to make test calls.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (error) {
      console.error("Failed to create test agent:", error);
      return new Response(
        JSON.stringify({
          error: "Failed to create test agent on Retell",
          details: String(error),
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  // ============================================================================
  // ACTION: Refine with Feedback (Wrapper)
  // ============================================================================
  if (requestBody.action === "refine_with_feedback") {
    const { prompt_version_id, transcript, user_rating, user_notes } = requestBody;

    // Validate input
    if (!prompt_version_id || !user_rating || !user_notes) {
      return new Response(
        JSON.stringify({ error: "prompt_version_id, user_rating, and user_notes are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (user_rating < 1 || user_rating > 5) {
      return new Response(
        JSON.stringify({ error: "user_rating must be between 1 and 5" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Refining with feedback for prompt version:", prompt_version_id);

    // Helper to call edge functions internally
    const callEdgeFunction = async (functionName: string, payload: any) => {
      const response = await fetch(
        `${supabaseUrl}/functions/v1/${functionName}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseServiceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${functionName} failed (${response.status}): ${errorText}`);
      }

      return response.json();
    };

    try {
      // Step 1: Analyze feedback with Critic LLM
      console.log("Calling analyze_feedback...");
      const feedbackResult = await callEdgeFunction("analyze_feedback", {
        prompt_version_id,
        transcript: transcript || "No transcript provided",
        user_rating,
        user_notes,
      });

      console.log("Feedback analyzed. Evaluation ID:", feedbackResult.evaluation_id);

      // Step 2: Refine prompts based on evaluation
      console.log("Calling refine_prompts...");
      const refinementResult = await callEdgeFunction("refine_prompts", {
        prompt_version_id,
        evaluation_id: feedbackResult.evaluation_id,
      });

      console.log("Refinement complete. New version ID:", refinementResult.new_version_id);

      // Return combined result
      return new Response(
        JSON.stringify({
          evaluation_id: feedbackResult.evaluation_id,
          automated_analysis: feedbackResult.automated_analysis,
          improvement_suggestions: feedbackResult.improvement_suggestions,
          patterns_extracted: feedbackResult.patterns_extracted,
          new_version_id: refinementResult.new_version_id,
          version_number: refinementResult.version_number,
          changes_summary: refinementResult.changes_summary,
          base_prompt: refinementResult.base_prompt,
          states: refinementResult.states,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (error) {
      console.error("Failed to refine with feedback:", error);
      return new Response(
        JSON.stringify({
          error: "Failed to refine with feedback",
          details: String(error),
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  // ============================================================================
  // ACTION: Update Test Agent Prompts
  // ============================================================================
  if (requestBody.action === "update") {
    const { test_agent_id, prompt_version_id } = requestBody;

    if (!test_agent_id || !prompt_version_id) {
      return new Response(
        JSON.stringify({ error: "test_agent_id and prompt_version_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isRetellAvailable()) {
      return new Response(
        JSON.stringify({ error: "Retell API not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: testAgent, error: testAgentError } = await supabase
      .from("test_agents")
      .select("id, user_id, prompt_version_id, retell_llm_id, retell_agent_id, test_name")
      .eq("id", test_agent_id)
      .single();

    if (testAgentError || !testAgent) {
      return new Response(
        JSON.stringify({ error: "Test agent not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (testAgent.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "Unauthorized to update this test agent" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: promptVersion, error: versionError } = await supabase
      .from("prompt_versions")
      .select(`
        id,
        session_id,
        version_number,
        base_prompt,
        states,
        prompt_generation_sessions!inner(user_id)
      `)
      .eq("id", prompt_version_id)
      .single();

    if (versionError || !promptVersion) {
      return new Response(
        JSON.stringify({ error: "Prompt version not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // @ts-ignore
    if (promptVersion.prompt_generation_sessions.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "Unauthorized to use this prompt version" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    try {
      await updateRetellLLM(
        testAgent.retell_llm_id,
        promptVersion.base_prompt,
        promptVersion.states
      );

      const { error: updateError } = await supabase
        .from("test_agents")
        .update({
          prompt_version_id,
        })
        .eq("id", test_agent_id);

      if (updateError) {
        console.error("Failed to update test agent record:", updateError);
        return new Response(
          JSON.stringify({ error: "Prompt updated on Retell but database update failed" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          message: "Test agent prompts updated successfully",
          test_agent_id,
          prompt_version_id,
          test_name: testAgent.test_name,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (error) {
      console.error("Failed to update test agent prompts:", error);
      return new Response(
        JSON.stringify({ error: "Failed to update test agent prompts", details: String(error) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  // ============================================================================
  // ACTION: Delete Test Agent
  // ============================================================================
  if (requestBody.action === "delete") {
    const { test_agent_id } = requestBody;

    // Load test agent
    const { data: testAgent, error: fetchError } = await supabase
      .from("test_agents")
      .select("*")
      .eq("id", test_agent_id)
      .eq("user_id", user.id)
      .is("deleted_at", null) // Only active agents
      .single();

    if (fetchError || !testAgent) {
      console.error("Test agent not found:", fetchError);
      return new Response(
        JSON.stringify({ error: "Test agent not found or already deleted" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Deleting test agent:", test_agent_id);

    try {
      // Step 1: Delete from Retell
      await deleteRetellAgent(testAgent.retell_agent_id);
      await deleteRetellLLM(testAgent.retell_llm_id);

      // Step 2: Soft delete in database
      const { error: updateError } = await supabase
        .from("test_agents")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", test_agent_id);

      if (updateError) {
        console.error("Failed to update test agent:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to mark test agent as deleted" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Test agent deleted from Retell and marked as deleted",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (error) {
      console.error("Failed to delete test agent:", error);
      return new Response(
        JSON.stringify({
          error: "Failed to delete test agent from Retell",
          details: String(error),
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  // Invalid action
  return new Response(
    JSON.stringify({ error: "Invalid action. Must be: create, refine_with_feedback, or delete" }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});

serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return handler(req);
});
