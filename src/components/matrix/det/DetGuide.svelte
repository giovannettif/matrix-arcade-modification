<script>
	import { onMount, onDestroy } from "svelte";
	import { MousePointerClick, Gauge, Crosshair, BookOpen, ChevronDown, ChevronUp } from "lucide-svelte";
	import { detGuideStep, detGuideCollapsed } from "$stores/det.js";

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
			body: "det(A) here updates live with the area. Try to make it negative — then try to make it exactly 0.",
			target: "readout"
		},
		{
			icon: Crosshair,
			title: "Predict on the canvas",
			body: "Start a prediction round here, then click the canvas where you think the answer is. Close counts — but only a hit turns green.",
			target: "predict"
		},
		{
			icon: BookOpen,
			title: "Break it on purpose",
			body: "Set det(A) to 0 and start an origin prediction: several points map to the same spot, so the answer is unknowable. That is why no inverse exists.",
			target: "origin"
		}
	];

	$: step = $detGuideStep;
	$: beat = step >= 0 && step < beats.length ? beats[step] : null;
	$: last = step === beats.length - 1;
	$: if (cardEl) place();

	let cardEl;
	let arrowSide = "left";
	let arrowTop = 40;
	let parked = true;

	// position the card next to the beat's target with an arrow pointing at it.
	// Positioning goes through style.left/top with a CSS transition (the card
	// visibly travels between beats). The transition is assigned ONCE —
	// re-assigning it every placement restarts the transition from the old
	// position, which reads as the card never moving.
	function moveTo(leftPx, topPx) {
		const l = `${Math.round(leftPx)}px`;
		const t = `${Math.round(topPx)}px`;
		if (cardEl.style.left === l && cardEl.style.top === t) return;
		cardEl.style.left = l;
		cardEl.style.top = t;
	}
	function place() {
		if (!cardEl) return;
		try {
			const vw = window.innerWidth;
			const vh = window.innerHeight;
			const cardW = cardEl.offsetWidth || 320;
			const cardH = cardEl.offsetHeight || 170;

			// park at the top-right when there is no active beat or it's folded
			if (!beat || $detGuideCollapsed) {
				parked = true;
				moveTo(vw - cardW - 24, Math.min(96, vh - cardH - 12));
				return;
			}

			const target = document.querySelector(`[data-tour="${beat.target}"]`);
			if (!target) {
				parked = true;
				moveTo(vw - cardW - 24, 96);
				return;
			}
			parked = false;
			const r = target.getBoundingClientRect();
			// prefer the card to the right of the target, arrow pointing left at it
			let left;
			if (r.right + cardW + 56 < vw) {
				left = r.right + 26;
				arrowSide = "left";
			} else {
				left = Math.max(12, r.left - cardW - 26);
				arrowSide = "right";
			}
			const centerY = r.top + r.height / 2;
			const top = Math.min(Math.max(centerY - cardH / 2, 12), vh - cardH - 12);
			arrowTop = Math.min(Math.max(centerY - top, 18), cardH - 18);
			moveTo(left, top);
		} catch (e) {
			window.__tourPlace = { error: String(e && e.message || e) };
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
		iv = setInterval(place, 700); // targets can shift; keep the arrow honest
		return () => {
			clearTimeout(t);
			window.removeEventListener("resize", place);
		};
	});
	onDestroy(() => clearInterval(iv));
</script>

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
</style>
