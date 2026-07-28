CREATE INDEX `ad_daily_facts_range_idx` ON `ad_daily_facts` (`user_id`,`account_id`,`report_date`);--> statement-breakpoint
CREATE INDEX `ad_daily_facts_sync_idx` ON `ad_daily_facts` (`account_id`,`sync_id`);--> statement-breakpoint
CREATE INDEX `ad_data_syncs_status_idx` ON `ad_data_syncs` (`user_id`,`account_id`,`status`,`updated_at`);