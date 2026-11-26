import researcherPrompt from "../../prompts/researcher.md";
import viralAnalystPrompt from "../../prompts/viral-analyst.md";
import strategistPrompt from "../../prompts/strategist.md";
import copywriterPrompt from "../../prompts/copywriter.md";
import editorPrompt from "../../prompts/editor.md";
import performanceAnalystPrompt from "../../prompts/performance-analyst.md";

const prompts: Record<string, string> = {
  researcher: researcherPrompt,
  "viral-analyst": viralAnalystPrompt,
  strategist: strategistPrompt,
  copywriter: copywriterPrompt,
  editor: editorPrompt,
  "performance-analyst": performanceAnalystPrompt,
};

export async function loadPrompt(name: string): Promise<string> {
  return prompts[name] ?? "";
}

export function clearPromptCache(): void {
  // Prompts are statically bundled; retained for API compatibility
}
