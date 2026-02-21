---
name: "bug-fixer"
description: "Diagnoses and fixes bugs end-to-end. Invoke when errors, crashes, or wrong behavior appear."
---

# Bug Fixer

This skill finds root causes of bugs and implements robust fixes verified by tests.

## When to Use

- User reports a runtime error, crash, or exception
- Behavior differs from requirements or previous versions
- Tests are failing or flaky

## Behavior

- Reproduce the issue using provided steps or reasonable assumptions
- Locate the source using logs, stack traces, and code search
- Propose a minimal, targeted fix that preserves existing behavior
- Implement the fix following existing code style and patterns
- Add or update tests to cover the bug scenario when possible
- Run available tests, linters, and type checks to verify the fix

## Output Style

- Summarize: symptom → root cause → fix → verification
- Highlight any trade-offs or potential side effects
- Keep explanations concise but technically clear

## Examples

- “Fix this crash when opening the settings page”
- “Tests started failing after this change, find and fix the cause”
- “This API returns the wrong data, diagnose and correct it”

