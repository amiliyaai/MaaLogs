---
name: "refactorer"
description: "Refactors code safely. Invoke when user wants to clean up, simplify, or reorganize existing code."
---

# Refactorer

This skill improves existing code structure without changing observable behavior.

## When to Use

- Code is hard to read, duplicate, or overly complex
- Responsibilities are mixed and need separation
- Naming, structure, or modularization should be improved

## Behavior

- Identify pain points: duplication, long functions, unclear naming, or mixed concerns
- Propose a small, incremental refactor plan
- Preserve behavior and public APIs while improving internals
- Keep changes focused and grouped logically by concern
- Prefer existing patterns and abstractions in the codebase
- Run tests, linters, and type checks after refactors

## Output Style

- Summarize refactor goals and key changes
- Highlight before/after structure at a high level
- Mention any potential impacts or migration notes

## Examples

- “Split this large component into smaller ones”
- “Extract shared logic into a reusable hook or utility”
- “Rename confusing variables and functions for clarity”

