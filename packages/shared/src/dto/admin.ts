import { OrderStatus } from '../enums';

export interface SalesReportDto {
  revenue: number; // paise, confirmed orders
  confirmedOrders: number;
  seatsSold: number;
  byStatus: Record<string, number>; // OrderStatus -> count
}

export interface OccupancyDto {
  showId: string;
  total: number;
  booked: number;
  blocked: number;
  available: number;
  occupancyPct: number; // 0-100, based on booked/total
}

export interface AdminShowDto {
  showId: string;
  eventTitle: string;
  startsAt: string;
  hallName: string;
  occupancy: OccupancyDto;
}

export interface AdminOrderDto {
  id: string;
  status: OrderStatus;
  amount: number;
  referenceNo: string | null;
  userPhone: string;
  userName: string | null;
  seatRefs: string[];
  createdAt: string;
}
