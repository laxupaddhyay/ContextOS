# Authentication setup

The API accepts OIDC access tokens outside the `local` Spring profile. It verifies the token signature, issuer, timestamps, and configured audience before resolving a stable internal user identity. The React client uses authorization code flow with PKCE through `oidc-client-ts`; it has no client secret.

## Configure an OIDC provider

1. Register a public single page application client with authorization code flow and PKCE enabled. Register `http://localhost:5173/` as both the sign-in redirect URI and sign-out redirect URI for local testing. Use the deployed HTTPS frontend origin in production. Allow the frontend origin to call the provider's discovery, authorization, and token endpoints from the browser.
2. Configure an API audience and a scope that lets this client request access tokens for the ContextOS API. Provider-specific audience and scope configuration varies.
3. Copy `.env.example` to `.env` and set these values:

   - `SPRING_PROFILES_ACTIVE=oidc` (any non-`local` profile enables JWT authentication).
   - `OIDC_ISSUER_URI` to the exact issuer identifier from the provider's discovery document and access tokens.
   - `OIDC_API_AUDIENCE` to the audience value that appears in the API access token.
   - `VITE_AUTH_MODE=oidc`, `VITE_OIDC_AUTHORITY` to the same issuer, and `VITE_OIDC_CLIENT_ID` to the public SPA client ID.
   - `VITE_OIDC_SCOPE` to `openid profile email` plus the provider's API scope.
   - `CORS_ALLOWED_ORIGIN` to the exact frontend origin.

4. Rebuild and restart Compose (`docker compose -f infra/compose.yaml up --build`) so the API and Vite process load the new settings and the browser dependency is included. Keep the issuer, audience, scope, redirect URIs, and frontend origin aligned with the provider configuration.

The API deliberately requires `OIDC_API_AUDIENCE`; a valid token from the same issuer that was issued for another application is rejected. The access token must contain a `sub` and the configured issuer. ContextOS maps that issuer and subject to an internal user ID and does not link accounts based only on email. A first sign-in creates a user record; workspaces created under the local demo identity remain separate.

## Local demo mode

Docker Compose defaults to `SPRING_PROFILES_ACTIVE=local` and `VITE_AUTH_MODE=local` for the local prototype. In this profile only, the API accepts `X-User-Id` and defaults it to the demo user. Do not expose this profile to a network or deployment. For a direct API launch, use `mvn spring-boot:run -Dspring-boot.run.profiles=local` when you want the demo identity; with no local profile, OIDC settings are required.

OIDC sign-in state and access tokens are stored in browser session storage. When a token expires or the API rejects it, the browser returns to sign-in. Logout redirects through the provider's end-session endpoint when supported.
