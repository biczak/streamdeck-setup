import streamDeck, {
	action, SingletonAction,
	type WillAppearEvent, type WillDisappearEvent, type DidReceiveSettingsEvent,
	type KeyDownEvent, type SendToPluginEvent,
} from "@elgato/streamdeck";
import type { JsonObject, JsonValue } from "@elgato/utils";
import { renderKey } from "../render/render-key";
import { readingToRenderInput } from "../battery/render-input";
import { batteryService, BatteryService } from "../battery/service";
import type { BatteryReading, KeySettings } from "../battery/types";

export function toImageDataUri(svg: string): string {
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

@action({ UUID: "dev.biczak.logitech-battery.status" })
export class BatteryStatus extends SingletonAction<JsonObject> {
	private unsubscribers = new Map<string, () => void>();

	constructor(private service: BatteryService = batteryService) {
		super();
	}

	private async paint(
		ctx: { setImage(img: string): Promise<void>; setTitle(title: string): Promise<void> },
		reading: BatteryReading | null,
		settings: KeySettings,
	): Promise<void> {
		await ctx.setImage(toImageDataUri(renderKey(readingToRenderInput(reading, settings))));
		await ctx.setTitle(""); // the percentage is drawn inside the icon; clear any leftover title
	}

	private bind(
		action: { id: string; setImage(img: string): Promise<void>; setTitle(title: string): Promise<void> },
		settings: KeySettings,
	): void {
		this.unsubscribers.get(action.id)?.();
		this.unsubscribers.delete(action.id);
		if (!settings.deviceId) {
			void this.paint(action, null, settings).catch((e) => streamDeck.logger.error("paint failed", e));
			return;
		}
		const stop = this.service.subscribe(settings.deviceId, settings.pollSeconds ?? 60, (reading) => {
			void this.paint(action, reading, settings).catch((e) => streamDeck.logger.error("paint failed", e));
		});
		this.unsubscribers.set(action.id, stop);
	}

	override onWillAppear(ev: WillAppearEvent<JsonObject>): void {
		this.bind(ev.action, ev.payload.settings as KeySettings);
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<JsonObject>): void {
		this.bind(ev.action, ev.payload.settings as KeySettings);
	}

	override onWillDisappear(ev: WillDisappearEvent<JsonObject>): void {
		this.unsubscribers.get(ev.action.id)?.();
		this.unsubscribers.delete(ev.action.id);
	}

	override async onKeyDown(ev: KeyDownEvent<JsonObject>): Promise<void> {
		try {
			const settings = ev.payload.settings as KeySettings;
			if (!settings.deviceId) return;
			await this.paint(ev.action, await this.service.readDevice(settings.deviceId), settings);
		} catch (e) {
			streamDeck.logger.error("onKeyDown failed", e);
		}
	}

	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, JsonObject>): Promise<void> {
		try {
			if ((ev.payload as { event?: string })?.event !== "getDevices") return;
			const devices = await this.service.listDevices();
			await streamDeck.ui.sendToPropertyInspector({ event: "getDevices", items: devices.map((d) => ({ label: d.name, value: d.id })) });
		} catch (e) {
			streamDeck.logger.error("onSendToPlugin failed", e);
		}
	}
}
