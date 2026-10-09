<script>
	import { Gamepad2, MousePointerClick, ArrowRight, X, Check } from "lucide-svelte";
	import {
		detGame,
		detStep,
		detGuideStep,
		startRound,
		endRound,
		acceptPending
	} from "$stores/det.js";
	import { colorX, colorY } from "$data/variables";

	$: active = $detStep === 6;
	$: g = $detGame;

	// corner rounds: the corner currently being asked (null otherwise)
	$: asked =
		g.mode === "corners" && g.status === "asking" && g.round
			? g.round.corners[g.round.index]
			: null;
	$: askedImage = asked ? `${asked.name}′` : "";
	$: inverseRound = g.mode === "inverse";
	// fire 80 (I4): the asked chip matches the scene's corner colors
	const CORNER_COLORS = { P2: colorX, P4: colorY };
	const askedColor = (name) => CORNER_COLORS[name] || "#f8f8f2";
	// fire 80 (I4): the reveal phase (the animated truth) shows its verdict
	$: revealing = g.status === "revealing" && g.result;

	function fmt(p) {
		return p ? `(${p[0].toFixed(2)}, ${p[1].toFixed(2)})` : "";
	}
</script>

{#if active}
	<div class="game">
		<div class="head">
			<span class="title"><Gamepad2 size={16} /> Your turn</span>
			{#if g.status === "idle"}
				<div class="modes" data-tour="predict" class:guide-hl={$detGuideStep === 2 || $detGuideStep === 3}>
					<button class="mode" on:click={() => startRound()}>
						<MousePointerClick size={15} /> Predict
					</button>
				</div>
			{:else}
				<button class="quit" on:click={endRound} aria-label="End the prediction round">
					<X size={15} /> quit
				</button>
			{/if}
		</div>

		{#if (g.status === "asking" || g.status === "revealing") && g.mode === "corners" && g.round}
			<!-- fire 80 (I4): the step header + dots — the round's structure is
			     visible at a glance (done-green / active-pulsing / todo-dashed) -->
			<div class="steps">
				<span class="step-label">
					Point {Math.min(g.round.index + 1, g.round.corners.length)} of {g.round.corners.length}
					{#if asked}
						· <b class="asked-chip" style:color={askedColor(asked.name)}>{asked.name}</b>
					{:else if revealing}
						· <b class="asked-chip" style:color={askedColor(g.result.name)}>{g.result.name}</b>
					{/if}
				</span>
				<div class="dots">
					{#each g.round.corners as c, i (c.name)}
						<span
							class="dot"
							class:done={i < g.round.index}
							class:active={i === g.round.index}
							class:todo={i > g.round.index}
						/>
					{/each}
				</div>
			</div>
		{/if}

		{#if g.status === "asking" && g.mode === "corners" && asked}
			<!-- fire 78 (H5): plot-then-accept — a click plots, another click
			     moves the plot, Accept commits (no more instant lock-in) -->
			<p class="question">
				Where does <b class="cn" style:color={askedColor(asked.name)}>{asked.name}</b> {fmt(asked.point)} land?
				Click the canvas to plot its image <b class="cn">{askedImage}</b> — click again to move it, then
				accept.
			</p>
			{#if g.round.results.length === 0}
				<p class="coach">
					Click where <b>{asked.name}</b> will land — the hollow ghost ring previews its landing.
				</p>
			{/if}
			<div class="progress">
				{#each g.round.results as r, i (i)}
					<span class="pc" class:okc={r.type === "correct"} class:noc={r.type === "wrong"}>
						{r.name} {r.type === "correct" ? "✓" : "✗"}
					</span>
				{/each}
			</div>
			<div class="accept-row">
				<button class="mode" disabled={!g.pending} on:click={acceptPending}>
					<Check size={15} /> Accept{g.pending ? ` ${fmt(g.pending)}` : ""}
				</button>
				{#if !g.pending}
					<span class="hint">plot a point on the canvas first — the ghost shows where it lands</span>
				{/if}
			</div>
		{:else if revealing}
			<!-- fire 80 (I4): the per-point verdict while the truth animates -->
			<p class="verdict-line" class:vok={g.result.type === "correct"} class:vno={g.result.type === "wrong"}>
				<b>{g.result.name}</b>
				{g.result.type === "correct" ? "— hit ✓" : "— missed ✗"} — watch where it really lands…
			</p>
		{:else if g.status === "asking" && inverseRound}
			<p class="question">
				The marked point landed at <b class="cn">{fmt(g.round.target)}</b> — plot the point of
				the original square that maps there, then accept.
			</p>
			<div class="accept-row">
				<button class="mode" disabled={!g.pending} on:click={acceptPending}>
					<Check size={15} /> Accept{g.pending ? ` ${fmt(g.pending)}` : ""}
				</button>
				{#if !g.pending}
					<span class="hint">plot a point on the canvas first</span>
				{/if}
			</div>
		{/if}

		{#if g.status === "revealed" && g.mode === "corners" && g.round}
			{@const correct = g.round.results.filter((r) => r.type === "correct").length}
			{#if correct === g.round.corners.length}
				<div class="banner ok">
					All three corners — nailed it! The parallelogram you built IS the image of the shape.
				</div>
			{:else}
				<div class="banner no">
					{correct}/{g.round.corners.length} corners. The connectors show where each one really
					landed — trace them against the column arrows.
				</div>
			{/if}
			<div class="strip">
				{#each g.round.results as r, i (i)}
					<ArrowRight size={12} />
					<span class="chip" class:okc={r.type === "correct"} class:noc={r.type === "wrong"}>
						{r.name} → {r.name}′ {fmt(r.answer)} {r.type === "correct" ? "✓" : "✗"}
					</span>
				{/each}
			</div>
			<div class="next-row">
				<button class="mode" on:click={() => startRound()}>
					<MousePointerClick size={15} /> Next round
				</button>
				<span class="streak">streak: {g.streak}</span>
			</div>
		{:else if g.status === "revealed" && inverseRound && g.result}
			{#if g.result.type === "correct"}
				<div class="banner ok">
					Correct! You found the point that maps there — the transformation is undone.
				</div>
			{:else if g.result.type === "wrong"}
				<div class="banner no">
					Not quite — it came from {fmt(g.result.answer)}. Watch the connector!
				</div>
			{:else}
				<div class="banner amb">
					Ambiguous! <b>Every</b> circled point maps to the same spot — you can't know which one
					it was. That's exactly why no inverse exists when det(A) = 0.
				</div>
			{/if}
			<div class="strip">
				<span class="chip">Landed at {fmt(g.round.target)}</span>
				<ArrowRight size={14} />
				<span class="chip" class:okc={g.result.type === "correct"} class:ambc={g.result.type === "ambiguous"} class:noc={g.result.type === "wrong"}>
					Came from {fmt(g.result.answer)} {g.result.type === "correct" ? "✓" : g.result.type === "ambiguous" ? "?" : "✗"}
				</span>
			</div>
			<div class="next-row">
				<button class="mode" on:click={() => startRound()}>
					<MousePointerClick size={15} /> Next round
				</button>
				<span class="streak">streak: {g.streak}</span>
			</div>
		{/if}

		<p class="legend">
			✓ hit · ✗ miss · <span class="amb">purple = ambiguous (det = 0)</span> · P2′ P3′ P4′ = image
			points · answers snap to the half-grid
		</p>
	</div>
{/if}

<style lang="postcss">
	.game {
		@apply mt-3 rounded-lg border border-[#44475a66] bg-[#0d0d18]/80 backdrop-blur-sm p-4;
		/* fire 80 (I4): the dock's chrome — the game card matches the try-it
		   panels instead of floating bare over the canvas */
		/* fire 105 (the "can't predict" report): the card floats OVER the
		   canvas and its box used to swallow the plot clicks whole — in the
		   split view the asking question sat right where the answer had to be
		   plotted, so clicks never reached the scene and no round could ever
		   be submitted. The card's BOX is now click-through; only its buttons
		   take pointers. */
		pointer-events: none;
	}
	.game :global(button) {
		pointer-events: auto;
	}	.steps {
		@apply flex items-center justify-between gap-2 border-b border-[#44475a66] pb-2;
	}
	.step-label {
		@apply font-sans text-xs font-bold uppercase tracking-wide text-[#8b90a7];
	}
	.asked-chip {
		@apply font-serif text-sm;
	}
	.dots {
		@apply flex items-center gap-1.5;
	}
	.dot {
		@apply h-2.5 w-2.5 rounded-full border;
	}
	.dot.done {
		background: rgba(80, 250, 123, 0.85);
		border-color: rgba(80, 250, 123, 0.85);
	}
	.dot.active {
		border-color: #f1fa8c;
		animation: guidepulse 1.1s ease-in-out infinite;
	}
	.dot.todo {
		border-style: dashed;
		border-color: #767b99;
	}
	.coach {
		@apply mt-2 rounded-lg border border-[#f1fa8c55] px-3 py-1.5 font-sans text-[11px] text-[#c8cbdd];
		background: rgba(241, 250, 140, 0.07);
	}
	.verdict-line {
		@apply mt-2 rounded-lg px-3 py-2 font-sans text-xs font-bold;
	}
	.verdict-line.vok {
		background: rgba(80, 250, 123, 0.12);
		color: #50fa7b;
		border: 1px solid rgba(80, 250, 123, 0.45);
	}
	.verdict-line.vno {
		background: rgba(255, 85, 85, 0.1);
		color: #ff5555;
		border: 1px solid rgba(255, 85, 85, 0.4);
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
	.mode:disabled {
		opacity: 0.45;
		pointer-events: none;
	}
	.accept-row {
		@apply mt-2 flex flex-wrap items-center gap-2;
	}
	.hint {
		@apply font-sans text-[11px] text-[#8b90a7];
	}
	:global(.guide-hl) {
		outline: 2px solid #50fa7b !important;
		outline-offset: 4px;
		border-radius: 10px;
		animation: guidepulse 1.2s ease-in-out infinite;
	}
	@keyframes guidepulse {
		0%,
		100% {
			box-shadow: 0 0 0 rgba(80, 250, 123, 0);
		}
		50% {
			box-shadow: 0 0 18px rgba(80, 250, 123, 0.55);
		}
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
	.cn {
		@apply font-serif text-sm;
		color: #f1fa8c;
	}
	.progress {
		@apply mt-2 flex gap-2 font-sans text-xs;
	}
	.pc {
		/* A2: pending chips were #8b90a7-on-#44475a — illegible at 1× on the
		   dark panel; pending is now near-white on a visible border, and the
		   ✓/✗ states keep their colors */
		@apply rounded-md border border-[#767b99] px-2 py-0.5 text-[#e2e4f0];
	}
	.okc {
		border-color: rgba(80, 250, 123, 0.6);
		color: #50fa7b;
	}
	.noc {
		border-color: rgba(255, 85, 85, 0.6);
		color: #ff5555;
	}
	.todo {
		border-style: dashed;
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
	.legend {
		@apply mt-3 border-t border-[#44475a66] pt-2 font-sans text-[10px] leading-relaxed text-[#8b90a7];
	}
	.legend .amb {
		color: #bd93f9;
	}
</style>
