<script>
	// fire 74 (H2): the 3D story's live readout card — the DetFormulaCard twin
	// for the cube beats (det3dStep 2-5). DetOverlay keeps only the arrow while
	// the 3D story plays, so the matrix/volume numbers had nowhere to live and
	// the user asked for "the top left card showing the matrix and whatnot as
	// the transformation occurs". Same geometry and chrome as the 2D card
	// (fixed left 1rem / top 5.25rem, z-30, pointer-events: none — it floats
	// over the canvas's answer zones and must never intercept them). The
	// entries are read straight from the shared det3 stores, so the card
	// tracks every morph tick like the 2D one.
	import { fade } from "svelte/transition";
	import { det3dStep, det3Entries, det3Value, det3Collapsed, det3Flipped } from "$stores/det3.js";

	// column colors match the dock's spinners and the scene's basis labels
	const COL_A = "#ff79c6";
	const COL_B = "#bd93f9";
	const COL_C = "#8be9fd";

	const fmt = (n) => {
		const v = Math.round(n * 100) / 100;
		return Number.isFinite(v) ? String(v) : "–";
	};

	$: visible = $det3dStep >= 2 && $det3dStep <= 5;
	$: stateText = $det3Collapsed
		? "the cube is squashed flat — volume 0"
		: $det3Flipped
			? `volume × ${fmt(Math.abs($det3Value))} · orientation reversed`
			: `volume × ${fmt(Math.abs($det3Value))}`;
</script>

{#if visible}
	<div class="det3-formula-card" transition:fade={{ duration: 250 }}>
		<!-- the live 3×3, column-colored to match the basis images on screen -->
		<div class="det3-formula-matrix" aria-hidden="true">
			<span class="det3-formula-bracket" />
			{#each [0, 1, 2] as row (row)}
				{#each [0, 1, 2] as col (col)}
					<span
						class="det3-formula-cell"
						style:color={col === 0 ? COL_A : col === 1 ? COL_B : COL_C}
					>
						{fmt($det3Entries[row * 3 + col])}
					</span>
				{/each}
			{/each}
			<span class="det3-formula-bracket right" />
		</div>
		<div class="det3-formula-live">
			det(A) =
			<b class="det3-formula-value" class:flipped={$det3Flipped} class:collapsed={$det3Collapsed}>
				{fmt($det3Value)}
			</b>
		</div>
		<div class="det3-formula-state" class:flipped={$det3Flipped} class:collapsed={$det3Collapsed}>
			{stateText}
		</div>
	</div>
{/if}

<style>
	.det3-formula-card {
		position: fixed;
		left: 1rem;
		top: 5.25rem;
		z-index: 30;
		pointer-events: none;
		padding: 10px 14px;
		background: rgba(13, 13, 24, 0.92);
		border: 1px solid rgba(248, 248, 242, 0.25);
		border-radius: 12px;
		font-family: "Chivo Variable", ui-sans-serif, sans-serif;
		color: #f8f8f2;
	}
	.det3-formula-matrix {
		display: grid;
		grid-template-columns: auto auto auto auto auto;
		column-gap: 12px;
		row-gap: 2px;
		align-items: center;
		justify-content: start;
		margin-bottom: 6px;
		font-size: 15px;
		font-weight: 700;
		line-height: 1.15;
	}
	.det3-formula-cell {
		text-align: center;
		min-width: 2.4ch;
	}
	.det3-formula-bracket {
		grid-row: 1 / span 3;
		width: 7px;
		height: 100%;
		min-height: 52px;
		border: 2px solid #f8f8f2;
		border-right: none;
		justify-self: end;
	}
	.det3-formula-bracket.right {
		grid-column: 5;
		border: 2px solid #f8f8f2;
		border-left: none;
		justify-self: start;
	}
	.det3-formula-live {
		font-size: 15px;
		font-weight: 700;
		letter-spacing: 0.02em;
	}
	.det3-formula-value {
		font-size: 17px;
	}
	.det3-formula-state {
		margin-top: 3px;
		font-size: 12px;
		opacity: 0.85;
	}
	.det3-formula-state.flipped,
	.det3-formula-value.flipped {
		color: #ff79c6;
	}
	.det3-formula-state.collapsed,
	.det3-formula-value.collapsed {
		color: #f1fa8c;
	}
</style>
