<script>
	// fire 67 (FIX-E, user: "no cards overlaid or guided tour, the try it
	// section looks bad compared to first determinant section"): the 3D
	// try-it's guided tour — a port of DetGuide.svelte (the same forced
	// grey-spotlight walk: everything outside the beat's target, the guide
	// card and the canvas stage is dimmed AND blocks clicks), with beats
	// targeting the dock's flow (spinners -> volume readout -> predict).
	import { onMount, onDestroy } from "svelte";
	import { MousePointerClick, Gauge, BookOpen, ChevronDown, ChevronUp } from "lucide-svelte";
	import { det3GuideStep, det3GuideCollapsed } from "$stores/det3.js";
	import { lastSpanEnd3 } from "$stores/detPins.js";

	const beats = [
		{
			icon: MousePointerClick,
			title: "Edit the matrix",
			body: "These nine numbers are the 3×3 matrix. Drag one to change it — each column shows where a basis vector lands, and the unit cube becomes the box they span.",
			target: "3matrix"
		},
		{
			icon: Gauge,
			title: "Watch the volume",
			body: "|det(A)| is the box's volume scale, live. Push det(A) negative and the box flips inside out — the volume still scales by |det(A)|, only the orientation reverses; the mirror-image det is exactly what the 2D story hinted at.",
			target: "3readout"
		},
		{
			icon: MousePointerClick,
			title: "Predict on the canvas",
			body: "Start a round, click the floor under the pulsing corner, set its height and lock it in. The truth flies out after every try, and the next corner follows.",
			target: "3predict"
		},
		{
			icon: BookOpen,
			title: "Break it on purpose",
			body: "Set the matrix so det(A) = 0: the whole cube collapses — this example onto a plane; other singular matrices can flatten space onto a line or a point. Either way the volume is zero and information is thrown away. That is why no inverse exists.",
			target: "3predict"
		}
	];

	$: step = $det3GuideStep;
	$: beat = step >= 0 && step < beats.length ? beats[step] : null;
	$: last = step === beats.length - 1;
	$: if (cardEl) place(beat);

	let cardEl;
	let arrowSide = "left";
	let arrowTop = 40;
	let parked = true;
	// fire 102: whether the card currently sits at the off-screen park (its CSS
	// start, left: -9999px) — off-screen <-> on-screen moves must SNAP, never
	// transition (see moveTo; the 2D twin DetGuide.svelte)
	let parkedOff = true;
	let spotPath = "";

	function rectHole(r, pad) {
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const x = Math.max(0, Math.round(r.x - pad));
		const y = Math.max(0, Math.round(r.y - pad));
		const w = Math.min(vw - x, Math.round(r.width + pad * 2));
		const h = Math.min(vh - y, Math.round(r.height + pad * 2));
		return `M${x} ${y}h${w}v${h}h${-w}Z`;
	}

	function updateSpots() {
		viewW = window.innerWidth;
		viewH = window.innerHeight;
		if (!cardEl || !beat || $det3GuideCollapsed || parked) {
			spotPath = "";
			return;
		}
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const cardW = cardEl.offsetWidth || 320;
		const cardH = cardEl.offsetHeight || 170;
		let d = `M0 0H${vw}V${vh}H0Z`;
		const target = document.querySelector(`[data-tour="${beat.target}"]`);
		if (target) d += rectHole(target.getBoundingClientRect(), 10);
		// fire 79 (I2): the card hole tracks the card's CURRENT rect (it travels)
		d += rectHole(cardEl.getBoundingClientRect(), 14);
		// fire 85 (adv fix): the canvas hole used to punch the FULL viewport
		// (the wrapper is full-bleed) — under evenodd that added a second
		// full-screen rect, cancelling the entire fuzz AND the mask (all
		// holes). New rule: NO canvas hole on the read beats (the fuzz focuses
		// on the panel chunk the beat talks about — the user's ask); on the
		// PLAY beats the canvas strip stays lit so the round is playable (the
		// article column's box is transformed, so the strip runs to its box
		// edge and clamps to the viewport).
		if (beat.target === "predict" || beat.target === "3predict") {
			const cw = document.getElementById("canvas-wrapper");
			const artEl = document.getElementById("article");
			if (cw && artEl) {
				const artLeft = artEl.getBoundingClientRect().left;
				const w = Math.max(0, Math.min(vw, artLeft));
				if (w > 40) d += rectHole({ x: 0, y: 0, width: Math.round(w), height: vh }, 0);
			}
		}
		spotPath = d;
	}

	// fire 79 (I2): the glass mask — the same holes as spotPath, encoded as a
	// data-URI SVG the .glass layer's CSS mask cuts through
		// fire 79 (I2): the glass mask — the same holes as spotPath, encoded as a
	// data-URI SVG that the .glass layer's CSS mask cuts through; rebuilt
	// together with spotPath. fire 84 (P2, user: the tour greyed out the part
	// it was pointing at): CSS image masks are ALPHA by default (match-source)
	// — a white rect + a BLACK holes path is opaque everywhere, so the mask
	// had no holes at all and the whole screen frosted. The fix is a SINGLE
	// white evenodd path: the holes are UNPAINTED (alpha 0) there, correct in
	// both alpha and luminance modes. Explicit pixel dims — percentage
	// intrinsic sizes don't resolve in image data-URIs; mask-size stretches.
	// fire 101: the mask canvas at the LIVE viewport size (the hardcoded
	// 1920x1080 scaled the holes wrong and lit the unpainted right third)
	let viewW = 1280;
	let viewH = 720;
	$: maskImage = spotPath
		? `url("data:image/svg+xml,${encodeURIComponent(
			`<svg xmlns='http://www.w3.org/2000/svg' width='${viewW}' height='${viewH}'><path d='${spotPath}' fill='white' fill-rule='evenodd'/></svg>`
		)}")`
		: "";

	function moveTo(leftPx, topPx, snap = false) {
		const l = `${Math.round(leftPx)}px`;
		const t = `${Math.round(topPx)}px`;
		if (cardEl.style.left === l && cardEl.style.top === t) return;
		if (!snap) {
			cardEl.style.left = l;
			cardEl.style.top = t;
			return;
		}
		// fire 102: a transitioned move to/from the off-screen park would fly
		// the card across the whole viewport — snap it (the mount flow's
		// transition:none below covers the same case for the first placement)
		const prev = cardEl.style.transition;
		cardEl.style.transition = "none";
		cardEl.style.left = l;
		cardEl.style.top = t;
		void cardEl.offsetWidth; // flush so this move never animates
		requestAnimationFrame(() => {
			cardEl.style.transition = prev;
		});
	}

	// fire 102 (the floating-card report): the region test — the 3D twin of
	// DetGuide's, on the 3D engine's own step-6 anchors: the try-it engages at
	// the last 3D span's end +100 (Det3DEngine's hand-off rule) and exits at
	// the clean-footer thresholds; det3d-st-6 leaving through the viewport
	// top bounds the down side, and the rect fallback (pins off) mirrors the
	// engine's center-cross rule. Below-lg place() returns at the
	// narrow-viewport branch before this runs (hidden rects read 0).
	function regionOnScreen() {
		const el = document.getElementById("det3d-st-6");
		if (!el) return true;
		const r = el.getBoundingClientRect();
		// past the try-it text (24px sliver tolerance, the 2D twin's note)
		if (r.bottom <= 24) return false;
		const footerEl = document.querySelector("footer");
		if (footerEl) {
			const bottomNow = window.innerHeight + window.scrollY;
			const articleBottom = footerEl.getBoundingClientRect().top + window.scrollY;
			if (
				bottomNow > articleBottom + window.innerHeight * 0.55 ||
				bottomNow >= document.documentElement.scrollHeight - 2
			) {
				return false; // the clean-footer hand-off (fire 73 H1, the 3D twin)
			}
		}
		const spanEnd = lastSpanEnd3();
		if (spanEnd !== null) return window.scrollY >= spanEnd + 100; // the pin-span hand-off
		return r.top <= window.innerHeight / 2; // rect mode: the center-cross rule
	}

	function place(_beat) {
		if (!cardEl) return;
		try {
			const vw = window.innerWidth;
			const vh = window.innerHeight;
			if (vw < 1024) {
				parked = true;
				parkedOff = true;
				moveTo(-9999, -9999);
				spotPath = "";
				return;
			}
			// fire 102: the card + fuzz belong ONLY to the 3D try-it region —
			// same rule as the 2D twin (DetGuide.svelte): off-region the card
			// parks off-screen and the fuzz clears in EVERY state (parked/
			// finished/collapsed included); place() re-runs on every scroll
			// tick + the 700ms interval, so the card returns the moment the
			// region is back and the tour state in det3GuideStep is untouched.
			if (!regionOnScreen()) {
				parked = true;
				parkedOff = true;
				moveTo(-9999, -9999, true);
				spotPath = "";
				return;
			}
			// returning from the off-screen park: snap into place, never fly
			const snap = parkedOff;
			const cardW = cardEl.offsetWidth || 320;
			const cardH = cardEl.offsetHeight || 170;
			if (!beat || $det3GuideCollapsed) {
				parked = true;
				moveTo(vw - cardW - 24, Math.min(96, vh - cardH - 12), snap);
				parkedOff = false;
				spotPath = "";
				return;
			}
			const target = document.querySelector(`[data-tour="${beat.target}"]`);
			if (!target) {
				parked = true;
				moveTo(vw - cardW - 24, 96, snap);
				parkedOff = false;
				spotPath = "";
				return;
			}
			parked = false;
			parkedOff = false;
			// fire 79 (I2): the card TRAVELS to the beat — beside the target's
			// right edge, vertically centered (flipped left on overflow)
			const r = target.getBoundingClientRect();
			let left = r.right + 18;
			if (left + cardW > vw - 12) left = Math.max(12, r.left - cardW - 18);
			let top = r.top + r.height / 2 - cardH / 2;
			top = Math.max(12, Math.min(vh - cardH - 12, top));
			moveTo(left, top, snap);
			arrowSide = left > r.right ? "left" : "right";
			arrowTop = Math.round(cardH / 2);
			updateSpots();
		} catch (e) {
			// placement is best-effort; a failed beat keeps the last position
		}
	}

	function next() {
		det3GuideStep.update((s) => Math.min(s + 1, beats.length - 1));
	}
	function back() {
		det3GuideStep.update((s) => Math.max(s - 1, 0));
	}
	function finish() {
		det3GuideStep.set(beats.length); // done — card stays, guide text minimized
	}
	function reopen() {
		det3GuideStep.set(0);
		det3GuideCollapsed.set(false);
	}

	let iv;
	onMount(() => {
		cardEl.style.transition = "none";
		const t = setTimeout(() => {
			place();
			requestAnimationFrame(() => {
				cardEl.style.transition =
					"left 0.45s cubic-bezier(0.22, 0.61, 0.36, 1), top 0.45s cubic-bezier(0.22, 0.61, 0.36, 1)";
			});
		}, 350);
		window.addEventListener("resize", place);
		// fire 101: re-place on scroll too (rAF-throttled; the 2D twin)
		let raf = 0;
		const onScrollPlace = () => {
			if (raf) return;
			raf = requestAnimationFrame(() => {
				raf = 0;
				place();
			});
		};
		window.addEventListener("scroll", onScrollPlace, { passive: true });
		iv = setInterval(place, 700); // targets can shift; keep the arrow honest
		return () => {
			clearTimeout(t);
			cancelAnimationFrame(raf);
		window.removeEventListener("resize", place);
		window.removeEventListener("scroll", onScrollPlace);
		};
	});
	onDestroy(() => clearInterval(iv));
</script>

{#if spotPath}
	<!-- fire 78 (H5): clicking the dimmed fuzz advances the tour (the twin of
	     the 2D guide's escape) — the dock's Predict row was click-blocked at
	     beats 0-1 and read as "no predict game".
	     fire 79 (I2): the GLASS — a backdrop-blur layer masked by the same
	     holes sits UNDER the click-blocker path (transparent fill now) -->
	<div
		class="glass"
		on:wheel|preventDefault={() => {}}
		style:mask-image={maskImage}
		style:-webkit-mask-image={maskImage}
		aria-hidden="true"
	/>
	<svg class="spotlight" aria-hidden="true" on:wheel|preventDefault={() => {}}>
		<path d={spotPath} fill-rule="evenodd" on:click={() => (last ? finish() : next())} />
	</svg>
{/if}

<div class="guide" class:collapsed={$det3GuideCollapsed} bind:this={cardEl}>
	{#if !parked && !$det3GuideCollapsed}
		<span class="arrow {arrowSide}" style:top="{arrowTop}px" aria-hidden="true" />
	{/if}
	<div class="head">
		<span class="title"><BookOpen size={15} /> Your guide</span>
		<button class="fold" on:click={() => det3GuideCollapsed.update((v) => !v)} aria-label={$det3GuideCollapsed ? "Show the guide" : "Hide the guide"}>
			{$det3GuideCollapsed ? "Show guide" : "Hide guide"}
			{#if $det3GuideCollapsed}
				<ChevronDown size={14} />
			{:else}
				<ChevronUp size={14} />
			{/if}
		</button>
	</div>

	{#if !$det3GuideCollapsed}
		{#if beat}
			<div class="beat">
				<div class="beat-head">
					<span class="ico"><beat.icon size={15} /></span>
					<b>{beat.title}</b>
				</div>
				<p>{beat.body}</p>
			</div>
			<div class="foot">
				<span class="count">{step + 1} / {beats.length}</span>
				<div class="nav">
					{#if step > 0}
						<button class="ghost" on:click={back}>Back</button>
					{/if}
					<button class="primary" on:click={last ? finish : next}>
						{last ? "Got it — play!" : "Next"}
					</button>
				</div>
			</div>
		{:else}
			<p class="done">
				You're on your own now — the dock keeps Score across rounds.
				<button class="reopen" on:click={reopen}>Replay the guide</button>
			</p>
		{/if}
	{/if}
</div>

<style lang="postcss">
	.guide {
		@apply fixed z-50 w-80 rounded-xl border border-[#50fa7b40] bg-[rgba(13,13,24,0.94)] p-3.5 shadow-[0_0_24px_rgba(0,0,0,0.5)];
		left: -9999px; /* positioned by place() on mount */
		/* fire 79 (I2): the traveling card is click-through except its buttons */
		pointer-events: none;
	}
	.guide button {
		pointer-events: auto;
	}
	.guide.collapsed {
		@apply py-2;
	}
	.arrow {
		position: absolute;
		width: 0;
		height: 0;
		border-top: 9px solid transparent;
		border-bottom: 9px solid transparent;
	}
	.arrow.left {
		left: -9px;
		border-right: 10px solid rgba(80, 250, 123, 0.55);
	}
	.arrow.right {
		right: -9px;
		border-left: 10px solid rgba(80, 250, 123, 0.55);
	}
	.head {
		@apply flex items-center justify-between gap-2;
	}
	.title {
		@apply flex items-center gap-2 font-sans text-xs font-bold uppercase tracking-wide text-[#50fa7b];
	}
	.fold {
		@apply flex items-center gap-1 rounded-md border border-[#44475a] px-2 py-1 font-sans text-[11px] text-[#8b90a7];
	}
	.fold:hover {
		@apply text-base-content;
	}
	.beat {
		@apply mt-2.5;
	}
	.beat-head {
		@apply flex items-center gap-2;
	}
	.ico {
		@apply grid h-6 w-6 place-items-center rounded-full border border-[#50fa7b] text-[#50fa7b];
	}
	.beat-head b {
		@apply font-sans text-sm text-base-content;
	}
	p {
		@apply mt-1.5 font-sans text-xs leading-relaxed text-[#c8cbdd];
	}
	.done {
		@apply mt-2;
	}
	.reopen {
		@apply ml-1 font-sans text-xs text-[#50fa7b] underline underline-offset-2;
	}
	.foot {
		@apply mt-2.5 flex items-center justify-between;
	}
	.count {
		@apply font-sans text-[10px] text-[#8b90a7];
	}
	.nav {
		@apply flex items-center gap-2;
	}
	.ghost {
		@apply font-sans text-xs text-[#8b90a7];
	}
	.ghost:hover {
		@apply text-base-content;
	}
	.primary {
		@apply rounded-lg border border-[#50fa7b99] px-3 py-1 font-sans text-xs font-bold text-[#50fa7b];
	}
	.primary:hover {
		background: rgba(80, 250, 123, 0.12);
	}
	.spotlight {
		position: fixed;
		inset: 0;
		width: 100vw;
		height: 100vh;
		z-index: 45; /* above the z-40 det panel (dims it), below this card (z-50) */
		pointer-events: none;
	}
	.spotlight path {
		fill: transparent; /* fire 79 (I2): the glass layer owns the tint now */
		pointer-events: auto;
	}
	/* fire 79 (I2): the frosted-glass blackout, cut by the shared hole mask */
	.glass {
		position: fixed;
		inset: 0;
		z-index: 45;
		pointer-events: none;
		background: rgba(4, 5, 11, 0.38);
		backdrop-filter: blur(4px) saturate(0.85);
		-webkit-backdrop-filter: blur(4px) saturate(0.85);
		mask-size: 100% 100%;
		mask-repeat: no-repeat;
		-webkit-mask-size: 100% 100%;
		-webkit-mask-repeat: no-repeat;
	}
</style>
