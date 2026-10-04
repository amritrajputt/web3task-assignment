import {
  boolean,
  integer,
  pgTable,
  timestamp,
  varchar,
  uuid
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  name: varchar({ length: 255 }).notNull(),
  email: varchar({ length: 255 }).notNull().unique(),
  password: varchar({ length: 60 }).notNull(),
  isVerified: boolean().notNull().default(false),
  otpSecret: varchar({ length: 255 }),
  otpExpiresAt: integer(),
  refreshToken: varchar({ length: 64 }),
  refreshTokenExpiresAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
