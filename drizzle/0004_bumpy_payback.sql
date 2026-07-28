CREATE TABLE `report_files` (
	`id` text PRIMARY KEY NOT NULL,
	`report_job_id` text NOT NULL,
	`part_number` integer NOT NULL,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`row_count` integer NOT NULL,
	`summary_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`report_job_id`) REFERENCES `report_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_files_object_key_unique` ON `report_files` (`object_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `report_files_job_part_idx` ON `report_files` (`report_job_id`,`part_number`);--> statement-breakpoint
CREATE TABLE `report_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`report_id` text,
	`create_tool` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`request_args` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_jobs_request_idx` ON `report_jobs` (`user_id`,`account_id`,`request_fingerprint`);--> statement-breakpoint
ALTER TABLE `accounts` ADD `marketplace` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `timezone` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `currency` text;