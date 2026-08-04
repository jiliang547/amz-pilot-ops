CREATE TABLE `sp_api_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`encrypted_credentials` text NOT NULL,
	`region` text NOT NULL,
	`marketplace_id` text NOT NULL,
	`marketplace_name` text NOT NULL,
	`country_code` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
