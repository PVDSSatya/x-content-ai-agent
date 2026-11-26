# Content Frameworks Reference

## Eight Reusable Writing Frameworks (F1-F8)

### F1: Tension → Mechanism → Implication
**Structure**: Show a real conflict → Explain its cause → End with practical significance
**Use When**: Technical trade-offs, industry shifts
**Guardrail**: Avoid if mechanism is unsupported
**Example**: "AI makes prototyping faster. But it makes deciding what deserves production more important. The bottleneck shifted from building to judging."

### F2: Common Belief → Qualification → Better Model
**Structure**: State the usual view fairly → Show what it misses → Replace with more accurate explanation
**Use When**: Misconception correction
**Guardrail**: Avoid straw-man arguments
**Example**: "People assume more automation = less work. The constraint is actually broken handoffs. One fixed handoff saves more time than ten new automations."

### F3: Observation → Principle → Application
**Structure**: Start with recurring pattern → Derive transferable rule → Show its use
**Use When**: Founder and engineering insights
**Guardrail**: Avoid generic aphorisms
**Example**: "Every team I've seen ships faster when they define 'done' before starting. Principle: ambiguity compounds. Application: write the acceptance criteria first."

### F4: Before → Friction → After
**Structure**: Describe old workflow → Identify bottleneck → Show credible improved state
**Use When**: Automation demonstrations
**Guardrail**: Avoid fake numbers or guaranteed results
**Example**: "Before: manual lead entry, 4-hour delay. Friction: leads go cold. After: form → CRM → instant Slack alert. Response time: 3 minutes."

### F5: Claim → Evidence → Decision
**Structure**: Present a claim → Back with proof → Give a decision rule
**Use When**: Research and tools analysis
**Guardrail**: Avoid treating single examples as universal proof
**Example**: "Claude 3.5 Sonnet outperforms GPT-4o on coding benchmarks. Evidence: 92% vs 87% on SWE-bench. Decision rule: use for code generation, GPT-4o for reasoning."

### F6: Failure → Diagnosis → Lesson
**Structure**: Describe real failure mode → Identify underlying cause → Offer useful guardrail
**Use When**: Engineering and operations
**Guardrail**: Avoid invented firsthand stories
**Example**: "Our webhook handler silently dropped 12% of events. Cause: no idempotency keys, retries created duplicates. Lesson: design for exactly-once before scaling throughput."

### F7: Trend → Second-Order Effect → Opportunity
**Structure**: State confirmed change → Trace plausible downstream impact → Name practical response
**Use When**: AI and SaaS developments
**Guardrail**: Label uncertainty in predictions
**Example**: "AI coding assistants are commoditizing implementation. Second-order: system design and product judgment become scarce. Response: invest in architecture reviews, not more code gen."

### F8: Checklist → Exception → Priority
**Structure**: Give clear useful steps → Include important limitation → Specify what to do first
**Use When**: Bookmarkable educational posts
**Guardrail**: Avoid laundry-list posts without hierarchy
**Example**: "Webhook security checklist: 1) Verify signatures 2) Use idempotency keys 3) Implement replay protection. Exception: internal services may skip #1. Priority: start with #2."

---

## Twelve Mechanisms to Test

| Mechanism | Reader Effect | Failure Mode |
|-----------|---------------|--------------|
| Contrast | Notice meaningful difference quickly | False dichotomy |
| Belief Revision | Reconsider an assumption | Contrarian claim without support |
| Recognition | Feel "this describes my experience" | Generic relatable cliché |
| Compressed Principle | Remember/quote an insight | Vagueness disguised as wisdom |
| Concrete Evidence | Trust claim or bookmark detail | Cherry-picked data |
| Unexpected Consequence | Explore hidden implication | Speculative overclaim |
| Practical Shortcut | Save repeatable method | Oversimplified advice |
| Status/Identity | Express professional values | Tribal bait or superiority |
| Timely Interpretation | Understand live event better | Short-lived relevance |
| Story with a Turn | Follow compact narrative | Invented anecdote |
| Useful Disagreement | Reply to genuine tension | Outrage engineering |
| Visual Demonstration | Grasp process at a glance | Decorative/misleading visual |

---

## Hook Library

| Hook Type | Template | Example |
|-----------|----------|---------|
| Unexpected Truth | The hardest part of X is Y | The hardest part of AI automation is not the model. It is the exceptions. |
| Cost Reframing | X looks cheap until Y | A free workflow looks cheap until it fails silently. |
| Founder Observation | Most teams optimize X before Y | Most teams choose tools before mapping the workflow. |
| Diagnostic | If X happens, inspect Y | If leads vanish after signup, inspect the handoff before buying more ads. |
| Outcome First | We changed X so Y improved | We removed duplicate data entry so the team could follow up sooner. |

---

## Seven Post Formulas (from Brand Playbook)

1. **Paradox**: [New capability] becomes easier. [Important decision] becomes harder.
2. **Belief Reversal**: People assume [X]. The constraint is actually [Y].
3. **Scarcity**: [Commodity] is abundant. [Valuable skill] is scarce.
4. **Hidden Cost**: The cost of [X] is not just [visible cost]. It is [downstream loss].
5. **Future Shift**: As [technology] becomes common, [human advantage] matters more.
6. **Operational Principle**: [Good practice] prevents [failure].
7. **Observation → Implication**: [Concrete observation]. Therefore [practical consequence].

---

## Content Formats (15 Types)

1. **Punchy one-liner** - Single insight, maximum impact
2. **Contrarian opinion** - Challenge common belief with evidence
3. **Educational insight** - Teach something specific and useful
4. **Breaking technology news** - Timely announcement with analysis
5. **Technical explanation** - Deep dive into mechanism/concept
6. **Curiosity-driven post** - Open loop demanding resolution
7. **Developer humour** - Relatable, self-deprecating, insider
8. **Relatable observation** - "You know this feeling" moment
9. **Open-source tool discovery** - Highlight useful tool with context
10. **Comparison** - X vs Y with decision framework
11. **Future prediction** - Forecast with reasoning (label uncertainty)
12. **Storytelling** - Compact narrative with turn
13. **Debate question** - Genuine question to spark discussion
14. **Numbered list** - Structured, scannable insights
15. **Long-form post** - Extended analysis (when configured)

---

## Optimization Checklist (Pre-Publish)

- [ ] **Accuracy**: Claims verifiable; facts and opinions distinguishable
- [ ] **Audience**: Specific reader recognizes why it matters
- [ ] **Hook**: Opening line communicates meaningful tension/value
- [ ] **Specificity**: At least one concrete mechanism/distinction/implication
- [ ] **Coherence**: Every sentence supports one central idea
- [ ] **Readability**: Clear on first read; formatting helps scanning
- [ ] **Originality**: Not a close paraphrase of another creator
- [ ] **Outcome**: Conclusion/CTA matches post's purpose
- [ ] **Platform fit**: Length, links, mentions, media serve message

---

## Scoring Rubric (100 Points)

| Dimension | Points | Criteria |
|-----------|--------|----------|
| Accuracy & Nuance | 25 | Claims supportable, appropriately qualified |
| Audience Relevance | 20 | Intended reader cares now |
| Clarity & Structure | 20 | Argument grasped quickly |
| Specificity & Usefulness | 15 | Actionable insight or clear mechanism |
| Originality & Voice | 10 | Framing distinctive and authentic |
| Purpose Alignment | 10 | Ending supports intended outcome |

**Publishing Gate**: 85-100 = publish; 70-84 = revise; below 70 = reconsider
**Any material factual error = do not publish**

---

## Editing Rules: Compression Without Distortion

**Cut**: Repeated claims, filler intros, empty adjectives, redundant qualifiers, unnecessary hashtags
**Keep**: Qualifications, numbers, sources, context, definitions needed for accuracy
**Prefer**: Concrete nouns, active verbs, short sentences, direct wording, readable line breaks
**Avoid**: False binaries, invented statistics, certainty without evidence, engagement bait, exaggerated outcomes, borrowed aphorisms
**Voice**: Consistent reasoning and tone; vary syntax/length to avoid formulaic posts