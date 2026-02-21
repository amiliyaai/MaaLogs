---
name: "test-writer"
description: "Designs and implements tests. Invoke when user wants unit, integration, or regression tests."
---

# Test Writer

This skill creates and improves automated tests to validate behavior and prevent regressions.

## When to Use

- New features need test coverage
- Bugs should be guarded by regression tests
- Existing code has little or no tests

## Behavior

- Inspect current test setup, frameworks, and conventions
- Derive test cases from requirements, edge cases, and past bugs
- Choose appropriate test level: unit, integration, or end-to-end when applicable
- Reuse existing helpers, factories, and fixtures
- Keep tests deterministic, isolated, and fast
- Ensure tests clearly document expected behavior and key edge cases
- Run the test suite and address any failures

## Output Style

- List key scenarios and what each test asserts
- Link to new or updated test files
- Briefly explain how to run the relevant tests

## Examples

- “Add tests for this hook’s data loading logic”
- “Write regression tests for this fixed bug”
- “Increase coverage for this API controller”

