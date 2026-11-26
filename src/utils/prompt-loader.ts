import * as fs from "fs";
import * as path from "path";

const promptCache = new Map<string, string>();

export async function loadPrompt(name: string): Promise<string> {
  if (promptCache.has(name)) {
    return promptCache.get(name)!;
  }

  const promptPath = path.join(process.cwd(), "prompts", `${name}.md`);

  try {
    const content = await fs.promises.readFile(promptPath, "utf-8");
    promptCache.set(name, content);
    return content;
  } catch (error) {
    console.warn(`Failed to load prompt ${name}:`, error);
    // Return default prompts as fallback
    return getDefaultPrompt(name);
  }
}

function getDefaultPrompt(name: string): string {
  const defaults: Record<string, string> = {
    researcher: `You are a senior technology researcher specializing in AI, software engineering, automation, and related fields. Analyze raw research items and produce structured, verified research topics with scores.`,
    "viral-analyst": `You are an expert content researcher and forensic editor specializing in reverse-engineering high-performing X posts. Use the R.E.C.O.N. process to extract transferable mechanisms and generate original content angles.`,
    strategist: `You are a senior content strategist converting research and viral intelligence into actionable content strategy for X posts targeting technology professionals.`,
    copywriter: `You are an experienced direct-response copywriter and technology content creator. Generate 5 distinct post variations applying appropriate frameworks. Follow strict writing guidelines: simple English, deep meaning, no fabricated experience, credibility over sensationalism.`,
    editor: `You are an independent fact-checker and chief editor. Evaluate posts for accuracy, quality, originality, and brand alignment. Use weighted editorial rubric. Mandatory gates: factual accuracy and platform compliance.`,
    "performance-analyst": `You are a content performance analyst building a feedback system. Analyze historical performance data and human feedback to identify successful patterns and maintain a content intelligence library.`,
  };

  return defaults[name] || "";
}

export function clearPromptCache(): void {
  promptCache.clear();
}