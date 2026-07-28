CREATE TABLE `ad_anomaly_analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`analysis_date` text NOT NULL,
	`report_kind` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`model_name` text NOT NULL,
	`status` text NOT NULL,
	`prompt` text NOT NULL,
	`summary` text,
	`anomalies_json` text,
	`raw_response` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ad_anomaly_analyses_account_date_kind_idx` ON `ad_anomaly_analyses` (`account_id`,`analysis_date`,`report_kind`);--> statement-breakpoint
CREATE INDEX `ad_anomaly_analyses_history_idx` ON `ad_anomaly_analyses` (`user_id`,`account_id`,`analysis_date`);