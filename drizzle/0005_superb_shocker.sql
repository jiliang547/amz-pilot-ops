CREATE TABLE `report_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`report_type` text NOT NULL,
	`window_key` text NOT NULL,
	`snapshot_date` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`report_id` text,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`metrics_json` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_snapshots_window_idx` ON `report_snapshots` (`account_id`,`report_type`,`window_key`,`snapshot_date`);