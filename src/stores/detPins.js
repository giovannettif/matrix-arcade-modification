// fire 111 (VERBATIM EXTENSION): the det stations are plain extra triggers
// in the original's stProps chain — ONE pinned element (#article), the
// ORIGINAL's exact config, created in Arcade's animate() batch next to
// st-1..st-13. The whole fire-100..110 machinery (the second pinned column,
// the spacer locks, the watchdogs, the heals, the window math) existed
// because the det story was a parallel pin system; merged into the
// original's chain, that entire bug class stops existing. The step state is
// written by the station callbacks (the original's onEnter pattern) and the
// engines read the stores — the polls keep only the games, the world
// repairs, and the fx.
import { writable, get } from "svelte/store";
import { gsap, ScrollTrigger } from "$utils/gsap.js";
import { det3ScrubTo } from "./det3.js";

// fire 111: the station callbacks write the TARGET step; the engines' polls
// read it and run their (unchanged) applyStep entry/exit logic — which owns
// the real detStep/det3dStep bookkeeping (prev-step detection, exit delays,
// the camera hand-offs). The callbacks never touch detStep directly.
export const detStepTarget = writable(0);
export const det3StepTarget = writable(0);

// the story arc matrices — canonical; the engines import these exact
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

// the det stations: verbatim extensions of the original's chain. hold is
// the pinned scroll per station (fire 104's 1300 tuning; the try-its get
// 1000 — they are overlay states, not scroll-held animations).
const DET_STATIONS = [
	{ id: "det-st-1", step: 1, family: 2 },
	{ id: "det-st-2", step: 2, family: 2 },
	{ id: "det-st-3", step: 3, family: 2 },
	{ id: "det-st-4", step: 4, family: 2 },
	{ id: "det-st-5", step: 5, family: 2 },
	{ id: "det-st-6", step: 6, family: 2, hold: 1000 },
	{ id: "det3d-st-1", step: 1, family: 3 },
	{ id: "det3d-st-2", step: 2, family: 3 },
	{ id: "det3d-st-3", step: 3, family: 3 },
	{ id: "det3d-st-4", step: 4, family: 3 },
	{ id: "det3d-st-5", step: 5, family: 3 },
	{ id: "det3d-st-6", step: 6, family: 3, hold: 1000 }
];

let detStTrigger1 = null;
// the try-it stations' triggers — the guides' visibility hand-off reads
// their ends ("show when the scroll is past the story's pinned span")
let detTrigger6 = null;
let det3Trigger6 = null;

// the step a station hands back to when the scroll leaves its top
// (onLeaveBack): the previous station, or 0 = the story exit
const PREV_STEP = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5 };

function applyStation(s) {
	if (s.family === 3) {
		det3StepTarget.set(s.step);
		// entering the 3D family exits the 2D story (the DetEngine watcher
		// runs the full 2D exit cleanup); leaving it back into the 2D try-it
		// is handled by det-st-6's onEnterBack below.
		if (s.step === 1) detStepTarget.set(0);
	} else {
		detStepTarget.set(s.step);
	}
}

export function createDetStations() {
	if (typeof window === "undefined") return;
	for (const s of DET_STATIONS) {
		const el = document.getElementById(s.id);
		if (!el) continue;
		const is3D = s.family === 3;
		const st = {
			fastScrollEnd: true,
			pin: "#article",
			pinnedContainer: "#article",
			start: "center center",
			scrub: 1,
			pinSpacing: true,
			toggleClass: "active",
			invalidateOnRefresh: true,
			trigger: el,
			end: `+=${s.hold || 1300}`,
			onEnter: () => applyStation(s),
			onEnterBack: () => applyStation(s),
			onLeaveBack: () => {
				if (is3D) {
					det3StepTarget.set(PREV_STEP[s.step]);
					if (s.step === 1) detStepTarget.set(6); // back into the 2D try-it
				} else {
					detStepTarget.set(PREV_STEP[s.step]);
				}
			}
		};
		if (s.id === "det3d-st-6") {
			// the terminal state: past the last det station the 3D story
			// releases into the clean footer view (the fire-73 behavior,
			// restored as a simple callback)
			st.onLeave = () => det3StepTarget.set(0);
		}
		const tl = gsap.timeline({ scrollTrigger: st });
		if (is3D && s.step <= 5) {
			// the 3D morphs ride the station timelines (the original's scrub
			// pattern; the window gate keeps starved tickers honest)
			const prev = STEP3_MATRIX[s.step === 1 ? 1 : s.step - 1];
			const cur = STEP3_MATRIX[s.step];
			const proxy = { t: s.step === 1 ? 1 : 0 };
			tl.to(
				proxy,
				{
					t: 1,
					ease: "none",
					onUpdate: () => {
						const trig = tl.scrollTrigger;
						const y = window.scrollY;
						if (!trig.isActive && !(y >= trig.start && y <= trig.end)) return;
						det3ScrubTo(prev, cur, proxy.t);
					}
				},
				0
			);
		}
		if (s.id === "det-st-1") detStTrigger1 = tl.scrollTrigger;
		if (s.id === "det-st-6") detTrigger6 = tl.scrollTrigger;
		if (s.id === "det3d-st-6") det3Trigger6 = tl.scrollTrigger;
	}
}

// fire 102: station 1's live progress (0..1) — DetEngine's beat-1 drive
// maps it onto the entrance scalars so the unit square draws on THROUGH
// the pinned hold instead of playing its one-shot entrance in 0.6s.
export function detSpan1Progress() {
	if (!detStTrigger1) return 0;
	const span = Math.max(1, detStTrigger1.end - detStTrigger1.start);
	const y = typeof window !== "undefined" ? window.scrollY : detStTrigger1.start;
	return Math.max(0, Math.min(1, (y - detStTrigger1.start) / span));
}

// fire 105: the 2D morph's live state for DetEngine's poll — the deepest
// started station with its scroll-mapped progress (window math against
// scrollY: no animation frame needed, so a starved renderer cannot freeze
// the morph mid-station).
export function detSpanScrub() {
	if (typeof window === "undefined" || !detStTrigger1) return null;
	const y = window.scrollY;
	const start1 = detStTrigger1.start;
	if (y < start1) return null;
	const n = Math.min(5, Math.floor((y - start1) / 1300) + 1);
	const st = detStTrigger1;
	const from = n === 1 ? STEP_MATRIX[1] : STEP_MATRIX[n - 1];
	const to = STEP_MATRIX[n];
	const stationStart = start1 + (n - 1) * 1300;
	const p = Math.max(0, Math.min(1, (y - stationStart) / 1300));
	void st;
	return { n, from, to, p };
}

export function detStationsReady() {
	return !!detStTrigger1;
}

// the try-it hand-off anchors for the guides (the scroll past the story's
// pinned span shows them; the clean-footer rule stays theirs)
export function lastSpanEnd() {
	return detTrigger6 ? Math.round(detTrigger6.end) : null;
}
export function lastSpanEnd3() {
	return det3Trigger6 ? Math.round(det3Trigger6.end) : null;
}
