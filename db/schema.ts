import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const deepSessions = sqliteTable(
  "deep_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    revokeTokenHash: text("revoke_token_hash").notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
    revokedAt: integer("revoked_at"),
  },
  (table) => [index("deep_sessions_expiry_idx").on(table.expiresAt)],
);

export const agentProfiles = sqliteTable(
  "agent_profiles",
  {
    tokenHash: text("token_hash").primaryKey(),
    revokeTokenHash: text("revoke_token_hash").notNull(),
    snapshotJson: text("snapshot_json").notNull(),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
    revokedAt: integer("revoked_at"),
  },
  (table) => [index("agent_profiles_expiry_idx").on(table.expiresAt)],
);
