-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('USER', 'NEWSMAKER', 'MODERATOR', 'ADMIN', 'CO_OWNER', 'OWNER');

-- CreateEnum
CREATE TYPE "GDRole" AS ENUM ('PLAYER', 'NEWSMAKER', 'MODERATOR', 'ELDER_MODERATOR', 'LIST_MANAGER', 'SLAYER', 'CREATOR', 'OWNER');

-- CreateEnum
CREATE TYPE "FriendStatus" AS ENUM ('PENDING', 'ACCEPTED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "DemonDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD', 'INSANE', 'EXTREME');

-- CreateEnum
CREATE TYPE "LevelDifficulty" AS ENUM ('AUTO', 'EASY', 'NORMAL', 'HARD', 'HARDER', 'INSANE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "nickname" TEXT,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "avatar" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "role" "PlatformRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsFilter" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gdSlayers" BOOLEAN NOT NULL DEFAULT true,
    "gdCreators" BOOLEAN NOT NULL DEFAULT true,
    "gdEvents" BOOLEAN NOT NULL DEFAULT true,
    "mcPvp" BOOLEAN NOT NULL DEFAULT true,
    "mcBuilders" BOOLEAN NOT NULL DEFAULT true,
    "mcEvents" BOOLEAN NOT NULL DEFAULT true,
    "siteUpdates" BOOLEAN NOT NULL DEFAULT true,
    "siteFeatures" BOOLEAN NOT NULL DEFAULT true,
    "siteSettings" BOOLEAN NOT NULL DEFAULT true,
    "hostingDowntimes" BOOLEAN NOT NULL DEFAULT true,
    "hostingStats" BOOLEAN NOT NULL DEFAULT true,
    "hostingFeatures" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NewsFilter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GDProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gdLogin" TEXT NOT NULL,
    "gdPassword" TEXT NOT NULL,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "moons" INTEGER NOT NULL DEFAULT 0,
    "creatorPoints" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "timeOnProject" INTEGER NOT NULL DEFAULT 0,
    "leaderboardPos" INTEGER,
    "reputation" INTEGER NOT NULL DEFAULT 0,
    "role" "GDRole" NOT NULL DEFAULT 'PLAYER',

    CONSTRAINT "GDProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GDFriendship" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "status" "FriendStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GDFriendship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GDDemon" (
    "id" TEXT NOT NULL,
    "gdProfileId" TEXT NOT NULL,
    "levelName" TEXT NOT NULL,
    "demonlistRank" INTEGER NOT NULL,
    "difficulty" "DemonDifficulty" NOT NULL,

    CONSTRAINT "GDDemon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GDCompletedLevel" (
    "id" TEXT NOT NULL,
    "gdProfileId" TEXT NOT NULL,
    "levelName" TEXT NOT NULL,
    "difficulty" "LevelDifficulty" NOT NULL,

    CONSTRAINT "GDCompletedLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GDCreatedLevel" (
    "id" TEXT NOT NULL,
    "gdProfileId" TEXT NOT NULL,
    "levelName" TEXT NOT NULL,
    "isRated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "GDCreatedLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GDEventResult" (
    "id" TEXT NOT NULL,
    "gdProfileId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "place" INTEGER NOT NULL,

    CONSTRAINT "GDEventResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MCProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mcLogin" TEXT NOT NULL,
    "mcPassword" TEXT NOT NULL,
    "skin" TEXT,
    "kills" INTEGER NOT NULL DEFAULT 0,
    "deaths" INTEGER NOT NULL DEFAULT 0,
    "money" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "timeOnServer" INTEGER NOT NULL DEFAULT 0,
    "reputation" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MCProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MCFriendship" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "status" "FriendStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MCFriendship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MCEventResult" (
    "id" TEXT NOT NULL,
    "mcProfileId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "place" INTEGER NOT NULL,

    CONSTRAINT "MCEventResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CSProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CSProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "NewsFilter_userId_key" ON "NewsFilter"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GDProfile_userId_key" ON "GDProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GDProfile_gdLogin_key" ON "GDProfile"("gdLogin");

-- CreateIndex
CREATE UNIQUE INDEX "GDFriendship_fromId_toId_key" ON "GDFriendship"("fromId", "toId");

-- CreateIndex
CREATE UNIQUE INDEX "MCProfile_userId_key" ON "MCProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MCProfile_mcLogin_key" ON "MCProfile"("mcLogin");

-- CreateIndex
CREATE UNIQUE INDEX "MCFriendship_fromId_toId_key" ON "MCFriendship"("fromId", "toId");

-- CreateIndex
CREATE UNIQUE INDEX "CSProfile_userId_key" ON "CSProfile"("userId");

-- AddForeignKey
ALTER TABLE "NewsFilter" ADD CONSTRAINT "NewsFilter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GDProfile" ADD CONSTRAINT "GDProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GDFriendship" ADD CONSTRAINT "GDFriendship_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "GDProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GDFriendship" ADD CONSTRAINT "GDFriendship_toId_fkey" FOREIGN KEY ("toId") REFERENCES "GDProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GDDemon" ADD CONSTRAINT "GDDemon_gdProfileId_fkey" FOREIGN KEY ("gdProfileId") REFERENCES "GDProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GDCompletedLevel" ADD CONSTRAINT "GDCompletedLevel_gdProfileId_fkey" FOREIGN KEY ("gdProfileId") REFERENCES "GDProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GDCreatedLevel" ADD CONSTRAINT "GDCreatedLevel_gdProfileId_fkey" FOREIGN KEY ("gdProfileId") REFERENCES "GDProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GDEventResult" ADD CONSTRAINT "GDEventResult_gdProfileId_fkey" FOREIGN KEY ("gdProfileId") REFERENCES "GDProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MCProfile" ADD CONSTRAINT "MCProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MCFriendship" ADD CONSTRAINT "MCFriendship_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "MCProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MCFriendship" ADD CONSTRAINT "MCFriendship_toId_fkey" FOREIGN KEY ("toId") REFERENCES "MCProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MCEventResult" ADD CONSTRAINT "MCEventResult_mcProfileId_fkey" FOREIGN KEY ("mcProfileId") REFERENCES "MCProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CSProfile" ADD CONSTRAINT "CSProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
