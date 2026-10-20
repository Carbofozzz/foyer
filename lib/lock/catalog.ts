/** Groups of similar runtimes. Brands are examples, not a closed list. */
export const BROKER_GROUPS = ["mcp", "http", "plugin", "extension", "cloud", "hosted"] as const;
export type BrokerGroup = (typeof BROKER_GROUPS)[number];

export const GROUP_SETUP: Record<
  BrokerGroup,
  { form: "program" | "http" | "plugin" | "extension" | "cloud" | "hosted"; ready: boolean; terminal: boolean }
> = {
  mcp: { form: "program", ready: true, terminal: true },
  http: { form: "http", ready: true, terminal: false },
  plugin: { form: "plugin", ready: false, terminal: false },
  extension: { form: "extension", ready: false, terminal: false },
  cloud: { form: "cloud", ready: false, terminal: false },
  hosted: { form: "hosted", ready: false, terminal: false },
};
