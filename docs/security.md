# Security notes

- Local identity is a fixed development UUID supplied through `X-User-Id`; it is not authentication. Replace it with verified OIDC subject claims before deployment.
- Membership is checked server-side. Unknown workspace and non-member responses do not disclose whether a workspace exists.
- Document text is treated as untrusted data in the AI system prompt. No tools are exposed to the model.
- Uploaded names are reduced to a basename and sanitized for the storage key. Upload size and extension are checked; parser validation happens asynchronously.
- The local Compose ports and default database password are development-only. Use TLS, secrets management, least-privilege credentials, malware scanning, private AI networking, and a retention policy before handling real company data.
- Deletion removes the local source file and deletes the document row; database cascade removes chunks/jobs. No cache is currently used.
- Raw question and document text are not written to application logs by these services. Provider retention and data handling depend on the configured provider and account settings.
