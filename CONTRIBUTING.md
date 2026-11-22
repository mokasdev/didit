# Contributing to didit

Thanks for helping improve didit. Use a bug report for reproducible failures,
a feature request for a workflow you cannot express today, and the
[security policy](SECURITY.md) for vulnerabilities.

## Local development

Requirements: **Node.js 22+** and **Git**. Clone or fork the repository, then run:

```sh
npm test
node bin/didit.mjs --help
npm pack --dry-run
```

No runtime dependencies are required. For CLI changes, add a regression test
using a temporary Git repository. Check both the exit code and the report.
When relevant, test an actual Windows command or document what was not tested.

## File a useful issue

- Check existing issues first. Open one issue per problem.
- Include the OS, Node and Git versions, didit version, exact command, expected
  result, and observed result. Include a minimal config if it affects behavior.
- Remove credentials, internal URLs, and private paths from logs or receipts.
- For a feature, describe your current workflow and the gap before proposing flags.

## Open a pull request

1. Open an issue first for changes to the CLI contract, receipt schema, or config format.
2. Keep each PR focused. Add tests and update the docs for user-facing changes.
3. Include the commands you actually ran and their results. List CircleCI, deploy,
   and live smoke results separately; "not checked" is a valid result.
4. Keep the English, Korean, and Japanese READMEs aligned when changing shared
   examples or behavior. When you cannot translate a change, call it out in the PR.

See the [PR checklist](.github/pull_request_template.md) and [changelog](CHANGELOG.md).
