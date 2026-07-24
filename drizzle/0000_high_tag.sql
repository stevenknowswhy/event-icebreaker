CREATE TABLE `deep_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`revoke_token_hash` text NOT NULL,
	`ciphertext` text NOT NULL,
	`iv` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE INDEX `deep_sessions_expiry_idx` ON `deep_sessions` (`expires_at`);