function normalizeAllowedDomain(input: string) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      return new URL(raw).hostname.replace(/^www\./, '').toLowerCase();
    }
  } catch {}
  return raw.replace(/^www\./, '').split('/')[0].toLowerCase();
}

export const env = {
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
  supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  supabaseUrlPublic: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  supabaseAnonKeyPublic: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  cohereApiKey: process.env.COHERE_API_KEY || '',
  embeddingModel: process.env.AI_EMBEDDING_MODEL || 'embed-english-v3.0',
  openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
  textModel: process.env.AI_TEXT_MODEL || 'meta-llama/llama-3.1-8b-instruct:free',
  textModelFallback: process.env.AI_TEXT_MODEL_FALLBACK || '',
  humanizeContentModel: (process.env.HUMANIZE_CONTENT_MODEL || '').trim(),
  validationSwarmAgent1: process.env.VALIDATION_SWARM_AGENT_1 || '',
  validationSwarmAgent2: process.env.VALIDATION_SWARM_AGENT_2 || '',
  validationSwarmAgent3: process.env.VALIDATION_SWARM_AGENT_3 || '',
  validationSwarmAgent4: process.env.VALIDATION_SWARM_AGENT_4 || '',
  openRouterBaseUrl: process.env.AI_TEXT_BASE_URL || 'https://openrouter.ai/api/v1',
  pollinationsApiKey: process.env.POLLINATIONS_API_KEY || '',
  huggingFaceAccessToken:
    process.env.HUGGING_FACE_ACCESS_TOKEN_FALLBACK ||
    process.env.HUGGINGFACE_ACCESS_TOKEN_FALLBACK ||
    process.env.HUGGING_FACE_ACCESS_TOKEN ||
    process.env.HUGGINGFACE_ACCESS_TOKEN ||
    process.env.HUGGING_FACE_API_KEY ||
    process.env.HUGGINGFACE_API_KEY ||
    process.env.HUGGING_FACE_TOKEN ||
    process.env.HF_ACCESS_TOKEN ||
    '',
  huggingFaceInferenceBaseUrl:
    process.env.HUGGING_FACE_INFERENCE_BASE_URL ||
    process.env.HUGGINGFACE_INFERENCE_BASE_URL ||
    process.env.HF_INFERENCE_BASE_URL ||
    'https://router.huggingface.co/hf-inference',
  huggingFaceImageCreationModel: (process.env.HUGGING_FACE_IMAGE_CREATION_MODEL || '').trim(),
  rankSimilarity: Number(process.env.RAG_RANK_SIMILARITY_WEIGHT || 0.6),
  rankRecency: Number(process.env.RAG_RANK_RECENCY_WEIGHT || 0.3),
  rankRegulatory: Number(process.env.RAG_RANK_REGULATORY_WEIGHT || 0.1),
  recencyDays: Number(process.env.RECENCY_DAYS || 30),
  trustThreshold: Number(process.env.TRUST_SCORE_THRESHOLD || 80),
  allowedDomains: (process.env.ALLOWED_PUBLIC_DOMAINS || 'fda.gov,nih.gov,cdc.gov')
    .split(',')
    .map((d) => normalizeAllowedDomain(d))
    .filter(Boolean),
};

export function requireKeys(keys: (keyof typeof env)[]) {
  const missing = keys.filter((k) => !env[k]);
  if (missing.length) {
    throw new Error(`Missing required env: ${missing.join(', ')}`);
  }
}
