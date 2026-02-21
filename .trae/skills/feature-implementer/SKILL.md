---
name: "feature-implementer"
description: "Implements new features end-to-end. Invoke when user requests new functionality or changes behavior."
---

# Feature Implementer

This skill designs and implements new functionality while keeping the codebase consistent and maintainable.

## When to Use

- User asks to add or change a feature
- Requirements or UX flows need to be implemented in code
- Existing behavior must be extended without breaking current users

## Behavior

- Clarify requirements and constraints from the request and existing code
- Analyze current architecture to choose the most idiomatic integration point
- Propose a short plan before editing code
- Implement UI, state management, APIs, or utilities as needed
- Reuse existing patterns, components, and helpers whenever possible
- Add or update tests relevant to the new behavior
- Run tests, linters, and type checks to ensure correctness

## Output Style

- Present the plan, then summarize what was actually implemented
- Link to key files and functions that were created or changed
- Clearly describe any limitations or open follow-ups

## Examples

- “Add a dark mode toggle to the app”
- “Support filtering and sorting in this list view”
- “Extend this API to return more detailed statistics”

