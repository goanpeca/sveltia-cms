import { stripSlashes } from '@sveltia/utils/string';
import { get } from 'svelte/store';

import github from '$lib/services/backends/git/github';
import {
  normalizeGraphQLBaseURL,
  normalizeRestBaseURL,
} from '$lib/services/backends/git/github/api';
import { getTokenPageURL } from '$lib/services/backends/git/github/auth';
import {
  DEFAULT_API_ROOT,
  DEFAULT_AUTH_PATH,
  DEFAULT_AUTH_ROOT,
  DEFAULT_PKCE_AUTH_PATH,
  DEFAULT_PKCE_AUTH_ROOT,
} from '$lib/services/backends/git/github/constants';
import { getBaseURLs, repository } from '$lib/services/backends/git/github/repository';
import { apiConfig, graphqlVars } from '$lib/services/backends/git/shared/api';
import { getRepoURL } from '$lib/services/backends/git/shared/repository';
import { cmsConfig } from '$lib/services/config';
import { prefs } from '$lib/services/user/prefs.svelte';

/**
 * @import { ApiEndpointConfig, BackendService, RepositoryInfo } from '$lib/types/private';
 */

/*
 * Cumbre Labs gateway backend.
 *
 * A thin, rebase-friendly alias of the GitHub backend for the Cumbre Labs
 * identity gateway: editors sign in with Google (or any IdP the worker
 * supports), a Cloudflare Worker checks the email allowlist and issues a
 * short-lived session JWT, and all GitHub traffic is proxied by the worker
 * using a delegated service-account PAT that never reaches the browser.
 *
 * Every GitHub backend method is reused as-is — they read all endpoints and the
 * provider name from `config.backend` at runtime. We override only:
 *   - `name`  -> 'cumbre-labs'. This is the config `backend.name` AND the
 *               OAuth provider string the worker must echo back, i.e. the popup
 *               posts `authorization:cumbre-labs:success:{"token": <JWT>}`.
 *   - `label` -> the sign-in button reads `backend.label` (`sign in with X`).
 *   - `init`  -> a copy of GitHub's `init` keyed to this name, because GitHub's
 *               own `init` returns early unless `backend.name === 'github'`.
 *
 * No secrets and no commit attribution live here; those are entirely in the
 * worker. In the site config, point `base_url` / `auth_endpoint` / `api_root` /
 * `graphql_api_root` at the worker and set `auth_methods: ['oauth']` so editors
 * can never hold a token.
 *
 * REBASE NOTE: this is a NEW file and never conflicts. The only edit to an
 * upstream file is one import + one entry in `../index.js`. If GitHub's `init`
 * changes upstream, reconcile this copy.
 */

const BACKEND_NAME = 'cumbre-labs';
const BACKEND_LABEL = 'Cumbre Labs';

/**
 * Initialize the Cumbre Labs gateway backend. Mirrors the GitHub backend's
 * `init`, keyed to this backend name.
 * @returns {RepositoryInfo | undefined} Repository info, or nothing when the
 * configured backend is not this one.
 */
export const init = () => {
  const { backend } = get(cmsConfig) ?? {};

  // `backend.name` is typed as the upstream `BackendName` union, which doesn’t
  // include this fork’s name; cast to string so the comparison type-checks
  // without editing the upstream union (keeps the rebase footprint to this file).
  if (/** @type {string | undefined} */ (backend?.name) !== BACKEND_NAME) {
    return undefined;
  }

  const {
    repo: projectPath,
    branch,
    auth_type: authType = '',
    // @ts-ignore PKCE is not yet supported
    base_url: authRoot = authType === 'pkce' ? DEFAULT_PKCE_AUTH_ROOT : DEFAULT_AUTH_ROOT,
    // @ts-ignore PKCE is not yet supported
    auth_endpoint: authPath = authType === 'pkce' ? DEFAULT_PKCE_AUTH_PATH : DEFAULT_AUTH_PATH,
    app_id: clientId = '',
    // GitHub Enterprise Server: https://HOSTNAME/api/v3
    api_root: restApiRoot = DEFAULT_API_ROOT,
    // GitHub Enterprise Server: https://HOSTNAME/api/graphql
    graphql_api_root: graphqlApiRoot = restApiRoot,
    include_credentials: includeCredentials = false,
  } = backend;

  const [owner, repo] = /** @type {string} */ (projectPath).split('/');
  const repoPath = `${owner}/${repo}`;
  const authURL = `${stripSlashes(authRoot)}/${stripSlashes(authPath)}`;
  const repoURL = getRepoURL(restApiRoot, repoPath);

  Object.assign(
    repository,
    /** @type {RepositoryInfo} */ ({
      service: BACKEND_NAME,
      label: BACKEND_LABEL,
      owner,
      repo,
      branch,
      repoURL,
      tokenPageURL: getTokenPageURL(repoURL),
      databaseName: `${BACKEND_NAME}:${repoPath}`,
      isSelfHosted: restApiRoot !== DEFAULT_API_ROOT,
    }),
    getBaseURLs(repoURL, branch),
  );

  Object.assign(
    apiConfig,
    /** @type {ApiEndpointConfig} */ ({
      clientId,
      authScope: 'repo,user',
      authURL,
      tokenURL: authURL.replace('/authorize', '/access_token'),
      restBaseURL: normalizeRestBaseURL(restApiRoot),
      graphqlBaseURL: normalizeGraphQLBaseURL(graphqlApiRoot),
      includeCredentials,
    }),
  );

  Object.assign(graphqlVars, { owner, repo, branch });

  if (prefs.devModeEnabled) {
    // eslint-disable-next-line no-console
    console.info('repositoryInfo', repository);
  }

  return repository;
};

/**
 * Cumbre Labs gateway backend service. Reuses every GitHub backend method and
 * overrides only the name, label, and init.
 * @type {BackendService}
 */
export default {
  ...github,
  name: BACKEND_NAME,
  label: BACKEND_LABEL,
  init,
};
