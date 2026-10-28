import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { rewriteCaption } from "../src/services/ai-caption";

const original = "A Prefeitura de Goiânia anunciou novas linhas de ônibus para ampliar o transporte público na capital goiana.";
const rewritten = "Novas linhas de ônibus vão ampliar o transporte público em Goiânia, segundo anúncio da prefeitura.";
const hashtags = ["#Goiania", "#Goias", "#TransportePublico", "#Onibus", "#MobilidadeUrbana", "#PrefeituraDeGoiania"];

function generated(legenda = rewritten) {
  return Response.json({
    candidates: [{
      content: { role: "model", parts: [{ text: JSON.stringify({ legenda, hashtags }) }] },
      finishReason: "STOP",
      index: 0,
    }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 50, totalTokenCount: 60 },
  });
}

function unavailable() {
  return Response.json({ error: {
    code: 503, status: "UNAVAILABLE",
    message: "Model is experiencing high demand. https://provider.example/?token=private-test-value",
  } }, { status: 503 });
}

test("caption generation works when Interactions is unavailable, preserving structured output", async (t) => {
  process.env.GEMINI_API_KEY = "test";
  process.env.GEMINI_MODEL = "gemini-primary";
  process.env.GEMINI_FALLBACK_MODEL = "gemini-backup";
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const stub = mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push({ url: request.url, body: await request.json() });
    return request.url.includes(":generateContent") ? generated() : unavailable();
  });
  t.after(() => stub.mock.restore());

  assert.equal(await rewriteCaption(original), `${rewritten}\n\n${hashtags.join(" ")}`);
  assert.equal(requests.length, 1);
  const body = requests[0].body as {
    systemInstruction: { parts: { text: string }[] };
    generationConfig: { responseMimeType: string; responseJsonSchema: { required: string[] } };
    contents: { parts: { text: string }[] }[];
  };
  assert.match(body.systemInstruction.parts[0].text, /editor jornalístico/);
  assert.match(body.contents[0].parts[0].text, /Prefeitura de Goiânia/);
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(body.generationConfig.responseJsonSchema.required, ["legenda", "hashtags"]);
});

test("a transient caption outage uses the backup model without nested SDK retries", async (t) => {
  process.env.GEMINI_API_KEY = "test";
  process.env.GEMINI_MODEL = "gemini-overloaded";
  process.env.GEMINI_FALLBACK_MODEL = "gemini-available";
  const urls: string[] = [];
  const stub = mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    urls.push(url);
    return url.includes("gemini-available:generateContent") ? generated() : unavailable();
  });
  t.after(() => stub.mock.restore());

  assert.equal(await rewriteCaption(original), `${rewritten}\n\n${hashtags.join(" ")}`);
  assert.equal(urls.length, 2);
});

test("caption failures retain the provider cause without leaking its URL", async (t) => {
  process.env.GEMINI_API_KEY = "test";
  process.env.GEMINI_MODEL = "gemini-unavailable";
  process.env.GEMINI_FALLBACK_MODEL = "gemini-unavailable";
  const stub = mock.method(globalThis, "fetch", async () => unavailable());
  t.after(() => stub.mock.restore());

  await assert.rejects(rewriteCaption(original), (error: Error) => {
    assert.match(error.message, /503/);
    assert.match(error.message, /high demand/);
    assert.doesNotMatch(error.message, /provider\.example|private-test-value/);
    return true;
  });
});

test("the generation endpoint still refuses an unchanged original caption", async (t) => {
  process.env.GEMINI_API_KEY = "test";
  process.env.GEMINI_MODEL = "gemini-copy";
  process.env.GEMINI_FALLBACK_MODEL = "gemini-copy";
  const stub = mock.method(globalThis, "fetch", async () => generated(original));
  t.after(() => stub.mock.restore());

  await assert.rejects(rewriteCaption(original), /devolveu a legenda original sem reescrever/);
});
