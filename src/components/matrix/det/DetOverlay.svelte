<script>
	import { fade, fly } from "svelte/transition";
	import { ChevronRight } from "lucide-svelte";
	import { detStep, detTryExpanded } from "$stores/det.js";
	import { det3dStep } from "$stores/det3.js";
	import DetControls from "./DetControls.svelte";
	import DetGame from "./DetGame.svelte";
	import DetGuide from "./DetGuide.svelte";
	import Det3DDock from "./Det3DDock.svelte";
	import Det3DGuide from "./Det3DGuide.svelte";

	// fire 59 (user: "the side disappears on its own — it should stay like the
	// original as you scroll and the user can then collapse, with the arrow on
	// the right side, same style, for both sections"): ONE persistent shell
	// owns the whole det terminal region (the 2D try-it through the 3D
	// chapter) and never unmounts while scrolling within it. The CONTENT swaps
	// in place (2D controls <-> the 3D dock; during the 3D story beats only
	// the arrow remains — nothing to control while the cube story plays), and
	// the collapse control is the ORIGINAL's TogglePlayground arrow (right
	// edge, vertically centered), which toggles the TEXT COLUMN via
	// detTryExpanded (setTryLayout consumes it — the same -65ch/-32.5ch
	// tweens, byte-identical to the original's). The panel itself, like the
	// original's #inputs HUD, always stays.
	const toggleTry = () => detTryExpanded.update((v) => !v);
	// the terminal region: the 2D try-it through the 3D chapter
	$: terminal = $detStep === 6 || $det3dStep >= 1;
</script>

{#if terminal}
	<!-- the arrow: the original's TogglePlayground, same geometry and style —
	     a 56px round chevron on the right edge, vertically centered; it points
	     right when the article is visible (click = expand the playground) and
	     flips left when expanded (click = show the article). data-state drives
	     both the position (right-0 when on) and the flip. -->
	<button
		class="det-arrow group bg-base-200 hover:bg-base-100 h-14 w-14 grid place-items-center rounded-full shadow-lg shadow-neutral-content/20 focus:ring-2 focus:ring-info transition-all -translate-x-1/2 -translate-y-1/2 tooltip tooltip-left tooltip-info fixed top-1/2 duration-300 hidden lg:grid {$detTryExpanded
			? 'right-0'
			: 'right-[calc(60ch)]'}"
		data-state={$detTryExpanded ? "on" : "off"}
		data-tip={$detTryExpanded ? "Show Article" : "Expand Playground"}
		aria-label={$detTryExpanded ? "Show the article column" : "Expand the playground full width"}
		on:click={toggleTry}
		in:fly={{ x: -20, duration: 200 }}
		out:fade={{ duration: 200 }}
	>
		<ChevronRight
			size={36}
			strokeWidth={3}
			transform="translate(2, 0)"
			class="transition {$detTryExpanded ? '-scale-x-100' : ''}"
		/>
	</button>

	{#if $det3dStep === 0 && $detStep === 6}
		<!-- the 2D try-it content: controls + game, the original's #inputs
		     pattern (fixed left, hidden below lg). in:fade waits ~a beat so the
		     layout slide mostly settles first; out:fade is the graceful exit. -->
		<div
			class="fixed left-0 top-0 z-40 hidden flex-col items-start gap-5 px-8 py-8 pointer-events-none lg:flex"
			in:fade={{ duration: 0.3, delay: 0.2 }}
			out:fade={{ duration: 0.3 }}
		>
			<div class="pointer-events-auto">
				<DetControls />
			</div>
			<div class="pointer-events-auto">
				<DetGame />
			</div>
		</div>
		<!-- fire 78 (H5): the guide mounts in BOTH layouts — it used to gate on
		     detTryExpanded, which FIX-D sets false on every fresh entry, so the
		     tour never showed on a fresh walk (the user's "no guided tour
		     sometimes"); the card is fixed top-right and works collapsed too -->
		<DetGuide />
	{:else if $det3dStep === 6}
		<!-- the 3D try-it content: the dock swaps into the SAME slot so the
		     side never vanishes between the sections; the guide is the 3D
		     twin of the 2D forced tour (fire 67, FIX-E) -->
		<!-- fire 73 (H1): px-8 py-8 matches the 2D branch — the unpadded
		     wrapper sat the dock flush at left-0/top-0, clipping its border -->
		<div
			class="fixed left-0 top-0 z-40 hidden px-8 py-8 lg:block pointer-events-none"
			in:fade={{ duration: 0.3, delay: 0.1 }}
			out:fade={{ duration: 0.3 }}
		>
			<div class="pointer-events-auto">
				<Det3DDock />
			</div>
		</div>
		<Det3DGuide />
	{/if}
	<!-- during det3dStep 1-5 (the 3D story beats) the shell keeps only the
	     arrow — there is nothing to control while the cube story plays -->
{/if}
