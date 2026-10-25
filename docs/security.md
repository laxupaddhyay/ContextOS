# Security notes

- Outside the `local` Spring profile, every API endpoint requires a signed OIDC access token. The API validates issuer, timestamps, and the configured audience, then maps issuer plus subject to an internal user ID. The `X-User-Id` demo identity filter only exists in the explicitly selected `local` profile; never expose that profile to the public internet.
- The browser uses authorization code flow with PKCE and keeps tokens in session storage. Configure the provider's redirect URI, API audience, API scope, issuer, and exact frontend origin as described in [authentication setup](authentication.md). Do not put a client secret in the browser.
- Email is not used to link OIDC identities. A change of issuer or subject creates a separate internal account; account linking needs a deliberate verified process.
- The AI `/answer` endpoint requires `X-Service-Token`, which the API adds from `AI_SERVICE_TOKEN`. Set a unique random value in `.env`; the built-in fallback token is public and local-development-only.
- Browser CORS is restricted to `CORS_ALLOWED_ORIGIN`. Configure the exact trusted frontend origin before deployment.
- Membership is checked server-side. Unknown workspace and non-member responses do not disclose whether a workspace exists.
- Conversation history, questions, answers, citation snippets, and feedback are stored in the database. Define retention and deletion behavior before using sensitive data; the current document deletion endpoint does not delete conversation history.
- Document text is treated as untrusted data in the AI system prompt. No tools are exposed to the model.
- Uploaded names are reduced to a basename and sanitized for the storage key. Upload size and extension are checked; parser validation happens asynchronously.
- The local Compose ports and default database password are development-only. Use TLS, secrets management, least-privilege credentials, malware scanning, private AI networking, and a retention policy before handling real company data.
- Deletion removes the local source file and deletes the document row; database cascade removes chunks/jobs. No cache is currently used.
- Raw question and document text are not written to application logs by these services, but questions and answers are persisted as conversation history. Provider retention and data handling depend on the configured provider and account settings.
- When `OPENAI_API_KEY` is configured, document chunks and questions are sent to the configured embedding model as well as the generation provider. Review provider data handling before indexing sensitive documents. Embeddings are workspace-filtered in SQL before passages are sent to the AI answer endpoint.
