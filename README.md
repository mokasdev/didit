<p align="center"><img src="docs/didit-mark.svg" alt="didit" width="152" /></p>
<h1 align="center">didit</h1>
<p align="center"><strong>Verification receipts for AI-assisted coding</strong><br />Know what actually passed before you merge.</p>
<p align="center"><strong>English</strong> · <a href="docs/README.ko.md">한국어</a> · <a href="docs/README.ja.md">日本語</a></p>
<p align="center"><a href="#quickstart">Quickstart</a> · <a href="#why">Why didit?</a> · <a href="#how">How it works</a> · <a href="#ci">CI and reports</a> · <a href="#faq">FAQ</a></p>

> **Preview · No account, API key, or runtime dependencies**

---

<a id="why"></a>
## Why didit?

An AI agent says the tests passed. Did it run them on this version of the code? Was that local, in CI, or in production? **didit** runs your checks and records their exit codes against a Git snapshot. Paste the receipt into a PR so reviewers can see what passed, what went stale, and what nobody checked.

**An example PR receipt**

| Check | Status |
| --- | --- |
| Local command | Not checked |
| CircleCI | Not checked |
| Production deployment | Not checked |
| Live smoke test | Not checked |
| test | Passed (exit 0) · 1842 ms |

<a id="quickstart"></a>
## Quickstart

Requires **Node.js 22+** and **Git**. Install globally with npm, or try it once with `npx`.

```sh
npm install -g @mokasdev/didit
npx @mokasdev/didit --help
```

Then go to the Git repository you want to verify. If you are working from a source checkout, you can use `npm link` instead of the global installation.

```sh
didit init
didit check
didit report --profile default
```

`init` creates a starter config without overwriting an existing file. It uses Node’s test runner by default; replace that command with your own project’s checks.

Define named checks in `didit.config.json` and group them into profiles like `quick`, `default`, and `release`. Commands run from the Git root. Review the configuration before running checks from an unfamiliar repository. [Example config](examples/didit.config.json)

```sh
didit check --profile quick --dry-run
didit check --profile quick --fail-fast
didit report --profile quick
```

Use `--only syntax,test` to select checks, `--dry-run` to preview, and `--fail-fast` to stop after the first failure. For npm on Windows, use an explicit `cmd.exe` wrapper as shown in the example config.

<a id="how"></a>
## How it works

1. **Run.** Execute the configured command and capture its exit code and duration.
2. **Bind.** Compare Git HEAD, the index, and tracked and nonignored file contents before and after the run.
3. **Review.** A later code change makes a receipt stale. A change observed during the run makes it unverified. A profile gate only accepts current passes from its configured commands.

<a id="ci"></a>
## CI and reports

Use **Markdown** for a PR, **JSON** for scripts, or **JUnit XML** for a CI test-results collector such as CircleCI. Keep report files outside the checkout or in an ignored directory so they don’t change the snapshot. A failed profile gate exits `1`; it still emits the report.

```sh
didit report --profile default --format json
didit report --profile default --format junit
```

CircleCI, deployment, and live smoke checks can also be recorded manually. These entries are labelled as manual evidence and never satisfy a gate. didit does not fetch or independently verify the reference.

```sh
didit record circleci passed --ref build-42
didit report
```

<a id="faq"></a>
## FAQ

### Is this an AI agent or a hosted service?

No. didit runs your commands locally or inside your existing CI job. It doesn’t call an LLM.

### What does a receipt not cover?

Ignored files, dependencies, environment variables, and changes that appear and disappear between snapshots. Receipts are not signed attestations. Command output and arguments are not saved.

### Can I run one check without setting up a project?

Yes: `didit run --check test -- node --test`, then `didit report --require test`.

## Contributing

Run `npm test` before submitting a change. For bug reports, include your OS, Node and Git versions, and a minimal command or configuration that reproduces the issue.

[Contribution guide](CONTRIBUTING.md) · [Issue templates](.github/ISSUE_TEMPLATE) · [PR checklist](.github/pull_request_template.md) · [Security](SECURITY.md) · [Changelog](CHANGELOG.md)

[MIT](LICENSE)
