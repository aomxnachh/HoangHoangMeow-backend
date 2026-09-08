import {
	boolean,
	date,
	integer,
	numeric,
	pgEnum,
	pgTable,
	serial,
	text,
	timestamp,
	varchar,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const planTypeEnum = pgEnum('plan_type', ['FREE', 'PREMIUM']);
export const paymentStatusEnum = pgEnum('payment_status', ['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED']);
export const genderEnum = pgEnum('gender', ['MALE', 'FEMALE', 'UNKNOWN']);
export const activityStatusEnum = pgEnum('activity_status', ['PENDING', 'DONE', 'CANCELLED']);
export const userRoleEnum = pgEnum('user_role', ['USER', 'ADMIN']);
export const authProviderEnum = pgEnum('auth_provider', ['EMAIL', 'GOOGLE', 'APPLE']);

export const users = pgTable('user', {
	id: serial('id').primaryKey(),
	username: varchar('username', { length: 100 }).notNull(),
	email: varchar('email', { length: 255 }).notNull().unique(),
	passwordHash: varchar('password_hash', { length: 255 }).notNull(),
	phone: varchar('phone', { length: 30 }),
	role: userRoleEnum('role').notNull().default('USER'),
	authProvider: authProviderEnum('auth_provider').notNull().default('EMAIL'),
	authProviderId: varchar('auth_provider_id', { length: 255 }),
	googleId: varchar('google_id', { length: 255 }).unique(),
	appleId: varchar('apple_id', { length: 255 }).unique(),
	planType: planTypeEnum('plan_type').notNull().default('FREE'),
	deletedAt: timestamp('deleted_at'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const passwordResetTokens = pgTable('password_reset_token', {
	id: serial('id').primaryKey(),
	userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	tokenHash: varchar('token_hash', { length: 128 }).notNull().unique(),
	expiresAt: timestamp('expires_at').notNull(),
	usedAt: timestamp('used_at'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const petCategories = pgTable('pet_category', {
	id: serial('id').primaryKey(),
	species: varchar('species', { length: 100 }).notNull(),
	breed: varchar('breed', { length: 100 }),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const pets = pgTable('pet', {
	petId: serial('pet_id').primaryKey(),
	userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	petCategoryId: integer('pet_category_id').notNull().references(() => petCategories.id, { onDelete: 'restrict' }),
	gender: genderEnum('gender').notNull().default('UNKNOWN'),
	name: varchar('name', { length: 100 }).notNull(),
	weight: numeric('weight', { precision: 6, scale: 2 }),
	birthdate: date('birthdate'),
	avatarUrl: text('avatar_url'),
	color: varchar('color', { length: 100 }),
	allergies: text('allergies'),
	notes: text('notes'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const payments = pgTable('payment', {
	id: serial('id').primaryKey(),
	userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
	status: paymentStatusEnum('status').notNull().default('PENDING'),
	provider: varchar('provider', { length: 50 }),
	reference: varchar('reference', { length: 255 }),
	periodEnd: timestamp('period_end'),
	cancelledAt: timestamp('cancelled_at'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const activities = pgTable('activity', {
	id: serial('id').primaryKey(),
	petId: integer('pet_id').notNull().references(() => pets.petId, { onDelete: 'cascade' }),
	entryType: varchar('entry_type', { length: 30 }).notNull().default('HEALTH_RECORD'),
	activityType: varchar('activity_type', { length: 100 }).notNull(),
	title: varchar('title', { length: 255 }).notNull(),
	detail: text('detail'),
	activityDate: date('activity_date').notNull(),
	scheduledAt: timestamp('scheduled_at'),
	reminderMinutes: integer('reminder_minutes'),
	recurrenceDays: integer('recurrence_days'),
	snoozedUntil: timestamp('snoozed_until'),
	completedAt: timestamp('completed_at'),
	provider: varchar('provider', { length: 255 }),
	cost: numeric('cost', { precision: 10, scale: 2 }),
	productUrl: text('product_url'),
	status: activityStatusEnum('status').notNull().default('PENDING'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const expenses = pgTable('expense', {
	id: serial('id').primaryKey(),
	petId: integer('pet_id').notNull().references(() => pets.petId, { onDelete: 'cascade' }),
	date: date('date').notNull(),
	category: varchar('category', { length: 100 }).notNull(),
	description: text('description'),
	amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const carePlans = pgTable('care_plan', {
	id: serial('id').primaryKey(),
	petId: integer('pet_id').notNull().references(() => pets.petId, { onDelete: 'cascade' }),
	title: varchar('title', { length: 255 }).notNull(),
	detail: text('detail'),
	frequencyDays: integer('frequency_days'),
	nextDueAt: timestamp('next_due_at'),
	status: activityStatusEnum('status').notNull().default('PENDING'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const ads = pgTable('ads', {
	id: serial('id').primaryKey(),
	petCategoryId: integer('pet_category_id').references(() => petCategories.id, { onDelete: 'cascade' }),
	location: varchar('location', { length: 255 }),
	title: varchar('title', { length: 255 }),
	content: text('content').notNull(),
	imageUrl: text('image_url'),
	targetUrl: text('target_url'),
	isActive: boolean('is_active').notNull().default(true),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const careRecommends = pgTable('care_recommend', {
	id: serial('id').primaryKey(),
	petCategoryId: integer('pet_category_id').references(() => petCategories.id, { onDelete: 'cascade' }),
	ageRange: varchar('age_range', { length: 50 }).notNull(),
	title: varchar('title', { length: 255 }),
	content: text('content').notNull(),
	imageUrl: text('image_url'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
	pets: many(pets),
	payments: many(payments),
	passwordResetTokens: many(passwordResetTokens),
}));
export const petCategoriesRelations = relations(petCategories, ({ many }) => ({
	pets: many(pets), ads: many(ads), careRecommends: many(careRecommends),
}));
export const petsRelations = relations(pets, ({ one, many }) => ({
	user: one(users, { fields: [pets.userId], references: [users.id] }),
	petCategory: one(petCategories, { fields: [pets.petCategoryId], references: [petCategories.id] }),
	activities: many(activities), expenses: many(expenses), carePlans: many(carePlans),
}));
export const paymentsRelations = relations(payments, ({ one }) => ({ user: one(users, { fields: [payments.userId], references: [users.id] }) }));
export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({ user: one(users, { fields: [passwordResetTokens.userId], references: [users.id] }) }));
export const activitiesRelations = relations(activities, ({ one }) => ({ pet: one(pets, { fields: [activities.petId], references: [pets.petId] }) }));
export const expensesRelations = relations(expenses, ({ one }) => ({ pet: one(pets, { fields: [expenses.petId], references: [pets.petId] }) }));
export const carePlansRelations = relations(carePlans, ({ one }) => ({ pet: one(pets, { fields: [carePlans.petId], references: [pets.petId] }) }));
export const adsRelations = relations(ads, ({ one }) => ({ petCategory: one(petCategories, { fields: [ads.petCategoryId], references: [petCategories.id] }) }));
export const careRecommendsRelations = relations(careRecommends, ({ one }) => ({ petCategory: one(petCategories, { fields: [careRecommends.petCategoryId], references: [petCategories.id] }) }));
