CREATE TABLE `agent_profiles` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`revoke_token_hash` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE INDEX `agent_profiles_expiry_idx` ON `agent_profiles` (`expires_at`);