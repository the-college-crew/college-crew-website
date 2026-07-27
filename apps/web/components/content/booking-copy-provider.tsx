"use client";

import { createContext, useContext } from "react";

import {
  bookingCopyValue,
  type BookingCopyKey,
  type BookingCopyOverrides,
} from "@/lib/content/booking-copy";

const BookingCopyContext = createContext<BookingCopyOverrides>({});

export function BookingCopyProvider({
  overrides,
  children,
}: {
  overrides: BookingCopyOverrides;
  children: React.ReactNode;
}) {
  return (
    <BookingCopyContext.Provider value={overrides}>
      <div className="contents whitespace-pre-line">{children}</div>
    </BookingCopyContext.Provider>
  );
}

export function useBookingCopy() {
  const overrides = useContext(BookingCopyContext);
  return (key: BookingCopyKey, values?: Record<string, string | number>) =>
    bookingCopyValue(overrides, key, values);
}
