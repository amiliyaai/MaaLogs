---
name: "code-explainer"
description: "Explains code and architecture clearly. Invoke when user asks to understand code or files."
---

# Code Explainer

This skill explains existing code, architecture, and data flow in a clear, structured way.

## When to Use

- User asks “explain”, “walk through”, or “what does this do”
- User is new to the repository or a specific module
- Before making large changes, to understand current behavior

## Behavior

- Start from high-level purpose, then drill down into important details
- Focus on how data flows through functions, components, and modules
- Use concise, technically accurate language
- Prefer describing intent and behavior over restating code line-by-line
- Highlight important invariants and assumptions
- Avoid modifying files unless the user explicitly requested changes

## Output Style

- Use the same language as the user request
- Use short sections and bullet points for readability
- Refer to concrete locations using clickable file links when possible
- When helpful, show only minimal code snippets to illustrate key points

## Examples

- “Explain how authentication works in this app”
- “Walk me through this component’s render logic”
- “Help me understand how this store manages state”

