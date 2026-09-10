CREATE TABLE `bundle_resources` (
	`bundle_id` text NOT NULL,
	`resource_id` text NOT NULL,
	FOREIGN KEY (`bundle_id`) REFERENCES `bundles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resource_id`) REFERENCES `subject_resources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pk_bundle_resources` ON `bundle_resources` (`bundle_id`,`resource_id`);--> statement-breakpoint
CREATE INDEX `idx_bundle_resources_resource_id` ON `bundle_resources` (`resource_id`);--> statement-breakpoint
CREATE TABLE `bundles` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`original_price_in_paise` integer NOT NULL,
	`discount_price_in_paise` integer NOT NULL,
	`thumbnail_url` text,
	`is_published` integer DEFAULT 0,
	`is_active` integer DEFAULT 1,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	`deleted_at` text,
	`updated_by` text
);
--> statement-breakpoint
CREATE TABLE `chapters` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_id` text NOT NULL,
	`unit_number` integer,
	`unit_name` text,
	`chapter_number` integer NOT NULL,
	`title` text NOT NULL,
	`is_published` integer DEFAULT 0,
	`is_active` integer DEFAULT 1,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	`deleted_at` text,
	`updated_by` text,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_chapters_subject_chapter` ON `chapters` (`subject_id`,`chapter_number`);--> statement-breakpoint
CREATE INDEX `idx_chapters_subject_id` ON `chapters` (`subject_id`);--> statement-breakpoint
CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`university_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`acronym` text,
	`duration_years` integer,
	`total_semesters` integer NOT NULL,
	`search_aliases` text DEFAULT '',
	`is_active` integer DEFAULT 1,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	`deleted_at` text,
	`updated_by` text,
	FOREIGN KEY (`university_id`) REFERENCES `universities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_courses_univ_slug` ON `courses` (`university_id`,`slug`);--> statement-breakpoint
CREATE INDEX `idx_courses_university_id` ON `courses` (`university_id`);--> statement-breakpoint
CREATE TABLE `purchase_items` (
	`purchase_id` text NOT NULL,
	`resource_id` text NOT NULL,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resource_id`) REFERENCES `subject_resources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pk_purchase_items` ON `purchase_items` (`purchase_id`,`resource_id`);--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`item_type` text NOT NULL,
	`resource_id` text,
	`bundle_id` text,
	`amount_in_paise` integer NOT NULL,
	`currency` text DEFAULT 'INR',
	`status` text DEFAULT 'PENDING' NOT NULL,
	`gateway_order_id` text,
	`gateway_payment_id` text,
	`access_expires_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resource_id`) REFERENCES `subject_resources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bundle_id`) REFERENCES `bundles`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "purchase_type_check" CHECK((item_type = 'RESOURCE' AND resource_id IS NOT NULL AND bundle_id IS NULL) OR (item_type = 'BUNDLE' AND bundle_id IS NOT NULL AND resource_id IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_purchases_unique_resource` ON `purchases` (`student_id`,`resource_id`) WHERE item_type = 'RESOURCE' AND status = 'SUCCESS';--> statement-breakpoint
CREATE UNIQUE INDEX `idx_purchases_unique_bundle` ON `purchases` (`student_id`,`bundle_id`) WHERE item_type = 'BUNDLE' AND status = 'SUCCESS';--> statement-breakpoint
CREATE INDEX `idx_purchases_gateway_order_id` ON `purchases` (`gateway_order_id`);--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`avatar_url` text,
	`google_id` text,
	`last_login_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `students_email_unique` ON `students` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `students_google_id_unique` ON `students` (`google_id`);--> statement-breakpoint
CREATE TABLE `subject_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_id` text NOT NULL,
	`chapter_id` text,
	`category` text NOT NULL,
	`content_type` text DEFAULT 'external_url',
	`title` text NOT NULL,
	`description` text,
	`rich_text_content` text,
	`r2_object_key` text DEFAULT '',
	`external_url` text,
	`thumbnail_url` text,
	`sequence_number` integer DEFAULT 0,
	`exam_type` text,
	`exam_year` integer,
	`is_public` integer DEFAULT 0,
	`is_published` integer DEFAULT 0,
	`price_in_paise` integer DEFAULT 0,
	`free_after_date` text,
	`valid_from` text,
	`submission_deadline` text,
	`academic_year` text,
	`is_active` integer DEFAULT 1,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	`deleted_at` text,
	`updated_by` text,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "resource_source_check" CHECK((r2_object_key IS NOT NULL AND r2_object_key != '') OR (external_url IS NOT NULL AND external_url != '') OR (rich_text_content IS NOT NULL AND rich_text_content != ''))
);
--> statement-breakpoint
CREATE INDEX `idx_subject_resources_subject_id` ON `subject_resources` (`subject_id`);--> statement-breakpoint
CREATE INDEX `idx_subject_resources_chapter_id` ON `subject_resources` (`chapter_id`);--> statement-breakpoint
CREATE INDEX `idx_subject_resources_sorting` ON `subject_resources` (`chapter_id`,`sequence_number`);--> statement-breakpoint
CREATE TABLE `subjects` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_code` text NOT NULL,
	`name` text NOT NULL,
	`course_id` text NOT NULL,
	`semester` integer NOT NULL,
	`search_aliases` text DEFAULT '',
	`is_active` integer DEFAULT 1,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	`deleted_at` text,
	`updated_by` text,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_subjects_course_sem_code` ON `subjects` (`course_id`,`semester`,`subject_code`);--> statement-breakpoint
CREATE INDEX `idx_subjects_course_id` ON `subjects` (`course_id`);--> statement-breakpoint
CREATE TABLE `universities` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`acronym` text,
	`website_url` text,
	`logo_url` text,
	`search_aliases` text DEFAULT '',
	`is_active` integer DEFAULT 1,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	`deleted_at` text,
	`updated_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `universities_slug_unique` ON `universities` (`slug`);