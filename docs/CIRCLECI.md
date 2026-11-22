# Use didit with CircleCI

Install a pinned version in the repository you want to verify:

```sh
npm install --save-dev --save-exact @mokasdev/didit@0.1.0
npm exec -- didit init
```

Edit `didit.config.json` so it runs the same commands your team expects to pass.
Commit that file and your package lock. The starter uses Node's test runner;
it does not know which checks your project needs.

Add these steps to a CircleCI job that already checks out the repository:

```yaml
- run: npm ci
- run: npm exec -- didit check --profile default
- run:
    name: Export verification receipt
    when: always
    command: |
      mkdir -p /tmp/didit-results
      npm exec -- didit report --profile default --format junit > /tmp/didit-results/receipt.xml
- store_test_results:
    path: /tmp/didit-results
```

Keep reports outside the Git checkout or under an ignored path. The JUnit
contains one entry per didit check, not one entry per test in your test
runner. Keep your test runner's own JUnit output if you need individual cases.

Use the CI job's exit status for branch protection. The receipt is
supplemental evidence. CircleCI, deployment, and smoke-test entries in the
report do not attest themselves. Keep deployment checks separate.

## Local commands

From a consumer repository, `npx @mokasdev/didit --help` runs the published
package. Inside didit's source repository use `node bin/didit.mjs --help`:
npm may resolve the current project instead of adding a temporary binary.
`npm run verify` exercises didit's own checked-in verification profile.
