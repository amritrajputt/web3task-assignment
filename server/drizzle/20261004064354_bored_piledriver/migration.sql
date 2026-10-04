ALTER TABLE "users" DROP COLUMN "salt";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password" SET DATA TYPE varchar(60) USING "password"::varchar(60);