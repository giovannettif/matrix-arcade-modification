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

// fire 106 (the probe's verdict — the user's dump: at every det pin engage
// the shared spacer's height contribution collapses for one layout pass
// (measured -14368px, pos cycling fixed->relative) and Chrome clamps
// scrollY into the shrunken document BEFORE the padding is re-applied
// (measured dY -814/-846) — the clamp sticks, dropping the user back below
// the pin start: the infinite intro loop). Locking each spacer's measured
// height as an inline min-height makes the transient invisible to the
// document box; re-locked after every refresh, cleared before teardown.
export function lockDetSpacerHeights() {
	if (typeof window === "undefined") return;
	const spacers = [...document.querySelectorAll(".pin-spacer")];
	// fire 106 rev 2 (the 3D-chapter blocker): the old re-lock measured the
	// CURRENT box — which the previous min-height itself was clamping — so a
	// height that legitimately shrank (the 3D watchdog's kill3DSpans, a
	// teardown, font settle) could NEVER be recorded: the stale lock held the
	// document 6500px too tall forever, displaced det3d-st-6 past the
	// footer-relative sanity window, and the 3D story held det3dStep 0 —
	// stuck on the 2D part, unable to reach the 3D chapter. Clear first,
	// measure the NATURAL height, then re-lock (one synchronous pass; a
	// mid-engage transient can at worst record a too-small lock, which is
	// harmless — only too-tall locks were destructive).
	// fire 107 (the teleport mechanism): while the pins are LIVE the lock is
	// MONOTONIC — a fast transit through the 19+10 station pins makes ST's
	// spacer bookkeeping DROP padding (measured live: the original's spacer
	// fell 19000 -> 1000, docH 59746 -> 35246) and Chrome then clamps the
	// scroll into the shrunken document — the user's "teleports me back to
	// the start of the determinant section". Clear-then-measure re-recorded
	// the collapsed box as the new truth (the ratchet), baking the clamp in.
	// fire 108: the story pins are ONE continuous trigger per family now, so
	// the lock is additionally CAPPED at the document's sane extent (the
	// footer's bottom + two viewports) — a lock recorded during a transient
	// tall state can never strand empty scroll past the end of the page (the
	// user's "sometimes goes past the end" report).
	// fire 109: measure the LAYOUT height (offsetHeight), never the visual
	// rect — during holds ST visually shifts the spacer (the multi-pin
	// `top` offset chain), and a rect measurement recorded that shifted
	// box (measured live: the lock ratcheted to 23712 vs the natural
	// 20868), stranding dead scroll past the end of the page — the user's
	// "sometimes goes past the end" report.
	for (const s of spacers) s.style.minHeight = "";
	const footerCapEl = document.querySelector("footer");
	const docCap = footerCapEl
		? footerCapEl.getBoundingClientRect().bottom + window.scrollY + window.innerHeight * 2
		: Infinity;
	for (const s of spacers) {
		const prev = parseFloat(s.dataset.detMinLock || "0");
		const spacerTop = s.getBoundingClientRect().top + window.scrollY;
		const room = Math.max(0, docCap - spacerTop);
		const h = Math.min(Math.max(prev, s.offsetHeight), room);
		if (h > 0) {
			s.dataset.detMinLock = String(Math.round(h));
			s.style.minHeight = `${Math.round(h)}px`;
		}
	}
}
export function clearDetSpacerLocks() {
	if (typeof window === "undefined") return;
	for (const s of document.querySelectorAll(".pin-spacer")) {
		s.style.minHeight = "";
		delete s.dataset.detMinLock;
	}
}
let spacersLockArmed = false;
// fire 106: ST creates the shared spacer lazily (at the first pin apply), so
// the creation-time lock can miss it — watch for the column being WRAPPED
// and lock the fresh spacer in the same microtask, before its first engage
// sequence can collapse the document.
let spacerWatch = null;
function armSpacerWatch() {
	if (spacerWatch || typeof window === "undefined") return;
	const col = document.getElementById("det-article");
	if (!col || !col.parentNode) return;
	spacerWatch = new MutationObserver(() => {
		if (get(detPinsLive)) lockDetSpacerHeights();
	});
	spacerWatch.observe(col.parentNode, { childList: true });
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
	// fire 110: the story pins are standalone triggers
	if (detPinTrigger2D) {
		detPinTrigger2D.kill();
		detPinTrigger2D = null;
	}
	if (detPinTrigger3D) {
		detPinTrigger3D.kill();
		detPinTrigger3D = null;
	}
	stationTls2D = [];
	stationTriggers2D = [];
	stationTls3D = [];
	stationTriggers3D = [];
	// fire 106: unmin the spacers BEFORE the refresh so it measures the true
	// reverted layout (the refresh listener re-locks the new truth after)
	clearDetSpacerLocks();
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
	// fire 110: the 3D story pin goes with its stations
	if (detPinTrigger3D) {
		detPinTrigger3D.kill();
		detPinTrigger3D = null;
	}
	spans3Disabled = true;
	// fire 106 rev 2: the 3D spacing is about to be removed — unmin the
	// spacers or the stale lock would hold the document 6500px too tall and
	// displace the det3d stations past the footer-relative sanity window
	// (the "stuck on the 2D part, 3D unreachable" report)
	clearDetSpacerLocks();
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
// fire 109 (VERBATIM REVERT): this is the fire-103 assert adapted to
// TRANSFORM pinning. With no pinType override, ST pins the column by
// writing the pin offset into its transform (measured on the original
// mid-hold: translate3d(-65ch, 14000px, 0) — the reading shift AND the
// pin offset share one transform, and the element is NEVER position
// fixed). Therefore: x is re-asserted at -65ch (ST preserves the x
// component — the original proves it), but y IS the pin offset while a
// station span holds — zeroing it mid-hold would throw the column back
// to its flow slot (the fire-101-era "text keeps moving" class). y is
// only zeroed OUTSIDE every span, which is also the fire-105b cleanup
// (a stale hold-multiple y surviving past the release, rendering the
// column over the footer / past the page end).
export function assertDetReadingShift() {
	const el = document.getElementById("det-article");
	if (!el) return;
	if (get(detStep) === 6 && get(detTryExpanded)) {
		gsap.set(el, { x: 0 });
		return;
	}
	const inStory = inDetSpan() || inDetSpan3();
	if (inStory) {
		staleYpolls = 0;
		gsap.set(el, { x: "-65ch" });
		return;
	}
	// x is ours; y is ST's pin offset — NEVER write it while a release might
	// still be in ST's ticker lag (measured: an imperative y-zero inside the
	// span4->5 gap desynced ST's cached transform and the scroll snapped
	// -7345). Outside every span, a non-zero y is only cleaned after it has
	// survived two consecutive polls (~600ms) — ST's own revert lands within
	// one frame, so genuine stale translates (fire 105b) still die.
	gsap.set(el, { x: "-65ch" });
	const y = gsap.getProperty(el, "y");
	if (Math.abs(y) > 50) {
		if (++staleYpolls >= 2) {
			staleYpolls = 0;
			gsap.set(el, { y: 0 });
		}
	} else {
		staleYpolls = 0;
	}
}
let staleYpolls = 0;

// fire 105b (the stuck release): after an instant jump past every span the
// triggers can ALL read inactive (progress 1, srcScroll tracking) while the
// pinned element keeps its fixed-pin inline state (position: fixed + hold
// translate + the sizing ST froze at pin time) for the rest of the session —
// measured live at the try-it band. ScrollTrigger's own view is the
// authority: when no hold is live and the scroll is past the last span end,
// restore the flow state, then the reading shift.
// fire 108 (the user's screenshot: the 3D story text held over the footer):
// a DISCONNECTED trigger's isActive can stick true forever (its ticker
// stopped updating), deadlocking this heal against its own guard. A trigger
// whose window does not contain the live scrollY is not holding anything —
// only a genuinely-containing hold defers the restore now.
export function assertDetReleased() {
	const el = document.getElementById("det-article");
	if (!el) return;
	if (getComputedStyle(el).position !== "fixed") return;
	const y = typeof window !== "undefined" ? window.scrollY : 0;
	const ends = [lastSpanEnd(), lastSpanEnd3()].filter((e) => e !== null);
	if (!ends.length || y <= Math.max(...ends) + 200) return;
	for (const st of [...stationTriggers2D, ...stationTriggers3D]) {
		if (st && st.isActive && y >= st.start && y <= st.end) return;
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
// fire 107: the deep-link family skips are GONE — a load restored past a
// section used to skip that family for the whole session, so its story had
// no holds and compressed to a fast-forward glimpse (the "glimpse of cube
// then the end" report). Shared-spacer spacing lands entirely BELOW the
// pinned column (measured: one spacer, pad-bottom only), so creating under
// the user shifts nothing above the viewport. Creation keeps the original's
// PROVEN animate()-batch timing: a settle-gated late creation landed ~1s
// after the batch and its forced recalibration stripped the ORIGINAL's own
// spacer padding mid-scroll (measured live: 19000 -> 1000, docH 59746 ->
// 35246, Chrome clamped the scroll — the "teleports me back" report).
export function createDetPins() {
	if (get(detPinsLive) || pinsDisabled || typeof window === "undefined") return;
	// fire 107 (the user's "3D section invisible / glimpse of cube then the end"
	// + "teleports back to the det start"): the old deep-link guards SKIPPED a
	// family forever when the load restored past its section — the story then
	// had no holds and compressed to a fast-forward glimpse. Shared-spacer
	// spacing lands entirely BELOW the pinned column (measured: one spacer,
	// pad-bottom only), so creating under the user shifts nothing above the
	// viewport — and the retry path's docH settle gate already guards the
	// fire-92 mid-cascade failure this guard was written for.
	const secDet = document.getElementById("section-det");
	const sec3 = document.getElementById("section-det3d");
	let created2D = !!secDet;
	let created3D = !!sec3 && !spans3Disabled;
	// the reading shift must be in place BEFORE the triggers' first refresh —
	// that refresh is what bakes the transform pin's state
	assertDetReadingShift();
	if (created2D) {
		create2DStoryPin();
		for (let n = 1; n <= 5; n++) {
			const el = document.getElementById(`det-st-${n}`);
			if (!el) continue;
			// fire 110 (the oscillation kill): the stations are WINDOW-ONLY
			// triggers — the column is pinned ONCE per story. The verbatim
			// per-station pins (fire 109) reproduced an oscillation the single
			// family never hits: with two families x five pins sharing one
			// spacer, ST's scroll-position-dependent spacing re-sum recalc
			// shrinks the doc on every refresh (measured -7345 + repeated
			// -864 snaps, docH 60034 -> 56270). One pin per family = one
			// spacing contributor = the measured-stable structure, with the
			// stations tiling the pin's span for the highlight/morph windows.
			const st = ScrollTrigger.create({
				trigger: el,
				start: () => storyWindow2D(n, 0),
				end: () => storyWindow2D(n, 1300),
				pinnedContainer: "#det-article",
				fastScrollEnd: true,
				toggleClass: "active",
				invalidateOnRefresh: true,
				onToggle: assertDetReadingShift
			});
			stationTriggers2D.push(st);
			stationTls2D.push(null);
		}
	}
	if (created3D) {
		// fire 107: a load restored INSIDE a 2D span makes the 2D family's first
		// trigger pin the column SYNCHRONOUSLY in its constructor (ST refreshes
		// each new trigger at creation) — creating the 3D family right after
		// then measures its windows inside the fixed hold (measured live: start
		// 0 / end NaN, the story dead or jumping straight to step 5). Defer to
		// the engines' poll heal (the footer-band recreate), which waits for an
		// unpinned moment.
		const colEl0 = document.getElementById("det-article");
		const colPinned0 = colEl0 && getComputedStyle(colEl0).position === "fixed";
		if (!colPinned0) {
			create3DSpanTriggers();
		}
	}
	if (!stationTriggers2D.length && !stationTriggers3D.length) return;
	// DEV-only QA surface: deterministic ScrollTrigger access for automation
	// (the module has no window global; the fire-107 stale-window heal needed
	// a reproducible refresh handle). Stripped from builds.
	if (import.meta.env.DEV) {
		window.__detpins = {
			refresh: () => ScrollTrigger.refresh(),
			spans: pinsSnapshot
		};
	}
	// fire 101 iterate: an end-clamp here was REVERTED — every ScrollTrigger
	// refresh recomputes end from the "+=1000" config (undoing the clamp) and
	// re-shortening it after each refresh made the spacers oscillate, which
	// the user experienced as the scroll repeatedly jumping back up. The
	// durable fix is LAYOUT: the 3D tail runway now gives the last spans room
	// to release before the footer on every calibration (Article.svelte).
	// fire 106: the anti-clamp lock (see lockDetSpacerHeights) — armed at
	// creation and re-armed after every refresh (pins live only — after a
	// teardown the spacers return to natural flow and must not be pinned to
	// a stale height), so recalibrations stay clamped-proof too.
	if (!spacersLockArmed) {
		spacersLockArmed = true;
		ScrollTrigger.addEventListener("refresh", () => {
			if (get(detPinsLive)) lockDetSpacerHeights();
		});
	}
	armSpacerWatch();
	lockDetSpacerHeights();
	detPinsLive.set(true);
	watchHealth(document.documentElement.scrollHeight);
}

// fire 110: ONE continuous pin per story — the whole chapter freezes the
// column with a single trigger (det-st-1's cross -> det-st-5's cross +
// 1300), and the stations tile that span as window-only triggers. One
// spacing contributor per family: no scroll-position-dependent spacing
// re-sums, no oscillation, no mid-story releases. The reading shift and
// the pin offset share the column's transform (transform pinning — the
// element is never position fixed, and ST preserves the x component).
let detPinTrigger2D = null;
let detPinTrigger3D = null;
// a station element's "center crosses viewport center" scroll position —
// measured inside ST's refresh (pins reverted, flow rects truthful)
function storyCross(sel) {
	const el = document.getElementById(sel);
	if (!el) return 0;
	const r = el.getBoundingClientRect();
	return r.top + window.scrollY + r.height / 2 - window.innerHeight / 2;
}
// the 2D family's configured duration — the shift the 3D story's windows
// must carry (the 3D crosses are raw flow positions; the 2D story's
// consumed scroll room sits between them and the 3D chapter)
function story2DDuration() {
	return detPinTrigger2D ? detPinTrigger2D.end - detPinTrigger2D.start : 0;
}
function storyWindow2D(n, offset) {
	if (!detPinTrigger2D) return 0;
	return detPinTrigger2D.start + (n - 1) * 1300 + offset;
}
function storyWindow3D(n, offset) {
	if (!detPinTrigger3D) return 0;
	return detPinTrigger3D.start + (n - 1) * 1300 + offset;
}
function create2DStoryPin() {
	if (detPinTrigger2D) return;
	detPinTrigger2D = ScrollTrigger.create({
		trigger: "#det-st-1",
		start: () => storyCross("det-st-1"),
		end: () => storyCross("det-st-1") + 5 * 1300,
		pin: "#det-article",
		pinnedContainer: "#det-article",
		pinSpacing: true,
		fastScrollEnd: true,
		invalidateOnRefresh: true,
		onRefresh: assertDetReadingShift,
		onToggle: assertDetReadingShift
	});
}

// fire 110: the 3D story's ONE continuous pin + window-only stations (the
// 2D twin — see create2DStoryPin). Re-creation measures fresh windows
// against the CURRENT layout, healing the frozen-shallow-window failure.
function create3DSpanTriggers() {
	if (!detPinTrigger3D) {
		detPinTrigger3D = ScrollTrigger.create({
			trigger: "#det3d-st-1",
			start: () => storyCross("det3d-st-1") + story2DDuration(),
			end: () => storyCross("det3d-st-1") + 5 * 1300 + story2DDuration(),
			pin: "#det-article",
			pinnedContainer: "#det-article",
			pinSpacing: true,
			fastScrollEnd: true,
			invalidateOnRefresh: true,
			onRefresh: assertDetReadingShift,
			onToggle: assertDetReadingShift
		});
	}
	for (let n = 1; n <= 5; n++) {
		const el = document.getElementById(`det3d-st-${n}`);
		if (!el) continue;
		const prev = n === 1 ? STEP3_MATRIX[1] : STEP3_MATRIX[n - 1];
		const cur = STEP3_MATRIX[n];
		const proxy = { t: n === 1 ? 1 : 0 };
		const tl = gsap.timeline({
			scrollTrigger: {
				trigger: el,
				start: () => storyWindow3D(n, 0),
				end: () => storyWindow3D(n, 1300),
				pinnedContainer: "#det-article",
				scrub: 1,
				fastScrollEnd: true,
				toggleClass: "active",
				invalidateOnRefresh: true
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

// fire 107 (the fire-104 disconnect, the user's "glitchy" 2D/3D fight): the
// 3D spans' windows can freeze on a stale layout (refresh-robust — measured:
// even a forced ScrollTrigger.refresh() left them at 26104 while det3d-st-1
// actually sat at 37784), engaging the 3D dock/story thousands of pixels
// early. Recreating the spans measures fresh windows against the settled
// layout — no refresh, no spacer churn, no rect-machine fallback, and the
// scroll position never moves.
export function recreate3DSpans() {
	if (typeof window === "undefined") return;
	for (const tl of stationTls3D) {
		if (tl) tl.kill();
	}
	stationTls3D = [];
	stationTriggers3D = [];
	// the story pin's windows go stale with the stations' — recreate it too
	if (detPinTrigger3D) {
		detPinTrigger3D.kill();
		detPinTrigger3D = null;
	}
	// fire 110: the column may still carry the previous pin's transform y
	// (the assert's grace period leaves it for ST's ticker) — storyCross
	// measures rects, and a stale +6500 offset poisons every recreated
	// window (measured: station windows inflated a full hold deep). Outside
	// a hold the y is garbage by definition — clear before measuring.
	const colEl = document.getElementById("det-article");
	if (colEl) gsap.set(colEl, { y: 0 });
	create3DSpanTriggers();
	if (get(detPinsLive)) lockDetSpacerHeights();
}

// collapse OR scroll-flow detachment within 2s of creation -> tear down and
// fall back to the rect machines for the session (the fire-81/92 failure
// modes recover instead of stranding the page).
// fire 107: the teardown calls ScrollTrigger.refresh() after dropping ~13k of
// spacer padding — with the user INSIDE the det region that refresh yanks the
// scroll (the "teleports me back to the start of the determinant section"
// report), so a mid-region failure is LOGGED and left live instead: degraded
// holds beat a scroll jump, and the engines' rect cross-checks keep the story
// state sane. Only a user still ABOVE the region gets the clean teardown.
export function userAboveDetRegion() {
	if (typeof window === "undefined") return true;
	const vh = window.innerHeight;
	const secDet = document.getElementById("section-det");
	const sec3 = document.getElementById("section-det3d");
	const detTop = secDet ? secDet.getBoundingClientRect().top : Infinity;
	const sec3Top = sec3 ? sec3.getBoundingClientRect().top : Infinity;
	return Math.min(detTop, sec3Top) > vh;
}
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
			if (!userAboveDetRegion()) {
				console.error(
					"[detPins] the station pins " +
						(detached ? "detached the scroll flow" : "collapsed the document") +
						" but the user is inside the det region — leaving them live (teardown would teleport the scroll)"
				);
				return;
			}
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
