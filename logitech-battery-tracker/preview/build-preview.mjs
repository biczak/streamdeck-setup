import { build } from "esbuild";

await build({
	entryPoints: ["src/render/render-key.ts"],
	bundle: true,
	format: "esm",
	outfile: "preview/render-key.mjs",
});
console.log("preview/render-key.mjs built");
