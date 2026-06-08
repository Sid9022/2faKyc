-- CreateTable
CREATE TABLE "test_connections" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_connections_pkey" PRIMARY KEY ("id")
);
