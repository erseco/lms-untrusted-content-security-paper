---
name: academic-humanizer
version: 0.3.3
source: https://raw.githubusercontent.com/AIScientists-Dev/academic-humanizer/refs/heads/main/SKILL.md
license: MIT
---

# Academic Humanizer

Use this skill when editing academic manuscripts. Preserve the author's structure,
technical terms, numbers, equations, citations, and evidence. Improve clarity and
voice without casualizing the prose or adding personality.

## Required workflow

1. Read the manuscript and identify its venue, register, and author voice.
2. Audit before editing: record formulaic or AI-like patterns, overclaims, and
   empirical claims whose evidence is missing or unclear.
3. Rewrite with the same content and structure. Remove filler, promotional
   language, vague attribution, repetitive connectives, elegant variation,
   unnecessary nominalizations, and clause-stacked sentences. Recast em dashes
   as commas, colons, parentheses, or separate sentences.
4. Report the changes and confirm that no number, equation, result, or citation
   was altered.

## Academic safeguards

- Match every empirical claim to a number, figure, table, or citation. Downgrade
  verbs such as “prove”, “demonstrate”, “establish”, and “guarantee” when the
  evidence supports only an observation or comparison.
- Keep evidence-tied hedging, passive voice where the actor is irrelevant, and
  first-person plural “we”. Do not flatten legitimate scholarly conventions.
- Prefer precise magnitudes and named comparisons over “extensive”, “various”,
  “significant” without a test or value, and other vague intensifiers.
- Do not invent, drop, or alter technical claims, numbers, equations, or citation
  keys. Flag unsupported claims instead of disguising them.

## Output

Return the revised text and a concise change report covering patterns removed,
claims softened or tied to evidence, and venue/voice decisions. The skill is for
clear academic writing, not for evading disclosure of AI assistance.
