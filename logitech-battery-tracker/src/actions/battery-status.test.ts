import { describe, it, expect, vi } from "vitest";
import streamDeck from "@elgato/streamdeck";
import { BatteryStatus, toImageDataUri } from "./battery-status";
import { BatteryService } from "../battery/service";
import type { BatteryProvider, BatteryReading } from "../battery/types";

function svcWith(reading: BatteryReading): BatteryService {
	const p: BatteryProvider = {
		source: "hidpp", available: async () => true,
		list: async () => [{ id: reading.deviceId, name: reading.name, source: "hidpp" }],
		read: async () => reading,
	};
	return new BatteryService([p]);
}
function fakeAction() {
	return { id: "ctx1", setImage: vi.fn<(img: string) => Promise<void>>(async () => {}), setTitle: vi.fn<(title: string) => Promise<void>>(async () => {}), sendToPropertyInspector: vi.fn<(payload: unknown) => Promise<void>>(async () => {}) };
}

describe("BatteryStatus", () => {
	it("toImageDataUri wraps svg as an svg+xml data uri", () => {
		expect(toImageDataUri("<svg/>")).toBe("data:image/svg+xml;charset=utf8,%3Csvg%2F%3E");
	});
	it("renders an off image immediately when no device is set", async () => {
		const action = new BatteryStatus(svcWith({ deviceId: "hidpp:1", name: "Mouse", percent: 0, state: "off", charging: false }));
		const a = fakeAction();
		await action.onWillAppear({ action: a, payload: { settings: {} } } as never);
		expect(a.setImage).toHaveBeenCalled();
		expect(a.setImage.mock.calls[0][0]).toContain("data:image/svg+xml");
		expect(a.setTitle).toHaveBeenCalledWith(""); // number is in the icon; title cleared
	});
	it("answers the getDevices datasource request", async () => {
		const action = new BatteryStatus(svcWith({ deviceId: "hidpp:1", name: "Mouse", percent: 50, state: "active", charging: false }));
		const a = fakeAction();
		const spy = vi.spyOn(streamDeck.ui, "sendToPropertyInspector").mockResolvedValue();
		try {
			await action.onSendToPlugin({ action: a, payload: { event: "getDevices" } } as never);
			expect(spy).toHaveBeenCalledWith(expect.objectContaining({ event: "getDevices", items: [{ label: "Mouse", value: "hidpp:1" }] }));
		} finally {
			spy.mockRestore();
		}
	});
});
