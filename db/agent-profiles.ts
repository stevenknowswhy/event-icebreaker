export type AgentProfileRecord = {
  tokenHash: string;
  revokeTokenHash: string;
  snapshotJson: string;
  expiresAt: number;
  createdAt: number;
  revokedAt: number | null;
};

export async function insertAgentProfile(
  db: D1Database,
  record: AgentProfileRecord,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO agent_profiles
        (token_hash, revoke_token_hash, snapshot_json, expires_at, created_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, NULL)`,
    )
    .bind(
      record.tokenHash,
      record.revokeTokenHash,
      record.snapshotJson,
      record.expiresAt,
      record.createdAt,
    )
    .run();
}

export async function findAgentProfile(
  db: D1Database,
  tokenHash: string,
): Promise<AgentProfileRecord | null> {
  const row = await db
    .prepare(
      `SELECT token_hash, revoke_token_hash, snapshot_json,
              expires_at, created_at, revoked_at
       FROM agent_profiles
       WHERE token_hash = ?
       LIMIT 1`,
    )
    .bind(tokenHash)
    .first<{
      token_hash: string;
      revoke_token_hash: string;
      snapshot_json: string;
      expires_at: number;
      created_at: number;
      revoked_at: number | null;
    }>();

  if (!row) return null;
  return {
    tokenHash: row.token_hash,
    revokeTokenHash: row.revoke_token_hash,
    snapshotJson: row.snapshot_json,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  };
}

export async function revokeAgentProfile(
  db: D1Database,
  tokenHash: string,
  revokeTokenHash: string,
  revokedAt: number,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE agent_profiles
       SET revoked_at = ?
       WHERE token_hash = ?
         AND revoke_token_hash = ?
         AND revoked_at IS NULL`,
    )
    .bind(revokedAt, tokenHash, revokeTokenHash)
    .run();
  return result.meta.changes > 0;
}
