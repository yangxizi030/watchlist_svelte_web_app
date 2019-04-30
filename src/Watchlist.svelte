<script>
	import { onMount } from 'svelte';
	import { spring } from 'svelte/motion';
  import { pannable } from './pannable.js';

  export let symbols;


	function constructList(symbols) {
		let stock = []
		for (let i=0; i<symbols.length; i++) {
			stock.push({symbol: symbols[i], description:'Fetching', bidPrice: 'Fetching', askPrice: 'Fetching', lastPrice: 'Fetching', fetchtime: 1});
		}
		return stock
	}
  $: stock = constructList(symbols)


	const coords = spring({ x: 0, y: 0 }, {
		stiffness: 0.2,
		damping: 0.4
	});

	function handlePanStart() {
		coords.stiffness = coords.damping = 1;
	}

	function handlePanMove(event) {
		coords.update($coords => ({
			x: $coords.x + event.detail.dx,
			y: $coords.y + event.detail.dy
		}));
	}

	function handlePanEnd(event) {
		coords.stiffness = 0.2;
		coords.damping = 0.4;
		coords.set({ x: 0, y: 0 });
	}

  let add = '';
  let delet = '';
  let addResult = [];
	$: addChoice = addResult;
	let delResult = [];
	$: delChoice = delResult;

	const autoComplete = async (symbol, add) => {
		if (!symbol) {
			return
		}
		const response = await fetch(encodeURI('https://api.tastyworks.com/symbols/search/' + symbol))
		const des = await response.json()
		const options = des.data.items
		if (add) {
			addResult = []
			for (let i=0; i<options.length; i++) {
				addResult.push((options[i].symbol + ":  " + options[i].description))
			}
		} else {
			delResult = []
			for (let i=0; i<options.length; i++) {
				delResult.push(options[i].symbol)
			}
		}

	}

	const fetchDescription = async (stock) => {
		const symbol = stock.symbol
		const response = await fetch(encodeURI('https://api.tastyworks.com/symbols/search/' + symbol))
		const des = await response.json()
		if (des.data.items[0]) {
			stock.description = des.data.items[0].description
		} else {
			stock.description = 'unknown symbol'
		}
	}

  const fetchBook = async (stock) => {
		const symbol = stock.symbol;
		let response = dxFeed.getQuote(symbol);
		stock.bidPrice = response.bid;
		stock.askPrice = response.ask;
		stock.lastPrice = response.last;
	}

	const addSymbol = (event, symbol) => {
		let s = symbol.split(':')[0]
		stock.push({symbol: s, description:'Fetching', bidPrice: 'Fetching', askPrice: 'Fetching', lastPrice: 'Fetching', fetchtime: 1});
	}

	const deleteSymbol = (event, symbol) => {
		for (let i=0; i<stock.length; i++) {
			if (stock[i].symbol == symbol) {
				stock.splice( i, 1 );
			}
		}
	}

	onMount(() => {
		constructList(symbols)
		if (stock[0]) {
			stock[0].fetchtime += 1
		}
	const interval = setInterval(() => {
		autoComplete(add, true)
		autoComplete(delet, false)
		for (let i = 0; i < stock.length; i++) {
			fetchDescription(stock[i])
			fetchBook(stock[i])
			stock[i].fetchtime += 1
		}
	}, 2000);

	return () => {
		clearInterval(interval);
	};
});

</script>

<style>
	p {
		font-size: 2em;
		text-align: center;
		padding-bottom: 50px;
	}

	div {
		font-size: 1em;
		text-align: center;
	}
	th {
		font-size: 1.5em;
		font-weight: 400;
		padding-top: 10px;
		padding-left: 30px;
		min-width: 150px;
	}
	.box {
		--width: 100px;
		--height: 100px;
		position: absolute;
		width: var(--width);
		height: var(--height);
		left: calc(32% - var(--width) / 2);
		top: calc(40% - var(--height) / 2);
		border-radius: 4px;
		background-color: #ff3e00;
		cursor: move;
	}
</style>

<ul>
  <p> Default Watchlist </p>

	<div>
		<input bind:value={add} placeholder="Add Symbol" list="addChoice">
		<datalist id="addChoice">
		  {#each addChoice as choice}
				<option value={choice} />
			{/each}
		</datalist>

  	<button on:click={ e => addSymbol(e, add)}>ADD</button>

		<input bind:value={delet} placeholder="Delete Symbol" list="delChoice">
		<datalist id="delChoice">
		  {#each delChoice as choice}
				<option value={choice} />
			{/each}
		</datalist>
  	<button on:click={ e => deleteSymbol(e, delet)}>DELETE</button>
  </div>

	<div class="box"
	use:pannable
	on:panstart={handlePanStart}
	on:panmove={handlePanMove}
	on:panend={handlePanEnd}
	style="transform:
		translate({$coords.x}px,{$coords.y}px)
		rotate({$coords.x * 0.2}deg)">
	<table>
		<tr>
			<th> Symbol </th>
			<th> Descrption </th>
			<th> BidPrice </th>
			<th> AskPrice </th>
			<th> LastPrice </th>
	 </tr>

	{#each stock as {symbol, description, bidPrice, askPrice, lastPrice, fetchtime}}
	<tr>
		<th> {symbol}</th>
		<th> {description} </th>
		<th> {bidPrice} </th>
		<th> {askPrice} </th>
		<th> {lastPrice}</th>
	</tr>
	{/each}

 </table>
 </div>
</ul>
