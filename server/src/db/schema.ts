import { integer, pgTable, varchar } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: varchar({ length: 255 }).notNull(),
    email: varchar({ length: 255 }).notNull().unique(),
    password: varchar({ length: 255 }).notNull(),
    otpSecret: varchar({ length: 255 }).notNull(),
    otpExpiresAt: integer().notNull(),
    refreshToken: varchar({ length: 255 }).notNull(),
    refreshTokenExpiresAt: integer().notNull(),
    createdAt: integer().notNull(),
    updatedAt: integer().notNull(),
});
