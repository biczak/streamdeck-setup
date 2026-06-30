// Approximate Li-ion discharge curve (mV -> %). The 0x1001 voltage feature has no
// exact public formula; the Linux kernel uses a 100-point lookup table. This anchor
// table is a monotonic approximation; for higher precision, replace with the kernel
// table from drivers/hid/hid-logitech-hidpp.c. Voltage is the last-resort feature.
const ANCHORS: ReadonlyArray<readonly [number, number]> = [
	[4186, 100], [4060, 90], [3980, 80], [3920, 70], [3870, 60],
	[3820, 50], [3790, 40], [3730, 30], [3680, 20], [3610, 10],
	[3550, 1], [3500, 0],
];

export function voltageToPercent(mV: number): number {
	if (mV >= ANCHORS[0][0]) return 100;
	if (mV <= ANCHORS[ANCHORS.length - 1][0]) return 0;
	for (let i = 0; i < ANCHORS.length - 1; i++) {
		const [vHi, pHi] = ANCHORS[i];
		const [vLo, pLo] = ANCHORS[i + 1];
		if (mV <= vHi && mV >= vLo) {
			const t = (mV - vLo) / (vHi - vLo);
			return Math.round(pLo + t * (pHi - pLo));
		}
	}
	return 0;
}
