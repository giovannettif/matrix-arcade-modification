<script>
	import { detStep } from "$stores/det.js";
	import DetControls from "./DetControls.svelte";
	import DetGame from "./DetGame.svelte";
	import DetGuide from "./DetGuide.svelte";
</script>

{#if $detStep === 6}
	<!-- fixed controls panel on the LEFT — the original's #inputs pattern -->
	<div
		class="fixed left-0 top-0 z-40 flex flex-col items-start gap-5 px-8 py-8 pointer-events-none"
	>
		<div class="pointer-events-auto">
			<DetControls />
		</div>
		<div class="pointer-events-auto">
			<DetGame />
		</div>
	</div>

	<!-- the guide positions itself next to each beat's target (DetGuide is fixed) -->
	<DetGuide />
{/if}
