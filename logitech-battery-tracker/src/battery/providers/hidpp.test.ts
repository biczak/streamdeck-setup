import { describe, it, expect } from "vitest";
import { selectHidppPaths, LOGITECH_VID, HIDPP_USAGE_PAGE } from "./hidpp";

describe("selectHidppPaths", () => {
	const dev = (over: object) => ({ vendorId: LOGITECH_VID, productId: 0xc52b, usagePage: HIDPP_USAGE_PAGE, usage: 2, path: "p", interface: 2, release: 0, ...over });
	it("keeps only Logitech HID++ (0xFF00) interfaces", () => {
		const out = selectHidppPaths([
			dev({}),
			dev({ usagePage: 0x0001 }),     // mouse collection — excluded
			dev({ vendorId: 0x1234 }),      // non-Logitech — excluded
		]);
		expect(out).toHaveLength(1);
		expect(out[0].usage).toBe(2);
	});
	it("prefers the long-report collection (usage 2) but keeps usage 1 too", () => {
		const out = selectHidppPaths([dev({ usage: 1, path: "a" }), dev({ usage: 2, path: "b" })]);
		expect(out.map((d) => d.usage).sort()).toEqual([1, 2]);
	});
});
