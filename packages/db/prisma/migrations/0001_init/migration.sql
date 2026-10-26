-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "bodyHtml" TEXT NOT NULL DEFAULT '',
    "durationSec" INTEGER,
    "manualOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "path" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "meta" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "Asset_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlatformAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platformId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'fail',
    "failReason" TEXT,
    "name" TEXT,
    "uid" TEXT,
    "avatarUrl" TEXT,
    "authExpiresAt" DATETIME,
    "lastCheckedAt" DATETIME,
    "profileGeneration" TEXT,
    "lands" TEXT,
    "credentialRef" TEXT,
    "profile" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PlatformAssetUpload" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platformId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'default',
    "kind" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "mime" TEXT NOT NULL,
    "sourceName" TEXT,
    "remoteId" TEXT NOT NULL,
    "remoteUrl" TEXT,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'available',
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PublishTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "accountUid" TEXT,
    "channelId" TEXT,
    "channelName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "stage" INTEGER NOT NULL DEFAULT 0,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "failReason" TEXT,
    "url" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME
);

-- CreateTable
CREATE TABLE "PublishLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "valueJson" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "PlatformAssetUpload_platformId_accountId_lastUsedAt_idx" ON "PlatformAssetUpload"("platformId", "accountId", "lastUsedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAssetUpload_platformId_accountId_scope_kind_contentHash_byteSize_mime_key" ON "PlatformAssetUpload"("platformId", "accountId", "scope", "kind", "contentHash", "byteSize", "mime");

-- CreateIndex
CREATE INDEX "PublishTask_postId_idx" ON "PublishTask"("postId");

-- CreateIndex
CREATE INDEX "PublishTask_status_idx" ON "PublishTask"("status");

-- CreateIndex
CREATE INDEX "PublishLog_taskId_idx" ON "PublishLog"("taskId");

