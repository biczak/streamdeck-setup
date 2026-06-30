import { voltageToPercent } from "./voltage-table";

export const FEATURE_IROOT = 0x0000;
export const FEATURE_UNIFIED_BATTERY = 0x1004;
export const FEATURE_BATTERY_STATUS = 0x1000;
export const FEATURE_BATTERY_VOLTAGE = 0x1001;

export interface BatteryParse {
	percent: number;
	charging: boolean;
	full: boolean;
}

// 0x1004 UnifiedBattery getStatus: p0=state-of-charge %, p2=charging status
// (0 discharging, 1 charging, 2 charging slow, 3 full, 4 error).
export function parseUnified1004(params: Buffer): BatteryParse {
	const status = params[2];
	return { percent: params[0], charging: status === 1 || status === 2, full: status === 3 };
}

// 0x1000 getBatteryLevelStatus: p0=capacity %, p2=status
// (0 discharging, 1 recharging, 2 near complete, 3 complete, 4 below optimal, ...).
export function parseStatus1000(params: Buffer): BatteryParse {
	const status = params[2];
	return { percent: params[0], charging: status === 1 || status === 2 || status === 4, full: status === 3 };
}

// 0x1001 getBatteryVoltage: be16 mV in p0..p1, flags in p2.
// flags bit7 set => charging family (low 3 bits: 0 charging, 1 full, 2 not charging).
export function parseVoltage1001(params: Buffer): BatteryParse {
	const mV = (params[0] << 8) | params[1];
	const flags = params[2];
	const chargingFamily = (flags & 0x80) !== 0;
	const low = flags & 0x07;
	return { percent: voltageToPercent(mV), charging: chargingFamily && low === 0, full: chargingFamily && low === 1 };
}
