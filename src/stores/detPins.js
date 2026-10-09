// fire 93: the det station pins live HERE, not in the engines, so they can
// be created in the SAME gsap batch as the original's 13 station triggers
// (Arcade's mount-time animate()). Creation timing is the whole game on this
// page: our own early self-creation collapsed the ORIGINAL pins' calibration
// (fire 81: docH 62k -> 22k), late self-creation detached the real scroll
// flow from the reported height (fire 92: scrollHeight 51k, reachable 21.5k)
// — but the original's own batch creation is proven across every load. The
// engines read the live state via pinsLive()/inDetSpan()/triggerCurrent()
// and derive detStep from the triggers' own progress while the pins hold
// (the fire-92 re-anchor; the rect machine remains the fallback).
import { writable, get } from "svelte/store";
import { gsap, ScrollTrigger } from "$utils/gsap.js";
// fire 105: detScrubTo moved out — the span morphs are written by the
// engines' scroll-path poll (spanScrub2D), no longer by scrub-tween renders
import { detStep, detTryExpanded } from "./det.js";
import { det3ScrubTo } from "./det3.js";

// the story arc matrices — canonical here; the engines import these exact
// objects (DetEngine aliases STEP_MATRIX, Det3DEngine aliases STEP3_MATRIX)
export const STEP_MATRIX = {
	1: [1, 0, 0, 1],
	2: [2, 1, 0, 1],
	3: [-2, 1, 0, 1],
	4: [1, 2, 2, 4],
	5: [1, 2, 2, 4]
};
export const STEP3_MATRIX = {
	1: [1, 0, 0, 0, 1, 0, 0, 0, 1],
	2: [2, 0, 1, 0, 1, 0, 0, 0, 1],
	3: [-2, 0, 1, 0, 1, 0, 0, 0, 1],
	4: [1, 0, 1, 0, 1, 1, 1, 1, 2],
	5: [1, 0, 1, 0, 1, 1, 1, 1, 2]
};

let stationTriggers2D = [];
let stationTls2D = [];
let stationTriggers3D = [];
let stationTls3D = [];
let pinsDisabled = false;

// the engines' gates read this (pins own the story only while healthy)
export const detPinsLive = writable(false);

export function pinsLive() {
	return get(detPinsLive);
}
export function inDetSpan() {
	// fire 105: isActive is updated on gsap's rAF ticker — a starved renderer
	// leaves it stale while the scroll sits mid-window, so pair it with the
	// cached window against live scrollY (windows only change on refresh)
	const y = typeof window !== "undefined" ? window.scrollY : 0;
	return stationTriggers2D.some((st) => st && (st.isActive || (y >= st.start && y <= st.end)));
}
export function inDetSpan3() {
	const y = typeof window !== "undefined" ? window.scrollY : 0;
	return stationTriggers3D.some((st) => st && (st.isActive || (y >= st.start && y <= st.end)));
}
// the trigger-anchored story step: the deepest station whose span is active
// or fully played (mid-span -> n; the gap after span n -> n, the original's
// between-stations hold; above span 1 -> 0, the approach zone)
export function triggerCurrent() {
	let current = 0;
	// fire 105 (the section-jump teleport): isActive/progress ride the rAF
	// ticker — on a starved renderer they go stale mid-window, the step
	// derivation fell to 0, and the fallback rect machines then yanked the
	// step back and forth around the true one. The cached span window against
	// live scrollY is starvation-proof (windows only move on refresh). The
	// deepest STARTED span is the whole rule: spans are ordered and
	// non-overlapping, so it yields mid-span -> n AND the gap-after-n hold
	// (progress >= 1 is stale-prone and no longer needed for the hold).
	const y = typeof window !== "undefined" ? window.scrollY : 0;
	for (let n = 1; n <= 5; n++) {
		const st = stationTriggers2D[n - 1];
		if (st && (st.isActive || st.progress >= 1 || y >= st.start)) current = n;
	}
	return current;
}
export function triggerCurrent3() {
	let current = 0;
	const y = typeof window !== "undefined" ? window.scrollY : 0;
	for (let n = 1; n <= 5; n++) {
		const st = stationTriggers3D[n - 1];
		if (st && (st.isActive || st.progress >= 1 || y >= st.start)) current = n;
	}
	return current;
}
// fire 105: the span morph's live state for the engines' poll — the deepest
// started span with its scroll-mapped progress. The old pipeline rode the
// rAF ticker twice (ScrollTrigger.progress -> scrub-tween render), so a
// starved renderer froze the morph mid-station and snapped it forward on
// catch-up; window math against scrollY needs no animation frame.
export function spanScrub2D() {
	if (typeof window === "undefined") return null;
	const y = window.scrollY;
	// deepest STARTED span (spans are ordered): mid-window it scrubs, past its
	// end it holds p = 1 until the next span starts
	let hit = null;
	for (let n = 1; n <= 5; n++) {
		const st = stationTriggers2D[n - 1];
		if (!st || y < st.start) continue;
		hit = n;
	}
	if (hit === null) return null;
	const st = stationTriggers2D[hit - 1];
	const from = hit === 1 ? STEP_MATRIX[1] : STEP_MATRIX[hit - 1];
	const to = STEP_MATRIX[hit];
	const p = Math.max(0, Math.min(1, (y - st.start) / Math.max(1, st.end - st.start)));
	return { n: hit, from, to, p };
}
// fire 100: the last span's end scroll position per family (the try-it
// hand-off anchor under pins — the live rects inside a pinned container
// are frozen-hold artifacts), or null when that family's pins are off
export function lastSpanEnd() {
	const st = stationTriggers2D[4];
	return st ? Math.round(st.end) : null;
}
export function lastSpanEnd3() {
	const st = stationTriggers3D[4];
	return st ? Math.round(st.end) : null;
}
// fire 102: span 1's live scrub progress (0..1) — DetEngine's beat-1 drive
// maps it onto the entrance scalars (stepInT/edgeDrawT) so the unit square
// draws on THROUGH the ~1300px pinned hold instead of playing its one-shot
// entrance in 0.6s and then holding static for the rest of the span.
// fire 105: derived from the cached window + live scrollY — `progress` rides
// the starved rAF ticker and would freeze the beat-1 drive mid-hold
export function span1Progress() {
	const st = stationTriggers2D[0];
	if (!st) return 0;
	const span = Math.max(1, st.end - st.start);
	const y = typeof window !== "undefined" ? window.scrollY : st.start;
	return Math.max(0, Math.min(1, (y - st.start) / span));
}

// the shared teardown: below-lg clears and the health guard both land here;
// after it the rect machines take over seamlessly (pins stay off for the
// session — nothing re-creates them once the original's animate() has run)
export function killDetPins() {
	for (const tl of stationTls2D) {
		if (tl) tl.kill();
	}
	for (const tl of stationTls3D) {
		if (tl) tl.kill();
	}
	stationTls2D = [];
	stationTriggers2D = [];
	stationTls3D = [];
	stationTriggers3D = [];
	if (get(detPinsLive)) {
		detPinsLive.set(false);
		ScrollTrigger.refresh();
	}
	pinsDisabled = true;
}

// fire 104 (F5, the 3D trigger disconnect): measured on live loads — the 3D
// family's triggers can end up disconnected (progress frozen at 0 while the
// scroll sits INSIDE their windows; the 2D family keeps working). When that
// happens the 3D story must fall back to its RECT machine: kill only the 3D
// spans (the 2D holds survive) and block the 3D family for the session.
let spans3Disabled = false;
export function kill3DSpans() {
	for (const tl of stationTls3D) {
		if (tl) tl.kill();
	}
	stationTls3D = [];
	stationTriggers3D = [];
	spans3Disabled = true;
	if (get(detPinsLive) && stationTriggers2D.length === 0) {
		detPinsLive.set(false);
	}
	ScrollTrigger.refresh();
}
export function detPinsSpans3() {
	return stationTriggers3D.map((st) => ({
		start: st ? Math.round(st.start) : 0,
		active: st ? st.isActive : false,
		progress: st ? st.progress || 0 : 0
	}));
}

// fire 104 (F5, rev 2): the 3D machine's liveness is per-family — a disconnected 3D
// span set must fall back to the 3D RECT machine while the 2D pins stay live
export function pins3Live() {
	return get(detPinsLive) && !spans3Disabled && stationTriggers3D.length > 0;
}

export function spans3Dead() {
	return spans3Disabled;
}

// fire 101 iterate: the POLL retry entry — a load restored deep into the
// page deferred creation at animate() time; the polls re-attempt with THIS.
// The retry must wait for the calibration to SETTLE (docH stable across 3
// consecutive attempts): a mid-cascade creation freezes the span windows on
// a layout that is about to grow (measured: the windows froze ~23k stale
// while the stations settled at +37k). The animate() batch path bypasses
// this gate — its triggers are recalibrated by the post-arm cascade.
let retryDocH1 = null;
let retryDocH2 = null;
export function retryCreateDetPins() {
	if (get(detPinsLive) || pinsDisabled || typeof window === "undefined") return;
	const docH = document.documentElement.scrollHeight;
	const stable =
		retryDocH1 !== null &&
		Math.abs(docH - retryDocH1) <= 2 &&
		retryDocH2 !== null &&
		Math.abs(retryDocH1 - retryDocH2) <= 2;
	retryDocH2 = retryDocH1;
	retryDocH1 = docH;
	if (!stable) return;
	createDetPins();
}

// fire 103 (the pinned black-right-quarter report): the station pins hold
// #det-article with pinType "fixed", and a fixed pin bakes `left` from the
// column's rect at refresh time while also reverting the element to its
// saved style state (captured at first engage — possibly mid entry-tween,
// i.e. translateX 0). Either path parks the pinned column off-screen right
// (in-flow left 1425) and the pinned story then renders over the bare
// canvas backdrop: the black rectangle right of the text, plus the jump
// when the pin releases back into flow. Assert the reading shift at
// creation and around every refresh/toggle so both the baked left and the
// live transform stay at the reading offset. The step-6 expanded sandbox
// is the one state that wants the column clear, so it stays exempt.
export function assertDetReadingShift() {
	const el = document.getElementById("det-article");
	if (!el) return;
	if (get(detStep) === 6 && get(detTryExpanded)) return;
	// while a station pin holds the element (position: fixed) ScrollTrigger
	// has already moved the reading offset into `left` and cleared the
	// transform — re-asserting x there would double-shift the pinned column
	if (getComputedStyle(el).position === "fixed") return;
	// fire 105b (the fast-scroll leftover, the user: "scrolling to the bottom
	// too fast causes the det part to go off the page past the ending"):
	// jumping past the release leaves a stale y-translate in gsap's cache on
	// this element (measured: a multiple of the 1300px holds — 5200, 6500 —
	// the fire-101 transform-pin signature at the new span length), and the
	// column then renders that far below its flow slot: over the footer /
	// past the document end, forever (it survives every later refresh). Out
	// of a fixed hold the column's only intended transform is the reading
	// shift, so y is zeroed here on every assert.
	gsap.set(el, { x: "-65ch", y: 0 });
}

// fire 105b (the stuck release): after an instant jump past every span the
// triggers can ALL read inactive (progress 1, srcScroll tracking) while the
// pinned element keeps its fixed-pin inline state (position: fixed + hold
// translate + the sizing ST froze at pin time) for the rest of the session —
// measured live at the try-it band. ScrollTrigger's own view is the
// authority: when no hold is live and the scroll is past the last span end,
// restore the flow state, then the reading shift. Conservative on purpose:
// any live isActive (even a stale one) defers to ST's ticker.
export function assertDetReleased() {
	const el = document.getElementById("det-article");
	if (!el) return;
	if (getComputedStyle(el).position !== "fixed") return;
	const y = typeof window !== "undefined" ? window.scrollY : 0;
	const ends = [lastSpanEnd(), lastSpanEnd3()].filter((e) => e !== null);
	if (!ends.length || y <= Math.max(...ends) + 200) return;
	for (const st of [...stationTriggers2D, ...stationTriggers3D]) {
		if (st && st.isActive) return;
	}
	gsap.set(el, {
		clearProps: "position,top,left,bottom,width,maxWidth,maxHeight,height,margin"
	});
	assertDetReadingShift();
}

// called from Arcade's animate() tail — the original's creation moment.
// fire 101: ALSO re-callable from the engines' polls — a load restored deep
// into the page deferred creation at animate() time and silently never
// armed (the user's "the text keeps moving" on every restored reload).
// The deferral inside still guards the viewport position; the polls simply
// re-attempt until it passes. Creation is idempotent (no-ops when created
// or session-disabled).
export function createDetPins() {
	if (get(detPinsLive) || pinsDisabled || typeof window === "undefined") return;
	const vh = window.innerHeight;
	// deep links past a section skip THAT family for the session (creating
	// under the user is the fire-92 shift-the-content failure)
	const secDet = document.getElementById("section-det");
	const sec3 = document.getElementById("section-det3d");
	let created2D = true;
	let created3D = true;
	if (secDet && window.scrollY + vh > secDet.getBoundingClientRect().top + window.scrollY + 100) {
		created2D = false;
	}
	if (spans3Disabled) {
		created3D = false;
	} else if (sec3 && window.scrollY + vh > sec3.getBoundingClientRect().top + window.scrollY + 100) {
		created3D = false;
	}
	// the reading shift must be in place BEFORE the triggers' first refresh —
	// that refresh is what bakes the fixed pin's `left`
	assertDetReadingShift();
	if (created2D) {
		for (let n = 1; n <= 5; n++) {
			const el = document.getElementById(`det-st-${n}`);
			if (!el) continue;
			// fire 105: the timeline is kept for the PIN + toggleClass only —
			// the morph write moved to the engines' scroll-path poll via
			// spanScrub2D() (window math, starvation-proof; the old scrub-tween
			// render froze on a starved rAF and snapped forward on catch-up)
			const tl = gsap.timeline({
				scrollTrigger: {
					trigger: el,
					start: "center center",
					// the original's scrollUnit — ~1000px of pinned hold per station
					// fire 104 (the user: the animations get cut before the text switches):
					// 1300px of hold per station — the beat animations need the room
					end: "+=1300",
					// fire 100: OUR container, not #article — 23 pins of one element
					// corrupted the page's calibration in every timing (81/92/93);
					// distinct pinned elements are the supported pattern
					pin: "#det-article",
					pinnedContainer: "#det-article",
					// fire 101 (the footer-overlap finding): ST was auto-picking
					// transform-pinning and left a constant translateY 5000 on the
					// container after span 5 released — the held text floated over
					// the footer. The sibling chain has no transformed ancestors,
					// so force the stable fixed pin type.
					pinType: "fixed",
					// fire 100 iterate: #det-article is now a SIBLING of #article (its own
					// column) — no transformed ancestor, so the default fixed pinType applies
					pinSpacing: true,
					scrub: 1,
					fastScrollEnd: true,
					toggleClass: "active",
					invalidateOnRefresh: true,
					// fire 103: keep the column at its reading offset through the
					// refresh's revert/re-capture cycle (both det families pin the
					// same element, so the 3D config repeats the hooks verbatim)
					onRefreshInit: assertDetReadingShift,
					onRefresh: assertDetReadingShift,
					onToggle: assertDetReadingShift
				}
			});
			stationTriggers2D.push(tl.scrollTrigger);
			stationTls2D.push(tl);
		}
	}
	if (created3D) {
		for (let n = 1; n <= 5; n++) {
			const el = document.getElementById(`det3d-st-${n}`);
			if (!el) continue;
			const prev = n === 1 ? STEP3_MATRIX[1] : STEP3_MATRIX[n - 1];
			const cur = STEP3_MATRIX[n];
			const proxy = { t: n === 1 ? 1 : 0 };
			const tl = gsap.timeline({
				scrollTrigger: {
					trigger: el,
					start: "center center",
					// fire 104 (the user: the animations get cut before the text switches):
					// 1300px of hold per station — the beat animations need the room
					end: "+=1300",
					// fire 100: OUR container, not #article — 23 pins of one element
					// corrupted the page's calibration in every timing (81/92/93);
					// distinct pinned elements are the supported pattern
					pin: "#det-article",
					pinnedContainer: "#det-article",
					// fire 101 (the footer-overlap finding): ST was auto-picking
					// transform-pinning and left a constant translateY 5000 on the
					// container after span 5 released — the held text floated over
					// the footer. The sibling chain has no transformed ancestors,
					// so force the stable fixed pin type.
					pinType: "fixed",
					// fire 100 iterate: #det-article is now a SIBLING of #article (its own
					// column) — no transformed ancestor, so the default fixed pinType applies
					pinSpacing: true,
					scrub: 1,
					fastScrollEnd: true,
					toggleClass: "active",
					invalidateOnRefresh: true,
					// fire 103: the 2D twin's hooks — same element, same fix
					onRefreshInit: assertDetReadingShift,
					onRefresh: assertDetReadingShift,
					onToggle: assertDetReadingShift
				}
			});
			tl.to(proxy, {
				t: 1,
				ease: "none",
				onUpdate: () => {
					// fire 100: the active-span gate (the 2D twin, see above)
					// fire 105: window test against rAF-stale isActive
					const trig = tl.scrollTrigger;
					const y = window.scrollY;
					if (!trig.isActive && !(y >= trig.start && y <= trig.end)) return;
					det3ScrubTo(prev, cur, proxy.t);
				}
			}, 0);
			stationTriggers3D.push(tl.scrollTrigger);
			stationTls3D.push(tl);
		}
	}
	if (!stationTriggers2D.length && !stationTriggers3D.length) return;
	// fire 101 iterate: an end-clamp here was REVERTED — every ScrollTrigger
	// refresh recomputes end from the "+=1000" config (undoing the clamp) and
	// re-shortening it after each refresh made the spacers oscillate, which
	// the user experienced as the scroll repeatedly jumping back up. The
	// durable fix is LAYOUT: the 3D tail runway now gives the last spans room
	// to release before the footer on every calibration (Article.svelte).
	detPinsLive.set(true);
	watchHealth(document.documentElement.scrollHeight);
}

// collapse OR scroll-flow detachment within 2s of creation -> tear down and
// fall back to the rect machines for the session (the fire-81/92 failure
// modes recover instead of stranding the page)
function watchHealth(before) {
	if (typeof window === "undefined") return;
	setTimeout(() => {
		if (!get(detPinsLive)) return;
		const after = document.documentElement.scrollHeight;
		const footer = document.querySelector("footer");
		const detached =
			footer &&
			after >
				footer.getBoundingClientRect().top +
					window.scrollY +
					footer.offsetHeight +
					window.innerHeight * 2;
		if (after < before * 0.8 || detached) {
			console.error(
				"[detPins] the station pins " +
					(detached ? "detached the scroll flow" : "collapsed the document") +
					" — tearing them down (self-heal)"
			);
			killDetPins();
		}
	}, 2000);
}

// QA surface: per-span windows for automation (the __detdev.snap() shape)
export function pinsSnapshot() {
	const span = (st) => ({
		start: st ? Math.round(st.start) : null,
		end: st ? Math.round(st.end) : null,
		active: st ? st.isActive : null,
		progress: st ? Math.round((st.progress || 0) * 100) / 100 : null,
		// fire 100: the trigger's OWN cached scroll — if this disagrees with
		// window.scrollY, ScrollTrigger's update loop is disconnected
		srcScroll: st && st.scroll ? Math.round(st.scroll()) : null
	});
	return {
		created: get(detPinsLive),
		disabled: pinsDisabled,
		live: get(detPinsLive),
		spans: stationTriggers2D.map(span),
		spans3: stationTriggers3D.map(span)
	};
}
