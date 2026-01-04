import { sqliteTable, text, integer, uniqueIndex, index, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';

// Helper for generating Time-sorted UUIDv7
const generateId = () => uuidv7();

// --------------------------------------------------------
// 1. CORE HIERARCHY
// --------------------------------------------------------
export const universities = sqliteTable('universities', {
    id: text('id').primaryKey().$defaultFn(generateId),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    acronym: text('acronym'),
    websiteUrl: text('website_url'),
    logoUrl: text('logo_url'),
    searchAliases: text('search_aliases').default(''),
    isActive: integer('is_active').default(1),
    createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`),
    deletedAt: text('deleted_at'),
    updatedBy: text('updated_by'),
});

export const courses = sqliteTable('courses', {
    id: text('id').primaryKey().$defaultFn(generateId),
    universityId: text('university_id').notNull().references(() => universities.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    acronym: text('acronym'),
    durationYears: integer('duration_years'),
    totalSemesters: integer('total_semesters').notNull(),
    searchAliases: text('search_aliases').default(''),
    isActive: integer('is_active').default(1),
    createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`),
    deletedAt: text('deleted_at'),
    updatedBy: text('updated_by'),
}, (table) => ({
    universitySlugUnique: uniqueIndex('idx_courses_univ_slug').on(table.universityId, table.slug),
    univIdx: index('idx_courses_university_id').on(table.universityId),
}));

export const subjects = sqliteTable('subjects', {
    id: text('id').primaryKey().$defaultFn(generateId),
    subjectCode: text('subject_code').notNull(),
    name: text('name').notNull(),
    courseId: text('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
    semester: integer('semester').notNull(),
    searchAliases: text('search_aliases').default(''),
    isActive: integer('is_active').default(1),
    createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`),
    deletedAt: text('deleted_at'),
    updatedBy: text('updated_by'),
}, (table) => ({
    courseSemCodeUnique: uniqueIndex('idx_subjects_course_sem_code').on(table.courseId, table.semester, table.subjectCode),
    courseIdx: index('idx_subjects_course_id').on(table.courseId),
}));

// --------------------------------------------------------
// 2. CONTENT ORGANIZATION
// --------------------------------------------------------
export const chapters = sqliteTable('chapters', {
    id: text('id').primaryKey().$defaultFn(generateId),
    subjectId: text('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
    unitNumber: integer('unit_number'),
    unitName: text('unit_name'),
    chapterNumber: integer('chapter_number').notNull(),
    title: text('title').notNull(),
    isPublished: integer('is_published').default(0),
    isActive: integer('is_active').default(1),
    priceInPaise: integer('price_in_paise').default(0),
    createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`),
    deletedAt: text('deleted_at'),
    updatedBy: text('updated_by'),
}, (table) => ({
    subjChapUnique: uniqueIndex('idx_chapters_subject_chapter').on(table.subjectId, table.chapterNumber),
    subjIdx: index('idx_chapters_subject_id').on(table.subjectId),
}));

// --------------------------------------------------------
// 3. THE RESOURCES (BULLETPROOF)
// --------------------------------------------------------
export const subjectResources = sqliteTable('subject_resources', {
    id: text('id').primaryKey().$defaultFn(generateId),
    subjectId: text('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
    chapterId: text('chapter_id').references(() => chapters.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    contentType: text('content_type').default('external_url'),
    title: text('title').notNull(),
    description: text('description'),
    richTextContent: text('rich_text_content'),
    r2ObjectKey: text('r2_object_key').default(''),
    externalUrl: text('external_url'),
    thumbnailUrl: text('thumbnail_url'),
    sequenceNumber: integer('sequence_number').default(0),
    examType: text('exam_type'),
    examYear: integer('exam_year'),
    isPublic: integer('is_public').default(0),
    isPublished: integer('is_published').default(0),
    priceInPaise: integer('price_in_paise').default(0),
    freeAfterDate: text('free_after_date'),
    validFrom: text('valid_from'),
    submissionDeadline: text('submission_deadline'),
    academicYear: text('academic_year'),
    isActive: integer('is_active').default(1),
    createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`),
    deletedAt: text('deleted_at'),
    updatedBy: text('updated_by'),
}, (table) => ({
    sourceCheck: check('resource_source_check', sql`(r2_object_key IS NOT NULL AND r2_object_key != '') OR (external_url IS NOT NULL AND external_url != '') OR (rich_text_content IS NOT NULL AND rich_text_content != '')`),
    subjIdx: index('idx_subject_resources_subject_id').on(table.subjectId),
    chapIdx: index('idx_subject_resources_chapter_id').on(table.chapterId),
    sortingIdx: index('idx_subject_resources_sorting').on(table.chapterId, table.sequenceNumber),
}));

// --------------------------------------------------------
// 4. BUNDLES & SNAPSHOTS
// --------------------------------------------------------
export const bundles = sqliteTable('bundles', {
    id: text('id').primaryKey().$defaultFn(generateId),
    title: text('title').notNull(),
    description: text('description'),
    originalPriceInPaise: integer('original_price_in_paise').notNull(),
    discountPriceInPaise: integer('discount_price_in_paise').notNull(),
    thumbnailUrl: text('thumbnail_url'),
    isPublished: integer('is_published').default(0),
    isActive: integer('is_active').default(1),
    createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`),
    deletedAt: text('deleted_at'),
    updatedBy: text('updated_by'),
});

export const bundleResources = sqliteTable('bundle_resources', {
    bundleId: text('bundle_id').notNull().references(() => bundles.id, { onDelete: 'cascade' }),
    resourceId: text('resource_id').notNull().references(() => subjectResources.id, { onDelete: 'cascade' }),
}, (table) => ({
    pk: uniqueIndex('pk_bundle_resources').on(table.bundleId, table.resourceId),
    resIdx: index('idx_bundle_resources_resource_id').on(table.resourceId),
}));

// --------------------------------------------------------
// 5. USERS & PURCHASES
// --------------------------------------------------------
export const students = sqliteTable('students', {
    id: text('id').primaryKey().$defaultFn(generateId),
    email: text('email').notNull().unique(),
    name: text('name'),
    avatarUrl: text('avatar_url'),
    googleId: text('google_id').unique(),
    lastLoginAt: text('last_login_at'),
    createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`),
});

export const purchases = sqliteTable('purchases', {
    id: text('id').primaryKey().$defaultFn(generateId),
    studentId: text('student_id').notNull().references(() => students.id),
    itemType: text('item_type').notNull(),
    resourceId: text('resource_id').references(() => subjectResources.id),
    bundleId: text('bundle_id').references(() => bundles.id),
    amountInPaise: integer('amount_in_paise').notNull(),
    currency: text('currency').default('INR'),
    status: text('status').default('PENDING').notNull(),
    gatewayOrderId: text('gateway_order_id'),
    gatewayPaymentId: text('gateway_payment_id'),
    accessExpiresAt: text('access_expires_at'),
    createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => ({
    typeCheck: check('purchase_type_check', sql`(item_type = 'RESOURCE' AND resource_id IS NOT NULL AND bundle_id IS NULL) OR (item_type = 'BUNDLE' AND bundle_id IS NOT NULL AND resource_id IS NULL)`),
    uniqueResourcePurchase: uniqueIndex('idx_purchases_unique_resource')
        .on(table.studentId, table.resourceId)
        .where(sql`item_type = 'RESOURCE' AND status = 'SUCCESS'`),
    uniqueBundlePurchase: uniqueIndex('idx_purchases_unique_bundle')
        .on(table.studentId, table.bundleId)
        .where(sql`item_type = 'BUNDLE' AND status = 'SUCCESS'`),
    gatewayIdx: index('idx_purchases_gateway_order_id').on(table.gatewayOrderId),
}));

export const purchaseItems = sqliteTable('purchase_items', {
    purchaseId: text('purchase_id').notNull().references(() => purchases.id, { onDelete: 'cascade' }),
    resourceId: text('resource_id').notNull().references(() => subjectResources.id),
}, (table) => ({
    pk: uniqueIndex('pk_purchase_items').on(table.purchaseId, table.resourceId),
}));