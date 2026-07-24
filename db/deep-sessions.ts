export type PrivateDeepSessionRecord = {
  tokenHash: string;
  revokeTokenHash: string;
  ciphertext: string;
  iv: string;
  expiresAt: number;
  createdAt: number;
  revokedAt: number | null;
};

export async function insertPrivateDeepSession(
  db: D1Database,
  record: PrivateDeepSessionRecord,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO deep_sessions
        (token_hash, revoke_token_hash, ciphertext, iv, expires_at, created_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
    )
    .bind(
      record.tokenHash,
      record.revokeTokenHash,
      record.ciphertext,
      record.iv,
      record.expiresAt,
      record.createdAt,
    )
    .run();
}

export async function findPrivateDeepSession(
  db: D1Database,
  tokenHash: string,
): Promise<PrivateDeepSessionRecord | null> {
  const row = await db
    .prepare(
      `SELECT token_hash, revoke_token_hash, ciphertext, iv,
              expires_at, created_at, revoked_at
       FROM deep_sessions
       WHERE token_hash = ?
       LIMIT 1`,
    )
    .bind(tokenHash)
    .first<{
      token_hash: string;
      revoke_token_hash: string;
      ciphertext: string;
      iv: string;
      expires_at: number;
      created_at: number;
      revoked_at: number | null;
    }>();

  if (!row) return null;
  return {
    tokenHash: row.token_hash,
    revokeTokenHash: row.revoke_token_hash,
    ciphertext: row.ciphertext,
    iv: row.iv,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  };
}

export async function revokePrivateDeepSession(
  db: D1Database,
  tokenHash: string,
  revokeTokenHash: string,
  revokedAt: number,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE deep_sessions
       SET revoked_at = ?
       WHERE token_hash = ?
         AND revoke_token_hash = ?
         AND revoked_at IS NULL`,
    )
    .bind(revokedAt, tokenHash, revokeTokenHash)
    .run();
  return result.meta.changes > 0;
}

