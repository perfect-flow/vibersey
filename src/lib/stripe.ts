import "server-only";
import Stripe from "stripe";
import { env } from "./env";

let client: Stripe | null = null;
export function stripe() {
  client ??= new Stripe(env.stripeSecret());
  return client;
}
