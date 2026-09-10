import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import * as schema from './schema';

// --------------------------------------------------------
// THE MASTER DATA DICTIONARY (For Frontend & AI)
// --------------------------------------------------------

// 1. Core Hierarchy
export type University = InferSelectModel<typeof schema.universities>;
export type NewUniversity = InferInsertModel<typeof schema.universities>; // Use this when creating a new entry

export type Course = InferSelectModel<typeof schema.courses>;
export type NewCourse = InferInsertModel<typeof schema.courses>;

export type Subject = InferSelectModel<typeof schema.subjects>;
export type NewSubject = InferInsertModel<typeof schema.subjects>;

// 2. Chapters & Resources
export type Chapter = InferSelectModel<typeof schema.chapters>;
export type SubjectResource = InferSelectModel<typeof schema.subjectResources>;

// 3. Bundles & Monetization
export type Bundle = InferSelectModel<typeof schema.bundles>;
export type BundleResource = InferSelectModel<typeof schema.bundleResources>;

// 4. Users & Purchases
export type Student = InferSelectModel<typeof schema.students>;
export type Purchase = InferSelectModel<typeof schema.purchases>;
export type PurchaseItem = InferSelectModel<typeof schema.purchaseItems>;

// --------------------------------------------------------
// ADVANCED JOIN TYPES (For Frontend UI Rendering)
// --------------------------------------------------------

// Use this type when fetching a Subject along with its Chapters and Resources
export type SubjectWithDetails = Subject & {
    chapters: (Chapter & {
        resources: SubjectResource[];
    })[];
};

// Use this type when displaying a Bundle to the user
export type BundleWithResources = Bundle & {
    resources: SubjectResource[];
};