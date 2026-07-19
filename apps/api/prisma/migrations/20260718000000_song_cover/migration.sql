-- Add cover art column to songs (populated from oEmbed on add)
ALTER TABLE "Song" ADD COLUMN "cover" TEXT;
