CREATE TABLE `model_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`base_url` text NOT NULL,
	`model_name` text NOT NULL,
	`user_agent` text,
	`encrypted_api_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
