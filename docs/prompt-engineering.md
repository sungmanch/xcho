# Prompt Engineering

Xcho uses four distinct prompts to power its features: comment generation, tweet translation, comment explanation, and persona analysis. All prompts share a consistent XML tag-based structure but are tuned differently for their specific tasks.

This document explains the design rationale behind each prompt, the dynamic sections that adapt to user context, and the anti-patterns that were discovered through iteration.

## Prompt Architecture

Every prompt in Xcho uses XML tags to create clear boundaries between sections. This is intentional -- Gemini models parse XML-delimited instructions more reliably than unstructured prose.

### Comment Generation Tags

The main prompt (`generateComment` / `generateCommentStream` in `src/utils/gemini.ts`) uses up to 10 sections:

| Tag | Purpose | Always present? |
|-----|---------|-----------------|
| `<role>` | Establishes the persona of the AI | Yes |
| `<goal>` | Defines what "success" looks like | Yes |
| `<context>` | Contains the tweet text in a nested `<tweet>` tag | Yes |
| `<persona-tone>` | Writing style instructions from persona analysis | Only with persona |
| `<user-intent>` | User's freeform direction for the reply | Only with intent |
| `<voice>` | Core writing rules and prohibitions | Yes |
| `<stance>` | Behavioral instructions for agree/disagree/question/neutral | Yes |
| `<reply-style>` | Tone, length, and calibration examples | Yes |
| `<constraints>` | Numbered rules as concrete guardrails | Yes |
| `<self-check>` | Verification checklist before output | Yes |

### Translation Tags

| Tag | Purpose |
|-----|---------|
| `<role>` | Professional translator for social media |
| `<goal>` | Natural Korean translation preserving tone |
| `<source-text>` | The tweet text to translate |
| `<constraints>` | Tone preservation, idiom handling, no explanations |
| `<output-format>` | JSON schema with `translatedText` and `sourceLanguage` |

### Explanation Tags

| Tag | Purpose |
|-----|---------|
| `<role>` | Bilingual social media expert |
| `<goal>` | Korean translation of reply + relevance reasoning |
| `<original-tweet>` | The source tweet |
| `<generated-reply>` | The AI-generated comment |
| `<constraints>` | Natural translation, concise explanation |
| `<output-format>` | JSON schema with `koreanTranslation` and `relevanceReason` |

### Persona Analysis Tags

| Tag | Purpose |
|-----|---------|
| `<context>` | Frames the task as writing style analysis |
| `<writings>` | Contains the user's uploaded text samples |
| `<task>` | Extract a persona profile for social media replies |
| `<schema>` | JSON structure with field descriptions |
| `<rules>` | Base analysis on provided writings, raw JSON output |

## Comment Generation Prompt Design

### `<role>` -- Setting the Persona

```
You are a skilled X (Twitter) user who writes replies that stop the scroll.
You have sharp opinions and an authentic voice. You share what you think,
not what you've done.
```

The role establishes three key traits: skill (not novice), opinionated (has a point of view), and authentic (doesn't fabricate). The phrase "what you think, not what you've done" is a deliberate guardrail against the model inventing personal anecdotes.

### `<goal>` -- Defining Success

```
Write a single reply that hooks readers instantly -- the kind that makes
people retweet, quote, or jump into the thread.
```

The goal is framed in engagement terms. This steers the model toward replies that provoke interaction rather than passive agreement.

### `<voice>` -- Core Writing Rules

The voice section contains the most critical behavioral instructions:

- **Lead with a sharp opinion or observation** -- Forces the model to front-load the interesting part instead of building up to it.
- **Frame opinions as YOUR take, not universal truth** -- Prevents authoritative-sounding declarations that come across as pretentious.
- **Default to inclusive "we"** -- Frames comments from a shared community perspective rather than pointing at the tweet author. "We keep making this mistake" reads better than "You're making this mistake".
- **Only use "you" for specific third parties** -- Prevents the model from lecturing the tweet author directly.
- **Never fabricate personal experience** -- State opinions, not stories. Stops the model from generating "When I worked at Google..." type fabrications.
- **CRITICAL: Never start with "I'd argue"** -- Marked as critical because early iterations showed this phrase appearing in a majority of generations. It became a verbal tic of the model.

### `<stance>` -- Four Modes

Each stance mode provides specific behavioral instructions:

**Agree:** Build on the tweet's point by extending, sharpening, or validating with specifics. The model adds value rather than just nodding.

**Disagree:** Respectfully challenge by offering a different lens, highlighting missed nuance, or reframing the premise. Keeps disagreement constructive.

**Question:** Express genuine curiosity through specific clarifying questions, requests for elaboration, or exploring related aspects. Not rhetorical questioning.

**Neutral:** Participate without taking sides by adding observations, offering different angles, or contributing context that reframes the discussion.

All stances include: "Express your stance naturally through your response. Do NOT explicitly say 'I agree' or 'I disagree'." This prevents the model from writing meta-commentary about its own position.

### `<reply-style>` -- Calibration Through Contrast

This section serves two purposes: it sets tone and length parameters, and it provides calibration examples.

**Strong examples** demonstrate the target quality:
- "The real problem isn't X here. It's that we keep ignoring Y"
- "Hot take -- this works in theory but falls apart the moment we try to scale"

**Weak examples** show what to avoid, with parenthetical labels:
- "Great point! Totally agree!" (empty validation)
- "This is so important for everyone to understand" (corporate speak)
- "Thanks for sharing! This really resonates" (AI cheerleading)

The weak examples are labeled so the model understands the failure mode, not just the bad output. Showing what NOT to do is as important as showing what to do -- it creates a tighter decision boundary.

### `<constraints>` -- Numbered Guardrails

Eight base constraints plus conditionally injected rules:

1. **Hook in the first few words** -- Front-load the interesting part
2. **Respond to something SPECIFIC** -- No generic takes on the topic
3. **Be bold** -- Strong takes over safe takes
4. **Concrete details over abstract concepts** -- Specificity breeds authenticity
5. **No emojis, no hashtags, no em-dashes** -- Maintain a clean, text-first aesthetic
6. **Never claim experience** -- Opinions, not stories
7. **Banned openers** -- "I'd argue", "Unpopular opinion:", "This.", "Here's the thing"
8. **"We" over "you"** -- Community perspective
9. *(Conditional)* **Match persona TONE only, never copy phrases** -- Added when persona exists
10. *(Implicit, via self-check)* **Reflect user's specified intent** -- Added when user intent exists

### `<self-check>` -- Pre-Output Verification

A checklist the model runs before producing output:

- Would this stop someone mid-scroll?
- Does this sound like a real person, not a bot?
- Is there a specific take, not generic agreement?
- Would someone want to reply to this?
- Is this an honest opinion, not fabricated experience?
- Does it use "we" for community perspective?
- *(Conditional)* Does it reflect the user's specified intent?

## Dynamic Sections

### `buildPersonaSection()`

Only included when the user has uploaded writing samples and persona analysis exists. Maps the `PersonaData` fields to natural language tone instructions:

| PersonaData field | Prompt instruction |
|-------------------|--------------------|
| `formality: casual` | "conversational and relaxed" |
| `formality: formal` | "polished and measured" |
| `formality: neutral` | "balanced tone" |
| `directness: direct` | "gets to the point quickly" |
| `directness: indirect` | "builds context before making the point" |
| `humor: true` | "comfortable with wit and playfulness" |
| `sentenceLength: short` | "punchy rhythm" |
| `sentenceLength: long` | "flowing, developed thoughts" |

When `opinionStyle` exists (extracted from persona analysis), additional guidance is injected:

| Field | Example mapping |
|-------|-----------------|
| `hookPattern: question` | "Open with a provocative or probing question" |
| `hookPattern: bold-claim` | "Open with a confident, direct claim" |
| `argumentStyle: evidence` | "Support takes with concrete evidence or data points" |
| `argumentStyle: analogy` | "Use analogies and comparisons to make the point land" |

The section ends with: "CRITICAL: Match the TONE and MANNER only. Use your own vocabulary. Never copy specific phrases or expressions." This is important because without it, the model tends to parrot the user's exact phrases from the persona data.

### `buildUserIntentSection()`

Only included when the user types something in the "Your Intent" field. Supports Korean input:

```
The user wants this specific approach for their reply:
"[user input here]"

Incorporate this intent naturally into the reply while maintaining
the selected tone and stance.
If the intent is in Korean, understand the meaning and apply it
to the English reply.
```

This enables a bilingual workflow: a Korean-speaking user can think in Korean ("이 주장에 반박하고 싶어") and get an English reply that embodies that intent.

### Dynamic Constraint Injection

When persona exists, constraint #9 is appended: "Match the persona TONE only, never copy their phrases."

When user intent exists, an additional self-check item is appended: "Does the reply reflect the user's specified intent?"

These are injected via string concatenation rather than conditional template blocks to keep the prompt structure clean.

## Temperature Settings

| Prompt type | Temperature | Rationale |
|-------------|-------------|-----------|
| Comment generation | 1.0 | Maximum creative variety; each generation should feel different |
| Translation | 0.3 | Accuracy over creativity; translation should be faithful |
| Explanation | 0.3 | Accuracy over creativity; analysis should be consistent |
| Persona analysis | Default | Uses model default; balanced analysis |

## Anti-Patterns and Design Decisions

### "I'd argue" Prohibition

In early iterations, the model started a majority of replies with "I'd argue that..." regardless of stance or tone. This was a Gemini-specific verbal tic. The prohibition now appears in two places -- `<voice>` (marked CRITICAL) and `<constraints>` rule #7 -- because a single mention was insufficient to suppress it reliably.

### "We" Framing Over "You"

Using "you" when addressing the tweet author creates a preachy, lecturing tone: "You should really think about this differently." Switching to "we" creates shared perspective: "We keep overlooking this part." This single change dramatically improved the perceived authenticity of generated replies.

The rule appears in `<voice>`, `<constraints>`, and `<self-check>` for triple reinforcement.

### No Emoji / No Hashtag Rule

Emojis and hashtags are telltale signs of AI-generated content on social media. Removing them makes replies feel more like they came from a real person with a strong opinion rather than a marketing account.

### Strong / Weak Example Pairs

The `<reply-style>` section uses contrastive examples rather than just positive examples. Showing weak examples with labeled failure modes ("empty validation", "corporate speak", "AI cheerleading") gives the model explicit negative patterns to avoid. This contrastive approach is more effective than positive-only examples because it defines both the target zone and the exclusion zone.

### No Em-Dash Rule

Em-dashes (--) tend to appear frequently in AI-generated text as a stylistic crutch. While the prompt text itself uses em-dashes for readability, constraint #5 instructs the model not to use them in the output.

## Translation Prompt

The translation prompt (`translateTweet`) focuses on naturalness over literal accuracy:

- **Tone preservation**: Casual tweets stay casual in Korean
- **Idiom handling**: "Translate idioms to Korean equivalents rather than literal translations"
- **Preserve formatting**: Hashtags, @mentions, and links stay unchanged
- **Structured output**: Returns JSON with `translatedText` and `sourceLanguage` (ISO 639-1 code)

Korean detection (`isKoreanText`) checks if >30% of characters are in Korean Unicode ranges (Hangul Syllables, Jamo, Compatibility Jamo). Tweets that are already primarily Korean skip the translation button entirely.

## Explanation Prompt

The explanation prompt (`generateCommentExplanation`) provides bilingual analysis:

- **Korean translation**: Natural Korean rendering of the generated English reply
- **Relevance reasoning**: 1-2 sentence Korean explanation of why the reply works as a response to the tweet

This auto-fires after comment generation. It serves Korean-speaking users who want to understand what the English reply actually says and why it's appropriate before posting it.

## Persona Analysis Prompt

The persona analysis prompt (`analyzeWritings` in `src/utils/persona.ts`) uses Gemini 3 Pro (hardcoded, not user-selectable) for higher quality analysis. It extracts:

- **writingStyle**: Sentence length, formality, humor, directness
- **opinionStyle**: How the user opens opinions (hookPattern) and supports them (argumentStyle)
- **commonPhrases**: 5-10 signature expressions (used for display, NOT injected into generation)
- **topics**: 3-7 recurring themes
- **exampleResponses**: 3-5 synthetic replies in the user's voice

Input writings are truncated to 50,000 characters to prevent token overflow. The prompt follows Gemini 3 best practices with context-first, instructions-last ordering.

The `commonPhrases` field deserves special attention: these phrases are shown to the user in the persona details modal but are deliberately NOT used in the generation prompt. The `buildPersonaSection()` function only extracts tone traits (formality, directness, humor, rhythm) and opinion style. This prevents the model from mechanically inserting the user's phrases, which would sound unnatural in a tweet reply context.
