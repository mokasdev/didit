# Security policy

Do not post vulnerability details or secret-bearing receipts in a public issue
or pull request. Use GitHub's private vulnerability reporting for this repository
under **Security → Report a vulnerability**.

Include the affected version, impact, and a minimal reproduction. Redact secrets.
The project is in preview; security fixes are targeted at the latest preview release.

## Trust boundaries

`didit check` runs commands from the repository's local configuration. Review the
configuration and the commands it invokes before running checks from an untrusted
checkout. A receipt is local evidence, not a signed attestation. External receipts
record manual claims and do not independently verify the linked result.
