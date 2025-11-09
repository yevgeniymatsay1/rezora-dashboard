import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getGlobalRetellApiKey } from '../_shared/retell-api-key.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// API key will be retrieved dynamically

const VOICE_IDS = [
  '11labs-Adrian',
  '11labs-Anna',
  '11labs-Andrew',
  '11labs-Bing',
  '11labs-Brian',
  '11labs-Emily',
  '11labs-Evie',
  '11labs-Grace',
  '11labs-James',
  '11labs-Kathrine'
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('Fetching voice details from Retell API with updated voice list...');

    // Get global API key for voice fetching (no user authentication needed)
    const apiKeyResult = await getGlobalRetellApiKey();
    const retellApiKey = apiKeyResult.apiKey;

    const voicePromises = VOICE_IDS.map(async (voiceId) => {
      try {
        const response = await fetch(`https://api.retellai.com/get-voice/${voiceId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${retellApiKey}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          console.error(`Failed to fetch voice ${voiceId}:`, response.status);
          return {
            voice_id: voiceId,
            voice_name: voiceId.replace('11labs-', ''),
            provider: 'elevenlabs',
            accent: 'American',
            gender: 'Unknown',
            age: 'Unknown',
            preview_audio_url: null,
          };
        }

        const voiceData = await response.json();
        return voiceData;
      } catch (error) {
        console.error(`Error fetching voice ${voiceId}:`, error);
        return {
          voice_id: voiceId,
          voice_name: voiceId.replace('11labs-', ''),
          provider: 'elevenlabs',
          accent: 'American',
          gender: 'Unknown',
          age: 'Unknown',
          preview_audio_url: null,
        };
      }
    });

    const voices = await Promise.all(voicePromises);

    console.log('Successfully fetched voice details:', voices.length);

    return new Response(JSON.stringify({ voices }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in get-retell-voices function:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch voices' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});