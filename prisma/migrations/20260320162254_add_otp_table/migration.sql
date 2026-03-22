-- CreateTable
CREATE TABLE "OTP" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "first_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "last_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "password" TEXT,
    "avatar" TEXT,
    "role" TEXT NOT NULL DEFAULT 'PASSENGER',
    "rating" REAL NOT NULL DEFAULT 4.9,
    "walletBalance" REAL NOT NULL DEFAULT 0.0,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "lastLocationLat" REAL,
    "lastLocationLng" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("avatar", "createdAt", "email", "first_name", "id", "isOnline", "lastLocationLat", "lastLocationLng", "last_name", "middle_name", "password", "phone", "rating", "role", "updatedAt", "walletBalance") SELECT "avatar", "createdAt", "email", "first_name", "id", "isOnline", "lastLocationLat", "lastLocationLng", "last_name", "middle_name", "password", "phone", "rating", "role", "updatedAt", "walletBalance" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "OTP_phone_key" ON "OTP"("phone");
