<script>
	// P1.3: live determinant readout beside the canvas during the story
	// (steps 2-5). The katex skeleton is rendered ONCE — the numbers are
	// plain colored spans driven by the stores, so the card tracks every
	// morph tick without re-parsing latex. Never intercepts pointer events:
	// it floats over the canvas's answer zones.
	import { fade } from "svelte/transition";
	import katex from "katex";
	import { detStep, detEntries, detValue, detFlipped, detCollapsed } from "$stores/det.js";
	import { colorX, colorY } from "$data/variables";

	const formulaHtml = katex.renderToString("\\det(A) \\;=\\; ad - bc", {
		throwOnError: false
	});

	const fmt = (n) => {
		const v = Math.round(n * 100) / 100;
		return Number.isFinite(v) ? String(v) : "–";
	};

	$: visible = $detStep >= 2 && $detStep <= 5;
	$: stateText = $detCollapsed
		? "area squashed to zero"
		: $detFlipped
			? `area × ${fmt(Math.abs($detValue))} · orientation reversed`
			: `area × ${fmt(Math.abs($detValue))}`;
</script>

{#if visible}
	<div class="det-formula-card" transition:fade={{ duration: 250 }}>
		<!-- U4: the actual matrix, column-colored to match the arrows/labels —
		     the ad−bc line below reads ITS entries -->
		<div class="det-formula-matrix" aria-hidden="true">
			<span class="det-formula-bracket" />
			<span class="det-formula-cell" style:color={colorX}>{fmt($detEntries[0])}</span>
			<span class="det-formula-cell" style:color={colorY}>{fmt($detEntries[1])}</span>
			<span class="det-formula-cell" style:color={colorX}>{fmt($detEntries[2])}</span>
			<span class="det-formula-cell" style:color={colorY}>{fmt($detEntries[3])}</span>
			<span class="det-formula-bracket right" />
		</div>
		<div class="det-formula-eq">{@html formulaHtml}</div>
		<div class="det-formula-live">
			<span style:color={colorX}>{fmt($detEntries[0])}</span>
			<span class="det-formula-op">·</span>
			<span style:color={colorY}>{fmt($detEntries[3])}</span>
			<span class="det-formula-op">−</span>
			<span style:color={colorY}>{fmt($detEntries[1])}</span>
			<span class="det-formula-op">·</span>
			<span style:color={colorX}>{fmt($detEntries[2])}</span>
			<span class="det-formula-op">=</span>
			<b class="det-formula-value" class:flipped={$detFlipped} class:collapsed={$detCollapsed}>
				{fmt($detValue)}
			</b>
		</div>
		<div class="det-formula-state" class:flipped={$detFlipped} class:collapsed={$detCollapsed}>
			{stateText}
		</div>
	</div>
{/if}

<style>
	.det-formula-matrix {
		display: grid;
		grid-template-columns: auto auto auto auto;
		column-gap: 14px;
		row-gap: 2px;
		align-items: center;
		justify-content: start;
		margin-bottom: 6px;
		font-size: 15px;
		font-weight: 700;
		line-height: 1.15;
	}
	.det-formula-cell {
		text-align: center;
		min-width: 2ch;
	}
	.det-formula-bracket {
		grid-row: 1 / span 2;
		width: 7px;
		height: 100%;
		min-height: 34px;
		border: 2px solid #f8f8f2;
		border-right: none;
		justify-self: end;
	}
	.det-formula-bracket.right {
		grid-column: 4;
		border: 2px solid #f8f8f2;
		border-left: none;
		justify-self: start;
	}
</style>
