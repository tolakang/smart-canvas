ALTER TABLE "presets" ADD COLUMN "family" text;--> statement-breakpoint
-- N5: team presets named "<Family> <W>×<H>" (how families were read before) keep their family.
UPDATE "presets" SET "family" = btrim(substring("name" from '^(.*?)\s+\d+\s*[×x]\s*\d+$')) WHERE "team_id" IS NOT NULL AND "family" IS NULL;
