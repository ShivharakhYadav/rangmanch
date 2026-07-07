-- CreateEnum
CREATE TYPE "SeatStatus" AS ENUM ('AVAILABLE', 'BOOKED', 'BLOCKED');

-- CreateTable
CREATE TABLE "Seat" (
    "id" TEXT NOT NULL,
    "hallId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "rowLabel" TEXT NOT NULL,
    "seatNumber" INTEGER NOT NULL,
    "seatRef" TEXT NOT NULL,
    "posX" INTEGER NOT NULL,
    "posY" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Seat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShowSeat" (
    "id" TEXT NOT NULL,
    "showId" TEXT NOT NULL,
    "seatId" TEXT NOT NULL,
    "status" "SeatStatus" NOT NULL DEFAULT 'AVAILABLE',
    "price" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShowSeat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Seat_hallId_idx" ON "Seat"("hallId");

-- CreateIndex
CREATE UNIQUE INDEX "Seat_hallId_seatRef_key" ON "Seat"("hallId", "seatRef");

-- CreateIndex
CREATE INDEX "ShowSeat_showId_idx" ON "ShowSeat"("showId");

-- CreateIndex
CREATE INDEX "ShowSeat_showId_status_idx" ON "ShowSeat"("showId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ShowSeat_showId_seatId_key" ON "ShowSeat"("showId", "seatId");

-- AddForeignKey
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_hallId_fkey" FOREIGN KEY ("hallId") REFERENCES "Hall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SeatCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowSeat" ADD CONSTRAINT "ShowSeat_showId_fkey" FOREIGN KEY ("showId") REFERENCES "Show"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowSeat" ADD CONSTRAINT "ShowSeat_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "Seat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
