/*
  Warnings:

  - You are about to drop the `GDCreatedLevel` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "GDCreatedLevel" DROP CONSTRAINT "GDCreatedLevel_gdProfileId_fkey";

-- AlterTable
ALTER TABLE "GDProfile" ADD COLUMN     "ball" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "coins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "color1" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "color2" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "color3" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "commentState" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cube" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "demonCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "diamonds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "explosion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "friendState" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "glowEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "iconType" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "jetpack" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "largeChestCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastLargeChest" TIMESTAMP(3),
ADD COLUMN     "lastSmallChest" TIMESTAMP(3),
ADD COLUMN     "messageState" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "orbs" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "robot" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "saveData" TEXT,
ADD COLUMN     "ship" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "smallChestCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "spider" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "swing" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "ufo" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "userCoins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "wave" INTEGER NOT NULL DEFAULT 1;

-- DropTable
DROP TABLE "GDCreatedLevel";

-- CreateTable
CREATE TABLE "GDLevel" (
    "id" SERIAL NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "levelData" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "length" INTEGER NOT NULL DEFAULT 0,
    "objects" INTEGER NOT NULL DEFAULT 0,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "difficulty" INTEGER NOT NULL DEFAULT 0,
    "isDemon" BOOLEAN NOT NULL DEFAULT false,
    "demonDiff" INTEGER NOT NULL DEFAULT 3,
    "isAuto" BOOLEAN NOT NULL DEFAULT false,
    "isRated" BOOLEAN NOT NULL DEFAULT false,
    "isEpic" INTEGER NOT NULL DEFAULT 0,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "verifiedCoins" BOOLEAN NOT NULL DEFAULT false,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "songId" INTEGER NOT NULL DEFAULT 0,
    "customSongId" INTEGER NOT NULL DEFAULT 0,
    "password" TEXT NOT NULL DEFAULT '0',
    "twoPlayer" BOOLEAN NOT NULL DEFAULT false,
    "isUnlisted" BOOLEAN NOT NULL DEFAULT false,
    "extra" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GDLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GDLevelComment" (
    "id" SERIAL NOT NULL,
    "levelId" INTEGER NOT NULL,
    "profileId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "percent" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "isSpam" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GDLevelComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GDProfileComment" (
    "id" SERIAL NOT NULL,
    "profileId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "isSpam" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GDProfileComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GDMessage" (
    "id" SERIAL NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GDMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GDDailyLevel" (
    "id" SERIAL NOT NULL,
    "levelId" INTEGER NOT NULL,
    "type" INTEGER NOT NULL,
    "number" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GDDailyLevel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GDDailyLevel_levelId_key" ON "GDDailyLevel"("levelId");

-- AddForeignKey
ALTER TABLE "GDLevel" ADD CONSTRAINT "GDLevel_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "GDProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GDLevelComment" ADD CONSTRAINT "GDLevelComment_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "GDLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GDLevelComment" ADD CONSTRAINT "GDLevelComment_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "GDProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GDProfileComment" ADD CONSTRAINT "GDProfileComment_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "GDProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GDProfileComment" ADD CONSTRAINT "GDProfileComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "GDProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GDMessage" ADD CONSTRAINT "GDMessage_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "GDProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GDMessage" ADD CONSTRAINT "GDMessage_toId_fkey" FOREIGN KEY ("toId") REFERENCES "GDProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GDDailyLevel" ADD CONSTRAINT "GDDailyLevel_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "GDLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
