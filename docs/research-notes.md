# Research Notes — BitGN PAC Agent

## SGR (Schema-Guided Reasoning) — The Winning Pattern

SGR was created by Rinat Abdullin (BitGN founder). The platform is designed to reward this pattern.
Over 500 teams and 360,000+ evaluations confirmed SGR as the dominant strategy.

### Three Patterns
1. **Cascade** — Force sequential reasoning via ordered schema fields
2. **Routing** — Discriminated union forces explicit tool selection
3. **Cycle** — Bounded list for multi-step planning

### Key Resources
- [SGR Explained](https://abdullin.com/schema-guided-reasoning/)
- [SGR Patterns](https://abdullin.com/schema-guided-reasoning/patterns)
- [SGR Demo](https://abdullin.com/schema-guided-reasoning/demo)
- [SGR Adaptive Planning](https://abdullin.com/schema-guided-reasoning/adaptive-planning)
- [SGR Agent Core (GitHub)](https://github.com/vamplabAI/sgr-agent-core)

## Prompt Injection Defense

### OWASP Recommended Layers
1. Input validation — regex for known injection phrases
2. Structured prompts with clear separation (SYSTEM_INSTRUCTIONS vs USER_DATA)
3. Output monitoring — check for system prompt leakage
4. Least privilege — only expose needed tools

### Agent-Specific Defenses
- Validate tool call parameters against session context
- Monitor reasoning for anomalies after reading files
- Never trust tool result content as instructions
- Sandwich defense: wrap user data between defensive prompts

### Source
- [OWASP LLM Prompt Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html)

## Model Selection

| Model | Speed | Quality | Cost | Tool Calling |
|-------|-------|---------|------|-------------|
| Claude Haiku 4.5 | Fastest | 90% of Sonnet | Cheapest | Good |
| Claude Sonnet 4.6 | Fast | 98% of Opus | Mid | Excellent |
| Claude Opus 4.6 | Slow | Best | Expensive | Excellent |
| GPT-4.1 | Fast | Strong | Mid | Native SGR support |

**Recommendation**: Sonnet 4.6 for competition. Haiku for development iterations.
SGR constraints mean even weaker models perform well.

## Enterprise RAG Challenge Winner Tips
- Route queries to specialized prompts based on expected answer type
- Use Chain of Thought WITHIN Structured Output (reasoning + answer fields)
- One-shot examples must be perfect — bad examples hurt more than none
- Implement reparser for malformed output correction

## Vercel AI SDK Tool Calling
- `tool()` with `inputSchema` (Zod) and optional `execute` function
- `generateText()` with tools for agent loops
- Tool `description` is critical — tells model when/how to use
- Three tool types: Custom, Provider-Defined, Provider-Executed

### Sources
- [Vercel AI SDK Tools](https://ai-sdk.dev/docs/foundations/tools)
- [Claude Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Claude Model Comparison](https://platform.claude.com/docs/en/about-claude/models/choosing-a-model)
