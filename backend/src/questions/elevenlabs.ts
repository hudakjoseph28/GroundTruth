export interface ParcelVoiceService {
  transcribe(audio: Buffer, contentType: string): Promise<string>;
  speak(text: string): Promise<Buffer>;
}

/** Speech in and out uses the voice already assigned to the configured agent. */
export function createElevenLabsParcelVoice(options: {
  apiKey: string;
  agentId: string;
  fetch?: typeof fetch;
}): ParcelVoiceService {
  const request = options.fetch ?? fetch;
  let voiceId: string | undefined;
  return {
    async transcribe(audio, contentType) {
      const form = new FormData();
      form.append("model_id", "scribe_v2");
      form.append(
        "file",
        new Blob([Uint8Array.from(audio)], { type: contentType }),
        audioName(contentType),
      );
      const response = await request(
        "https://api.elevenlabs.io/v1/speech-to-text",
        {
          method: "POST",
          headers: { "xi-api-key": options.apiKey },
          body: form,
        },
      );
      if (!response.ok)
        throw new Error(`ElevenLabs transcription ${response.status}`);
      const body = (await response.json()) as { text?: unknown };
      if (typeof body.text !== "string" || !body.text.trim()) {
        throw new Error("ElevenLabs transcription was empty");
      }
      return body.text.trim();
    },
    async speak(text) {
      voiceId ??= await configuredVoiceId(
        request,
        options.apiKey,
        options.agentId,
      );
      const response = await request(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: {
            "xi-api-key": options.apiKey,
            "content-type": "application/json",
          },
          body: JSON.stringify({ text, model_id: "eleven_flash_v2_5" }),
        },
      );
      if (!response.ok) throw new Error(`ElevenLabs speech ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    },
  };
}

async function configuredVoiceId(
  request: typeof fetch,
  apiKey: string,
  agentId: string,
): Promise<string> {
  const response = await request(
    `https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`,
    { headers: { "xi-api-key": apiKey } },
  );
  if (!response.ok) throw new Error(`ElevenLabs agent ${response.status}`);
  const body = (await response.json()) as {
    conversation_config?: { tts?: { voice_id?: unknown } };
  };
  const id = body.conversation_config?.tts?.voice_id;
  if (typeof id !== "string" || !id) {
    throw new Error("Configured ElevenLabs agent has no voice");
  }
  return id;
}

function audioName(contentType: string): string {
  if (contentType.includes("mp4")) return "question.mp4";
  if (contentType.includes("ogg")) return "question.ogg";
  return "question.webm";
}
