CREATE TABLE "room_moderators" (
	"roomId" uuid,
	"moderatorId" uuid,
	CONSTRAINT "room_moderators_pkey" PRIMARY KEY("roomId","moderatorId")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"userId" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"password" varchar(255),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "isVerified";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "otpSecret";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "otpExpiresAt";--> statement-breakpoint
ALTER TABLE "room_moderators" ADD CONSTRAINT "room_moderators_roomId_rooms_id_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "room_moderators" ADD CONSTRAINT "room_moderators_moderatorId_users_id_fkey" FOREIGN KEY ("moderatorId") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id");