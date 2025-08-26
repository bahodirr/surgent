/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as actions_agent from "../actions/agent.js";
import type * as actions_sandbox from "../actions/sandbox.js";
import type * as agentic_agent_adapter from "../agentic/agent/adapter.js";
import type * as agentic_agent_base from "../agentic/agent/base.js";
import type * as agentic_agent_claude from "../agentic/agent/claude.js";
import type * as agentic_agent_types from "../agentic/agent/types.js";
import type * as agentic_agent_utils from "../agentic/agent/utils.js";
import type * as agentic_constants_agents from "../agentic/constants/agents.js";
import type * as agentic_constants_index from "../agentic/constants/index.js";
import type * as agentic_constants_providers from "../agentic/constants/providers.js";
import type * as agentic_sandbox_daytona from "../agentic/sandbox/daytona.js";
import type * as auth from "../auth.js";
import type * as commits from "../commits.js";
import type * as http from "../http.js";
import type * as projects from "../projects.js";
import type * as sessions from "../sessions.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  "actions/agent": typeof actions_agent;
  "actions/sandbox": typeof actions_sandbox;
  "agentic/agent/adapter": typeof agentic_agent_adapter;
  "agentic/agent/base": typeof agentic_agent_base;
  "agentic/agent/claude": typeof agentic_agent_claude;
  "agentic/agent/types": typeof agentic_agent_types;
  "agentic/agent/utils": typeof agentic_agent_utils;
  "agentic/constants/agents": typeof agentic_constants_agents;
  "agentic/constants/index": typeof agentic_constants_index;
  "agentic/constants/providers": typeof agentic_constants_providers;
  "agentic/sandbox/daytona": typeof agentic_sandbox_daytona;
  auth: typeof auth;
  commits: typeof commits;
  http: typeof http;
  projects: typeof projects;
  sessions: typeof sessions;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
