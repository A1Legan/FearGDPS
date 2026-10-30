-- CreateTable
CREATE TABLE "GDSong" (
    "id" TEXT NOT NULL,
    "gdId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "artistName" TEXT NOT NULL DEFAULT 'Unknown',
    "artistId" INTEGER NOT NULL DEFAULT 0,
    "downloadUrl" TEXT NOT NULL,
    "fileSize" TEXT NOT NULL DEFAULT '0.00',
    "driveFileId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'upload',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GDSong_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GDSong_gdId_key" ON "GDSong"("gdId");
