import type { BatteryProvider, BatteryReading, DeviceInfo } from "../types";

const DEVICES: DeviceInfo[] = [
	{ id: "simulator:mouse", name: "Sim G Pro Wireless", kind: "mouse", source: "simulator" },
	{ id: "simulator:headset", name: "Sim G733", kind: "headset", source: "simulator" },
];
const STATE: Record<string, BatteryReading> = {
	"simulator:mouse": { deviceId: "simulator:mouse", name: "Sim G Pro Wireless", percent: 72, state: "active", charging: false },
	"simulator:headset": { deviceId: "simulator:headset", name: "Sim G733", percent: 35, state: "active", charging: true },
};

export class SimulatorProvider implements BatteryProvider {
	readonly source = "simulator" as const;
	async available(): Promise<boolean> {
		return process.env.LBP_SIMULATE === "1";
	}
	async list(): Promise<DeviceInfo[]> {
		return [...DEVICES];
	}
	async read(deviceId: string): Promise<BatteryReading> {
		if (process.env.LBP_SIMULATE !== "1") return { deviceId, name: "Sim device", percent: 0, state: "off", charging: false };
		return STATE[deviceId] ?? { deviceId, name: "Sim device", percent: 0, state: "off", charging: false };
	}
}
