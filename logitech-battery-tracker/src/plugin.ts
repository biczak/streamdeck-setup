import streamDeck from "@elgato/streamdeck";
import { BatteryStatus } from "./actions/battery-status";

streamDeck.logger.setLevel("info");
streamDeck.actions.registerAction(new BatteryStatus());
streamDeck.connect();
