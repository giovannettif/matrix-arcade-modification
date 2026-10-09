<script>
	import { onMount, onDestroy } from "svelte";
	import { MousePointerClick, Gauge, Crosshair, BookOpen, ChevronDown, ChevronUp } from "lucide-svelte";
	import { detGuideStep, detGuideCollapsed, detGame } from "$stores/det.js";
	import { lastSpanEnd } from "$stores/detPins.js";

	const beats = [
		{
			icon: MousePointerClick,
			title: "Edit the matrix",
			body: "Drag a number left or right to change it — or click it once and type your own. The columns are where the basis vectors land.",
			target: "matrix"
		},
		{
			icon: Gauge,
			title: "Watch the determinant",
			body: "det(A) here updates live as you drag — the area always scales by |det(A)|, and the sign only flips the orientation. Try to make it negative — then try to make it exactly 0.",
			target: "readout"
		},
		{
			icon: Crosshair,
			title: "Predict on the canvas",
			body: "Start a prediction round, click the canvas to plot where the asked point lands — the ghost ring previews it — then hit Accept. The truth flies out after every try, and the next point follows.",
			target: "predict"
		},
		{
			icon: BookOpen,
			title: "Break it on purpose",
			body: "Set det(A) to 0 and start a corner round: the whole square collapses — this example onto one line, though a matrix can collapse it to a single point too — so the corners end up sharing an image. Where a corner came from stops being recoverable. That is why no inverse exists.",
			target: "predict"
		}
	];

	$: step = $detGuideStep;
	$: beat = step >= 0 && step < beats.length ? beats[step] : null;
	$: last = step === beats.length - 1;
	$: if (cardEl) place(beat);
	// fire 105 (the "can't predict" report): while a prediction round is
	// asking, the spotlight fuzz stands down — its whole viewport path used
	// to keep blocking canvas clicks mid-round (each plot click just advanced
	// the tour), so rounds could not be played until the tour happened to
	// finish. The dim/blur look stays; only the interception is released.
	$: roundLive = $detGame.status === "asking";

	let cardEl;
	let arrowSide = "left";
	let arrowTop = 40;
	let parked = true;
	// fire 102: whether the card currently sits at the off-screen park (its CSS
	// start, left: -9999px) — off-screen <-> on-screen moves must SNAP, never
	// transition (see moveTo)
	let parkedOff = true;
	// fire 50 (user: make the tour forced — "show the grey darker fuzz screen
	// except for the part the guide is and the part its talking about"): one
	// fixed SVG with evenodd holes. Everything outside the beat's target, the
	// guide card and the canvas stage is dimmed AND blocks clicks, so the user
	// walks the tour beat by beat; the holes pass pointer events through.
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
		if (!cardEl || !beat || $detGuideCollapsed || parked) {
			spotPath = "";
			return;
		}
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		let d = `M0 0H${vw}V${vh}H0Z`;
		const target = document.querySelector(`[data-tour="${beat.target}"]`);
		if (target) d += rectHole(target.getBoundingClientRect(), 10);
		// fire 79 (I2): the card hole tracks the card's CURRENT rect — the card
		// travels with the beats now, so the parked top-right spot is gone
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
	// data-URI SVG that the .glass layer's CSS mask cuts through; rebuilt
	// together with spotPath. fire 84 (P2, user: the tour greyed out the part
	// it was pointing at): CSS image masks are ALPHA by default (match-source)
	// — a white rect + a BLACK holes path is opaque everywhere, so the mask
	// had no holes at all and the whole screen frosted. The fix is a SINGLE
	// white evenodd path: the holes are UNPAINTED (alpha 0) there, correct in
	// both alpha and luminance modes. Explicit pixel dims — percentage
	// intrinsic sizes don't resolve in image data-URIs; mask-size stretches.
	// fire 101 (the user's tour report): the mask canvas dims were hardcoded
	// 1920x1080 — on any other viewport mask-size stretched the holes to the
	// wrong place and the unpainted right third lit up for no reason. Build
	// the mask at the LIVE viewport size (captured in place()/updateSpots).
	let viewW = 1280;
	let viewH = 720;
	$: maskImage = spotPath
		? `url("data:image/svg+xml,${encodeURIComponent(
			`<svg xmlns='http://www.w3.org/2000/svg' width='${viewW}' height='${viewH}'><path d='${spotPath}' fill='white' fill-rule='evenodd'/></svg>`
		)}")`
		: "";

	// position the card next to the beat's target with an arrow pointing at it.
	// Positioning goes through style.left/top with a CSS transition (the card
	// visibly travels between beats). The transition is assigned ONCE —
	// re-assigning it every placement restarts the transition from the old
	// position, which reads as the card never moving.
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

	// fire 102 (the floating-card report): the region test — the card + fuzz
	// belong ONLY to the det try-it region, in every state (parked/finished/
	// collapsed included). The region is the engine's OWN step-6 zone, not a
	// bare rect: with the pins live the try-it engages at the LAST span's end
	// +100 (DetEngine's hand-off rule — at that scroll the try-it text is
	// still a little below the fold, so a paragraph-intersection test would
	// strand the forced tour), and it exits at the engine's clean-footer
	// thresholds. The try-it text itself (#det-st-6) bounds the DOWN side:
	// once it has left through the viewport top the card is over the 3D
	// chapter — the fire-102 band float. The up side is the scroll band
	// itself, so the test reads true/false on any live scroll tick even when
	// the engine's poll is stalled (the stuck-card form of this bug); the
	// rect fallback (pins off) mirrors the engine's center-cross rule.
	// Below-lg place() returns at the narrow-viewport branch before this runs.
	function regionOnScreen() {
		const el = document.getElementById("det-st-6");
		if (!el) return true;
		const r = el.getBoundingClientRect();
		// past the try-it text: the 3D-chapter side. 24px = sliver tolerance —
		// a knife-edge 0 cut flips the whole card on 1px of scroll while the
		// text's last line trails off the top edge
		if (r.bottom <= 24) return false;
		const footerEl = document.querySelector("footer");
		if (footerEl) {
			const bottomNow = window.innerHeight + window.scrollY;
			const articleBottom = footerEl.getBoundingClientRect().top + window.scrollY;
			if (
				bottomNow > articleBottom + window.innerHeight * 0.55 ||
				bottomNow >= document.documentElement.scrollHeight - 2
			) {
				return false; // the clean-footer hand-off (fire 79 I3)
			}
		}
		const spanEnd = lastSpanEnd();
		if (spanEnd !== null) return window.scrollY >= spanEnd + 100; // the pin-span hand-off
		return r.top <= window.innerHeight / 2; // rect mode: the center-cross rule
	}
	// the _beat argument only registers `beat` as a reactive dependency so a
	// beat change repositions the card + spotlight immediately (the module
	// `beat` is already fresh — reactives flush in declaration order)
	function place(_beat) {
		if (!cardEl) return;
		try {
			const vw = window.innerWidth;
			const vh = window.innerHeight;

			// the det story is desktop-only — never paint over the site's
			// narrow-viewport fallback notice
			if (vw < 1024) {
				parked = true;
				parkedOff = true;
				moveTo(-9999, -9999);
				spotPath = "";
				return;
			}

			// fire 102: the card + fuzz belong ONLY to the det try-it region —
			// the finished/collapsed park used to stay fixed top-right across
			// the whole terminal band (detStep 6 is scroll-absolute from the
			// try-it through the 3D chapter), so the dismissed card floated
			// over every chapter inside it, and an active tour's fuzz rode
			// along the same way. Off-region the card parks off-screen and the
			// fuzz clears in EVERY state (parked/finished/collapsed included);
			// place() re-runs on every scroll tick + the 700ms interval, so the
			// card returns the moment the region is back and the tour state in
			// detGuideStep is untouched — fully functional inside its region.
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

			// park at the top-right when there is no active beat or it's folded
			if (!beat || $detGuideCollapsed) {
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
			// right edge, vertically centered on it (flipped to the target's
			// left when it would overflow the viewport), so the tour visibly
			// points at the chunk it talks about instead of parking top-right
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
		detGuideStep.update((s) => Math.min(s + 1, beats.length - 1));
	}
	function back() {
		detGuideStep.update((s) => Math.max(s - 1, 0));
	}
	function finish() {
		detGuideStep.set(beats.length); // done — card stays, guide text minimized
	}
	function reopen() {
		detGuideStep.set(0);
		detGuideCollapsed.set(false);
	}

	let iv;
	onMount(() => {
		// first placement snaps (no transition — otherwise the card would fly in
		// from its off-screen -9999px start), then travel transitions turn on
		cardEl.style.transition = "none";
		const t = setTimeout(() => {
			place();
			requestAnimationFrame(() => {
				cardEl.style.transition =
					"left 0.45s cubic-bezier(0.22, 0.61, 0.36, 1), top 0.45s cubic-bezier(0.22, 0.61, 0.36, 1)";
			});
		}, 350);
		window.addEventListener("resize", place);
		// fire 101: re-place on scroll too (rAF-throttled) — the card + the
		// fuzz holes previously trailed a scroll by up to the 700ms interval
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
	<!-- fire 50: the forced-tour fuzz — dims everything outside the lit spots
	     and blocks clicks there; the evenodd holes pass events through.
	     fire 79 (I2): the GLASS — a backdrop-blur layer masked by the same
	     holes sits UNDER this path, so the rest of the screen reads as dimmed
	     frosted glass; the path itself keeps only the click blocking
	     (transparent fill), and clicking the glass advances the tour. If the
	     CSS mask ever fails we lose the blur, never the whole screen. -->
	<div
		class="glass"
		class:round-live={roundLive}
		on:wheel|preventDefault={() => {}}
		style:mask-image={maskImage}
		style:-webkit-mask-image={maskImage}
		aria-hidden="true"
	/>
	<svg class="spotlight" class:round-live={roundLive} aria-hidden="true" on:wheel|preventDefault={() => {}}>
		<path
			d={spotPath}
			fill-rule="evenodd"
			on:click={() => {
				if (roundLive) return;
				last ? finish() : next();
			}}
		/>
	</svg>
{/if}

<div class="guide" class:collapsed={$detGuideCollapsed} bind:this={cardEl}>
	{#if !parked && !$detGuideCollapsed}
		<span class="arrow {arrowSide}" style:top="{arrowTop}px" aria-hidden="true" />
	{/if}
	<div class="head">
		<span class="title"><BookOpen size={15} /> Your guide</span>
		<button class="fold" on:click={() => detGuideCollapsed.update((v) => !v)} aria-label={$detGuideCollapsed ? "Show the guide" : "Hide the guide"}>
			{$detGuideCollapsed ? "Show guide" : "Hide guide"}
			{#if $detGuideCollapsed}
				<ChevronDown size={14} />
			{:else}
				<ChevronUp size={14} />
			{/if}
		</button>
	</div>

	{#if !$detGuideCollapsed}
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
				You're on your own now — the round buttons below keep Score.
				<button class="reopen" on:click={reopen}>Replay the guide</button>
			</p>
		{/if}
	{/if}
</div>

<style lang="postcss">
	.guide {
		@apply fixed z-50 w-80 rounded-xl border border-[#50fa7b40] bg-[rgba(13,13,24,0.94)] p-3.5 shadow-[0_0_24px_rgba(0,0,0,0.5)];
		left: -9999px; /* positioned by place() on mount */
		/* fire 79 (I2): the traveling card is click-through except its own
		   buttons — a card resting over the canvas can never block guesses */
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
		fill: transparent; /* fire 79 (I2): the glass layer owns the tint now —
		                      this path only blocks clicks */
		pointer-events: auto;
	}
	/* fire 105: mid-round the fuzz keeps its look but stops intercepting —
	   the canvas must take the plot clicks (see the roundLive note above) */
	.spotlight.round-live path {
		pointer-events: none;
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
