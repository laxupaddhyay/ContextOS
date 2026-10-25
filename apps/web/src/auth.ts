import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts';

export const authMode = (import.meta.env.VITE_AUTH_MODE || 'local').toLowerCase();
export const isLocalAuth = authMode === 'local';
const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1';
let manager: UserManager | undefined;
let initialization: Promise<User | null> | undefined;

function oidcManager(): UserManager {
  if (manager) return manager;
  const authority = import.meta.env.VITE_OIDC_AUTHORITY;
  const clientId = import.meta.env.VITE_OIDC_CLIENT_ID;
  if (!authority || !clientId) {
    throw new Error('OIDC mode needs VITE_OIDC_AUTHORITY and VITE_OIDC_CLIENT_ID.');
  }
  manager = new UserManager({
    authority,
    client_id: clientId,
    redirect_uri: `${window.location.origin}/`,
    post_logout_redirect_uri: `${window.location.origin}/`,
    response_type: 'code',
    automaticSilentRenew: false,
    scope: import.meta.env.VITE_OIDC_SCOPE || 'openid profile email',
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  });
  return manager;
}

export function finishSignIn(): Promise<User | null> {
  if (isLocalAuth) return Promise.resolve(null);
  if (!initialization) {
    initialization = (async () => {
      const client = oidcManager();
      const query = new URLSearchParams(window.location.search);
      if (query.has('code') || query.has('error')) {
        await client.signinCallback();
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      const user = await client.getUser();
      return user && !user.expired ? user : null;
    })();
  }
  return initialization;
}

export async function beginSignIn(): Promise<void> {
  await oidcManager().signinRedirect();
}

export async function signOut(): Promise<void> {
  if (isLocalAuth) return;
  const client = oidcManager();
  try {
    await client.signoutRedirect();
  } catch {
    await client.removeUser();
    window.location.assign(window.location.origin);
  }
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (isLocalAuth) {
    headers.set('X-User-Id', '00000000-0000-0000-0000-000000000001');
  } else {
    const client = oidcManager();
    const user = await client.getUser();
    if (!user || user.expired) {
      await client.removeUser();
      await client.signinRedirect();
      throw new Error('Your sign-in expired. Redirecting to sign in again.');
    }
    headers.set('Authorization', `Bearer ${user.access_token}`);
  }
  const response = await fetch(`${apiBase}${path}`, { ...init, headers });
  if (response.status === 401 && !isLocalAuth) {
    const client = oidcManager();
    await client.removeUser();
    await client.signinRedirect();
  }
  return response;
}
