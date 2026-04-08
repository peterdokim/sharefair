import "@/app/globals.css";
import { TripStoreProvider } from "@/lib/store";

export const metadata = {
  title: "Smart Contract",
  description: "A mobile-first trip settlement prototype that protects friendships without losing fairness."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <TripStoreProvider>{children}</TripStoreProvider>
      </body>
    </html>
  );
}
