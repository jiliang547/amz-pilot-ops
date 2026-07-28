CREATE TABLE `ad_keyword_daily_facts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`report_date` text NOT NULL,
	`campaign_id` text NOT NULL,
	`campaign_name` text,
	`ad_group_id` text NOT NULL,
	`ad_group_name` text,
	`keyword_id` text NOT NULL,
	`keyword` text NOT NULL,
	`keyword_type` text,
	`match_type` text,
	`keyword_bid` real,
	`keyword_status` text,
	`impressions` integer DEFAULT 0 NOT NULL,
	`clicks` integer DEFAULT 0 NOT NULL,
	`cost` real DEFAULT 0 NOT NULL,
	`purchases` real DEFAULT 0 NOT NULL,
	`sales` real DEFAULT 0 NOT NULL,
	`attribution_final` integer DEFAULT false NOT NULL,
	`source_report_id` text NOT NULL,
	`sync_id` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ad_keyword_daily_facts_key_idx` ON `ad_keyword_daily_facts` (`account_id`,`report_date`,`campaign_id`,`ad_group_id`,`keyword_id`);--> statement-breakpoint
CREATE INDEX `ad_keyword_daily_facts_range_idx` ON `ad_keyword_daily_facts` (`user_id`,`account_id`,`report_date`);--> statement-breakpoint
CREATE INDEX `ad_keyword_daily_facts_sync_idx` ON `ad_keyword_daily_facts` (`account_id`,`sync_id`);--> statement-breakpoint
CREATE TABLE `ad_report_syncs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`sync_date` text NOT NULL,
	`report_kind` text NOT NULL,
	`mode` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`report_id` text,
	`status` text NOT NULL,
	`rows_upserted` integer DEFAULT 0 NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ad_report_syncs_account_date_kind_idx` ON `ad_report_syncs` (`account_id`,`sync_date`,`report_kind`);--> statement-breakpoint
CREATE INDEX `ad_report_syncs_status_idx` ON `ad_report_syncs` (`user_id`,`account_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `ad_search_term_daily_facts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`report_date` text NOT NULL,
	`campaign_id` text NOT NULL,
	`campaign_name` text,
	`ad_group_id` text NOT NULL,
	`ad_group_name` text,
	`keyword_id` text NOT NULL,
	`keyword` text,
	`keyword_type` text,
	`match_type` text,
	`targeting` text,
	`search_term` text NOT NULL,
	`impressions` integer DEFAULT 0 NOT NULL,
	`clicks` integer DEFAULT 0 NOT NULL,
	`cost` real DEFAULT 0 NOT NULL,
	`purchases` real DEFAULT 0 NOT NULL,
	`sales` real DEFAULT 0 NOT NULL,
	`attribution_final` integer DEFAULT false NOT NULL,
	`source_report_id` text NOT NULL,
	`sync_id` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ad_search_term_daily_facts_key_idx` ON `ad_search_term_daily_facts` (`account_id`,`report_date`,`campaign_id`,`ad_group_id`,`keyword_id`,`search_term`);--> statement-breakpoint
CREATE INDEX `ad_search_term_daily_facts_range_idx` ON `ad_search_term_daily_facts` (`user_id`,`account_id`,`report_date`);--> statement-breakpoint
CREATE INDEX `ad_search_term_daily_facts_sync_idx` ON `ad_search_term_daily_facts` (`account_id`,`sync_id`);