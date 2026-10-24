# Security notes

- Local identity is a fixed development UUID supplied through `X-User-Id`; it is not authentication. Replace it with verified OIDC subject claims before deployment.
- The AI `/answer` endpoint requires `X-Service-Token`, which the API adds from `AI_SERVICE_TOKEN`. Set a unique random value in `.env`; the built-in fallback token is public and local-development-only.
- Browser CORS is restricted to the local Vite origin. Configure the exact trusted frontend origin before deployment.
- Membership is checked server-side. Unknown workspace and non-member responses do not disclose whether a workspace exists.
- Conversation history, questions, answers, citation snippets, and feedback are stored in the database. Define retention and deletion behavior before using sensitive data; the current document deletion endpoint does not delete conversation history.
- Document text is treated as untrusted data in the AI system prompt. No tools are exposed to the model.
- Uploaded names are reduced to a basename and sanitized for the storage key. Upload size and extension are checked; parser validation happens asynchronously.
- The local Compose ports and default database password are development-only. Use TLS, secrets management, least-privilege credentials, malware scanning, private AI networking, and a retention policy before handling real company data.
- Deletion removes the local source file and deletes the document row; database cascade removes chunks/jobs. No cache is currently used.
- Raw question and document text are not written to application logs by these services, but questions and answers are persisted as conversation history. Provider retention and data handling depend on the configured provider and account settings.
- When `OPENAI_API_KEY` is configured, document chunks and questions are sent to the configured embedding model as well as the generation provider. Review provider data handling before indexing sensitive documents. Embeddings are workspace-filtered in SQL before passages are sent to the AI answer endpoint.
