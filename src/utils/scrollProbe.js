// fire 106 diagnostics: names the writer of the pin-boundary scroll
// teleport. The app code never writes scroll (audited), so a jump comes from
// the browser (anchoring/clamp), a layout-height change (spacer), or
// ScrollTrigger's own refresh restore — this probe records all three
// channels correlated by timestamp until one of them moves.
//
// INERT unless armed: append ?scrollprobe to the URL, or set
// localStorage.scrollProbe = "1" once. Then repro the glitch and run
// __scrollProbe.dump() in the console — hand back the array.
import { ScrollTrigger } from "$utils/gsap.js";

export function initScrollProbe() {
	if (typeof window === "undefined" || window.__scrollProbe) return;
	const enabled =
		new URLSearchParams(location.search).has("scrollprobe") ||
		localStorage.getItem("scrollProbe") === "1";
	if (!enabled) return;

	const log = [];
	const t0 = performance.now();
	let lastY = window.scrollY;
	let lastH = document.documentElement.scrollHeight;

	const spanWindows = () => {
		try {
			return window.__detdev
				? window.__detdev.snap().pins.spans.map((s) => `${s.start}-${s.end}`)
				: null;
		} catch (e) {
			return "err";
		}
	};

	const snap = (why) => {
		const y = window.scrollY;
		const h = document.documentElement.scrollHeight;
		const el = document.getElementById("det-article");
		const cs = el ? getComputedStyle(el) : null;
		const tf = cs && cs.transform !== "none" ? cs.transform : "none";
		const entry = {
			t: +((performance.now() - t0) / 1000).toFixed(2),
			why,
			y: Math.round(y),
			dY: Math.round(y - lastY),
			dH: h - lastH,
			h,
			pos: cs ? cs.position : null,
			tf: tf === "none" ? "none" : tf.slice(0, 40),
			rectTop: el ? Math.round(el.getBoundingClientRect().top) : null,
			spans: spanWindows()
		};
		lastY = y;
		lastH = h;
		log.push(entry);
		if (log.length > 900) log.shift();
	};

	window.addEventListener("scroll", () => snap("scroll"), { passive: true });
	const iv = setInterval(() => snap("tick"), 250);
	const mo = new MutationObserver(() => snap("style-mut"));
	const el0 = document.getElementById("det-article");
	if (el0) mo.observe(el0, { attributes: true, attributeFilter: ["style", "class"] });
	ScrollTrigger.addEventListener("refresh", () => snap("ST-REFRESH"));
	window.addEventListener("resize", () => snap("resize"));

	window.__scrollProbe = {
		log,
		dump: () => {
			clearInterval(iv);
			mo.disconnect();
			window.__scrollProbe.armed = false;
			return log.slice(-300);
		},
		armed: true
	};
	console.info(
		"[scrollProbe] armed — repro the glitch, then run copy(__scrollProbe.dump()) and hand back the array"
	);
}
