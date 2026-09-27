<script>
	import { MousePointerClick, Gauge, Crosshair, BookOpen, ChevronDown, ChevronUp } from "lucide-svelte";
	import { detGuideStep, detGuideCollapsed } from "$stores/det.js";

	const beats = [
		{
			icon: MousePointerClick,
			title: "Edit the matrix",
			body: "Drag a number left or right to change it — or click it once and type your own. The columns are where the basis vectors land."
		},
		{
			icon: Gauge,
			title: "Watch the determinant",
			body: "det(A) on the canvas updates live with the area. Try to make it negative — then try to make it exactly 0."
		},
		{
			icon: Crosshair,
			title: "Predict on the canvas",
			body: "Start a prediction round below, then click the canvas where you think the answer is. Close counts — but only a hit turns green."
		},
		{
			icon: BookOpen,
			title: "Break it on purpose",
			body: "Set det(A) to 0 and try an origin prediction: several points map to the same spot, so the answer is unknowable. That is why no inverse exists."
		}
	];

	$: step = $detGuideStep;
	$: beat = step >= 0 && step < beats.length ? beats[step] : null;
	$: last = step === beats.length - 1;

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
</script>

<div class="guide" class:collapsed={$detGuideCollapsed}>
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
		@apply rounded-xl border border-[#50fa7b40] bg-[rgba(13,13,24,0.92)] p-3.5 shadow-[0_0_24px_rgba(0,0,0,0.5)];
	}
	.guide.collapsed {
		@apply py-2;
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
