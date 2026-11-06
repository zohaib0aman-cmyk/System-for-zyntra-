// Public data/service layer. Reuse these from server actions, API routes and the MCP server.
// Every write function accepts { actor } ("owner" | "claude" | "gpt" | "system" | any AI name)
// and records what it did in the lead's timeline.
export * from "./types";
export * from "./activities";
export * from "./leads";
export * from "./leadList";
export * from "./niches";
export * from "./pipeline";
export * from "./followups";
export * from "./tags";
export * from "./imports";
export * from "./logos";
