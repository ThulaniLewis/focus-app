// focus-claude: the only place the Anthropic key lives.
//
// The app sends its sign-in token with each call. This function checks the
// token is a real, signed-in user on the allowed list, then forwards a
// limited request to Anthropic using the key from Supabase secrets.
//
// Secrets to set in Supabase (Edge Functions > Secrets):
//   ANTHROPIC_API_KEY  your Anthropic key
//   ALLOWED_EMAILS     the email(s) allowed to use it, comma separated
import { createClient } from 'npm:@supabase/supabase-js@2';

const MAX_TOKENS_CAP = 4000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  const allowed = (Deno.env.get('ALLOWED_EMAILS') ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!apiKey || allowed.length === 0) {
    return json({ error: 'Server not set up: add ANTHROPIC_API_KEY and ALLOWED_EMAILS secrets.' }, 500);
  }

  // Who is calling? Check the sign-in token with Supabase Auth.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Not signed in: no token sent' }, 401);
  // The service role key is always provided to functions, so the check works with old and new key styles.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return json({ error: `Not signed in: ${error?.message ?? 'no user'}` }, 401);
  if (!allowed.includes((data.user.email ?? '').toLowerCase())) return json({ error: 'Not allowed' }, 403);

  // Only pass through what Focus needs, with a cap on size.
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Bad request' }, 400);
  }
  const model = String(body?.model ?? '');
  if (!/^claude-[a-z0-9.-]+$/.test(model)) return json({ error: 'Unknown model' }, 400);
  if (!Array.isArray(body?.messages)) return json({ error: 'No messages' }, 400);

  // Newer models don't allow forcing a tool. Ask for it in words instead and let the model choose.
  let system = body.system;
  let toolChoice = body.tool_choice;
  if (toolChoice && (toolChoice.type === 'tool' || toolChoice.type === 'any')) {
    const name = toolChoice.name ?? body.tools?.[0]?.name ?? 'the tool';
    const rule = `Always answer by calling the ${name} tool exactly once. Never reply with plain text.`;
    system = typeof system === 'string' ? `${system}\n\n${rule}` : rule;
    toolChoice = { type: 'auto' };
  }

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: Math.min(Number(body.max_tokens) || 1000, MAX_TOKENS_CAP),
      system,
      messages: body.messages,
      ...(body.tools ? { tools: body.tools } : {}),
      ...(toolChoice ? { tool_choice: toolChoice } : {}),
    }),
  });

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  });
});
