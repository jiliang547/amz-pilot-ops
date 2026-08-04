CREATE TABLE IF NOT EXISTS `model_token_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`model_name` text NOT NULL,
	`model_source` text NOT NULL,
	`operation` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`provider_reported` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `model_token_usage_user_time_idx` ON `model_token_usage` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `review_api_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`encrypted_api_key` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `review_items` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`review_id` text NOT NULL,
	`asin` text NOT NULL,
	`marketplace` text NOT NULL,
	`user_name` text,
	`rating` integer NOT NULL,
	`title` text,
	`review_date` text,
	`review_content` text,
	`verified_purchase` integer DEFAULT false NOT NULL,
	`helpful_votes` integer DEFAULT 0 NOT NULL,
	`product_variant` text,
	`images_json` text DEFAULT '[]' NOT NULL,
	`page` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `review_tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `review_items_task_review_idx` ON `review_items` (`task_id`,`review_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `review_items_task_rating_idx` ON `review_items` (`task_id`,`rating`,`review_date`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `review_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`asin` text NOT NULL,
	`marketplace` text NOT NULL,
	`pages` integer NOT NULL,
	`star_mode` text NOT NULL,
	`stars_json` text NOT NULL,
	`sort_by` text NOT NULL,
	`reviewer_type` text NOT NULL,
	`media_type` text NOT NULL,
	`variant` text NOT NULL,
	`status` text NOT NULL,
	`upstream_tasks_json` text NOT NULL,
	`review_count` integer DEFAULT 0 NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `review_tasks_user_time_idx` ON `review_tasks` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `review_tasks_status_idx` ON `review_tasks` (`user_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `site_models` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`base_url` text NOT NULL,
	`model_name` text NOT NULL,
	`user_agent` text,
	`encrypted_api_key` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `site_models_enabled_idx` ON `site_models` (`enabled`,`updated_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_model_selections` (
	`user_id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`preset_model_id` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`preset_model_id`) REFERENCES `site_models`(`id`) ON UPDATE no action ON DELETE set null
);
