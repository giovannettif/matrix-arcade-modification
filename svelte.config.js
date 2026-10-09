import adapterStatic from "@sveltejs/adapter-static";
import sveltePreprocess from "svelte-preprocess";
import autoprefixer from "autoprefixer";
import { preprocessMeltUI } from "@melt-ui/pp";
import sequence from "svelte-sequential-preprocessor";
import { vitePreprocess } from '@sveltejs/kit/vite';

const preprocess = sveltePreprocess({
	postcss: {
		plugins: [autoprefixer]
	}
});

// $app/environment is a Vite virtual module — Node cannot resolve it when it
// loads this file directly, so `vite build` (and the Pages CI run) died with
// ERR_MODULE_NOT_FOUND (Kit 1.x only wires $app/* inside Vite). NODE_ENV is
// already "development"/"production" at config-load time for vite dev/build,
// which is the same signal.
const dev = process.env.NODE_ENV === "development";

const config = {
	preprocess: sequence([preprocess, vitePreprocess(), preprocessMeltUI()]),
	kit: {
		adapter: adapterStatic(),
		// fire 104: GitHub Pages serves the site under /matrix-arcade-modification/
		// — all asset and route URLs are built from this base. Dev stays at the
		// root so localhost:5174 is unchanged.
		paths: {
			base: dev ? "" : "/matrix-arcade-modification"
		}
	},
	vitePlugin: {
		// experimental: {
		// 	inspector: { holdMode: true },
		// }
	}
};

export default config;
