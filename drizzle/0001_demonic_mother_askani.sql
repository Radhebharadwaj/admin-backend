DROP TABLE IF EXISTS `contributors`;
CREATE TABLE `contributors` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`github_or_twitter_link` text,
	`amount_in_paise` integer NOT NULL,
	`razorpay_order_id` text,
	`razorpay_payment_id` text,
	`is_verified` integer DEFAULT false,
	`is_test` integer DEFAULT false,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);