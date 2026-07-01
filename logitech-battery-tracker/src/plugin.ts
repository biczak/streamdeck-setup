import streamDeck from "@elgato/streamdeck";
import { BatteryStatus } from "./actions/battery-status";

streamDeck.logger.setLevel("info");

// Without these, a rejected/thrown startup error crashes the process before anything
// is logged — Node terminates on an unhandled rejection with no trace anywhere the
// Stream Deck host surfaces to a user, so the plugin just silently never starts.
process.on("uncaughtException", (e) => streamDeck.logger.error("uncaughtException", e));
process.on("unhandledRejection", (e) => streamDeck.logger.error("unhandledRejection", e));

streamDeck.logger.info("Logitech Battery plugin starting");
streamDeck.actions.registerAction(new BatteryStatus());
streamDeck
	.connect()
	.then(() => streamDeck.logger.info("Logitech Battery plugin connected"))
	.catch((e) => streamDeck.logger.error("connect() failed", e));
