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

	<!-- collapsible guide card on the RIGHT -->
	<div class="fixed right-6 top-24 z-40 w-80 pointer-events-auto">
		<DetGuide />
	</div>
{/if}
