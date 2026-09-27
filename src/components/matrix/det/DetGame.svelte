<script>
	import { Gamepad2, MousePointerClick, ArrowRight, RotateCcw, X } from "lucide-svelte";
	import {
		detGame,
		detChapter,
		startRound,
		endRound
	} from "$stores/det.js";

	$: active = $detChapter === 3;
	$: g = $detGame;

	$: question =
		g.mode === "forward"
			? "Click where you think the highlighted point from the unit square lands."
			: "Click where you think the marked point came from in the original square.";

	function fmt(p) {
		return p ? `(${p[0].toFixed(1)}, ${p[1].toFixed(1)})` : "";
	}
</script>

{#if active}
	<div class="game">
		<div class="head">
			<span class="title"><Gamepad2 size={16} /> Your turn</span>
			{#if g.status === "idle"}
				<div class="modes">
					<button class="mode" on:click={() => startRound("forward")}>
						<MousePointerClick size={15} /> Predict the image
					</button>
					<button class="mode" on:click={() => startRound("inverse")}>
						<RotateCcw size={15} /> Predict the origin
					</button>
				</div>
			{:else}
				<button class="quit" on:click={endRound} aria-label="End the prediction round">
					<X size={15} /> quit
				</button>
			{/if}
		</div>

		{#if g.status === "asking"}
			<p class="question">{question}</p>
		{/if}

		{#if g.status === "revealed" && g.result}
			{#if g.result.type === "correct"}
				<div class="banner ok">
					{g.mode === "forward"
						? "Correct! This is the image of the point under A."
						: "Correct! You found the point that maps there — the transformation is undone."}
				</div>
			{:else if g.result.type === "wrong"}
				<div class="banner no">
					Not quite — the real answer is {fmt(g.result.answer)}. Watch the connector and
					try the next one!
				</div>
			{:else}
				<div class="banner amb">
					Ambiguous! <b>Every</b> circled point maps to the same image — you can't know
					which one it was. That's exactly why no inverse exists when det(A) = 0.
				</div>
			{/if}
			<div class="strip">
				{#if g.mode === "forward"}
					<span class="chip">Original point {fmt(g.round.point)}</span>
					<ArrowRight size={14} />
					{#if g.guess}
						<span class="chip" class:okc={g.result.type === "correct"} class:noc={g.result.type === "wrong"}>
							Your guess {fmt(g.guess)} {g.result.type === "correct" ? "✓" : "✗"}
						</span>
					{/if}
					<span class="chip">Image {fmt(g.result.answer)}</span>
				{:else}
					<span class="chip">Landed at {fmt(g.round.target)}</span>
					<ArrowRight size={14} />
					<span class="chip" class:okc={g.result.type === "correct"} class:ambc={g.result.type === "ambiguous"} class:noc={g.result.type === "wrong"}>
						Came from {fmt(g.result.answer)} {g.result.type === "correct" ? "✓" : g.result.type === "ambiguous" ? "?" : "✗"}
					</span>
				{/if}
			</div>
			<div class="next-row">
				<button class="mode" on:click={() => startRound(g.mode)}>
					Next round ({g.mode === "forward" ? "image" : "origin"})
				</button>
				<span class="streak">streak: {g.streak}</span>
			</div>
		{/if}
	</div>
{/if}

<style lang="postcss">
	.game {
		@apply mt-3 rounded-xl border border-[#44475a66] bg-[#0d0d18]/95 p-4;
	}
	.head {
		@apply flex flex-wrap items-center justify-between gap-2;
	}
	.title {
		@apply flex items-center gap-2 font-sans text-sm font-bold text-base-content;
	}
	.modes {
		@apply flex flex-wrap gap-2;
	}
	.mode {
		@apply flex items-center gap-1.5 rounded-lg border border-[#50fa7b66] px-3 py-1.5 font-sans text-xs font-bold text-[#50fa7b];
		background: rgba(80, 250, 123, 0.07);
		box-shadow: 0 0 10px rgba(80, 250, 123, 0.15);
		transition: box-shadow 0.2s, background 0.2s;
	}
	.mode:hover {
		background: rgba(80, 250, 123, 0.16);
		box-shadow: 0 0 16px rgba(80, 250, 123, 0.35);
	}
	.quit {
		@apply flex items-center gap-1 rounded-lg border border-[#44475a] px-2 py-1 font-sans text-xs text-[#8b90a7];
	}
	.quit:hover {
		@apply text-base-content;
	}
	.question {
		@apply mt-2 font-sans text-xs text-[#c8cbdd];
	}
	.banner {
		@apply mt-2 rounded-lg px-3 py-2 font-sans text-xs font-bold;
	}
	.ok {
		background: rgba(80, 250, 123, 0.12);
		color: #50fa7b;
		border: 1px solid rgba(80, 250, 123, 0.45);
	}
	.no {
		background: rgba(255, 85, 85, 0.1);
		color: #ff5555;
		border: 1px solid rgba(255, 85, 85, 0.4);
	}
	.amb {
		background: rgba(189, 147, 249, 0.1);
		color: #bd93f9;
		border: 1px solid rgba(189, 147, 249, 0.4);
	}
	.amb b {
		@apply text-base-content;
	}
	.strip {
		@apply mt-2 flex flex-wrap items-center gap-2 font-serif text-xs;
	}
	.chip {
		@apply rounded-md border border-[#44475a] px-2 py-1 text-[#c8cbdd];
	}
	.okc {
		border-color: rgba(80, 250, 123, 0.6);
		color: #50fa7b;
	}
	.noc {
		border-color: rgba(255, 85, 85, 0.6);
		color: #ff5555;
	}
	.ambc {
		border-color: rgba(189, 147, 249, 0.6);
		color: #bd93f9;
	}
	.next-row {
		@apply mt-3 flex items-center justify-between;
	}
	.streak {
		@apply font-sans text-xs text-[#8b90a7];
	}
</style>
