CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL UNIQUE,
	"password" varchar(255) NOT NULL,
	"salt" varchar(255) NOT NULL,
	"isVerified" boolean DEFAULT false NOT NULL,
	"otpSecret" varchar(255),
	"otpExpiresAt" integer,
	"refreshToken" varchar(64),
	"refreshTokenExpiresAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
